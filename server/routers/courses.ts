import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { courseEnrollments, courseModuleHashtags, courseModules, journalEntries, members, moduleProgress, testResults } from "../../db/schema";
import { logActivity, touchEnrollment } from "../lib/activity";
import { consentNeeded, memoryActive, memorySettings, rememberModule } from "../lib/coachMemory";
import { isQuestion, memberBlocks, plainOf, type CourseBlock } from "../lib/courseBlocks";
import { memberCourses, moduleView, readableModule } from "../lib/courseState";
import { notify } from "../lib/notify";
import { open, seal } from "../lib/privateBox";

const courseProc = procFor("course.use");
const NOTE = "note"; // une réflexion libre, en plus des questions de l'exercice
const fullName = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`.trim();

/** Prévenir l'administration qu'un membre vient de lui partager quelque chose. */
async function notifyShared(member: { id: number; firstName: string; lastName: string }, what: string) {
  const admins = await getDb().select({ id: members.id }).from(members).where(and(eq(members.role, "administrateur"), eq(members.status, "actif"), isNull(members.deletedAt)));
  await notify(admins.map((a) => a.id).filter((id) => id !== member.id), { title: `${fullName(member)} a partagé ${what} avec vous`, href: `/admin/membres/${member.id}` });
}

const flatten = (blocks: CourseBlock[]): CourseBlock[] => blocks.flatMap((b) => [b, ...("children" in b && b.children ? flatten(b.children) : [])]);

const resultSchema = z.object({
  label: z.string().trim().max(200).default(""),
  summary: z.string().trim().max(4000).default(""),
  score: z.union([z.number(), z.string().max(40)]).nullable().optional(),
  details: z.record(z.string(), z.union([z.string().max(1000), z.number(), z.boolean()])).optional(),
});

export const coursesRouter = createRouter({
  /** Mes formations, côte à côte. */
  list: courseProc.query(async ({ ctx }) => {
    const rows = await memberCourses(ctx.member);
    return rows.map(({ course, enrollment, done, total, next }) => ({
      id: course.id, title: course.title, tagline: course.tagline, emoji: course.emoji, coverUrl: course.coverUrl, rhythm: course.rhythm,
      startedAt: enrollment?.startedAt ?? null, fullAccess: !!enrollment?.fullAccessAt, finishedAt: enrollment?.finishedAt ?? null, done, total,
      next: next ? { id: next.id, title: next.title, position: next.position, open: next.open, opensAt: next.opensAt } : null,
    }));
  }),

  /** Une formation : sa présentation et ses modules, y compris ceux à venir, avec leur date. */
  course: courseProc.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const [state] = await memberCourses(ctx.member, input.id);
    if (!state) throw new TRPCError({ code: "NOT_FOUND", message: "Cette formation n’existe pas ou n’est pas accessible." });
    const { course, enrollment, modules, done, total, next } = state;
    const settings = await memorySettings(ctx.memberId);
    return {
      id: course.id, title: course.title, tagline: course.tagline, emoji: course.emoji, coverUrl: course.coverUrl, rhythm: course.rhythm,
      description: memberBlocks(course.content.description ?? []),
      startedAt: enrollment?.startedAt ?? null, fullAccess: !!enrollment?.fullAccessAt, finishedAt: enrollment?.finishedAt ?? null,
      modules, done, total, nextId: next?.id ?? null, consentNeeded: consentNeeded(settings),
    };
  }),

  /** Commencer : le premier module s'ouvre aujourd'hui, puis un nouveau module chaque semaine. */
  start: courseProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [state] = await memberCourses(ctx.member, input.id);
    if (!state) throw new TRPCError({ code: "NOT_FOUND", message: "Cette formation n’est pas accessible." });
    if (state.enrollment) return { ok: true };
    await getDb().insert(courseEnrollments).values({ courseId: input.id, memberId: ctx.memberId }).onConflictDoNothing();
    await logActivity(ctx.memberId, "formation_commencee", { courseId: input.id, label: state.course.title });
    return { ok: true };
  }),

  /** La lecture d'un module, avec mes réponses. */
  module: courseProc.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const { mod, state } = await readableModule(ctx.member, input.id);
    const [view, answers, tests, [progress]] = await Promise.all([
      moduleView(mod, state.course),
      db.select().from(journalEntries).where(and(eq(journalEntries.memberId, ctx.memberId), eq(journalEntries.moduleId, mod.id))),
      db.select().from(testResults).where(and(eq(testResults.memberId, ctx.memberId), eq(testResults.moduleId, mod.id))).orderBy(desc(testResults.passedAt)),
      db.select().from(moduleProgress).where(and(eq(moduleProgress.memberId, ctx.memberId), eq(moduleProgress.moduleId, mod.id))).limit(1),
    ]);
    const index = state.modules.findIndex((m) => m.id === mod.id);
    const next = state.modules[index + 1];
    return {
      ...view,
      preview: false,
      answers: answers.map((a) => ({ id: a.id, questionId: a.questionId, answer: open(ctx.memberId, a.answerEnc), sharedAt: a.sharedAt, updatedAt: a.updatedAt })),
      testResults: tests.map((t) => ({ id: t.id, result: parseResult(open(ctx.memberId, t.resultEnc)), passedAt: t.passedAt, sharedAt: t.sharedAt })),
      challengeDoneAt: progress?.challengeDoneAt ?? null,
      challengeNote: progress?.challengeNoteEnc ? (open(ctx.memberId, progress.challengeNoteEnc) ?? "") : "",
      completedAt: progress?.completedAt ?? null,
      next: next ? { id: next.id, title: next.title, open: next.open, opensAt: next.opensAt } : null,
      prev: index > 0 ? { id: state.modules[index - 1].id, title: state.modules[index - 1].title } : null,
    };
  }),

  /** Module ouvert : inscrit une fois au journal d'activité. */
  markOpened: courseProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { mod, entry, state } = await readableModule(ctx.member, input.id);
    const onCalendar = state.course.rhythm === "complet" || (!!entry.opensAt && entry.opensAt <= new Date());
    const [row] = await db.insert(moduleProgress).values({ memberId: ctx.memberId, moduleId: mod.id, openedAt: new Date(), openedViaFullAccess: !onCalendar }).onConflictDoNothing().returning();
    if (!row) return { first: false };
    await logActivity(ctx.memberId, "module_ouvert", { courseId: mod.courseId, moduleId: mod.id, label: mod.title });
    await touchEnrollment(ctx.memberId, mod.courseId);
    return { first: true };
  }),

  /** Une réponse dans mon journal privé. Vide : la réponse est retirée. */
  saveAnswer: courseProc
    .input(z.object({ moduleId: z.number().int(), questionId: z.string().min(1).max(64), answer: z.string().max(8000) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { mod, state } = await readableModule(ctx.member, input.moduleId);
      const question = input.questionId === NOTE ? null : flatten(mod.content.sections?.exercice ?? []).find((b) => b.id === input.questionId && isQuestion(b));
      if (input.questionId !== NOTE && !question) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette question n’existe plus dans le module." });
      const where = and(eq(journalEntries.memberId, ctx.memberId), eq(journalEntries.moduleId, mod.id), eq(journalEntries.questionId, input.questionId));
      const answer = input.answer.trim();
      if (!answer) { await db.delete(journalEntries).where(where); await touchEnrollment(ctx.memberId, mod.courseId); return { id: null }; }
      const answerEnc = seal(ctx.memberId, answer);
      const questionText = question && "html" in question ? plainOf(question.html) : "";
      const [row] = await db.insert(journalEntries)
        .values({ memberId: ctx.memberId, moduleId: mod.id, courseTitle: state.course.title, moduleTitle: mod.title, questionId: input.questionId, questionText, answerEnc })
        .onConflictDoUpdate({ target: [journalEntries.memberId, journalEntries.moduleId, journalEntries.questionId], set: { answerEnc, questionText, courseTitle: state.course.title, moduleTitle: mod.title, updatedAt: new Date() } })
        .returning({ id: journalEntries.id });
      await touchEnrollment(ctx.memberId, mod.courseId);
      return { id: row.id };
    }),

  /** Partager une réponse avec Laura, ou reprendre ce partage. */
  shareAnswer: courseProc.input(z.object({ id: z.number().int(), shared: z.boolean() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb().update(journalEntries).set({ sharedAt: input.shared ? new Date() : null }).where(and(eq(journalEntries.id, input.id), eq(journalEntries.memberId, ctx.memberId))).returning({ id: journalEntries.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cette réponse n’existe plus." });
    if (input.shared) await notifyShared(ctx.member, "une réponse de son journal");
    return { ok: true };
  }),

  shareTest: courseProc.input(z.object({ id: z.number().int(), shared: z.boolean() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb().update(testResults).set({ sharedAt: input.shared ? new Date() : null }).where(and(eq(testResults.id, input.id), eq(testResults.memberId, ctx.memberId))).returning({ id: testResults.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Ce résultat n’existe plus." });
    if (input.shared) await notifyShared(ctx.member, "un résultat de test");
    return { ok: true };
  }),

  /** Le défi dans le réseau : relevé ou non, avec une note facultative. */
  saveChallenge: courseProc.input(z.object({ moduleId: z.number().int(), done: z.boolean(), note: z.string().max(4000).default("") })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { mod } = await readableModule(ctx.member, input.moduleId);
    const note = input.note.trim();
    const set = { challengeDoneAt: input.done ? new Date() : null, challengeNoteEnc: input.done && note ? seal(ctx.memberId, note) : "" };
    const [before] = await db.select({ done: moduleProgress.challengeDoneAt }).from(moduleProgress).where(and(eq(moduleProgress.memberId, ctx.memberId), eq(moduleProgress.moduleId, mod.id))).limit(1);
    await db.insert(moduleProgress).values({ memberId: ctx.memberId, moduleId: mod.id, openedAt: new Date(), ...set }).onConflictDoUpdate({ target: [moduleProgress.memberId, moduleProgress.moduleId], set });
    if (input.done && !before?.done) await logActivity(ctx.memberId, "defi_releve", { courseId: mod.courseId, moduleId: mod.id, label: mod.title });
    await touchEnrollment(ctx.memberId, mod.courseId);
    return { ok: true };
  }),

  /** Le résultat d'un test intégré, reçu par la page. L'interface a déjà vérifié son origine. */
  saveTestResult: courseProc.input(z.object({ moduleId: z.number().int(), result: resultSchema })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { mod, state } = await readableModule(ctx.member, input.moduleId);
    if (!mod.testUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce module n’a pas de test." });
    const [row] = await db.insert(testResults).values({ memberId: ctx.memberId, moduleId: mod.id, courseTitle: state.course.title, moduleTitle: mod.title, resultEnc: seal(ctx.memberId, JSON.stringify(input.result)) }).returning({ id: testResults.id });
    await logActivity(ctx.memberId, "test_passe", { courseId: mod.courseId, moduleId: mod.id, label: mod.title });
    await touchEnrollment(ctx.memberId, mod.courseId);
    return { id: row.id };
  }),

  /** « J'ai terminé » : c'est ce geste qui met à jour la mémoire du coach, si le membre l'a acceptée. */
  complete: courseProc.input(z.object({ moduleId: z.number().int(), done: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { mod, state } = await readableModule(ctx.member, input.moduleId);
    const [before] = await db.select().from(moduleProgress).where(and(eq(moduleProgress.memberId, ctx.memberId), eq(moduleProgress.moduleId, mod.id))).limit(1);
    const firstTime = input.done && !before?.completedAt;
    const set = { completedAt: input.done ? (before?.completedAt ?? new Date()) : null };
    await db.insert(moduleProgress).values({ memberId: ctx.memberId, moduleId: mod.id, openedAt: new Date(), ...set }).onConflictDoUpdate({ target: [moduleProgress.memberId, moduleProgress.moduleId], set });
    await touchEnrollment(ctx.memberId, mod.courseId);
    if (firstTime) await logActivity(ctx.memberId, "module_termine", { courseId: mod.courseId, moduleId: mod.id, label: mod.title });
    // La formation est finie quand tous ses modules publiés le sont
    const doneIds = new Set(state.modules.filter((m) => m.done).map((m) => m.id));
    if (input.done) doneIds.add(mod.id); else doneIds.delete(mod.id);
    const finished = state.modules.length > 0 && state.modules.every((m) => doneIds.has(m.id));
    if (finished && !state.enrollment?.finishedAt) await logActivity(ctx.memberId, "formation_terminee", { courseId: mod.courseId, label: state.course.title });
    await db.update(courseEnrollments).set({ finishedAt: finished ? (state.enrollment?.finishedAt ?? new Date()) : null }).where(and(eq(courseEnrollments.memberId, ctx.memberId), eq(courseEnrollments.courseId, mod.courseId)));
    // En arrière-plan : la page n'attend pas le service d'IA. Une seule fois par module.
    const settings = await memorySettings(ctx.memberId);
    if (firstTime && memoryActive(settings) && before?.memoryStatus !== "fait") {
      await db.update(moduleProgress).set({ memoryStatus: "en_attente" }).where(and(eq(moduleProgress.memberId, ctx.memberId), eq(moduleProgress.moduleId, mod.id)));
      void rememberModule(ctx.memberId, mod.id);
    }
    return { finished };
  }),

  /** Tout mon journal : réponses, réflexions, résultats de tests et notes de défis. Visible de moi seul·e. */
  journal: courseProc.query(async ({ ctx }) => {
    const db = getDb();
    const [entries, tests, challenges] = await Promise.all([
      db.select().from(journalEntries).where(eq(journalEntries.memberId, ctx.memberId)).orderBy(desc(journalEntries.updatedAt)),
      db.select().from(testResults).where(eq(testResults.memberId, ctx.memberId)).orderBy(desc(testResults.passedAt)),
      db.select({ moduleId: moduleProgress.moduleId, note: moduleProgress.challengeNoteEnc, doneAt: moduleProgress.challengeDoneAt, title: courseModules.title, courseId: courseModules.courseId }).from(moduleProgress).innerJoin(courseModules, eq(courseModules.id, moduleProgress.moduleId)).where(and(eq(moduleProgress.memberId, ctx.memberId))),
    ]);
    return {
      entries: entries.map((e) => ({ id: e.id, moduleId: e.moduleId, courseTitle: e.courseTitle, moduleTitle: e.moduleTitle, question: e.questionText, isNote: e.questionId === NOTE, answer: open(ctx.memberId, e.answerEnc), sharedAt: e.sharedAt, updatedAt: e.updatedAt })),
      tests: tests.map((t) => ({ id: t.id, moduleId: t.moduleId, courseTitle: t.courseTitle, moduleTitle: t.moduleTitle, result: parseResult(open(ctx.memberId, t.resultEnc)), sharedAt: t.sharedAt, passedAt: t.passedAt })),
      challenges: challenges.filter((c) => c.doneAt).map((c) => ({ moduleId: c.moduleId, moduleTitle: c.title, courseId: c.courseId, doneAt: c.doneAt, note: c.note ? open(ctx.memberId, c.note) : "" })),
    };
  }),

  /** Le coach annonce le module de la semaine sur le tableau de bord. */
  weekModule: courseProc.query(async ({ ctx }) => {
    const rows = await memberCourses(ctx.member);
    let best: { courseId: number; courseTitle: string; moduleId: number; title: string; position: number; intention: string; fresh: boolean; opensAt: Date | null } | null = null;
    for (const c of rows) {
      if (!c.enrollment) continue;
      // Le dernier module ouvert et pas encore terminé : le plus récent passe devant
      const open = [...c.modules].reverse().find((m) => m.open && !m.done);
      if (open && (!best || (open.opensAt ?? new Date(0)) > (best.opensAt ?? new Date(0)))) best = { courseId: c.course.id, courseTitle: c.course.title, moduleId: open.id, title: open.title, position: open.position, intention: open.intention, fresh: !open.opened, opensAt: open.opensAt };
    }
    if (best) return { kind: "module" as const, ...best };
    // Tout ce qui est ouvert est terminé : le coach annonce la suite
    const coming = rows.flatMap((c) => (c.enrollment && c.next && !c.next.open ? [{ courseId: c.course.id, courseTitle: c.course.title, title: c.next.title, opensAt: c.next.opensAt }] : [])).sort((x, y) => +(x.opensAt ?? 0) - +(y.opensAt ?? 0))[0];
    if (coming) return { kind: "next" as const, ...coming };
    const waiting = rows.find((c) => !c.enrollment);
    if (waiting && waiting.total > 0) return { kind: "start" as const, courseId: waiting.course.id, courseTitle: waiting.course.title, tagline: waiting.course.tagline };
    return null;
  }),

  /** Les modules ouverts qui portent ce hashtag : le panneau les montre avec les publications du forum. */
  byHashtag: courseProc.input(z.object({ hashtagId: z.number().int() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const links = await db.select({ moduleId: courseModuleHashtags.moduleId }).from(courseModuleHashtags).where(eq(courseModuleHashtags.hashtagId, input.hashtagId));
    if (!links.length) return [];
    const ids = new Set(links.map((l) => l.moduleId));
    const rows = await memberCourses(ctx.member);
    return rows.flatMap((c) => c.modules.filter((m) => ids.has(m.id) && m.open).map((m) => ({ id: m.id, title: m.title, courseId: c.course.id, courseTitle: c.course.title })));
  }),

});

export type TestResult = { label?: string; summary?: string; score?: number | string | null; details?: Record<string, string | number | boolean> };

export function parseResult(raw: string | null): TestResult | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as TestResult; } catch { return { summary: raw }; }
}
