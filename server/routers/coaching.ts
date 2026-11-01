import { z } from "zod";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { coachingSessions, courseLessons, courseSections, journalEntries, members } from "../../db/schema";
import { publicMember } from "../lib/format";
import { open } from "../lib/privateBox";

const adminProc = procFor("admin.panel");

/**
 * /admin › Coaching : seules les réponses que le membre a marquées « À travailler en coaching » sortent d'ici.
 * Toute lecture du journal passe par ce filtre : sans marque, une réponse n'est jamais lue ni déchiffrée pour l'administration.
 */
const isMarked = isNotNull(journalEntries.sharedAt);

const nextOf = (sessions: { memberId: number; title: string; startsAt: Date; durationMin: number; format: string; number: number; total: number; done: boolean }[], memberId: number) => sessions.find((s) => s.memberId === memberId && !s.done && s.startsAt >= new Date()) ?? sessions.find((s) => s.memberId === memberId && !s.done) ?? null;

export const coachingRouter = createRouter({
  /** Les clients suivis, et ceux qui ont marqué une réponse sans accompagnement en cours. */
  clients: adminProc.query(async ({ ctx }) => {
    const db = getDb();
    const [marked, sessions] = await Promise.all([
      db.select({ memberId: journalEntries.memberId, discussedAt: journalEntries.coachingDiscussedAt }).from(journalEntries).where(isMarked),
      db.select().from(coachingSessions).orderBy(asc(coachingSessions.startsAt)),
    ]);
    const ids = [...new Set([...marked.map((m) => m.memberId), ...sessions.map((s) => s.memberId)])];
    const people = await db.select().from(members).where(and(isNull(members.deletedAt), or(ne(members.accessType, "collectif"), ids.length ? inArray(members.id, ids) : undefined)));
    return people.map((m) => {
      const mine = marked.filter((x) => x.memberId === m.id);
      const next = nextOf(sessions, m.id);
      return {
        id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), photoUrl: m.photoUrl, initials: publicMember(m).initials, jobTitle: m.jobTitle, followed: m.accessType !== "collectif" || sessions.some((s) => s.memberId === m.id && !s.done),
        toDiscuss: mine.filter((x) => !x.discussedAt).length, discussed: mine.filter((x) => x.discussedAt).length,
        next: next ? { title: next.title, startsAt: next.startsAt } : null,
      };
    }).filter((c) => c.id !== ctx.memberId || c.toDiscuss + c.discussed > 0).sort((a, b) => b.toDiscuss - a.toDiscuss || a.name.localeCompare(b.name, "fr"));
  }),

  /** La fiche d'un client : ses réponses marquées, en préparation de sa prochaine séance. */
  client: adminProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const db = getDb();
    const [m] = await db.select().from(members).where(and(eq(members.id, input.id), isNull(members.deletedAt))).limit(1);
    if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Cette fiche n’existe pas." });
    const [rows, sessions] = await Promise.all([
      db.select({ e: journalEntries, sectionTitle: courseSections.title })
        .from(journalEntries)
        .leftJoin(courseLessons, eq(courseLessons.id, journalEntries.lessonId))
        .leftJoin(courseSections, eq(courseSections.id, courseLessons.sectionId))
        .where(and(eq(journalEntries.memberId, m.id), isMarked))
        .orderBy(desc(journalEntries.sharedAt)),
      db.select().from(coachingSessions).where(eq(coachingSessions.memberId, m.id)).orderBy(asc(coachingSessions.startsAt)),
    ]);
    const next = nextOf(sessions, m.id);
    return {
      id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), firstName: m.firstName, photoUrl: m.photoUrl, initials: publicMember(m).initials, jobTitle: m.jobTitle, followed: m.accessType !== "collectif" || sessions.some((s) => !s.done),
      next: next ? { title: next.title, startsAt: next.startsAt, durationMin: next.durationMin, format: next.format, number: next.number, total: next.total } : null,
      entries: rows.map(({ e, sectionTitle }) => ({
        id: e.id, courseTitle: e.courseTitle, sectionTitle: sectionTitle ?? "", lessonTitle: e.lessonTitle, question: e.questionText, isNote: e.kind === "reflexion",
        answer: open(m.id, e.answerEnc), markedAt: e.sharedAt, updatedAt: e.updatedAt, discussedAt: e.coachingDiscussedAt,
      })),
    };
  }),

  /** « Abordée en séance », ou de nouveau à aborder. Une réponse que le membre a retirée ne se touche plus. */
  setDiscussed: adminProc.input(z.object({ id: z.number().int(), discussed: z.boolean() })).mutation(async ({ input }) => {
    const [row] = await getDb().update(journalEntries).set({ coachingDiscussedAt: input.discussed ? new Date() : null }).where(and(eq(journalEntries.id, input.id), isMarked)).returning({ id: journalEntries.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cette réponse n’est plus partagée avec vous." });
    return { ok: true };
  }),
});
