import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { coachingEngagements, coachingMeetings, coachingOffers, coachingSyncRuns, members, type CoachingEngagement } from "../../db/schema";
import { env } from "./env";
import { listPages, NotionError, notionMessage, updatePage, type NotionPage, type NotionProperty } from "./notion";
import { richTextToPlain } from "./notionBlocks";
import { open, seal } from "./privateBox";

/**
 * Le suivi du coaching individuel lit les bases Notion de Laura (Notion fait foi) :
 * Offres Accompagnements, CRM People, Inscriptions et Sessions. Seul le compte rendu d'une séance y est écrit.
 * Un client est relié à sa fiche Présence par l'adresse e-mail du CRM.
 */

const prop = (p: NotionPage, name: string): NotionProperty | undefined => p.properties[name];
const text = (p?: NotionProperty) => richTextToPlain(p?.title ?? p?.rich_text).trim();
const num = (p?: NotionProperty) => p?.number ?? p?.formula?.number ?? p?.rollup?.number ?? null;
const dateOf = (p?: NotionProperty) => p?.date ?? p?.formula?.date ?? p?.rollup?.date ?? null;
const choice = (p?: NotionProperty) => p?.select?.name ?? p?.status?.name ?? "";
const firstRel = (p?: NotionProperty) => p?.relation?.[0]?.id ?? null;

/** Les textes d'un accompagnement sont scellés pour lui seul : déplacés, ils deviennent illisibles. */
export const scope = (engagementId: number) => `coaching:${engagementId}`;
export const reveal = (engagementId: number, sealed: string) => (sealed ? open(scope(engagementId), sealed) ?? "" : "");
export const hide = (engagementId: number, plain: string) => (plain.trim() ? seal(scope(engagementId), plain.trim()) : "");

/** Seules les « Séance » terminées sont décomptées du forfait, comme dans Notion. */
export const counted = (m: { kind: string; state: string }) => m.kind === "Séance" && m.state === "Terminé";

const ACCESS_MONTHS = 6;
const plusMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

/**
 * La fin de l'accompagnement : la fin de parcours si elle a eu lieu, sinon la dernière séance terminée d'un accompagnement terminé,
 * sinon la date de fin prévue. Un accompagnement abandonné n'ouvre aucun accès.
 */
export function accompanimentEnd(e: Pick<CoachingEngagement, "status" | "plannedEndOn">, meetings: Pick<typeof coachingMeetings.$inferSelect, "kind" | "state" | "startsAt">[]): Date | null {
  if (e.status === "Abandonné") return null;
  const done = meetings.filter((m) => m.state === "Terminé" && m.startsAt).sort((a, b) => b.startsAt!.getTime() - a.startsAt!.getTime());
  const final = done.find((m) => m.kind === "Fin de parcours");
  if (final) return final.startsAt;
  if (e.status === "Terminé" && done[0]) return done[0].startsAt;
  return e.plannedEndOn ? new Date(`${e.plannedEndOn}T12:00:00Z`) : null;
}
export const accessEndFor = (end: Date | null) => (end ? plusMonths(end, ACCESS_MONTHS) : null);

let current: Promise<{ ok: boolean; detail: string }> | null = null;

export function syncCoaching(): Promise<{ ok: boolean; detail: string }> {
  current ??= run().finally(() => { current = null; });
  return current;
}

async function run(): Promise<{ ok: boolean; detail: string }> {
  const db = getDb();
  const [runRow] = await db.insert(coachingSyncRuns).values({}).returning();
  const finish = async (ok: boolean, detail: string) => {
    await db.update(coachingSyncRuns).set({ finishedAt: new Date(), status: ok ? "ok" : "erreur", detail }).where(eq(coachingSyncRuns.id, runRow.id));
    return { ok, detail };
  };
  let offerPages: NotionPage[], clientPages: NotionPage[], enrollmentPages: NotionPage[], sessionPages: NotionPage[];
  try {
    [offerPages, clientPages, enrollmentPages, sessionPages] = [
      await listPages(env.notionCoachingOffers), await listPages(env.notionCoachingClients),
      await listPages(env.notionCoachingEnrollments), await listPages(env.notionCoachingSessions),
    ];
  } catch (e) {
    // Une base introuvable : c'est l'accès de l'intégration aux bases du coaching qui manque, pas « Formations Présence »
    const missing = e instanceof NotionError && e.status === 404;
    return finish(false, missing
      ? "Notion ne trouve pas une des bases du coaching. Dans Notion, ajoutez la connexion de l’intégration Présence aux bases Offres Accompagnements, CRM People, Inscriptions et Sessions."
      : `${notionMessage(e)} Les bases du coaching : Offres Accompagnements, CRM People, Inscriptions et Sessions.`);
  }

  // Offres
  const offerIds = new Map<string, typeof coachingOffers.$inferSelect>();
  for (const p of offerPages) {
    const formats = (prop(p, "format")?.multi_select ?? []).map((o) => o.name);
    const values = { title: text(prop(p, "Titre")), sessions: num(prop(p, "Nombre de sessions")), individual: !formats.length || formats.includes("individuel"), presenceAccess: !!prop(p, "Accès Présence inclus")?.checkbox, archivedAt: null, updatedAt: new Date() };
    const [row] = await db.insert(coachingOffers).values({ notionPageId: p.id, ...values }).onConflictDoUpdate({ target: coachingOffers.notionPageId, set: values }).returning();
    offerIds.set(p.id, row);
  }
  if (offerPages.length) await db.update(coachingOffers).set({ archivedAt: new Date() }).where(and(notInArray(coachingOffers.notionPageId, offerPages.map((p) => p.id)), isNull(coachingOffers.archivedAt)));

  // Le CRM ne sert qu'à relier : rien n'est gardé des personnes sans inscription
  const clients = new Map(clientPages.map((p) => {
    const first = text(prop(p, "Prénom")), last = text(prop(p, "Nom famille"));
    return [p.id, { email: (prop(p, "Email")?.email ?? "").trim().toLowerCase(), name: [first, last].filter(Boolean).join(" ") || text(prop(p, "Person")) }] as const;
  }));
  const people = await db.select({ id: members.id, email: members.email }).from(members).where(isNull(members.deletedAt));
  const memberByEmail = new Map(people.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m.id]));

  // Inscriptions : les accompagnements individuels seulement
  const kept: string[] = [];
  const byNotion = new Map<string, CoachingEngagement>();
  let unmatched = 0;
  for (const p of enrollmentPages) {
    const offer = offerIds.get(firstRel(prop(p, "Programme")) ?? "");
    if (offer && !offer.individual) continue;
    const client = clients.get(firstRel(prop(p, "Client")) ?? "");
    const memberId = client?.email ? memberByEmail.get(client.email) ?? null : null;
    if (!memberId) unmatched++;
    const values = {
      memberId, clientPageId: firstRel(prop(p, "Client")) ?? "", clientName: client?.name ?? "", clientEmail: client?.email ?? "",
      offerId: offer?.id ?? null, title: offer?.title || text(prop(p, "Titre")), status: choice(prop(p, "Statut")),
      startsOn: dateOf(prop(p, "Date début"))?.start.slice(0, 10) ?? null, plannedEndOn: dateOf(prop(p, "Date de fin prévue"))?.start.slice(0, 10) ?? null,
      sessionsPlanned: num(prop(p, "Séances prévues")) ?? num(prop(p, "Nombre de sessions")) ?? offer?.sessions ?? null,
      notionEditedAt: new Date(p.last_edited_time), archivedAt: null, updatedAt: new Date(),
    };
    const [row] = await db.insert(coachingEngagements).values({ notionPageId: p.id, ...values }).onConflictDoUpdate({ target: coachingEngagements.notionPageId, set: values }).returning();
    kept.push(p.id);
    byNotion.set(p.id, row);
  }
  await db.update(coachingEngagements).set({ archivedAt: new Date() }).where(and(kept.length ? notInArray(coachingEngagements.notionPageId, kept) : undefined, isNull(coachingEngagements.archivedAt)));

  // Séances : par leur inscription, ou à défaut par la personne (son accompagnement le plus récent)
  const latestByClient = new Map<string, CoachingEngagement>();
  for (const e of [...byNotion.values()].sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? ""))) latestByClient.set(e.clientPageId, e);
  const existing = new Map((await db.select().from(coachingMeetings)).map((m) => [m.notionPageId, m]));
  const seen: string[] = [];
  for (const p of sessionPages) {
    const engagement = byNotion.get(firstRel(prop(p, "Inscription")) ?? "") ?? latestByClient.get(firstRel(prop(p, "Personne")) ?? "");
    if (!engagement) continue;
    seen.push(p.id);
    const before = existing.get(p.id);
    const edited = new Date(p.last_edited_time);
    // Rien n'a bougé dans Notion : pas de nouveau chiffrement à chaque passage
    if (before && before.engagementId === engagement.id && before.notionEditedAt?.getTime() === edited.getTime() && !before.archivedAt) continue;
    const when = dateOf(prop(p, "Date de la session"));
    const values = {
      engagementId: engagement.id, number: num(prop(p, "N°Session")), kind: choice(prop(p, "Type de session")), state: choice(prop(p, "État")) || "Non planifié",
      startsAt: when ? new Date(when.start) : null, endsAt: when?.end ? new Date(when.end) : null,
      keyPointsEnc: hide(engagement.id, text(prop(p, "Points clés travaillés"))), actionsEnc: hide(engagement.id, text(prop(p, "Actions pour le client"))),
      reportShared: !!prop(p, "Compte rendu validé")?.checkbox, notionEditedAt: edited, archivedAt: null, updatedAt: new Date(),
    };
    await db.insert(coachingMeetings).values({ notionPageId: p.id, ...values }).onConflictDoUpdate({ target: coachingMeetings.notionPageId, set: values });
  }
  await db.update(coachingMeetings).set({ archivedAt: new Date() }).where(and(seen.length ? notInArray(coachingMeetings.notionPageId, seen) : undefined, isNull(coachingMeetings.archivedAt)));

  const extended = await applyAccess([...byNotion.values()]);
  const parts = [`${byNotion.size} accompagnement${byNotion.size > 1 ? "s" : ""}`, `${seen.length} séance${seen.length > 1 ? "s" : ""}`];
  if (unmatched) parts.push(`${unmatched} client${unmatched > 1 ? "s" : ""} sans compte Présence à cette adresse`);
  if (extended) parts.push(`${extended} fin${extended > 1 ? "s" : ""} d’accès reportée${extended > 1 ? "s" : ""}`);
  return finish(true, parts.join(" · "));
}

/**
 * Accès au réseau pendant le coaching, puis 6 mois après, quand l'offre a « Accès Présence inclus ».
 * Jamais raccourci : une fin d'accès plus lointaine (abonnement au collectif) reste. Une fiche sans fin d'accès
 * n'en reçoit une que si son accès est seulement individuel.
 */
async function applyAccess(engagements: CoachingEngagement[]): Promise<number> {
  const db = getDb();
  let extended = 0;
  const offers = new Map((await db.select().from(coachingOffers)).map((o) => [o.id, o]));
  for (const e of engagements) {
    const meetings = await db.select().from(coachingMeetings).where(and(eq(coachingMeetings.engagementId, e.id), isNull(coachingMeetings.archivedAt)));
    const accessEndsAt = accessEndFor(accompanimentEnd(e, meetings));
    await db.update(coachingEngagements).set({ accessEndsAt }).where(eq(coachingEngagements.id, e.id));
    if (!accessEndsAt || !e.memberId || !offers.get(e.offerId ?? -1)?.presenceAccess) continue;
    const [m] = await db.select().from(members).where(eq(members.id, e.memberId));
    if (!m) continue;
    const later = m.accessEndsAt ? m.accessEndsAt < accessEndsAt : m.accessType === "individuel";
    if (!later) continue;
    await db.update(members).set({ accessEndsAt }).where(eq(members.id, m.id));
    await db.update(coachingEngagements).set({ accessAppliedAt: new Date() }).where(eq(coachingEngagements.id, e.id));
    extended++;
  }
  return extended;
}

export async function lastCoachingSync() {
  const [row] = await getDb().select().from(coachingSyncRuns).orderBy(desc(coachingSyncRuns.id)).limit(1);
  return row ?? null;
}

/* ───────────── Écriture : le compte rendu d'une séance ───────────── */

// Notion limite un morceau de texte à 2 000 caractères
const richText = (s: string) => (s.match(/[\s\S]{1,1900}/g) ?? []).slice(0, 90).map((content) => ({ type: "text", text: { content } }));

/** Le compte rendu part dans la page Notion de la séance, puis la copie locale suit. */
export async function saveReport(meeting: typeof coachingMeetings.$inferSelect, r: { keyPoints: string; actions: string; shared: boolean }) {
  const page = await updatePage(meeting.notionPageId, { properties: {
    "Points clés travaillés": { rich_text: richText(r.keyPoints.trim()) },
    "Actions pour le client": { rich_text: richText(r.actions.trim()) },
    "Compte rendu validé": { checkbox: r.shared },
  } });
  const id = meeting.engagementId!;
  await getDb().update(coachingMeetings).set({ keyPointsEnc: hide(id, r.keyPoints), actionsEnc: hide(id, r.actions), reportShared: r.shared, notionEditedAt: new Date(page.last_edited_time), updatedAt: new Date() }).where(eq(coachingMeetings.id, meeting.id));
}

/** Les accompagnements d'un membre qui comptent encore (pas abandonnés), le plus récent d'abord. */
export async function engagementsOf(memberId: number) {
  return getDb().select().from(coachingEngagements).where(and(eq(coachingEngagements.memberId, memberId), isNull(coachingEngagements.archivedAt), inArray(coachingEngagements.status, ["En attente", "En cours", "Terminé"]))).orderBy(desc(coachingEngagements.startsOn), desc(coachingEngagements.id));
}
