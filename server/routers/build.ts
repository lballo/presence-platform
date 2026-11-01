import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import {
  coachMemory, courseAssignments, courseEnrollments, courseHashtags, courseLessonHashtags, courseLessons, courseSectionHashtags, courseSections, courses, emailSends, hashtags, journalEntries, lessonProgress, memberActivity, memberTagLinks, memberTags,
  members, testResults, workflows, type Course, type CourseLesson, type CourseSection, type Member,
} from "../../db/schema";
import { ACTIVITY_LABEL, logActivity } from "../lib/activity";
import { logAdmin } from "../lib/adminLog";
import { testUrlProblem } from "../lib/courseAccess";
import { LESSON_RUBRICS, LESSON_TYPES, SECTION_RUBRICS, type CourseBlock, type PageContent, type Rubric, type Rubrics } from "../lib/courseBlocks";
import { lessonView } from "../lib/courseState";
import { EMAIL_CATEGORIES, emailReady, fillTemplate, memberPreferences } from "../lib/email";
import { env } from "../lib/env";
import { appendBlocks, getPage, listTemplates, notionReady, updatePage } from "../lib/notion";
import { cleanInline, heading2 } from "../lib/notionBlocks";
import { lastSync, refreshCourse, refreshLesson, refreshSection, syncAll, syncCoursePage, syncLessonPage, syncRunning, syncSectionPage } from "../lib/notionSync";
import { asTrpcError, assertNotionReady, assertUnchanged, COURSE_STATUS, courseProperties, createCoursePage, createLessonPage, createSectionPage, LESSON_STATUS, lessonProperties, sectionProperties, writeLessonList, writeList, writeRubrics } from "../lib/notionWrite";
import { notify } from "../lib/notify";
import { open, privateBoxReady } from "../lib/privateBox";
import { reminderPlan, sendCourseReminder, sendMemberEmail, SKIP_LABEL } from "../lib/reminders";
import { isOurImage, storageReady } from "../lib/storage";
import { runWorkflows, workflowOverview } from "../lib/workflows";
import { parseResult } from "./courses";

const buildProc = procFor("course.build");
const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const fullName = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`.trim();
const statusSchema = z.enum(["brouillon", "relecture", "publie"]);
const DAY = 86400000;

/* ───────────── Blocs reçus de l'éditeur ───────────── */

const blockInput = z.object({
  id: z.string().max(64),
  type: z.enum(["paragraph", "bullet", "number", "quote", "heading", "callout", "toggle", "divider", "image", "video", "file", "link", "unknown"]),
  html: z.string().max(20000).optional(),
  level: z.union([z.literal(2), z.literal(3)]).optional(),
  emoji: z.string().max(16).optional(),
  url: z.string().max(2000).optional(),
  caption: z.string().max(1000).optional(),
  name: z.string().max(200).optional(),
  title: z.string().max(500).optional(),
  notionType: z.string().max(60).optional(),
});
type BlockInput = z.infer<typeof blockInput>;

const webUrl = (u: string | undefined, what: string) => {
  const v = (u ?? "").trim();
  if (!/^https?:\/\/\S+$/i.test(v)) throw badRequest(`${what} : indiquez une adresse complète (https://…).`);
  return v;
};

/** Le texte vient du navigateur : il est nettoyé ici. Un bloc existant garde ses enfants et son identifiant Notion. */
function cleanBlock(input: BlockInput, old: Map<string, CourseBlock>): CourseBlock | null {
  const known = old.get(input.id);
  const id = known ? input.id : `nouveau-${input.id}`;
  const children = known && "children" in known && known.children ? { children: known.children } : {};
  const html = cleanInline(input.html ?? "");
  switch (input.type) {
    case "paragraph": case "bullet": case "number": case "quote": case "toggle":
      return html ? { id, type: input.type, html, ...children } as CourseBlock : null;
    case "heading":
      return html ? { id, type: "heading", html, level: input.level === 2 ? 2 : 3, ...children } : null;
    case "callout":
      return html ? { id, type: "callout", html, emoji: input.emoji ?? "", ...children } : null;
    case "divider": return { id, type: "divider" };
    case "image": case "video":
      return { id, type: input.type, url: webUrl(input.url, input.type === "image" ? "Image" : "Vidéo"), caption: input.caption ?? "", ...(known && "sourceKey" in known && known.sourceKey ? { sourceKey: known.sourceKey } : {}) };
    case "file":
      return { id, type: "file", url: webUrl(input.url, "Fichier"), name: input.name?.trim() || "Fichier", ...(known && "sourceKey" in known && known.sourceKey ? { sourceKey: known.sourceKey } : {}) };
    case "link":
      return { id, type: "link", url: webUrl(input.url, "Lien"), title: input.title ?? "" };
    default:
      return known?.type === "unknown" ? known : null; // jamais créé depuis l'application
  }
}

const cleanList = (inputs: BlockInput[], oldList: CourseBlock[]) => {
  const old = new Map(oldList.map((b) => [b.id, b]));
  return inputs.flatMap((b) => cleanBlock(b, old) ?? []);
};

const blockList = z.array(blockInput).max(300);
const lessonRubrics = z.object({ intention: blockList, contenu: blockList, exercice: blockList, defi: blockList, plusLoin: blockList });
const sectionRubrics = z.object({ intention: blockList, objectifs: blockList, defi: blockList });

/** Nettoie les rubriques reçues de l'éditeur, en repartant de ce que la page contient. */
function cleanRubrics(input: Partial<Record<keyof Rubrics, BlockInput[]>>, old: PageContent, rubrics: readonly Rubric[]): Rubrics {
  const out: Rubrics = {};
  for (const { key } of rubrics) if (key !== "lecons") out[key] = cleanList(input[key] ?? [], old.rubrics?.[key] ?? []);
  return out;
}

/** Après un échec d'écriture, la copie reflète ce qui a vraiment été écrit. Pas après un conflit : elle doit rester en retard, pour qu'un second clic n'écrase rien. */
const refreshAfterFailure = async (e: unknown, refresh: () => Promise<unknown>) => {
  if (!(e instanceof TRPCError && e.code === "CONFLICT")) await refresh().catch(() => undefined);
};

const escapeText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** L'intention existe en deux endroits : la rubrique suit le champ quand celui-ci change. */
function followIntention(rubrics: Rubrics, intention: string, previous: string) {
  if (intention === previous) return;
  const list = rubrics.intention ?? (rubrics.intention = []);
  const first = list.find((b) => b.type === "paragraph");
  if (first && "html" in first) first.html = escapeText(intention);
  else if (intention) list.unshift({ id: "nouveau-intention", type: "paragraph", html: escapeText(intention) });
}

/* ───────────── Lecture ───────────── */

async function requireCourse(id: number): Promise<Course> {
  const [c] = await getDb().select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Formation introuvable." });
  return c;
}

async function requireSection(id: number): Promise<CourseSection> {
  const [x] = await getDb().select().from(courseSections).where(eq(courseSections.id, id)).limit(1);
  if (!x) throw new TRPCError({ code: "NOT_FOUND", message: "Section introuvable." });
  return x;
}

async function requireLesson(id: number): Promise<CourseLesson> {
  const [l] = await getDb().select().from(courseLessons).where(eq(courseLessons.id, id)).limit(1);
  if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Leçon introuvable." });
  return l;
}

/** Les sections d'une formation et leurs leçons, retirées exceptées. */
async function outline(courseId: number) {
  const db = getDb();
  const sections = await db.select().from(courseSections).where(and(eq(courseSections.courseId, courseId), isNull(courseSections.archivedAt))).orderBy(asc(courseSections.position), asc(courseSections.id));
  const lessons = sections.length ? await db.select().from(courseLessons).where(and(inArray(courseLessons.sectionId, sections.map((x) => x.id)), isNull(courseLessons.archivedAt))).orderBy(asc(courseLessons.position), asc(courseLessons.id)) : [];
  return { sections, lessons };
}

/** Membres par section et par leçon, et leçons où l'on décroche. Uniquement des nombres, jamais qui a écrit quoi. */
async function courseStats(courseId: number) {
  const db = getDb();
  const [{ sections, lessons }, enrollments] = await Promise.all([outline(courseId), db.select().from(courseEnrollments).where(eq(courseEnrollments.courseId, courseId))]);
  const progress = lessons.length ? await db.select().from(lessonProgress).where(inArray(lessonProgress.lessonId, lessons.map((l) => l.id))) : [];
  const shownSections = sections.map((x) => ({ ...x, lessons: lessons.filter((l) => l.sectionId === x.id && l.status === "publie") })).filter((x) => x.lessons.length);
  const published = shownSections.flatMap((x) => x.lessons);
  const did = (memberId: number, lessonId: number) => progress.some((p) => p.memberId === memberId && p.lessonId === lessonId && p.completedAt);
  const now = Date.now();
  const stuck = new Map<number, number>();
  for (const e of enrollments) {
    if (e.finishedAt || now - e.lastActivityAt.getTime() < 14 * DAY) continue;
    const first = published.find((l) => !did(e.memberId, l.id));
    if (first) stuck.set(first.id, (stuck.get(first.id) ?? 0) + 1);
  }
  return {
    enrolled: enrollments.length,
    finished: enrollments.filter((e) => e.finishedAt).length,
    fullAccess: enrollments.filter((e) => e.fullAccessAt).length,
    inactive: enrollments.filter((e) => !e.finishedAt && now - e.lastActivityAt.getTime() >= 14 * DAY).length,
    sections: shownSections.map((x) => ({
      id: x.id, title: x.title, position: x.position,
      opened: enrollments.filter((e) => x.lessons.some((l) => progress.some((p) => p.memberId === e.memberId && p.lessonId === l.id && p.openedAt))).length,
      completed: enrollments.filter((e) => x.lessons.every((l) => did(e.memberId, l.id))).length,
      stuck: x.lessons.reduce((n, l) => n + (stuck.get(l.id) ?? 0), 0),
      lessons: x.lessons.map((l) => {
        const rows = progress.filter((p) => p.lessonId === l.id);
        return { id: l.id, title: l.title, position: l.position, opened: rows.filter((r) => r.openedAt).length, completed: rows.filter((r) => r.completedAt).length, stuck: stuck.get(l.id) ?? 0 };
      }),
    })),
  };
}

const lessonSummary = (l: CourseLesson) => ({ id: l.id, sectionId: l.sectionId, title: l.title, position: l.position, type: l.type, status: l.status, intention: l.intention, durationMin: l.durationMin, hasTest: !!l.testUrl, hasVideo: !!l.videoUrl, issues: l.issues, updatedAt: l.updatedAt });

/** La liste « Leçons » d'une page de section suit ses leçons. Un échec ici n'annule pas ce qui vient d'être enregistré. */
async function refreshLessonList(sectionId: number) {
  const db = getDb();
  const section = await requireSection(sectionId);
  if (section.archivedAt) return;
  const lessons = await db.select({ title: courseLessons.title }).from(courseLessons).where(and(eq(courseLessons.sectionId, sectionId), isNull(courseLessons.archivedAt))).orderBy(asc(courseLessons.position), asc(courseLessons.id));
  try {
    if (await writeLessonList(section.notionPageId, section.content, lessons.map((l) => l.title))) await refreshSection(section);
  } catch (e) {
    console.error("Liste des leçons :", e instanceof Error ? e.message : "erreur");
  }
}

async function tagNames(ids: number[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await getDb().select({ name: hashtags.name }).from(hashtags).where(inArray(hashtags.id, ids));
  return rows.map((r) => r.name);
}

async function participants(courseId: number) {
  const db = getDb();
  const rows = await db.select({ e: courseEnrollments, m: members }).from(courseEnrollments).innerJoin(members, eq(members.id, courseEnrollments.memberId)).where(eq(courseEnrollments.courseId, courseId)).orderBy(desc(courseEnrollments.startedAt));
  const { lessons } = await outline(courseId);
  const published = lessons.filter((l) => l.status === "publie");
  const progress = published.length && rows.length ? await db.select().from(lessonProgress).where(and(inArray(lessonProgress.lessonId, published.map((l) => l.id)), inArray(lessonProgress.memberId, rows.map((r) => r.e.memberId)))) : [];
  const sends = rows.length ? await db.select({ memberId: emailSends.memberId, at: emailSends.createdAt }).from(emailSends).where(and(eq(emailSends.courseId, courseId), eq(emailSends.status, "envoye"), inArray(emailSends.memberId, rows.map((r) => r.e.memberId)))).orderBy(desc(emailSends.createdAt)) : [];
  const now = Date.now();
  return Promise.all(rows.map(async ({ e, m }) => ({
    memberId: m.id, name: fullName(m), photoUrl: m.photoUrl, initials: `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase(),
    startedAt: e.startedAt, lastActivityAt: e.lastActivityAt, finishedAt: e.finishedAt, fullAccess: !!e.fullAccessAt,
    done: progress.filter((p) => p.memberId === m.id && p.completedAt).length, total: published.length,
    inactive: !e.finishedAt && now - e.lastActivityAt.getTime() >= 14 * DAY,
    lastReminderAt: sends.find((x) => x.memberId === m.id)?.at ?? null,
    unsubscribed: !(await memberPreferences(m.id)).formations,
    reminder: (await reminderPlan(m, courseId))?.template ?? null,
  })));
}

/** Relancer par e-mail, après le clic de l'administration. Chaque personne écartée l'est pour une raison affichée. */
async function remind(actor: Member, courseId: number, memberIds: number[]) {
  const course = await requireCourse(courseId);
  const people = memberIds.length ? await getDb().select().from(members).where(inArray(members.id, memberIds)) : [];
  const results = [];
  for (const m of people) {
    const plan = await reminderPlan(m, courseId);
    const r = plan ? await sendCourseReminder(m, course, plan, { kind: "manuel", sentBy: actor.id }) : { status: "ignore" as const, reason: "a_jour" };
    results.push({ memberId: m.id, name: fullName(m), status: r.status, reason: r.reason, reasonLabel: SKIP_LABEL[r.reason] ?? "" });
    if (r.status === "envoye") await logAdmin(actor, { action: "Relance envoyée par e-mail", targetType: "membre", targetId: m.id, label: fullName(m), detail: course.title });
  }
  return { sent: results.filter((r) => r.status === "envoye").length, results };
}

/** Donner ou retirer l'accès complet : réversible, le journal et les réponses restent. */
async function setFullAccess(actor: Parameters<typeof logAdmin>[0], courseId: number, memberId: number, on: boolean) {
  const db = getDb();
  const course = await requireCourse(courseId);
  const [m] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!m || m.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable." });
  if (on) {
    await db.insert(courseEnrollments).values({ courseId, memberId, fullAccessAt: new Date(), fullAccessBy: actor.id }).onConflictDoUpdate({ target: [courseEnrollments.courseId, courseEnrollments.memberId], set: { fullAccessAt: new Date(), fullAccessBy: actor.id } });
    await notify([memberId], { title: `Toutes les sections de « ${course.title} » sont ouvertes pour vous`, href: `/parcours/${courseId}` });
  } else {
    await db.update(courseEnrollments).set({ fullAccessAt: null, fullAccessBy: null }).where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.memberId, memberId)));
  }
  await logActivity(memberId, on ? "acces_complet_donne" : "acces_complet_retire", { courseId, label: course.title });
  await logAdmin(actor, { action: on ? "Accès complet donné" : "Accès complet retiré", targetType: "formation", targetId: courseId, label: course.title, detail: fullName(m) });
}

export const buildRouter = createRouter({
  /** L'état de la liaison avec Notion. */
  status: buildProc.query(async () => ({
    notionReady: notionReady(), storageReady: storageReady(), privateBoxReady: privateBoxReady(), aiReady: !!env.geminiApiKey, emailReady: emailReady(),
    running: syncRunning(), lastSync: await lastSync(),
  })),

  /** Synchroniser maintenant. « full » relit tout, même ce qui ne semble pas avoir changé. */
  syncNow: buildProc.input(z.object({ full: z.boolean().default(false) })).mutation(async ({ input }) => {
    if (!notionReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La clé Notion (NOTION_TOKEN) n’est pas encore configurée." });
    return syncAll({ trigger: "manuel", full: input.full });
  }),

  courses: buildProc.query(async () => {
    const db = getDb();
    const [rows, sections, lessons, counts] = await Promise.all([
      db.select().from(courses).where(isNull(courses.archivedAt)).orderBy(asc(courses.position), asc(courses.title)),
      db.select({ id: courseSections.id, courseId: courseSections.courseId, issues: courseSections.issues }).from(courseSections).where(isNull(courseSections.archivedAt)),
      db.select({ sectionId: courseLessons.sectionId, status: courseLessons.status, issues: courseLessons.issues }).from(courseLessons).where(isNull(courseLessons.archivedAt)),
      db.select({ courseId: courseEnrollments.courseId, n: sql<number>`count(*)::int` }).from(courseEnrollments).groupBy(courseEnrollments.courseId),
    ]);
    return rows.map((c) => {
      const ownSections = sections.filter((x) => x.courseId === c.id);
      const ownLessons = lessons.filter((l) => ownSections.some((x) => x.id === l.sectionId));
      return {
        id: c.id, title: c.title, tagline: c.tagline, emoji: c.emoji, coverUrl: c.coverUrl, public: c.public, rhythm: c.rhythm, status: c.status, position: c.position,
        sectionCount: ownSections.length, lessonCount: ownLessons.length, publishedCount: ownLessons.filter((l) => l.status === "publie").length, participants: counts.find((x) => x.courseId === c.id)?.n ?? 0,
        issueCount: c.issues.length + ownSections.reduce((n, x) => n + x.issues.length, 0) + ownLessons.reduce((n, l) => n + l.issues.length, 0),
      };
    });
  }),

  course: buildProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const db = getDb();
    const c = await requireCourse(input.id);
    const [{ sections, lessons }, tags, assignments, people, stats] = await Promise.all([
      outline(c.id),
      db.select({ id: courseHashtags.hashtagId }).from(courseHashtags).where(eq(courseHashtags.courseId, c.id)),
      db.select({ a: courseAssignments, name: sql<string | null>`${members.firstName} || ' ' || ${members.lastName}`, tag: memberTags.name }).from(courseAssignments).leftJoin(members, eq(members.id, courseAssignments.memberId)).leftJoin(memberTags, eq(memberTags.id, courseAssignments.tagId)).where(eq(courseAssignments.courseId, c.id)).orderBy(asc(courseAssignments.id)),
      participants(c.id),
      courseStats(c.id),
    ]);
    return {
      id: c.id, title: c.title, tagline: c.tagline, emoji: c.emoji, coverUrl: c.coverUrl, public: c.public, rhythm: c.rhythm, status: c.status, position: c.position,
      description: c.content.description ?? [], hashtagIds: tags.map((t) => t.id), issues: c.issues, notionPageId: c.notionPageId, notionEditedAt: c.notionEditedAt, archived: !!c.archivedAt,
      sections: sections.map((x) => ({ id: x.id, title: x.title, position: x.position, intention: x.intention, issues: x.issues, lessons: lessons.filter((l) => l.sectionId === x.id).map(lessonSummary) })),
      assignments: assignments.map(({ a, name, tag }) => ({ id: a.id, memberId: a.memberId, accessType: a.accessType, tagId: a.tagId, label: name ?? tag ?? "" })),
      participants: people, stats,
    };
  }),

  /** Créer une formation : d'abord dans Notion, puis copie ici. */
  createCourse: buildProc
    .input(z.object({ title: z.string().trim().min(1, "Indiquez un titre.").max(200), tagline: z.string().trim().max(400).default(""), description: z.string().trim().max(2000).default(""), coverUrl: z.string().trim().max(1000).default(""), public: z.enum(["tous", "attribution"]), rhythm: z.enum(["hebdo", "complet"]).default("hebdo"), hashtagIds: z.array(z.number().int()).max(10).default([]) }))
    .mutation(async ({ ctx, input }) => {
      assertNotionReady();
      if (input.coverUrl && !isOurImage("courseImage", input.coverUrl)) throw badRequest("Importez la couverture depuis ce formulaire.");
      const [{ n }] = await getDb().select({ n: sql<number>`coalesce(max(${courses.position}), 0)::int` }).from(courses);
      try {
        const page = await createCoursePage({ ...input, status: "brouillon", position: n + 1, hashtags: await tagNames(input.hashtagIds) });
        const row = await syncCoursePage(await getPage(page.id));
        await logAdmin(ctx.member, { action: "Formation créée", targetType: "formation", targetId: row.id, label: row.title });
        return { id: row.id };
      } catch (e) { throw asTrpcError(e); }
    }),

  updateCourse: buildProc
    .input(z.object({ id: z.number().int(), title: z.string().trim().min(1, "Indiquez un titre.").max(200), tagline: z.string().trim().max(400), coverUrl: z.string().trim().max(1000), public: z.enum(["tous", "attribution"]), rhythm: z.enum(["hebdo", "complet"]), status: statusSchema, position: z.number().int(), hashtagIds: z.array(z.number().int()).max(10), description: z.array(blockInput).max(100) }))
    .mutation(async ({ ctx, input }) => {
      assertNotionReady();
      const c = await requireCourse(input.id);
      const coverChanged = input.coverUrl !== c.coverUrl;
      if (coverChanged && input.coverUrl && !isOurImage("courseImage", input.coverUrl)) throw badRequest("Importez la couverture depuis ce formulaire.");
      try {
        await assertUnchanged(c.notionPageId, c.notionEditedAt);
        await updatePage(c.notionPageId, { properties: await courseProperties({ ...input, hashtags: await tagNames(input.hashtagIds) }, { coverChanged }) });
        const oldList = c.content.description ?? [];
        const heading = c.content.descriptionHeading;
        const wanted = cleanList(input.description, oldList);
        if (heading) await writeList(c.notionPageId, oldList, wanted, heading);
        else if (wanted.length) { const [h] = await appendBlocks(c.notionPageId, [heading2("Présentation de la formation")]); await writeList(c.notionPageId, [], wanted, h.id); }
      } catch (e) {
        await refreshAfterFailure(e, () => refreshCourse(c));
        throw asTrpcError(e);
      }
      const row = await refreshCourse(c);
      await logAdmin(ctx.member, { action: "Formation modifiée", targetType: "formation", targetId: row.id, label: row.title });
      return { ok: true };
    }),

  /** Les modèles de la base Leçons de Notion, s'il y en a. */
  templates: buildProc.query(async () => {
    if (!notionReady()) return [];
    try { return await listTemplates(env.notionLecons); } catch { return []; }
  }),

  /* ───────────── Sections ───────────── */

  /** Créer une section : d'abord dans Notion, à la suite des autres. Elle apparaîtra quand une de ses leçons sera publiée. */
  createSection: buildProc
    .input(z.object({ courseId: z.number().int(), title: z.string().trim().min(1, "Indiquez un titre.").max(200), intention: z.string().trim().max(600).default("") }))
    .mutation(async ({ ctx, input }) => {
      assertNotionReady();
      const course = await requireCourse(input.courseId);
      const [{ n }] = await getDb().select({ n: sql<number>`coalesce(max(${courseSections.position}), 0)::int` }).from(courseSections).where(and(eq(courseSections.courseId, course.id), isNull(courseSections.archivedAt)));
      try {
        const page = await createSectionPage({ title: input.title, position: n + 1, intention: input.intention, hashtags: [], coursePageId: course.notionPageId }, { kind: "structure" });
        const row = await syncSectionPage(await getPage(page.id), course);
        await logAdmin(ctx.member, { action: "Section créée", targetType: "section", targetId: row.id, label: row.title, detail: course.title });
        return { id: row.id };
      } catch (e) { throw asTrpcError(e); }
    }),

  section: buildProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const x = await requireSection(input.id);
    const [tags, course] = await Promise.all([
      getDb().select({ id: courseSectionHashtags.hashtagId }).from(courseSectionHashtags).where(eq(courseSectionHashtags.sectionId, x.id)),
      requireCourse(x.courseId),
    ]);
    return {
      id: x.id, courseId: x.courseId, courseTitle: course.title, title: x.title, position: x.position, intention: x.intention,
      rubrics: { intention: x.content.rubrics?.intention ?? [], objectifs: x.content.rubrics?.objectifs ?? [], defi: x.content.rubrics?.defi ?? [] },
      hashtagIds: tags.map((t) => t.id), issues: x.issues, notionPageId: x.notionPageId, notionEditedAt: x.notionEditedAt, archived: !!x.archivedAt,
    };
  }),

  /** Enregistrer une section : Notion d'abord, relecture ensuite. Refusé si la page a changé dans Notion entre-temps. */
  saveSection: buildProc
    .input(z.object({ id: z.number().int(), title: z.string().trim().min(1, "Indiquez un titre.").max(200), position: z.number().int().min(0), intention: z.string().trim().max(2000), hashtagIds: z.array(z.number().int()).max(10), rubrics: sectionRubrics }))
    .mutation(async ({ ctx, input }) => {
      assertNotionReady();
      const x = await requireSection(input.id);
      const old = x.content;
      const rubrics = cleanRubrics(input.rubrics, old, SECTION_RUBRICS);
      try {
        await assertUnchanged(x.notionPageId, x.notionEditedAt);
        await updatePage(x.notionPageId, { properties: await sectionProperties({ ...input, hashtags: await tagNames(input.hashtagIds) }) });
        followIntention(rubrics, input.intention, x.intention);
        await writeRubrics(x.notionPageId, old, rubrics, SECTION_RUBRICS);
      } catch (e) {
        await refreshAfterFailure(e, () => refreshSection(x));
        throw asTrpcError(e);
      }
      const row = await refreshSection(x);
      await logAdmin(ctx.member, { action: "Section modifiée", targetType: "section", targetId: row.id, label: row.title });
      return { ok: true, issues: row.issues };
    }),

  /** Réordonner les sections d'une formation : l'« Ordre » change dans Notion, il fixe la semaine d'ouverture. */
  reorderSections: buildProc.input(z.object({ courseId: z.number().int(), sectionIds: z.array(z.number().int()).max(200) })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const db = getDb();
    const { sections } = await outline(input.courseId);
    if (sections.length !== input.sectionIds.length || !sections.every((x) => input.sectionIds.includes(x.id))) throw badRequest("Cette liste ne correspond plus aux sections de la formation : rechargez la page.");
    try {
      for (const [i, id] of input.sectionIds.entries()) {
        const x = sections.find((y) => y.id === id)!;
        if (x.position === i + 1) continue;
        await assertUnchanged(x.notionPageId, x.notionEditedAt);
        const page = await updatePage(x.notionPageId, { properties: { Ordre: { number: i + 1 } } });
        await db.update(courseSections).set({ position: i + 1, notionEditedAt: new Date(page.last_edited_time), updatedAt: new Date() }).where(eq(courseSections.id, x.id));
      }
    } catch (e) { throw asTrpcError(e); }
    await logAdmin(ctx.member, { action: "Ordre des sections modifié", targetType: "formation", targetId: input.courseId });
    return { ok: true };
  }),

  /** Dupliquer une section avec ses leçons : « Copie de… », leçons en brouillon, à la suite des autres sections. */
  duplicateSection: buildProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const db = getDb();
    const x = await requireSection(input.id);
    const course = await requireCourse(x.courseId);
    const { sections, lessons } = await outline(x.courseId);
    const own = lessons.filter((l) => l.sectionId === x.id);
    const sectionTags = await db.select({ id: courseSectionHashtags.hashtagId }).from(courseSectionHashtags).where(eq(courseSectionHashtags.sectionId, x.id));
    try {
      const page = await createSectionPage({ title: `Copie de ${x.title}`.slice(0, 200), position: Math.max(0, ...sections.map((y) => y.position)) + 1, intention: x.intention, hashtags: await tagNames(sectionTags.map((t) => t.id)), coursePageId: course.notionPageId }, { kind: "copie", content: x.content, lessonTitles: own.map((l) => l.title) });
      const row = await syncSectionPage(await getPage(page.id), course);
      for (const l of own) {
        const tags = await db.select({ id: courseLessonHashtags.hashtagId }).from(courseLessonHashtags).where(eq(courseLessonHashtags.lessonId, l.id));
        const copy = await createLessonPage({ title: l.title, position: l.position, type: l.type, status: "brouillon", intention: l.intention, durationMin: l.durationMin, videoUrl: l.videoUrl, testUrl: l.testUrl, hashtags: await tagNames(tags.map((t) => t.id)), sectionPageId: page.id }, { kind: "copie", content: l.content });
        await syncLessonPage(await getPage(copy.id), row);
      }
      await logAdmin(ctx.member, { action: "Section dupliquée", targetType: "section", targetId: row.id, label: x.title, detail: `${own.length} leçon(s)` });
      return { id: row.id };
    } catch (e) { throw asTrpcError(e); }
  }),

  /** Retirer une section : elle et ses leçons vont à la corbeille de Notion. La progression et le journal des membres restent. */
  archiveSection: buildProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const db = getDb();
    const x = await requireSection(input.id);
    const own = await db.select().from(courseLessons).where(and(eq(courseLessons.sectionId, x.id), isNull(courseLessons.archivedAt)));
    const now = new Date();
    try {
      for (const l of own) {
        await updatePage(l.notionPageId, { in_trash: true });
        await db.update(courseLessons).set({ archivedAt: now, updatedAt: new Date() }).where(eq(courseLessons.id, l.id));
      }
      await updatePage(x.notionPageId, { in_trash: true });
    } catch (e) { throw asTrpcError(e); }
    await db.update(courseSections).set({ archivedAt: now, updatedAt: new Date() }).where(eq(courseSections.id, x.id));
    await logAdmin(ctx.member, { action: "Section retirée", targetType: "section", targetId: x.id, label: x.title, detail: `${own.length} leçon(s) à la corbeille de Notion` });
    return { ok: true };
  }),

  /* ───────────── Leçons ───────────── */

  /** Créer une leçon : structure de la base, ou modèle de Notion. La liste de la page de section suit. */
  createLesson: buildProc
    .input(z.object({ sectionId: z.number().int(), title: z.string().trim().min(1, "Indiquez un titre.").max(200), type: z.enum(LESSON_TYPES).default("contenu"), intention: z.string().trim().max(600).default(""), source: z.discriminatedUnion("kind", [z.object({ kind: z.literal("structure") }), z.object({ kind: z.literal("notion"), templateId: z.string().max(64) })]) }))
    .mutation(async ({ ctx, input }) => {
      assertNotionReady();
      const section = await requireSection(input.sectionId);
      const [{ n }] = await getDb().select({ n: sql<number>`coalesce(max(${courseLessons.position}), 0)::int` }).from(courseLessons).where(and(eq(courseLessons.sectionId, section.id), isNull(courseLessons.archivedAt)));
      try {
        const page = await createLessonPage({ title: input.title, position: n + 1, type: input.type, status: "brouillon", intention: input.intention, durationMin: null, videoUrl: "", testUrl: "", hashtags: [], sectionPageId: section.notionPageId }, input.source);
        const row = await syncLessonPage(await getPage(page.id), section);
        await refreshLessonList(section.id);
        await logAdmin(ctx.member, { action: "Leçon créée", targetType: "lecon", targetId: row.id, label: row.title, detail: section.title });
        return { id: row.id };
      } catch (e) { throw asTrpcError(e); }
    }),

  lesson: buildProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const l = await requireLesson(input.id);
    const section = await requireSection(l.sectionId);
    const [tags, course] = await Promise.all([
      getDb().select({ id: courseLessonHashtags.hashtagId }).from(courseLessonHashtags).where(eq(courseLessonHashtags.lessonId, l.id)),
      requireCourse(section.courseId),
    ]);
    const r = l.content.rubrics ?? {};
    return {
      id: l.id, sectionId: l.sectionId, sectionTitle: section.title, courseId: section.courseId, courseTitle: course.title, title: l.title, position: l.position, type: l.type, status: l.status, intention: l.intention, durationMin: l.durationMin, videoUrl: l.videoUrl, testUrl: l.testUrl,
      rubrics: { intention: r.intention ?? [], contenu: r.contenu ?? [], exercice: r.exercice ?? [], defi: r.defi ?? [], plusLoin: r.plusLoin ?? [] }, headings: l.content.headings ?? {}, before: l.content.before ?? [], hashtagIds: tags.map((t) => t.id), issues: l.issues, notionPageId: l.notionPageId, notionEditedAt: l.notionEditedAt, archived: !!l.archivedAt,
    };
  }),

  /** Enregistrer une leçon : Notion d'abord, relecture ensuite. Refusé si la page a changé dans Notion entre-temps. */
  saveLesson: buildProc
    .input(z.object({ id: z.number().int(), title: z.string().trim().min(1, "Indiquez un titre.").max(200), position: z.number().int().min(0), type: z.enum(LESSON_TYPES), status: statusSchema, intention: z.string().trim().max(2000), durationMin: z.number().int().min(0).max(1000).nullable(), videoUrl: z.string().trim().max(1000), testUrl: z.string().trim().max(1000), hashtagIds: z.array(z.number().int()).max(10), rubrics: lessonRubrics }))
    .mutation(async ({ ctx, input }) => {
      assertNotionReady();
      const l = await requireLesson(input.id);
      const problem = testUrlProblem(input.testUrl, env.appUrl);
      if (problem) throw badRequest(problem);
      if (input.videoUrl && !/^https?:\/\/\S+$/i.test(input.videoUrl)) throw badRequest("Vidéo : indiquez une adresse complète (https://…).");
      const old = l.content;
      const rubrics = cleanRubrics(input.rubrics, old, LESSON_RUBRICS);
      try {
        await assertUnchanged(l.notionPageId, l.notionEditedAt);
        await updatePage(l.notionPageId, { properties: await lessonProperties({ ...input, hashtags: await tagNames(input.hashtagIds) }) });
        followIntention(rubrics, input.intention, l.intention);
        await writeRubrics(l.notionPageId, old, rubrics, LESSON_RUBRICS);
      } catch (e) {
        await refreshAfterFailure(e, () => refreshLesson(l));
        throw asTrpcError(e);
      }
      const row = await refreshLesson(l);
      if (row.title !== l.title || row.position !== l.position) await refreshLessonList(l.sectionId);
      await logAdmin(ctx.member, { action: "Leçon modifiée", targetType: "lecon", targetId: row.id, label: row.title });
      return { ok: true, issues: row.issues };
    }),

  /** Réordonner les leçons d'une section. Une leçon peut venir d'une autre section de la formation : sa relation change aussi dans Notion. */
  reorderLessons: buildProc.input(z.object({ sectionId: z.number().int(), lessonIds: z.array(z.number().int()).max(500) })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const db = getDb();
    const target = await requireSection(input.sectionId);
    const { sections, lessons } = await outline(target.courseId);
    const own = lessons.filter((l) => l.sectionId === target.id);
    const moved = input.lessonIds.map((id) => lessons.find((l) => l.id === id));
    if (moved.some((l) => !l) || !own.every((l) => input.lessonIds.includes(l.id))) throw badRequest("Cette liste ne correspond plus aux leçons de la formation : rechargez la page.");
    const touched = new Set<number>([target.id]);
    try {
      for (const [i, l] of (moved as CourseLesson[]).entries()) {
        const changesSection = l.sectionId !== target.id;
        if (l.position === i + 1 && !changesSection) continue;
        await assertUnchanged(l.notionPageId, l.notionEditedAt);
        const page = await updatePage(l.notionPageId, { properties: { Ordre: { number: i + 1 }, ...(changesSection ? { Section: { relation: [{ id: target.notionPageId }] } } : {}) } });
        await db.update(courseLessons).set({ position: i + 1, sectionId: target.id, notionEditedAt: new Date(page.last_edited_time), updatedAt: new Date() }).where(eq(courseLessons.id, l.id));
        touched.add(l.sectionId);
      }
    } catch (e) { throw asTrpcError(e); }
    for (const id of touched) if (sections.some((x) => x.id === id)) await refreshLessonList(id);
    await logAdmin(ctx.member, { action: "Ordre des leçons modifié", targetType: "section", targetId: target.id, label: target.title });
    return { ok: true };
  }),

  /** Publier ou dépublier une leçon en un clic : le statut change dans Notion, puis la page est relue. */
  setLessonStatus: buildProc.input(z.object({ id: z.number().int(), status: statusSchema })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const l = await requireLesson(input.id);
    try {
      await assertUnchanged(l.notionPageId, l.notionEditedAt);
      await updatePage(l.notionPageId, { properties: { Statut: { status: { name: LESSON_STATUS[input.status] } } } });
      await refreshLesson(l);
    } catch (e) { throw asTrpcError(e); }
    await logAdmin(ctx.member, { action: input.status === "publie" ? "Leçon publiée" : "Leçon dépubliée", targetType: "lecon", targetId: l.id, label: l.title });
    return { ok: true };
  }),

  /** Dupliquer une leçon : « Copie de… », en brouillon, à la fin de sa section. */
  duplicateLesson: buildProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const db = getDb();
    const l = await requireLesson(input.id);
    const section = await requireSection(l.sectionId);
    const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${courseLessons.position}), 0)::int` }).from(courseLessons).where(and(eq(courseLessons.sectionId, section.id), isNull(courseLessons.archivedAt)));
    const tags = await db.select({ id: courseLessonHashtags.hashtagId }).from(courseLessonHashtags).where(eq(courseLessonHashtags.lessonId, l.id));
    try {
      const page = await createLessonPage({ title: `Copie de ${l.title}`.slice(0, 200), position: n + 1, type: l.type, status: "brouillon", intention: l.intention, durationMin: l.durationMin, videoUrl: l.videoUrl, testUrl: l.testUrl, hashtags: await tagNames(tags.map((t) => t.id)), sectionPageId: section.notionPageId }, { kind: "copie", content: l.content });
      const row = await syncLessonPage(await getPage(page.id), section);
      await refreshLessonList(section.id);
      await logAdmin(ctx.member, { action: "Leçon dupliquée", targetType: "lecon", targetId: row.id, label: l.title });
      return { id: row.id };
    } catch (e) { throw asTrpcError(e); }
  }),

  /** Retirer une leçon : elle part à la corbeille de Notion. La progression et le journal des membres restent. */
  archiveLesson: buildProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const l = await requireLesson(input.id);
    try { await updatePage(l.notionPageId, { in_trash: true }); } catch (e) { throw asTrpcError(e); }
    await getDb().update(courseLessons).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(courseLessons.id, l.id));
    await refreshLessonList(l.sectionId);
    await logAdmin(ctx.member, { action: "Leçon retirée", targetType: "lecon", targetId: l.id, label: l.title });
    return { ok: true };
  }),

  /** Aperçu comme un membre : même affichage, quel que soit le statut, sans rien enregistrer. */
  preview: buildProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const l = await requireLesson(input.id);
    const section = await requireSection(l.sectionId);
    const course = await requireCourse(section.courseId);
    return { ...(await lessonView(l, section, course)), preview: true, status: l.status, courseStatus: course.status };
  }),

  setCourseStatus: buildProc.input(z.object({ id: z.number().int(), status: statusSchema })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const c = await requireCourse(input.id);
    try {
      await assertUnchanged(c.notionPageId, c.notionEditedAt);
      await updatePage(c.notionPageId, { properties: { Statut: { status: { name: COURSE_STATUS[input.status] } } } });
      await refreshCourse(c);
    } catch (e) { throw asTrpcError(e); }
    await logAdmin(ctx.member, { action: input.status === "publie" ? "Formation publiée" : "Formation dépubliée", targetType: "formation", targetId: c.id, label: c.title });
    return { ok: true };
  }),

  /** Supprimer une formation : elle, ses sections et ses leçons vont à la corbeille de Notion. Le journal des membres reste. */
  archiveCourse: buildProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const c = await requireCourse(input.id);
    const { sections, lessons } = await outline(c.id);
    const now = new Date();
    try {
      for (const l of lessons) {
        await updatePage(l.notionPageId, { in_trash: true });
        await getDb().update(courseLessons).set({ archivedAt: now, updatedAt: new Date() }).where(eq(courseLessons.id, l.id));
      }
      for (const x of sections) {
        await updatePage(x.notionPageId, { in_trash: true });
        await getDb().update(courseSections).set({ archivedAt: now, updatedAt: new Date() }).where(eq(courseSections.id, x.id));
      }
      await updatePage(c.notionPageId, { in_trash: true });
    } catch (e) { throw asTrpcError(e); }
    await getDb().update(courses).set({ archivedAt: now, updatedAt: new Date() }).where(eq(courses.id, c.id));
    await logAdmin(ctx.member, { action: "Formation supprimée", targetType: "formation", targetId: c.id, label: c.title, detail: `${sections.length} section(s) et ${lessons.length} leçon(s) à la corbeille de Notion` });
    return { ok: true };
  }),

  /* ───────────── Attributions, étiquettes, accès complet ───────────── */

  assign: buildProc
    .input(z.object({ courseId: z.number().int(), memberId: z.number().int().optional(), accessType: z.enum(["collectif", "individuel", "les_deux"]).optional(), tagId: z.number().int().optional() }).refine((i) => [i.memberId, i.accessType, i.tagId].filter((x) => x !== undefined).length === 1, "Choisissez un membre, un type d’accès ou une étiquette."))
    .mutation(async ({ ctx, input }) => {
      const course = await requireCourse(input.courseId);
      const [row] = await getDb().insert(courseAssignments).values({ courseId: input.courseId, memberId: input.memberId ?? null, accessType: input.accessType ?? null, tagId: input.tagId ?? null, createdBy: ctx.memberId }).onConflictDoNothing().returning();
      if (row) {
        if (input.memberId && course.status === "publie") await notify([input.memberId], { title: `Une formation vous est ouverte : ${course.title}`, href: `/parcours/${course.id}` });
        await logAdmin(ctx.member, { action: "Formation attribuée", targetType: "formation", targetId: course.id, label: course.title, detail: input.memberId ? `Membre n° ${input.memberId}` : input.accessType ? `Accès ${input.accessType}` : `Étiquette n° ${input.tagId}` });
      }
      return { ok: true };
    }),

  unassign: buildProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb().delete(courseAssignments).where(eq(courseAssignments.id, input.id)).returning();
    if (row) await logAdmin(ctx.member, { action: "Attribution retirée", targetType: "formation", targetId: row.courseId });
    return { ok: true };
  }),

  tags: buildProc.query(() =>
    getDb().select({ id: memberTags.id, name: memberTags.name, members: sql<number>`count(${memberTagLinks.memberId})::int` }).from(memberTags).leftJoin(memberTagLinks, eq(memberTagLinks.tagId, memberTags.id)).groupBy(memberTags.id, memberTags.name).orderBy(asc(memberTags.name))
  ),

  createTag: buildProc.input(z.object({ name: z.string().trim().min(1).max(60) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [same] = await db.select().from(memberTags).where(eq(sql`lower(${memberTags.name})`, input.name.toLowerCase())).limit(1);
    if (same) return same;
    const [row] = await db.insert(memberTags).values({ name: input.name }).returning();
    await logAdmin(ctx.member, { action: "Étiquette créée", targetType: "etiquette", targetId: row.id, label: row.name });
    return row;
  }),

  removeTag: buildProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb().delete(memberTags).where(eq(memberTags.id, input.id)).returning();
    if (row) await logAdmin(ctx.member, { action: "Étiquette supprimée", targetType: "etiquette", targetId: row.id, label: row.name });
    return { ok: true };
  }),

  setMemberTag: buildProc.input(z.object({ memberId: z.number().int(), tagId: z.number().int(), on: z.boolean() })).mutation(async ({ input }) => {
    const db = getDb();
    if (input.on) await db.insert(memberTagLinks).values({ memberId: input.memberId, tagId: input.tagId }).onConflictDoNothing();
    else await db.delete(memberTagLinks).where(and(eq(memberTagLinks.memberId, input.memberId), eq(memberTagLinks.tagId, input.tagId)));
    return { ok: true };
  }),

  setFullAccess: buildProc.input(z.object({ courseId: z.number().int(), memberId: z.number().int(), on: z.boolean() })).mutation(async ({ ctx, input }) => {
    await setFullAccess(ctx.member, input.courseId, input.memberId, input.on);
    return { ok: true };
  }),

  /* ───────────── Fiche d'un membre ───────────── */

  /** Ses formations, ses étiquettes et son activité : des faits, jamais ce qu'il a écrit. */
  memberFile: buildProc.input(z.object({ memberId: z.number().int() })).query(async ({ input }) => {
    const db = getDb();
    const [list, enrollments, tags, activity] = await Promise.all([
      db.select().from(courses).where(isNull(courses.archivedAt)).orderBy(asc(courses.position)),
      db.select().from(courseEnrollments).where(eq(courseEnrollments.memberId, input.memberId)),
      db.select({ id: memberTags.id, name: memberTags.name }).from(memberTagLinks).innerJoin(memberTags, eq(memberTags.id, memberTagLinks.tagId)).where(eq(memberTagLinks.memberId, input.memberId)),
      db.select().from(memberActivity).where(eq(memberActivity.memberId, input.memberId)).orderBy(desc(memberActivity.createdAt), desc(memberActivity.id)).limit(40),
    ]);
    const published = await db.select({ id: courseLessons.id, courseId: courseSections.courseId }).from(courseLessons).innerJoin(courseSections, eq(courseSections.id, courseLessons.sectionId)).where(and(eq(courseLessons.status, "publie"), isNull(courseLessons.archivedAt), isNull(courseSections.archivedAt)));
    const progress = await db.select({ lessonId: lessonProgress.lessonId }).from(lessonProgress).where(and(eq(lessonProgress.memberId, input.memberId), isNotNull(lessonProgress.completedAt)));
    const [prefs, sends] = await Promise.all([memberPreferences(input.memberId), db.select().from(emailSends).where(eq(emailSends.memberId, input.memberId)).orderBy(desc(emailSends.createdAt)).limit(10)]);
    return {
      courses: list.map((c) => {
        const e = enrollments.find((x) => x.courseId === c.id);
        const own = published.filter((l) => l.courseId === c.id);
        return { id: c.id, title: c.title, status: c.status, startedAt: e?.startedAt ?? null, fullAccess: !!e?.fullAccessAt, finishedAt: e?.finishedAt ?? null, total: own.length, done: own.filter((l) => progress.some((p) => p.lessonId === l.id)).length };
      }),
      tags,
      activity: activity.map((a) => ({ id: a.id, type: a.type, typeLabel: ACTIVITY_LABEL[a.type] ?? a.type, label: a.label, at: a.createdAt })),
      emailPrefs: Object.entries(prefs).map(([key, enabled]) => ({ key, label: EMAIL_CATEGORIES[key as keyof typeof EMAIL_CATEGORIES].label, enabled })),
      emailSends: sends.map((x) => ({ id: x.id, subject: x.subject, status: x.status, reasonLabel: SKIP_LABEL[x.reason] ?? "", kind: x.kind, at: x.createdAt })),
    };
  }),

  /** Ce que ce membre a choisi de partager, et rien d'autre : le serveur ne lit jamais les éléments non partagés. */
  memberShared: buildProc.input(z.object({ memberId: z.number().int() })).query(async ({ input }) => {
    const db = getDb();
    const [entries, tests, memory] = await Promise.all([
      db.select().from(journalEntries).where(and(eq(journalEntries.memberId, input.memberId), isNotNull(journalEntries.sharedAt))).orderBy(desc(journalEntries.sharedAt)),
      db.select().from(testResults).where(and(eq(testResults.memberId, input.memberId), isNotNull(testResults.sharedAt))).orderBy(desc(testResults.sharedAt)),
      db.select().from(coachMemory).where(and(eq(coachMemory.memberId, input.memberId), isNotNull(coachMemory.sharedAt))).orderBy(desc(coachMemory.sharedAt)),
    ]);
    return {
      entries: entries.map((e) => ({ id: e.id, lessonTitle: e.lessonTitle, question: e.questionText, answer: open(input.memberId, e.answerEnc), sharedAt: e.sharedAt })),
      tests: tests.map((t) => ({ id: t.id, lessonTitle: t.lessonTitle, result: parseResult(open(input.memberId, t.resultEnc)), sharedAt: t.sharedAt })),
      memory: memory.map((m) => ({ id: m.id, sourceLabel: m.sourceLabel, text: open(input.memberId, m.contentEnc), sharedAt: m.sharedAt })),
    };
  }),

  /* ───────────── Relances ───────────── */

  workflows: buildProc.query(() => workflowOverview()),

  updateWorkflow: buildProc
    .input(z.object({ key: z.string().max(60), active: z.boolean(), title: z.string().trim().min(1).max(200), body: z.string().trim().max(600), emailEnabled: z.boolean(), emailSubject: z.string().trim().min(1, "Indiquez l’objet de l’e-mail.").max(200), emailBody: z.string().trim().min(1, "Écrivez le texte de l’e-mail.").max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const { key, ...set } = input;
      const [row] = await getDb().update(workflows).set({ ...set, updatedAt: new Date() }).where(eq(workflows.key, key)).returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Modèle introuvable." });
      await logAdmin(ctx.member, { action: "Relance modifiée", targetType: "relance", label: row.name, detail: `Notification ${input.active ? "active" : "désactivée"} · e-mail automatique ${input.emailEnabled ? "actif" : "désactivé"}` });
      return { ok: true };
    }),

  /** Relancer par e-mail un ou plusieurs participants, au clic. */
  sendReminders: buildProc.input(z.object({ courseId: z.number().int(), memberIds: z.array(z.number().int()).min(1).max(500) })).mutation(({ ctx, input }) => remind(ctx.member, input.courseId, input.memberIds)),

  /** Recevoir soi-même un exemple d'un modèle, pour le relire ou vérifier que l'envoi fonctionne. */
  sendTestEmail: buildProc.input(z.object({ key: z.string().max(60) })).mutation(async ({ ctx, input }) => {
    const [model] = await getDb().select().from(workflows).where(eq(workflows.key, input.key)).limit(1);
    if (!model) throw new TRPCError({ code: "NOT_FOUND", message: "Modèle introuvable." });
    if (!emailReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: SKIP_LABEL.sans_cle });
    const values = { prenom: ctx.member.firstName, section: "Exemple de section", lecon: "Exemple de leçon", formation: "Exemple de formation" };
    const r = await sendMemberEmail(ctx.member, { category: "formations", kind: "essai", template: model.key, subject: `[Essai] ${fillTemplate(model.emailSubject, values)}`, body: fillTemplate(model.emailBody, values), cta: { label: "Voir mes formations", href: `${env.appUrl}/parcours` } });
    if (r.status !== "envoye") throw new TRPCError({ code: "BAD_GATEWAY", message: SKIP_LABEL[r.reason] ?? "L’envoi a échoué." });
    return { to: ctx.member.email };
  }),

  /** Lancer les relances sans attendre. */
  runWorkflows: buildProc.mutation(() => runWorkflows()),
});

