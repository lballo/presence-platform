import { z } from "zod";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor, publicProc } from "../middleware";
import { getDb } from "../queries/connection";
import { coachingEngagements, coachingGoals, coachingJournal, coachingMeetings, coachingNotes, coachingOffers, courseLessons, courseSections, journalEntries, members, workflows, type CoachingEngagement, type CoachingMeeting } from "../../db/schema";
import { publicMember } from "../lib/format";
import { open } from "../lib/privateBox";
import { env } from "../lib/env";
import { notionMessage } from "../lib/notion";
import { counted, engagementsOf, hide, lastCoachingSync, reveal, saveReport, syncCoaching } from "../lib/coachingSync";
import { MIDPOINT, runCoachingMidpoint } from "../lib/coachingMidpoint";
import { satisfactionFor, satisfactionForm, satisfactionUrl, submitSatisfaction } from "../lib/coachingSatisfaction";

const adminProc = procFor("admin.panel");
const memberProc = procFor("profile.use");

/**
 * Le journal n'est lu pour Laura que si le membre a marqué une réponse « À travailler en coaching » :
 * sans marque, une réponse n'est jamais lue ni déchiffrée pour l'administration.
 */
const isMarked = isNotNull(journalEntries.sharedAt);

const live = (m: CoachingMeeting) => !m.archivedAt;
const upcoming = (meetings: CoachingMeeting[]) => meetings.filter((m) => live(m) && m.state === "Planifié" && m.startsAt && m.startsAt.getTime() >= Date.now() - 3 * 3600 * 1000).sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())[0] ?? null;
const notionUrl = (id: string) => `https://www.notion.so/${id.replace(/-/g, "")}`;

type Step = { key: string; label: string; state: "fait" | "prevu" | "a_venir"; date: Date | null };

/** Les jalons de l'accompagnement, tels que Notion les connaît : diagnostic, séances, mi-parcours, fin de parcours, suivi. */
function milestones(e: CoachingEngagement, meetings: CoachingMeeting[]): Step[] {
  const of = (kind: string): Step["state"] => (meetings.some((m) => m.kind === kind && m.state === "Terminé") ? "fait" : meetings.some((m) => m.kind === kind && m.state === "Planifié") ? "prevu" : "a_venir");
  const dateOf = (kind: string) => meetings.filter((m) => m.kind === kind && m.startsAt && ["Terminé", "Planifié"].includes(m.state)).sort((a, b) => b.startsAt!.getTime() - a.startsAt!.getTime())[0]?.startsAt ?? null;
  const done = meetings.filter(counted).length;
  const planned = e.sessionsPlanned ?? 0;
  return [
    { key: "diagnostic", label: "Diagnostic", state: of("Diagnostic"), date: dateOf("Diagnostic") },
    { key: "seances", label: planned ? `Séances · ${done} sur ${planned}` : `Séances · ${done}`, state: planned && done >= planned ? "fait" : done > 0 ? "prevu" : "a_venir", date: null },
    { key: "mi", label: "Mi-parcours", state: of("Mi-parcours"), date: dateOf("Mi-parcours") },
    { key: "fin", label: "Fin de parcours", state: of("Fin de parcours"), date: dateOf("Fin de parcours") },
    { key: "suivi", label: "Suivi après l’accompagnement", state: of("Suivi après accompagnement"), date: dateOf("Suivi après accompagnement") },
  ];
}

const meetingsOf = (engagementId: number) => getDb().select().from(coachingMeetings).where(and(eq(coachingMeetings.engagementId, engagementId), isNull(coachingMeetings.archivedAt))).orderBy(asc(coachingMeetings.startsAt), asc(coachingMeetings.number));
const goalsOf = (engagementId: number) => getDb().select().from(coachingGoals).where(eq(coachingGoals.engagementId, engagementId)).orderBy(asc(coachingGoals.position), asc(coachingGoals.id));

async function requireEngagement(id: number) {
  const [e] = await getDb().select().from(coachingEngagements).where(and(eq(coachingEngagements.id, id), isNull(coachingEngagements.archivedAt)));
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Cet accompagnement n’est plus dans vos bases Notion." });
  return e;
}

/** Le résumé que voient le client, son tableau de bord et Laura. */
function summary(e: CoachingEngagement, meetings: CoachingMeeting[]) {
  const done = meetings.filter(counted).length;
  const next = upcoming(meetings);
  return {
    id: e.id, title: e.title, status: e.status, startsOn: e.startsOn, plannedEndOn: e.plannedEndOn,
    planned: e.sessionsPlanned, done, remaining: e.sessionsPlanned ? Math.max(0, e.sessionsPlanned - done) : null,
    next: next ? { kind: next.kind, number: next.number, startsAt: next.startsAt!, endsAt: next.endsAt } : null,
  };
}

/** Ce que le client voit de son accompagnement (le plus récent). Jamais les notes privées de Laura. */
export async function clientView(memberId: number) {
  const [e] = await engagementsOf(memberId);
  if (!e) return null;
  const [meetings, goals, journal, [member]] = await Promise.all([
    meetingsOf(e.id), goalsOf(e.id),
    getDb().select().from(coachingJournal).where(and(eq(coachingJournal.engagementId, e.id), eq(coachingJournal.memberId, memberId))).orderBy(desc(coachingJournal.createdAt)),
    getDb().select({ accessEndsAt: members.accessEndsAt }).from(members).where(eq(members.id, memberId)),
  ]);
  return {
    ...summary(e, meetings),
    accessEndsAt: member?.accessEndsAt ?? null,
    calendlyUrl: env.calendlyUrl,
    milestones: milestones(e, meetings),
    meetings: meetings.filter((m) => m.state !== "Annulée").map((m) => ({ id: m.id, kind: m.kind, number: m.number, state: m.state, startsAt: m.startsAt })),
    goals: goals.map((g) => ({ id: g.id, text: reveal(e.id, g.textEnc), done: !!g.doneAt })),
    reports: meetings.filter((m) => m.reportShared).reverse().map((m) => ({ id: m.id, kind: m.kind, number: m.number, startsAt: m.startsAt, keyPoints: reveal(e.id, m.keyPointsEnc), actions: reveal(e.id, m.actionsEnc) })),
    inspiration: reveal(e.id, e.inspirationEnc),
    exercise: reveal(e.id, e.exerciseEnc),
    journal: journal.map((j) => ({ id: j.id, text: reveal(e.id, j.textEnc), createdAt: j.createdAt, updatedAt: j.updatedAt })),
    // Le questionnaire de satisfaction, proposé une fois l'accompagnement terminé
    satisfactionUrl: e.status === "Terminé" ? satisfactionUrl(e.id) : null,
  };
}

async function myEngagement(memberId: number) {
  const [e] = await engagementsOf(memberId);
  if (!e) throw new TRPCError({ code: "FORBIDDEN", message: "Cet espace est réservé aux clients du coaching individuel." });
  return e;
}

const text = z.string().trim().max(8000);
const note = z.number().int().min(1).max(5);
const token = z.string().max(80).optional();

export const coachingRouter = createRouter({
  /* ───────────── Le client ───────────── */

  mine: memberProc.query(({ ctx }) => clientView(ctx.memberId)),

  /** Le carnet d'introspection, partagé avec Laura. */
  addJournal: memberProc.input(z.object({ text: text.min(1, "Écrivez quelques mots.") })).mutation(async ({ ctx, input }) => {
    const e = await myEngagement(ctx.memberId);
    await getDb().insert(coachingJournal).values({ engagementId: e.id, memberId: ctx.memberId, textEnc: hide(e.id, input.text) });
    return { ok: true };
  }),
  updateJournal: memberProc.input(z.object({ id: z.number().int(), text: text.min(1, "Écrivez quelques mots, ou effacez cette page.") })).mutation(async ({ ctx, input }) => {
    const e = await myEngagement(ctx.memberId);
    const [row] = await getDb().update(coachingJournal).set({ textEnc: hide(e.id, input.text), updatedAt: new Date() }).where(and(eq(coachingJournal.id, input.id), eq(coachingJournal.memberId, ctx.memberId), eq(coachingJournal.engagementId, e.id))).returning({ id: coachingJournal.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return { ok: true };
  }),
  removeJournal: memberProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(coachingJournal).where(and(eq(coachingJournal.id, input.id), eq(coachingJournal.memberId, ctx.memberId)));
    return { ok: true };
  }),

  /* ───────────── Le questionnaire de satisfaction (sans connexion, par lien personnel) ───────────── */

  satisfactionForm: publicProc.input(z.object({ token })).query(({ input }) => satisfactionForm(input.token)),

  submitSatisfaction: publicProc.input(z.object({
    token,
    satisfaction: note, besoin: note, professionnalisme: note, disponibilite: note,
    remarques: z.string().max(8000).default(""),
    prenom: z.string().max(120).default(""), programme: z.string().max(200).default(""),
  })).mutation(async ({ input }) => {
    try {
      return await submitSatisfaction(input.token, input, { prenom: input.prenom, programme: input.programme });
    } catch (e) {
      console.error("Satisfaction coaching :", e);
      throw new TRPCError({ code: "BAD_GATEWAY", message: "Votre réponse n’a pas pu être enregistrée. Réessayez dans un instant, ou écrivez à contact@lauraballo.com." });
    }
  }),

  /* ───────────── L'outil de suivi de Laura ───────────── */

  /** Le lien du questionnaire à envoyer au client, et ses réponses (lues dans Notion). */
  satisfaction: adminProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => satisfactionFor(await requireEngagement(input.id))),

  overview: adminProc.query(async () => {
    const db = getDb();
    const [engagements, sync, [model]] = await Promise.all([
      db.select({ e: coachingEngagements, member: members }).from(coachingEngagements).leftJoin(members, eq(members.id, coachingEngagements.memberId)).where(isNull(coachingEngagements.archivedAt)).orderBy(desc(coachingEngagements.startsOn)),
      lastCoachingSync(),
      db.select().from(workflows).where(eq(workflows.key, MIDPOINT)),
    ]);
    const ids = engagements.map((x) => x.e.id);
    const meetings = ids.length ? await db.select().from(coachingMeetings).where(and(inArray(coachingMeetings.engagementId, ids), isNull(coachingMeetings.archivedAt))) : [];
    const memberIds = engagements.map((x) => x.member?.id).filter((x): x is number => !!x);
    const marked = memberIds.length ? await db.select({ memberId: journalEntries.memberId, discussedAt: journalEntries.coachingDiscussedAt }).from(journalEntries).where(and(isMarked, inArray(journalEntries.memberId, memberIds))) : [];
    return {
      sync: sync ? { at: sync.finishedAt ?? sync.startedAt, status: sync.status, detail: sync.detail } : null,
      notionReady: !!env.notionToken,
      midpoint: { active: !!model?.active, email: !!model?.emailEnabled },
      clients: engagements.map(({ e, member }) => ({
        ...summary(e, meetings.filter((m) => m.engagementId === e.id)),
        clientName: e.clientName || (member ? `${member.firstName} ${member.lastName}`.trim() : "Client"),
        member: member && !member.deletedAt ? { id: member.id, initials: publicMember(member).initials, photoUrl: member.photoUrl } : null,
        midpointEmailAt: e.midpointEmailAt,
        toDiscuss: member ? marked.filter((x) => x.memberId === member.id && !x.discussedAt).length : 0,
      })),
    };
  }),

  sync: adminProc.mutation(async () => {
    if (!env.notionToken) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La clé Notion manque sur le serveur." });
    const r = await syncCoaching();
    // Ce que Notion vient d'apprendre peut déclencher l'invitation de mi-parcours, sans attendre le passage régulier
    if (r.ok) await runCoachingMidpoint();
    return r;
  }),

  /** L'e-mail de mi-parcours : automatique par défaut, Laura peut le couper. */
  setMidpointEmail: adminProc.input(z.object({ enabled: z.boolean() })).mutation(async ({ input }) => {
    await getDb().update(workflows).set({ emailEnabled: input.enabled, updatedAt: new Date() }).where(eq(workflows.key, MIDPOINT));
    return { ok: true };
  }),

  /** La fiche d'un accompagnement : tout ce que Laura sait et écrit, notes privées comprises. */
  engagement: adminProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const db = getDb();
    const e = await requireEngagement(input.id);
    const [meetings, goals, notes, journal, [offer], member] = await Promise.all([
      meetingsOf(e.id), goalsOf(e.id),
      db.select().from(coachingNotes).where(eq(coachingNotes.engagementId, e.id)).orderBy(desc(coachingNotes.createdAt)),
      db.select().from(coachingJournal).where(eq(coachingJournal.engagementId, e.id)).orderBy(desc(coachingJournal.createdAt)),
      e.offerId ? db.select().from(coachingOffers).where(eq(coachingOffers.id, e.offerId)) : Promise.resolve([]),
      e.memberId ? db.query.members.findFirst({ where: and(eq(members.id, e.memberId), isNull(members.deletedAt)) }) : Promise.resolve(undefined),
    ]);
    const marked = member ? await db.select({ e: journalEntries, sectionTitle: courseSections.title }).from(journalEntries)
      .leftJoin(courseLessons, eq(courseLessons.id, journalEntries.lessonId)).leftJoin(courseSections, eq(courseSections.id, courseLessons.sectionId))
      .where(and(eq(journalEntries.memberId, member.id), isMarked)).orderBy(desc(journalEntries.sharedAt)) : [];
    return {
      ...summary(e, meetings),
      clientName: e.clientName || (member ? `${member.firstName} ${member.lastName}`.trim() : "Client"),
      clientEmail: e.clientEmail,
      member: member ? { id: member.id, name: `${member.firstName} ${member.lastName}`.trim(), firstName: member.firstName, initials: publicMember(member).initials, photoUrl: member.photoUrl, jobTitle: member.jobTitle, accessEndsAt: member.accessEndsAt } : null,
      offer: offer ? { title: offer.title, presenceAccess: offer.presenceAccess } : null,
      accessEndsAt: e.accessEndsAt, accessAppliedAt: e.accessAppliedAt, midpointEmailAt: e.midpointEmailAt,
      notionUrl: notionUrl(e.notionPageId),
      milestones: milestones(e, meetings),
      meetings: meetings.map((m) => ({ id: m.id, kind: m.kind, number: m.number, state: m.state, startsAt: m.startsAt, endsAt: m.endsAt, keyPoints: reveal(e.id, m.keyPointsEnc), actions: reveal(e.id, m.actionsEnc), shared: m.reportShared, notionUrl: notionUrl(m.notionPageId) })),
      goals: goals.map((g) => ({ id: g.id, text: reveal(e.id, g.textEnc), done: !!g.doneAt })),
      notes: notes.map((n) => ({ id: n.id, meetingId: n.meetingId, text: reveal(e.id, n.textEnc), createdAt: n.createdAt, updatedAt: n.updatedAt })),
      inspiration: reveal(e.id, e.inspirationEnc),
      exercise: reveal(e.id, e.exerciseEnc),
      journal: journal.map((j) => ({ id: j.id, text: reveal(e.id, j.textEnc), createdAt: j.createdAt })),
      marked: marked.map(({ e: j, sectionTitle }) => ({ id: j.id, courseTitle: j.courseTitle, sectionTitle: sectionTitle ?? "", lessonTitle: j.lessonTitle, question: j.questionText, isNote: j.kind === "reflexion", answer: member ? open(member.id, j.answerEnc) : null, markedAt: j.sharedAt, discussedAt: j.coachingDiscussedAt })),
    };
  }),

  /** Le compte rendu d'une séance : écrit dans la page Notion de la séance ; « partagé », il devient visible du client. */
  saveReport: adminProc.input(z.object({ meetingId: z.number().int(), keyPoints: text, actions: text, shared: z.boolean() })).mutation(async ({ input }) => {
    const [m] = await getDb().select().from(coachingMeetings).where(and(eq(coachingMeetings.id, input.meetingId), isNull(coachingMeetings.archivedAt)));
    if (!m?.engagementId) throw new TRPCError({ code: "NOT_FOUND", message: "Cette séance n’est plus dans Notion." });
    try { await saveReport(m, input); } catch (e) { throw new TRPCError({ code: "BAD_GATEWAY", message: notionMessage(e) }); }
    return { ok: true };
  }),

  addGoal: adminProc.input(z.object({ engagementId: z.number().int(), text: text.min(1) })).mutation(async ({ input }) => {
    const e = await requireEngagement(input.engagementId);
    const goals = await goalsOf(e.id);
    await getDb().insert(coachingGoals).values({ engagementId: e.id, textEnc: hide(e.id, input.text), position: goals.length });
    return { ok: true };
  }),
  updateGoal: adminProc.input(z.object({ id: z.number().int(), text: text.min(1).optional(), done: z.boolean().optional() })).mutation(async ({ input }) => {
    const [g] = await getDb().select().from(coachingGoals).where(eq(coachingGoals.id, input.id));
    if (!g) throw new TRPCError({ code: "NOT_FOUND" });
    await getDb().update(coachingGoals).set({ ...(input.text !== undefined ? { textEnc: hide(g.engagementId, input.text) } : {}), ...(input.done !== undefined ? { doneAt: input.done ? new Date() : null } : {}), updatedAt: new Date() }).where(eq(coachingGoals.id, g.id));
    return { ok: true };
  }),
  removeGoal: adminProc.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    await getDb().delete(coachingGoals).where(eq(coachingGoals.id, input.id));
    return { ok: true };
  }),

  /** Notes privées : chiffrées, jamais montrées au client. */
  addNote: adminProc.input(z.object({ engagementId: z.number().int(), meetingId: z.number().int().nullable().default(null), text: text.min(1) })).mutation(async ({ input }) => {
    const e = await requireEngagement(input.engagementId);
    await getDb().insert(coachingNotes).values({ engagementId: e.id, meetingId: input.meetingId, textEnc: hide(e.id, input.text) });
    return { ok: true };
  }),
  updateNote: adminProc.input(z.object({ id: z.number().int(), text: text.min(1) })).mutation(async ({ input }) => {
    const [n] = await getDb().select().from(coachingNotes).where(eq(coachingNotes.id, input.id));
    if (!n) throw new TRPCError({ code: "NOT_FOUND" });
    await getDb().update(coachingNotes).set({ textEnc: hide(n.engagementId, input.text), updatedAt: new Date() }).where(eq(coachingNotes.id, n.id));
    return { ok: true };
  }),
  removeNote: adminProc.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    await getDb().delete(coachingNotes).where(eq(coachingNotes.id, input.id));
    return { ok: true };
  }),

  /** Pour le client : une inspiration, un exercice ou un défi. */
  setForClient: adminProc.input(z.object({ engagementId: z.number().int(), inspiration: text, exercise: text })).mutation(async ({ input }) => {
    const e = await requireEngagement(input.engagementId);
    await getDb().update(coachingEngagements).set({ inspirationEnc: hide(e.id, input.inspiration), exerciseEnc: hide(e.id, input.exercise), updatedAt: new Date() }).where(eq(coachingEngagements.id, e.id));
    return { ok: true };
  }),

  /** « Abordée en séance », ou de nouveau à aborder. Une réponse que le membre a retirée ne se touche plus. */
  setDiscussed: adminProc.input(z.object({ id: z.number().int(), discussed: z.boolean() })).mutation(async ({ input }) => {
    const [row] = await getDb().update(journalEntries).set({ coachingDiscussedAt: input.discussed ? new Date() : null }).where(and(eq(journalEntries.id, input.id), isMarked)).returning({ id: journalEntries.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cette réponse n’est plus partagée avec vous." });
    return { ok: true };
  }),
});
