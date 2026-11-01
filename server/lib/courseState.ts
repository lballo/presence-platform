import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import {
  courseAssignments, courseEnrollments, courseModuleHashtags, courseModules, courses, hashtags, memberTagLinks, moduleProgress,
  type Course, type CourseModule, type Member,
} from "../../db/schema";
import { courseIsVisible, isAssigned, moduleIsOpen, moduleOpensAt } from "./courseAccess";
import { memberBlocks, SECTIONS, emptySections, type Sections } from "./courseBlocks";

const parisDay = (d: Date) => d.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });

/**
 * Tout ce qu'un membre peut voir de ses formations : seules les formations et modules publiés,
 * chaque module avec sa date d'ouverture et son état. C'est la seule source des droits de lecture.
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
  const mods = await db.select().from(courseModules)
    .where(and(inArray(courseModules.courseId, visible.map((v) => v.course.id)), eq(courseModules.status, "publie"), isNull(courseModules.archivedAt)))
    .orderBy(asc(courseModules.position), asc(courseModules.id));
  const progress = mods.length ? await db.select().from(moduleProgress).where(and(eq(moduleProgress.memberId, member.id), inArray(moduleProgress.moduleId, mods.map((m) => m.id)))) : [];
  const now = new Date();
  return visible.map(({ course, enrollment }) => {
    const modules = mods.filter((m) => m.courseId === course.id).map((m) => {
      const p = progress.find((x) => x.moduleId === m.id);
      const startedAt = enrollment?.startedAt ?? null;
      const fullAccess = !!enrollment?.fullAccessAt;
      return {
        id: m.id, title: m.title, position: m.position, intention: m.intention, durationMin: m.durationMin, hasTest: !!m.testUrl,
        opensAt: startedAt && course.rhythm === "hebdo" ? moduleOpensAt(startedAt, m.position) : startedAt,
        open: moduleIsOpen({ startedAt, position: m.position, rhythm: course.rhythm, fullAccess, openedAt: p?.openedAt, openedViaFullAccess: p?.openedViaFullAccess }, now),
        opened: !!p?.openedAt, done: !!p?.completedAt,
      };
    });
    const done = modules.filter((m) => m.done).length;
    const next = modules.find((m) => !m.done) ?? null;
    return { course, enrollment, modules, done, total: modules.length, next };
  });
}

export type MemberCourse = Awaited<ReturnType<typeof memberCourses>>[number];

/** Le contenu d'un module tel qu'un membre le lit : ni textes provisoires, ni consigne du coach. */
export async function moduleView(mod: CourseModule, course: Pick<Course, "id" | "title" | "emoji">) {
  const tags = await getDb().select({ id: hashtags.id, name: hashtags.name, color: hashtags.color }).from(courseModuleHashtags).innerJoin(hashtags, eq(hashtags.id, courseModuleHashtags.hashtagId)).where(eq(courseModuleHashtags.moduleId, mod.id)).orderBy(asc(hashtags.name));
  const sections = emptySections();
  for (const { key } of SECTIONS) sections[key] = memberBlocks(mod.content.sections?.[key] ?? []);
  return {
    id: mod.id, title: mod.title, position: mod.position, intention: mod.intention, durationMin: mod.durationMin, videoUrl: mod.videoUrl, testUrl: mod.testUrl,
    course: { id: course.id, title: course.title, emoji: course.emoji }, hashtags: tags, sections: sections as Sections,
  };
}

/** Le module, si ce membre a le droit de le lire aujourd'hui. Sinon, un refus clair. */
export async function readableModule(member: Pick<Member, "id" | "accessType">, moduleId: number) {
  const [mod] = await getDb().select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
  const refused = () => new TRPCError({ code: "NOT_FOUND", message: "Ce module n’existe pas ou n’est pas accessible." });
  if (!mod) throw refused();
  const [state] = await memberCourses(member, mod.courseId);
  const entry = state?.modules.find((m) => m.id === moduleId);
  if (!state || !entry) throw refused();
  if (!state.enrollment) throw new TRPCError({ code: "FORBIDDEN", message: "Commencez d’abord cette formation." });
  if (!entry.open) throw new TRPCError({ code: "FORBIDDEN", message: entry.opensAt ? `Ce module s’ouvrira le ${parisDay(entry.opensAt)}.` : "Ce module n’est pas encore ouvert." });
  return { mod, state, entry };
}
