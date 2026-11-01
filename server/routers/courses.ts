import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { coachingSessions, courseEnrollments, courseLessonHashtags, courseLessons, courseSectionHashtags, courseSections, journalEntries, lessonProgress, members, sectionProgress, testResults } from "../../db/schema";
import { logActivity, touchEnrollment } from "../lib/activity";
import { answerMemory, challengeMemory, testMemory } from "../lib/coach";
import { consentNeeded, forget, memoryLabel, memoryOrigin, memorySettings, remember } from "../lib/coachMemory";
import { isQuestion, memberBlocks, plainOf, type CourseBlock } from "../lib/courseBlocks";
import { lessonView, memberCourses, readableLesson, readableSection } from "../lib/courseState";
import { env } from "../lib/env";
import { notify } from "../lib/notify";
import { open, seal } from "../lib/privateBox";

const courseProc = procFor("course.use");
const NOTE = "note"; // une réflexion libre, en plus des questions de l'exercice
const fullName = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`.trim();

/** Prévenir l'administration qu'un membre vient de lui partager quelque chose. */
async function notifyShared(member: { id: number; firstName: string; lastName: string }, title: string, href: string) {
  const admins = await getDb().select({ id: members.id }).from(members).where(and(eq(members.role, "administrateur"), eq(members.status, "actif"), isNull(members.deletedAt)));
  await notify(admins.map((a) => a.id).filter((id) => id !== member.id), { title, href });
}

const flatten = (blocks: CourseBlock[]): CourseBlock[] => blocks.flatMap((b) => [b, ...("children" in b && b.children ? flatten(b.children) : [])]);

export const resultSchema = z.object({
  label: z.string().trim().max(200).default(""),
  summary: z.string().trim().max(4000).default(""),
  score: z.union([z.number(), z.string().max(40)]).nullable().optional(),
  details: z.record(z.string(), z.union([z.string().max(1000), z.number(), z.boolean()])).optional(),
});

export const coursesRouter = createRouter({
  /** Mes formations, côte à côte, avec la prochaine leçon. */
  list: courseProc.query(async ({ ctx }) => {
    const rows = await memberCourses(ctx.member);
    return rows.map(({ course, enrollment, sections, done, total, next }) => ({
      id: course.id, title: course.title, tagline: course.tagline, emoji: course.emoji, coverUrl: course.coverUrl, rhythm: course.rhythm,
      startedAt: enrollment?.startedAt ?? null, fullAccess: !!enrollment?.fullAccessAt, finishedAt: enrollment?.finishedAt ?? null, done, total, sectionCount: sections.length,
      next: next ? { id: next.id, title: next.title, sectionTitle: next.sectionTitle, open: next.open, opensAt: next.opensAt } : null,
    }));
  }),

  /** Une formation : sa présentation et ses sections, y compris celles à venir, avec leur date. */
  course: courseProc.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const [state] = await memberCourses(ctx.member, input.id);
    if (!state) throw new TRPCError({ code: "NOT_FOUND", message: "Cette formation n’existe pas ou n’est pas accessible." });
    const { course, enrollment, sections, done, total, next } = state;
    const settings = await memorySettings(ctx.memberId);
    return {
      id: course.id, title: course.title, tagline: course.tagline, emoji: course.emoji, coverUrl: course.coverUrl, rhythm: course.rhythm,
      description: memberBlocks(course.content.description ?? []),
      startedAt: enrollment?.startedAt ?? null, fullAccess: !!enrollment?.fullAccessAt, finishedAt: enrollment?.finishedAt ?? null,
      // Objectifs et défi seulement quand la section est ouverte
      sections: sections.map(({ content, challengeNoteEnc, ...s }) => ({
        ...s,
        objectifs: s.open ? memberBlocks(content.rubrics?.objectifs ?? []) : [],
        defi: s.open ? memberBlocks(content.rubrics?.defi ?? []) : [],
        challengeNote: s.open && challengeNoteEnc ? (open(ctx.memberId, challengeNoteEnc) ?? "") : "",
      })),
      done, total, nextId: next?.id ?? null, consentNeeded: consentNeeded(settings),
    };
  }),

  /** Commencer : la première section s'ouvre aujourd'hui, puis une nouvelle section chaque semaine. */
  start: courseProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [state] = await memberCourses(ctx.member, input.id);
    if (!state) throw new TRPCError({ code: "NOT_FOUND", message: "Cette formation n’est pas accessible." });
    if (state.enrollment) return { ok: true };
    await getDb().insert(courseEnrollments).values({ courseId: input.id, memberId: ctx.memberId }).onConflictDoNothing();
    await logActivity(ctx.memberId, "formation_commencee", { courseId: input.id, label: state.course.title });
    return { ok: true };
  }),

  /** La lecture d'une leçon, avec mes réponses. */
  lesson: courseProc.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const { lesson, section, state } = await readableLesson(ctx.member, input.id);
    const [view, answers, tests, [progress]] = await Promise.all([
      lessonView(lesson, section, state.course),
      db.select().from(journalEntries).where(and(eq(journalEntries.memberId, ctx.memberId), eq(journalEntries.lessonId, lesson.id))),
      db.select().from(testResults).where(and(eq(testResults.memberId, ctx.memberId), eq(testResults.lessonId, lesson.id))).orderBy(desc(testResults.passedAt)),
      db.select().from(lessonProgress).where(and(eq(lessonProgress.memberId, ctx.memberId), eq(lessonProgress.lessonId, lesson.id))).limit(1),
    ]);
    const index = state.lessons.findIndex((l) => l.id === lesson.id);
    const next = state.lessons[index + 1];
    const prev = state.lessons[index - 1];
    return {
      ...view,
      preview: false,
      answers: answers.map((a) => ({ id: a.id, questionId: a.questionId, answer: open(ctx.memberId, a.answerEnc), sharedAt: a.sharedAt, updatedAt: a.updatedAt })),
      testResults: tests.map((t) => ({ id: t.id, result: parseResult(open(ctx.memberId, t.resultEnc)), passedAt: t.passedAt, sharedAt: t.sharedAt })),
      challengeDoneAt: progress?.challengeDoneAt ?? null,
      challengeNote: progress?.challengeNoteEnc ? (open(ctx.memberId, progress.challengeNoteEnc) ?? "") : "",
      completedAt: progress?.completedAt ?? null,
      next: next ? { id: next.id, title: next.title, open: next.open, opensAt: next.opensAt, sectionTitle: next.sectionTitle } : null,
      prev: prev ? { id: prev.id, title: prev.title } : null,
    };
  }),

  /** Une ancienne adresse de module : la leçon qui l'a reprise, s'il y en a une. */
  legacyLesson: courseProc.input(z.object({ moduleId: z.number().int() })).query(async ({ input }) => {
    const [row] = await getDb().select({ id: courseLessons.id }).from(courseLessons).where(and(eq(courseLessons.legacyModuleId, input.moduleId), isNull(courseLessons.archivedAt))).limit(1);
    return { lessonId: row?.id ?? null };
  }),

  /** Leçon ouverte : inscrite une fois au journal d'activité. La section est ouverte avec elle. */
  markOpened: courseProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { lesson, section, entry, state } = await readableLesson(ctx.member, input.id);
    const onCalendar = state.course.rhythm === "complet" || (!!entry.opensAt && entry.opensAt <= new Date());
    await db.insert(sectionProgress).values({ memberId: ctx.memberId, sectionId: section.id, openedAt: new Date(), openedViaFullAccess: !onCalendar }).onConflictDoNothing();
    const [row] = await db.insert(lessonProgress).values({ memberId: ctx.memberId, lessonId: lesson.id, openedAt: new Date() }).onConflictDoNothing().returning();
    if (!row) return { first: false };
    await logActivity(ctx.memberId, "lecon_ouverte", { courseId: section.courseId, sectionId: section.id, lessonId: lesson.id, label: lesson.title });
    await touchEnrollment(ctx.memberId, section.courseId);
    return { first: true };
  }),

  /** Une réponse dans mon journal privé. Vide : la réponse est retirée. Avec l'accord du membre, elle entre dans la mémoire du coach. */
  saveAnswer: courseProc
    .input(z.object({ lessonId: z.number().int(), questionId: z.string().min(1).max(64), answer: z.string().max(8000) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { lesson, section, state } = await readableLesson(ctx.member, input.lessonId);
      const question = input.questionId === NOTE ? null : flatten(lesson.content.rubrics?.exercice ?? []).find((b) => b.id === input.questionId && isQuestion(b));
      if (input.questionId !== NOTE && !question) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette question n’existe plus dans la leçon." });
      const where = and(eq(journalEntries.memberId, ctx.memberId), eq(journalEntries.lessonId, lesson.id), eq(journalEntries.questionId, input.questionId));
      const answer = input.answer.trim();
      if (!answer) {
        const removed = await db.delete(journalEntries).where(where).returning({ id: journalEntries.id });
        for (const r of removed) await forget(ctx.memberId, memoryOrigin.answer(r.id));
        await touchEnrollment(ctx.memberId, section.courseId);
        return { id: null };
      }
      const answerEnc = seal(ctx.memberId, answer);
      const questionText = question && "html" in question ? plainOf(question.html) : "";
      const [row] = await db.insert(journalEntries)
        .values({ memberId: ctx.memberId, lessonId: lesson.id, courseTitle: state.course.title, lessonTitle: lesson.title, questionId: input.questionId, questionText, answerEnc, kind: input.questionId === NOTE ? "reflexion" : "exercice" })
        .onConflictDoUpdate({ target: [journalEntries.memberId, journalEntries.lessonId, journalEntries.questionId], set: { answerEnc, questionText, courseTitle: state.course.title, lessonTitle: lesson.title, updatedAt: new Date() } })
        .returning({ id: journalEntries.id });
      await remember(ctx.memberId, { origin: memoryOrigin.answer(row.id), source: questionText ? "exercice" : "reflexion", sourceLabel: memoryLabel(section.title, lesson.title), courseId: section.courseId, sectionId: section.id, lessonId: lesson.id, text: answerMemory(questionText, answer) });
      await touchEnrollment(ctx.memberId, section.courseId);
      return { id: row.id };
    }),

  /** « À travailler en coaching avec Laura » : la seule porte par laquelle une réponse devient lisible de l'administration. Retirée, elle redevient privée. */
  shareAnswer: courseProc.input(z.object({ id: z.number().int(), shared: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [entry] = await db.select({ sharedAt: journalEntries.sharedAt, lessonId: journalEntries.lessonId, lessonTitle: journalEntries.lessonTitle, sectionId: courseSections.id, courseId: courseSections.courseId })
      .from(journalEntries).leftJoin(courseLessons, eq(courseLessons.id, journalEntries.lessonId)).leftJoin(courseSections, eq(courseSections.id, courseLessons.sectionId))
      .where(and(eq(journalEntries.id, input.id), eq(journalEntries.memberId, ctx.memberId))).limit(1);
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Cette réponse n’existe plus." });
    if (input.shared === !!entry.sharedAt) return { ok: true };
    await db.update(journalEntries).set({ sharedAt: input.shared ? new Date() : null, coachingDiscussedAt: null }).where(and(eq(journalEntries.id, input.id), eq(journalEntries.memberId, ctx.memberId)));
    if (input.shared) {
      await logActivity(ctx.memberId, "coaching_marque", { courseId: entry.courseId, sectionId: entry.sectionId, lessonId: entry.lessonId, label: entry.lessonTitle });
      await notifyShared(ctx.member, `${fullName(ctx.member)} a marqué une réponse à travailler en coaching`, `/admin/coaching/${ctx.memberId}`);
    }
    return { ok: true };
  }),

  shareTest: courseProc.input(z.object({ id: z.number().int(), shared: z.boolean() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb().update(testResults).set({ sharedAt: input.shared ? new Date() : null }).where(and(eq(testResults.id, input.id), eq(testResults.memberId, ctx.memberId))).returning({ id: testResults.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Ce résultat n’existe plus." });
    if (input.shared) await notifyShared(ctx.member, `${fullName(ctx.member)} a partagé un résultat de test avec vous`, `/admin/membres/${ctx.memberId}`);
    return { ok: true };
  }),

  /** Le défi d'une leçon : relevé ou non, avec une note facultative. */
  saveChallenge: courseProc.input(z.object({ lessonId: z.number().int(), done: z.boolean(), note: z.string().max(4000).default("") })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { lesson, section } = await readableLesson(ctx.member, input.lessonId);
    const note = input.note.trim();
    const set = { challengeDoneAt: input.done ? new Date() : null, challengeNoteEnc: input.done && note ? seal(ctx.memberId, note) : "" };
    const [before] = await db.select({ done: lessonProgress.challengeDoneAt }).from(lessonProgress).where(and(eq(lessonProgress.memberId, ctx.memberId), eq(lessonProgress.lessonId, lesson.id))).limit(1);
    await db.insert(lessonProgress).values({ memberId: ctx.memberId, lessonId: lesson.id, openedAt: new Date(), ...set }).onConflictDoUpdate({ target: [lessonProgress.memberId, lessonProgress.lessonId], set });
    if (input.done && !before?.done) await logActivity(ctx.memberId, "defi_releve", { courseId: section.courseId, sectionId: section.id, lessonId: lesson.id, label: lesson.title });
    const origin = memoryOrigin.lessonChallenge(lesson.id);
    if (input.done) await remember(ctx.memberId, { origin, source: "defi", sourceLabel: memoryLabel(section.title, lesson.title), courseId: section.courseId, sectionId: section.id, lessonId: lesson.id, text: challengeMemory(lesson.title, note) });
    else await forget(ctx.memberId, origin);
    await touchEnrollment(ctx.memberId, section.courseId);
    return { ok: true };
  }),

  /** Le défi d'une section : facultatif, il ne compte pas pour terminer la section. */
  saveSectionChallenge: courseProc.input(z.object({ sectionId: z.number().int(), done: z.boolean(), note: z.string().max(4000).default("") })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { section, entry } = await readableSection(ctx.member, input.sectionId);
    const note = input.note.trim();
    const set = { challengeDoneAt: input.done ? new Date() : null, challengeNoteEnc: input.done && note ? seal(ctx.memberId, note) : "" };
    await db.insert(sectionProgress).values({ memberId: ctx.memberId, sectionId: section.id, ...set }).onConflictDoUpdate({ target: [sectionProgress.memberId, sectionProgress.sectionId], set });
    if (input.done && !entry.challengeDoneAt) await logActivity(ctx.memberId, "defi_releve", { courseId: section.courseId, sectionId: section.id, label: section.title });
    const origin = memoryOrigin.sectionChallenge(section.id);
    if (input.done) await remember(ctx.memberId, { origin, source: "defi", sourceLabel: memoryLabel(section.title, ""), courseId: section.courseId, sectionId: section.id, text: challengeMemory(section.title, note) });
    else await forget(ctx.memberId, origin);
    await touchEnrollment(ctx.memberId, section.courseId);
    return { ok: true };
  }),

  /** Le résultat d'un test intégré, reçu par la page. L'interface a déjà vérifié son origine. */
  saveTestResult: courseProc.input(z.object({ lessonId: z.number().int(), result: resultSchema })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { lesson, section, state } = await readableLesson(ctx.member, input.lessonId);
    if (!lesson.testUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette leçon n’a pas de test." });
    const raw = JSON.stringify(input.result);
    const [row] = await db.insert(testResults).values({ memberId: ctx.memberId, lessonId: lesson.id, courseTitle: state.course.title, lessonTitle: lesson.title, resultEnc: seal(ctx.memberId, raw) }).returning({ id: testResults.id });
    await logActivity(ctx.memberId, "test_passe", { courseId: section.courseId, sectionId: section.id, lessonId: lesson.id, label: lesson.title });
    await remember(ctx.memberId, { origin: memoryOrigin.test(row.id), source: "test", sourceLabel: memoryLabel(section.title, lesson.title), courseId: section.courseId, sectionId: section.id, lessonId: lesson.id, text: testMemory(raw) });
    await touchEnrollment(ctx.memberId, section.courseId);
    return { id: row.id };
  }),

  /** « J'ai terminé » : une section est terminée quand toutes ses leçons publiées le sont, la formation quand toutes ses sections le sont. */
  complete: courseProc.input(z.object({ lessonId: z.number().int(), done: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { lesson, section, state } = await readableLesson(ctx.member, input.lessonId);
    const [before] = await db.select().from(lessonProgress).where(and(eq(lessonProgress.memberId, ctx.memberId), eq(lessonProgress.lessonId, lesson.id))).limit(1);
    const firstTime = input.done && !before?.completedAt;
    const set = { completedAt: input.done ? (before?.completedAt ?? new Date()) : null };
    await db.insert(lessonProgress).values({ memberId: ctx.memberId, lessonId: lesson.id, openedAt: new Date(), ...set }).onConflictDoUpdate({ target: [lessonProgress.memberId, lessonProgress.lessonId], set });
    await touchEnrollment(ctx.memberId, section.courseId);
    if (firstTime) await logActivity(ctx.memberId, "lecon_terminee", { courseId: section.courseId, sectionId: section.id, lessonId: lesson.id, label: lesson.title });
    const doneIds = new Set(state.lessons.filter((l) => l.done).map((l) => l.id));
    if (input.done) doneIds.add(lesson.id); else doneIds.delete(lesson.id);
    const entry = state.sections.find((s) => s.id === section.id);
    const sectionDone = !!entry && entry.lessons.every((l) => doneIds.has(l.id));
    if (sectionDone !== entry?.done) {
      await db.insert(sectionProgress).values({ memberId: ctx.memberId, sectionId: section.id, openedAt: new Date(), completedAt: sectionDone ? new Date() : null }).onConflictDoUpdate({ target: [sectionProgress.memberId, sectionProgress.sectionId], set: { completedAt: sectionDone ? new Date() : null } });
      if (sectionDone) await logActivity(ctx.memberId, "section_terminee", { courseId: section.courseId, sectionId: section.id, label: section.title });
    }
    const finished = state.lessons.length > 0 && state.lessons.every((l) => doneIds.has(l.id));
    if (finished && !state.enrollment?.finishedAt) await logActivity(ctx.memberId, "formation_terminee", { courseId: section.courseId, label: state.course.title });
    await db.update(courseEnrollments).set({ finishedAt: finished ? (state.enrollment?.finishedAt ?? new Date()) : null }).where(and(eq(courseEnrollments.memberId, ctx.memberId), eq(courseEnrollments.courseId, section.courseId)));
    return { finished, sectionDone };
  }),

  /**
   * Mon journal personnel : les réponses aux exercices et aux questions des leçons. Visible de moi seul·e.
   * `kind` prépare les entrées libres et les questions du jour : elles viendront sans leçon, donc sans section.
   */
  journal: courseProc.query(async ({ ctx }) => {
    const db = getDb();
    const [rows, [session]] = await Promise.all([
      db.select({ e: journalEntries, sectionId: courseSections.id, sectionTitle: courseSections.title, sectionPosition: courseSections.position })
        .from(journalEntries)
        .leftJoin(courseLessons, eq(courseLessons.id, journalEntries.lessonId))
        .leftJoin(courseSections, eq(courseSections.id, courseLessons.sectionId))
        .where(eq(journalEntries.memberId, ctx.memberId))
        .orderBy(desc(journalEntries.updatedAt)),
      db.select({ id: coachingSessions.id }).from(coachingSessions).where(and(eq(coachingSessions.memberId, ctx.memberId), eq(coachingSessions.done, false))).limit(1),
    ]);
    return {
      entries: rows.map(({ e, sectionId, sectionTitle, sectionPosition }) => ({
        id: e.id, kind: e.kind, lessonId: e.lessonId, courseTitle: e.courseTitle, sectionId, sectionTitle: sectionTitle ?? "", sectionPosition, lessonTitle: e.lessonTitle, question: e.questionText,
        answer: open(ctx.memberId, e.answerEnc), sharedAt: e.sharedAt, discussedAt: e.coachingDiscussedAt, createdAt: e.createdAt, updatedAt: e.updatedAt,
      })),
      // Sans accompagnement individuel en cours, l'option reste disponible et propose aussi un appel découverte
      coaching: { active: ctx.member.accessType !== "collectif" || !!session, discoveryUrl: env.calendlyExploUrl },
    };
  }),

  /** Le coach annonce la section de la semaine sur le tableau de bord. */
  weekSection: courseProc.query(async ({ ctx }) => {
    const rows = await memberCourses(ctx.member);
    let best: { courseId: number; courseTitle: string; sectionId: number; title: string; intention: string; fresh: boolean; opensAt: Date | null; nextLesson: { id: number; title: string } | null } | null = null;
    for (const c of rows) {
      if (!c.enrollment) continue;
      // La dernière section ouverte et pas encore terminée : la plus récente passe devant
      const current = [...c.sections].reverse().find((s) => s.open && !s.done);
      if (current && (!best || (current.opensAt ?? new Date(0)) > (best.opensAt ?? new Date(0)))) {
        const lesson = current.lessons.find((l) => !l.done);
        best = { courseId: c.course.id, courseTitle: c.course.title, sectionId: current.id, title: current.title, intention: current.intention, fresh: !current.opened, opensAt: current.opensAt, nextLesson: lesson ? { id: lesson.id, title: lesson.title } : null };
      }
    }
    if (best) return { kind: "section" as const, ...best };
    // Tout ce qui est ouvert est terminé : le coach annonce la suite
    const coming = rows.flatMap((c) => {
      const s = c.enrollment ? c.sections.find((x) => !x.open) : undefined;
      return s ? [{ courseId: c.course.id, courseTitle: c.course.title, sectionId: s.id, title: s.title, opensAt: s.opensAt }] : [];
    }).sort((x, y) => +(x.opensAt ?? 0) - +(y.opensAt ?? 0))[0];
    if (coming) return { kind: "next" as const, ...coming };
    const waiting = rows.find((c) => !c.enrollment);
    if (waiting && waiting.total > 0) return { kind: "start" as const, courseId: waiting.course.id, courseTitle: waiting.course.title, tagline: waiting.course.tagline };
    return null;
  }),

  /** Les leçons et sections ouvertes qui portent ce hashtag : le panneau les montre avec les publications du forum. */
  byHashtag: courseProc.input(z.object({ hashtagId: z.number().int() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const [lessonLinks, sectionLinks] = await Promise.all([
      db.select({ id: courseLessonHashtags.lessonId }).from(courseLessonHashtags).where(eq(courseLessonHashtags.hashtagId, input.hashtagId)),
      db.select({ id: courseSectionHashtags.sectionId }).from(courseSectionHashtags).where(eq(courseSectionHashtags.hashtagId, input.hashtagId)),
    ]);
    if (!lessonLinks.length && !sectionLinks.length) return [];
    const lessonIds = new Set(lessonLinks.map((l) => l.id));
    const sectionIds = new Set(sectionLinks.map((l) => l.id));
    const rows = await memberCourses(ctx.member);
    return rows.flatMap((c) => [
      ...c.sections.filter((s) => sectionIds.has(s.id) && s.open).map((s) => ({ key: `section-${s.id}`, title: s.title, courseTitle: c.course.title, href: `/parcours/${c.course.id}#section-${s.id}` })),
      ...c.lessons.filter((l) => lessonIds.has(l.id) && l.open).map((l) => ({ key: `lecon-${l.id}`, title: l.title, courseTitle: c.course.title, href: `/parcours/${c.course.id}/lecon/${l.id}` })),
    ]);
  }),
});

export type TestResult = { label?: string; summary?: string; score?: number | string | null; details?: Record<string, string | number | boolean> };

export function parseResult(raw: string | null): TestResult | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as TestResult; } catch { return { summary: raw }; }
}
