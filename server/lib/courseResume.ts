import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { coachMemory, courseLessons, courseModules, courseSections, journalEntries, lessonProgress, memberActivity, moduleProgress, sectionProgress, testResults, type CourseLesson, type CourseSection } from "../../db/schema";
import { isQuestion, plainOf } from "./courseBlocks";

const NO_TITLE = "Sans titre";
/** Comparer deux titres sans tenir compte des accents, des majuscules ni de la forme de l'apostrophe. */
export const sameTitleKey = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();

/** Le titre d'un ancien module : sa copie l'a parfois perdu, le journal d'activité et le journal du membre le gardent. */
async function legacyTitle(moduleId: number, ownTitle: string): Promise<string> {
  if (ownTitle && ownTitle !== NO_TITLE) return ownTitle;
  const db = getDb();
  const [activity] = await db.select({ label: memberActivity.label }).from(memberActivity).where(and(eq(memberActivity.moduleId, moduleId), ne(memberActivity.label, ""))).orderBy(desc(memberActivity.createdAt)).limit(1);
  if (activity) return activity.label;
  const [entry] = await db.select({ title: journalEntries.moduleTitle }).from(journalEntries).where(and(eq(journalEntries.moduleId, moduleId), ne(journalEntries.moduleTitle, ""))).limit(1);
  if (entry) return entry.title;
  const [test] = await db.select({ title: testResults.moduleTitle }).from(testResults).where(and(eq(testResults.moduleId, moduleId), ne(testResults.moduleTitle, ""))).limit(1);
  return test?.title ?? "";
}

/** Une ancienne progression, reportée sur la leçon du même nom. Sans effet si elle a déjà été reprise. */
async function moveModule(moduleId: number, lesson: CourseLesson, section: CourseSection) {
  const db = getDb();
  const flat = (lesson.content.rubrics?.exercice ?? []).filter(isQuestion);
  await db.transaction(async (tx) => {
    await tx.update(courseLessons).set({ legacyModuleId: moduleId }).where(eq(courseLessons.id, lesson.id));
    const rows = await tx.select().from(moduleProgress).where(eq(moduleProgress.moduleId, moduleId));
    for (const p of rows) {
      await tx.insert(lessonProgress).values({ memberId: p.memberId, lessonId: lesson.id, openedAt: p.openedAt, completedAt: p.completedAt, challengeDoneAt: p.challengeDoneAt, challengeNoteEnc: p.challengeNoteEnc }).onConflictDoNothing();
      if (!p.openedAt) continue;
      // La section est ouverte depuis la première de ses leçons reprises. Ouverte au calendrier une fois, elle le reste.
      await tx.insert(sectionProgress).values({ memberId: p.memberId, sectionId: section.id, openedAt: p.openedAt, openedViaFullAccess: p.openedViaFullAccess })
        .onConflictDoUpdate({ target: [sectionProgress.memberId, sectionProgress.sectionId], set: { openedAt: sql`least(${sectionProgress.openedAt}, excluded.opened_at)`, openedViaFullAccess: sql`${sectionProgress.openedViaFullAccess} and excluded.opened_via_full_access` } });
    }
    // Une réponse retrouve sa question si le texte n'a pas changé. Sinon elle reste lisible dans le journal, avec sa question d'origine.
    const entries = await tx.select().from(journalEntries).where(and(eq(journalEntries.moduleId, moduleId), isNull(journalEntries.lessonId)));
    for (const e of entries) {
      const question = flat.find((b) => "html" in b && sameTitleKey(plainOf(b.html)) === sameTitleKey(e.questionText));
      const questionId = question?.id ?? e.questionId;
      const [taken] = await tx.select({ id: journalEntries.id }).from(journalEntries).where(and(eq(journalEntries.memberId, e.memberId), eq(journalEntries.lessonId, lesson.id), eq(journalEntries.questionId, questionId))).limit(1);
      await tx.update(journalEntries).set(taken ? { lessonTitle: lesson.title } : { lessonId: lesson.id, lessonTitle: lesson.title, questionId }).where(eq(journalEntries.id, e.id));
    }
    await tx.update(testResults).set({ lessonId: lesson.id, lessonTitle: lesson.title }).where(and(eq(testResults.moduleId, moduleId), isNull(testResults.lessonId)));
    await tx.update(coachMemory).set({ lessonId: lesson.id, sectionId: section.id }).where(and(eq(coachMemory.moduleId, moduleId), isNull(coachMemory.lessonId)));
  });
}

/**
 * Reprend ce que les membres ont fait dans les anciens modules : une progression devient une progression sur la leçon du même nom.
 * Rejouable sans doublon, après chaque synchronisation : un module sans leçon du même nom est mis de côté et signalé, jamais perdu.
 */
export async function resumeLegacyProgress(): Promise<{ moved: number; waiting: string[] }> {
  const db = getDb();
  const [fromProgress, fromJournal, fromTests, fromMemory, mapped] = await Promise.all([
    db.selectDistinct({ id: moduleProgress.moduleId }).from(moduleProgress),
    db.selectDistinct({ id: journalEntries.moduleId }).from(journalEntries).where(and(isNotNull(journalEntries.moduleId), isNull(journalEntries.lessonId))),
    db.selectDistinct({ id: testResults.moduleId }).from(testResults).where(and(isNotNull(testResults.moduleId), isNull(testResults.lessonId))),
    db.selectDistinct({ id: coachMemory.moduleId }).from(coachMemory).where(and(isNotNull(coachMemory.moduleId), isNull(coachMemory.lessonId))),
    db.select({ id: courseLessons.legacyModuleId }).from(courseLessons).where(isNotNull(courseLessons.legacyModuleId)),
  ]);
  const done = new Set(mapped.map((m) => m.id));
  const ids = [...new Set([...fromProgress, ...fromJournal, ...fromTests, ...fromMemory].map((r) => r.id).filter((id): id is number => id !== null && !done.has(id)))];
  if (!ids.length) return { moved: 0, waiting: [] };
  const modules = await db.select({ id: courseModules.id, title: courseModules.title, courseId: courseModules.courseId }).from(courseModules).where(inArray(courseModules.id, ids));
  const lessons = await db.select({ lesson: courseLessons, section: courseSections }).from(courseLessons).innerJoin(courseSections, eq(courseSections.id, courseLessons.sectionId)).where(and(isNull(courseLessons.archivedAt), isNull(courseSections.archivedAt)));
  let moved = 0;
  const waiting: string[] = [];
  const taken = new Set<number>();
  for (const mod of modules) {
    const title = await legacyTitle(mod.id, mod.title);
    const found = title ? lessons.find((x) => x.section.courseId === mod.courseId && !x.lesson.legacyModuleId && !taken.has(x.lesson.id) && sameTitleKey(x.lesson.title) === sameTitleKey(title)) : undefined;
    if (!found) { waiting.push(title || `module n° ${mod.id}`); continue; }
    await moveModule(mod.id, found.lesson, found.section);
    taken.add(found.lesson.id);
    moved++;
  }
  return { moved, waiting };
}
