import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import {
  courseAssignments, courseEnrollments, courseLessonHashtags, courseLessons, courseSections, courses, hashtags, lessonProgress, memberTagLinks, sectionProgress,
  type Course, type CourseLesson, type CourseSection, type Member,
} from "../../db/schema";
import { courseIsVisible, isAssigned, sectionIsDone, sectionIsOpen, sectionOpensAt } from "./courseAccess";
import { LESSON_RUBRICS, memberBlocks, type Rubrics } from "./courseBlocks";

const parisDay = (d: Date) => d.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });

/**
 * Tout ce qu'un membre peut voir de ses formations : une leçon n'est visible que si sa formation et elle-même sont publiées.
 * Une section n'a pas de statut : elle apparaît dès qu'une de ses leçons est publiée. C'est la seule source des droits de lecture.
 */
export async function memberCourses(member: Pick<Member, "id" | "accessType">, courseId?: number) {
  const db = getDb();
  const rows = await db.select().from(courses)
    .where(and(eq(courses.status, "publie"), isNull(courses.archivedAt), courseId ? eq(courses.id, courseId) : undefined))
    .orderBy(asc(courses.position), asc(courses.title));
  if (!rows.length) return [];
  const ids = rows.map((c) => c.id);
  const [enrollments, assignments, tags] = await Promise.all([
    db.select().from(courseEnrollments).where(and(eq(courseEnrollments.memberId, member.id), inArray(courseEnrollments.courseId, ids))),
    db.select().from(courseAssignments).where(inArray(courseAssignments.courseId, ids)),
    db.select({ tagId: memberTagLinks.tagId }).from(memberTagLinks).where(eq(memberTagLinks.memberId, member.id)),
  ]);
  const tagIds = tags.map((t) => t.tagId);
  const visible = rows.flatMap((course) => {
    const enrollment = enrollments.find((e) => e.courseId === course.id) ?? null;
    const assigned = isAssigned(member, tagIds, assignments.filter((a) => a.courseId === course.id));
    return courseIsVisible(course, assigned, !!enrollment?.fullAccessAt) ? [{ course, enrollment }] : [];
  });
  if (!visible.length) return [];
  const sections = await db.select().from(courseSections)
    .where(and(inArray(courseSections.courseId, visible.map((v) => v.course.id)), isNull(courseSections.archivedAt)))
    .orderBy(asc(courseSections.position), asc(courseSections.id));
  const lessons = sections.length ? await db.select().from(courseLessons)
    .where(and(inArray(courseLessons.sectionId, sections.map((s) => s.id)), eq(courseLessons.status, "publie"), isNull(courseLessons.archivedAt)))
    .orderBy(asc(courseLessons.position), asc(courseLessons.id)) : [];
  const [sectionRows, lessonRows] = await Promise.all([
    sections.length ? db.select().from(sectionProgress).where(and(eq(sectionProgress.memberId, member.id), inArray(sectionProgress.sectionId, sections.map((s) => s.id)))) : [],
    lessons.length ? db.select().from(lessonProgress).where(and(eq(lessonProgress.memberId, member.id), inArray(lessonProgress.lessonId, lessons.map((l) => l.id)))) : [],
  ]);
  const now = new Date();
  return visible.map(({ course, enrollment }) => {
    const startedAt = enrollment?.startedAt ?? null;
    const fullAccess = !!enrollment?.fullAccessAt;
    const own = sections.filter((s) => s.courseId === course.id).flatMap((s) => {
      const p = sectionRows.find((x) => x.sectionId === s.id);
      const opensAt = startedAt && course.rhythm === "hebdo" ? sectionOpensAt(startedAt, s.position) : startedAt;
      const open = sectionIsOpen({ startedAt, position: s.position, rhythm: course.rhythm, fullAccess, openedAt: p?.openedAt, openedViaFullAccess: p?.openedViaFullAccess }, now);
      const list = lessons.filter((l) => l.sectionId === s.id).map((l) => {
        const lp = lessonRows.find((x) => x.lessonId === l.id);
        return {
          id: l.id, title: l.title, position: l.position, type: l.type, intention: l.intention, durationMin: l.durationMin, hasTest: !!l.testUrl, hasVideo: !!l.videoUrl,
          sectionId: s.id, sectionTitle: s.title, open, opensAt, opened: !!lp?.openedAt, done: !!lp?.completedAt,
        };
      });
      if (!list.length) return []; // une section sans leçon publiée reste invisible
      return [{
        id: s.id, title: s.title, position: s.position, intention: s.intention, content: s.content, opensAt, open, opened: !!p?.openedAt,
        done: sectionIsDone(list), doneCount: list.filter((l) => l.done).length, total: list.length,
        challengeDoneAt: p?.challengeDoneAt ?? null, challengeNoteEnc: p?.challengeNoteEnc ?? "", lessons: list,
      }];
    });
    const flat = own.flatMap((s) => s.lessons);
    const next = flat.find((l) => !l.done) ?? null;
    return { course, enrollment, sections: own, lessons: flat, done: flat.filter((l) => l.done).length, total: flat.length, next };
  });
}

export type MemberCourse = Awaited<ReturnType<typeof memberCourses>>[number];

/** Le contenu d'une leçon tel qu'un membre le lit : sans les textes provisoires. */
export async function lessonView(lesson: CourseLesson, section: Pick<CourseSection, "id" | "title">, course: Pick<Course, "id" | "title" | "emoji">) {
  const tags = await getDb().select({ id: hashtags.id, name: hashtags.name, color: hashtags.color }).from(courseLessonHashtags).innerJoin(hashtags, eq(hashtags.id, courseLessonHashtags.hashtagId)).where(eq(courseLessonHashtags.lessonId, lesson.id)).orderBy(asc(hashtags.name));
  const rubrics: Rubrics = {};
  for (const { key } of LESSON_RUBRICS) rubrics[key] = memberBlocks(lesson.content.rubrics?.[key] ?? []);
  return {
    id: lesson.id, title: lesson.title, position: lesson.position, type: lesson.type, intention: lesson.intention, durationMin: lesson.durationMin, videoUrl: lesson.videoUrl, testUrl: lesson.testUrl,
    section: { id: section.id, title: section.title }, course: { id: course.id, title: course.title, emoji: course.emoji }, hashtags: tags, rubrics,
  };
}

const lockedMessage = (what: string, opensAt: Date | null) => (opensAt ? `${what} s’ouvrira le ${parisDay(opensAt)}.` : `${what} n’est pas encore ouverte.`);

/** La leçon, si ce membre a le droit de la lire aujourd'hui. Sinon, un refus clair. */
export async function readableLesson(member: Pick<Member, "id" | "accessType">, lessonId: number) {
  const db = getDb();
  const [lesson] = await db.select().from(courseLessons).where(eq(courseLessons.id, lessonId)).limit(1);
  const refused = () => new TRPCError({ code: "NOT_FOUND", message: "Cette leçon n’existe pas ou n’est pas accessible." });
  if (!lesson) throw refused();
  const [section] = await db.select().from(courseSections).where(eq(courseSections.id, lesson.sectionId)).limit(1);
  if (!section) throw refused();
  const [state] = await memberCourses(member, section.courseId);
  const entry = state?.lessons.find((l) => l.id === lessonId);
  if (!state || !entry) throw refused();
  if (!state.enrollment) throw new TRPCError({ code: "FORBIDDEN", message: "Commencez d’abord cette formation." });
  if (!entry.open) throw new TRPCError({ code: "FORBIDDEN", message: lockedMessage("Cette leçon", entry.opensAt) });
  return { lesson, section, state, entry };
}

/** La section, si ce membre peut y agir aujourd'hui (son défi, par exemple). */
export async function readableSection(member: Pick<Member, "id" | "accessType">, sectionId: number) {
  const [section] = await getDb().select().from(courseSections).where(eq(courseSections.id, sectionId)).limit(1);
  const refused = () => new TRPCError({ code: "NOT_FOUND", message: "Cette section n’existe pas ou n’est pas accessible." });
  if (!section) throw refused();
  const [state] = await memberCourses(member, section.courseId);
  const entry = state?.sections.find((s) => s.id === sectionId);
  if (!state || !entry) throw refused();
  if (!state.enrollment) throw new TRPCError({ code: "FORBIDDEN", message: "Commencez d’abord cette formation." });
  if (!entry.open) throw new TRPCError({ code: "FORBIDDEN", message: lockedMessage("Cette section", entry.opensAt) });
  return { section, state, entry };
}
