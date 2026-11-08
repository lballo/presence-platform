import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { coachingEngagements, members, type CoachingEngagement } from "../../db/schema";
import { env } from "./env";
import { createPage, NotionError, queryPages, type NotionPage } from "./notion";
import { richTextToPlain } from "./notionBlocks";

/**
 * Questionnaire de satisfaction du coaching individuel (pas celui des stagiaires des formations, qui reste dans l'outil Qualiopi).
 * Le client répond sans se connecter, par un lien personnel signé, propre à son accompagnement.
 * La réponse part dans la base Notion « Réponses Satisfaction Clients », reliée à l'inscription et à la fiche CRM.
 */

export const satisfactionReady = () => !!env.privateDataKey;

const signature = (engagementId: number) => createHmac("sha256", env.privateDataKey).update(`satisfaction:${engagementId}`).digest("base64url").slice(0, 24);

export const satisfactionUrl = (engagementId: number) => (satisfactionReady() ? `${env.appUrl}/satisfaction/${engagementId}-${signature(engagementId)}` : null);

export function engagementFromToken(token: string): number | null {
  if (!satisfactionReady()) return null;
  const m = /^(\d{1,9})-([A-Za-z0-9_-]{24})$/.exec(token);
  if (!m) return null;
  const id = Number(m[1]);
  const want = Buffer.from(signature(id));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

export type Answers = { satisfaction: number; besoin: number; professionnalisme: number; disponibilite: number; remarques: string };

async function load(token: string) {
  const id = engagementFromToken(token);
  if (!id) return null;
  const db = getDb();
  const [e] = await db.select().from(coachingEngagements).where(and(eq(coachingEngagements.id, id), isNull(coachingEngagements.archivedAt)));
  if (!e) return null;
  const [m] = e.memberId ? await db.select({ firstName: members.firstName }).from(members).where(eq(members.id, e.memberId)) : [];
  const prenom = (m?.firstName || e.clientName.split(" ")[0] || "").trim();
  return { e, prenom };
}

/** Les réponses déjà données pour cet accompagnement : par l'inscription, ou par la fiche CRM pour les anciennes. */
async function answersOf(e: CoachingEngagement): Promise<NotionPage[]> {
  const or: unknown[] = [{ property: "Inscription", relation: { contains: e.notionPageId } }];
  if (e.clientPageId) or.push({ property: "Client lié", relation: { contains: e.clientPageId } });
  return queryPages(env.notionCoachingSatisfaction, { or });
}

/** Ce que la page du questionnaire affiche. Sans lien personnel : le questionnaire anonyme, comme l'ancien lien du site. */
export async function satisfactionForm(token: string | undefined) {
  if (!token) return { valid: true as const, personal: false, prenom: "", programme: "", answered: false };
  const found = await load(token);
  if (!found) return { valid: false as const };
  let answered = false;
  try { answered = (await answersOf(found.e)).some((p) => p.properties.Inscription?.relation?.some((r) => r.id === found.e.notionPageId)); } catch { /* Notion injoignable : le formulaire reste ouvert */ }
  return { valid: true as const, personal: true, prenom: found.prenom, programme: found.e.title, answered };
}

const rich = (s: string) => (s.match(/[\s\S]{1,1900}/g) ?? []).slice(0, 5).map((content) => ({ type: "text", text: { content } }));

export async function submitSatisfaction(token: string | undefined, a: Answers, anonymous: { prenom: string; programme: string }) {
  const found = token ? await load(token) : null;
  if (token && !found) return { ok: false as const, reason: "lien" };
  const prenom = found?.prenom ?? anonymous.prenom.trim();
  const programme = found?.e.title ?? anonymous.programme.trim();
  if (found && (await answersOf(found.e)).some((p) => p.properties.Inscription?.relation?.some((r) => r.id === found.e.notionPageId))) return { ok: true as const, already: true };
  const properties: Record<string, unknown> = {
    Nom: { title: rich(prenom ? `${prenom} — ${programme || "Programme"}` : programme || "Réponse sans nom") },
    "Prénom": { rich_text: rich(prenom) },
    "Programme suivi": { rich_text: rich(programme) },
    "Satisfaction générale": { number: a.satisfaction },
    "Réponse à votre besoin initial": { number: a.besoin },
    "Professionnalisme du coach": { number: a.professionnalisme },
    "Disponibilité du coach": { number: a.disponibilite },
    "Axes d amélioration et remarques": { rich_text: rich(a.remarques.trim()) },
    "Statut traitement": { select: { name: "Nouveau" } },
  };
  if (found) {
    properties.Inscription = { relation: [{ id: found.e.notionPageId }] };
    if (found.e.clientPageId) properties["Client lié"] = { relation: [{ id: found.e.clientPageId }] };
    if (found.e.clientEmail) properties.Email = { email: found.e.clientEmail };
  }
  await createPage({ dataSourceId: env.notionCoachingSatisfaction, properties });
  return { ok: true as const, already: false };
}

/** Pour Laura, dans la fiche de l'accompagnement : le lien à envoyer et les réponses reçues. */
export async function satisfactionFor(e: CoachingEngagement) {
  const url = satisfactionUrl(e.id);
  try {
    const pages = await answersOf(e);
    const n = (p: NotionPage, k: string) => p.properties[k]?.number ?? null;
    const responses = pages
      .map((p) => ({
        id: p.id, at: p.created_time ?? null, notionUrl: p.url ?? `https://www.notion.so/${p.id.replace(/-/g, "")}`,
        satisfaction: n(p, "Satisfaction générale"), besoin: n(p, "Réponse à votre besoin initial"), professionnalisme: n(p, "Professionnalisme du coach"), disponibilite: n(p, "Disponibilité du coach"),
        remarques: richTextToPlain(p.properties["Axes d amélioration et remarques"]?.rich_text).trim(),
        status: p.properties["Statut traitement"]?.select?.name ?? "",
      }))
      .sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
    return { url, responses, error: "" };
  } catch (err) {
    const missing = err instanceof NotionError && err.status === 404;
    return { url, responses: [], error: missing ? "Notion ne trouve pas la base « Réponses Satisfaction Clients » : ajoutez-y la connexion de l’intégration Présence." : err instanceof Error ? err.message : "Notion est injoignable." };
  }
}
