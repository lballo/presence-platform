import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import {
  coachMemory, courseAssignments, courseEnrollments, courseHashtags, courseModuleHashtags, courseModules, courses, emailSends, hashtags, journalEntries, memberActivity, memberTagLinks, memberTags,
  members, moduleProgress, testResults, workflows, type Course, type CourseModule, type Member,
} from "../../db/schema";
import { ACTIVITY_LABEL, logActivity } from "../lib/activity";
import { processPendingMemories } from "../lib/coachMemory";
import { logAdmin } from "../lib/adminLog";
import { testUrlProblem } from "../lib/courseAccess";
import { emptySections, SECTIONS, type CourseBlock, type ModuleContent, type Sections } from "../lib/courseBlocks";
import { moduleView } from "../lib/courseState";
import { EMAIL_CATEGORIES, emailReady, fillTemplate, memberPreferences } from "../lib/email";
import { env } from "../lib/env";
import { appendBlocks, getPage, listTemplates, notionReady, updatePage } from "../lib/notion";
import { cleanInline, heading2 } from "../lib/notionBlocks";
import { lastSync, refreshCourse, refreshModule, syncAll, syncCoursePage, syncModulePage, syncRunning } from "../lib/notionSync";
import { asTrpcError, assertNotionReady, assertUnchanged, COURSE_STATUS, courseProperties, createCoursePage, createModulePage, MODULE_STATUS, moduleProperties, writeList, writeSections } from "../lib/notionWrite";
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

const sectionsSchema = z.object(Object.fromEntries(SECTIONS.map((s) => [s.key, z.array(blockInput).max(300)])) as Record<(typeof SECTIONS)[number]["key"], z.ZodArray<typeof blockInput>>);

/* ───────────── Lecture ───────────── */

async function requireCourse(id: number): Promise<Course> {
  const [c] = await getDb().select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Formation introuvable." });
  return c;
}

async function requireModule(id: number): Promise<CourseModule> {
  const [m] = await getDb().select().from(courseModules).where(eq(courseModules.id, id)).limit(1);
  if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Module introuvable." });
  return m;
}

async function tagNames(ids: number[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await getDb().select({ name: hashtags.name }).from(hashtags).where(inArray(hashtags.id, ids));
  return rows.map((r) => r.name);
}

/** Membres par module et modules où l'on décroche. Uniquement des nombres, jamais qui a écrit quoi. */
async function courseStats(courseId: number) {
  const db = getDb();
  const [mods, enrollments] = await Promise.all([
    db.select().from(courseModules).where(and(eq(courseModules.courseId, courseId), isNull(courseModules.archivedAt))).orderBy(asc(courseModules.position)),
    db.select().from(courseEnrollments).where(eq(courseEnrollments.courseId, courseId)),
  ]);
  const progress = mods.length ? await db.select().from(moduleProgress).where(inArray(moduleProgress.moduleId, mods.map((m) => m.id))) : [];
  const published = mods.filter((m) => m.status === "publie");
  const now = Date.now();
  const stuck = new Map<number, number>();
  for (const e of enrollments) {
    if (e.finishedAt || now - e.lastActivityAt.getTime() < 14 * DAY) continue;
    const first = published.find((m) => !progress.some((p) => p.moduleId === m.id && p.memberId === e.memberId && p.completedAt));
    if (first) stuck.set(first.id, (stuck.get(first.id) ?? 0) + 1);
  }
  return {
    enrolled: enrollments.length,
    finished: enrollments.filter((e) => e.finishedAt).length,
    fullAccess: enrollments.filter((e) => e.fullAccessAt).length,
    inactive: enrollments.filter((e) => !e.finishedAt && now - e.lastActivityAt.getTime() >= 14 * DAY).length,
    modules: published.map((m) => {
      const rows = progress.filter((p) => p.moduleId === m.id);
      return { id: m.id, title: m.title, position: m.position, opened: rows.filter((r) => r.openedAt).length, completed: rows.filter((r) => r.completedAt).length, stuck: stuck.get(m.id) ?? 0 };
    }),
  };
}

const moduleSummary = (m: CourseModule) => ({ id: m.id, title: m.title, position: m.position, status: m.status, intention: m.intention, durationMin: m.durationMin, hasTest: !!m.testUrl, hasVideo: !!m.videoUrl, issues: m.issues, updatedAt: m.updatedAt });

async function participants(courseId: number) {
  const db = getDb();
  const rows = await db.select({ e: courseEnrollments, m: members }).from(courseEnrollments).innerJoin(members, eq(members.id, courseEnrollments.memberId)).where(eq(courseEnrollments.courseId, courseId)).orderBy(desc(courseEnrollments.startedAt));
  const mods = await db.select({ id: courseModules.id }).from(courseModules).where(and(eq(courseModules.courseId, courseId), eq(courseModules.status, "publie"), isNull(courseModules.archivedAt)));
  const progress = mods.length && rows.length ? await db.select().from(moduleProgress).where(and(inArray(moduleProgress.moduleId, mods.map((m) => m.id)), inArray(moduleProgress.memberId, rows.map((r) => r.e.memberId)))) : [];
  const sends = rows.length ? await db.select({ memberId: emailSends.memberId, at: emailSends.createdAt }).from(emailSends).where(and(eq(emailSends.courseId, courseId), eq(emailSends.status, "envoye"), inArray(emailSends.memberId, rows.map((r) => r.e.memberId)))).orderBy(desc(emailSends.createdAt)) : [];
  const now = Date.now();
  return Promise.all(rows.map(async ({ e, m }) => ({
    memberId: m.id, name: fullName(m), photoUrl: m.photoUrl, initials: `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase(),
    startedAt: e.startedAt, lastActivityAt: e.lastActivityAt, finishedAt: e.finishedAt, fullAccess: !!e.fullAccessAt,
    done: progress.filter((p) => p.memberId === m.id && p.completedAt).length, total: mods.length,
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
    await notify([memberId], { title: `Tous les modules de « ${course.title} » sont ouverts pour vous`, href: `/parcours/${courseId}` });
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
    const [rows, mods, counts] = await Promise.all([
      db.select().from(courses).where(isNull(courses.archivedAt)).orderBy(asc(courses.position), asc(courses.title)),
      db.select({ courseId: courseModules.courseId, status: courseModules.status, issues: courseModules.issues }).from(courseModules).where(isNull(courseModules.archivedAt)),
      db.select({ courseId: courseEnrollments.courseId, n: sql<number>`count(*)::int` }).from(courseEnrollments).groupBy(courseEnrollments.courseId),
    ]);
    return rows.map((c) => {
      const own = mods.filter((m) => m.courseId === c.id);
      return {
        id: c.id, title: c.title, tagline: c.tagline, emoji: c.emoji, coverUrl: c.coverUrl, public: c.public, rhythm: c.rhythm, status: c.status, position: c.position,
        moduleCount: own.length, publishedCount: own.filter((m) => m.status === "publie").length, participants: counts.find((x) => x.courseId === c.id)?.n ?? 0,
        issueCount: c.issues.length + own.reduce((n, m) => n + m.issues.length, 0),
      };
    });
  }),

  course: buildProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const db = getDb();
    const c = await requireCourse(input.id);
    const [mods, tags, assignments, people, stats] = await Promise.all([
      db.select().from(courseModules).where(and(eq(courseModules.courseId, c.id), isNull(courseModules.archivedAt))).orderBy(asc(courseModules.position), asc(courseModules.id)),
      db.select({ id: courseHashtags.hashtagId }).from(courseHashtags).where(eq(courseHashtags.courseId, c.id)),
      db.select({ a: courseAssignments, name: sql<string | null>`${members.firstName} || ' ' || ${members.lastName}`, tag: memberTags.name }).from(courseAssignments).leftJoin(members, eq(members.id, courseAssignments.memberId)).leftJoin(memberTags, eq(memberTags.id, courseAssignments.tagId)).where(eq(courseAssignments.courseId, c.id)).orderBy(asc(courseAssignments.id)),
      participants(c.id),
      courseStats(c.id),
    ]);
    return {
      id: c.id, title: c.title, tagline: c.tagline, emoji: c.emoji, coverUrl: c.coverUrl, public: c.public, rhythm: c.rhythm, status: c.status, position: c.position,
      description: c.content.description ?? [], hashtagIds: tags.map((t) => t.id), issues: c.issues, notionPageId: c.notionPageId, notionEditedAt: c.notionEditedAt, archived: !!c.archivedAt,
      modules: mods.map(moduleSummary),
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
        await refreshCourse(c).catch(() => undefined); // la copie reflète ce qui a vraiment été écrit
        throw asTrpcError(e);
      }
      const row = await refreshCourse(c);
      await logAdmin(ctx.member, { action: "Formation modifiée", targetType: "formation", targetId: row.id, label: row.title });
      return { ok: true };
    }),

  /** Les modèles de la base Notion, s'il y en a. */
  templates: buildProc.query(async () => {
    if (!notionReady()) return [];
    try { return await listTemplates(env.notionModules); } catch { return []; }
  }),

  /** Créer un module : structure à six sections, copie d'un module existant, ou modèle de la base Notion. */
  createModule: buildProc
    .input(z.object({ courseId: z.number().int(), title: z.string().trim().min(1, "Indiquez un titre.").max(200), intention: z.string().trim().max(600).default(""), source: z.discriminatedUnion("kind", [z.object({ kind: z.literal("structure") }), z.object({ kind: z.literal("copie"), moduleId: z.number().int() }), z.object({ kind: z.literal("notion"), templateId: z.string().max(64) })]) }))
    .mutation(async ({ ctx, input }) => {
      assertNotionReady();
      const course = await requireCourse(input.courseId);
      const [{ n }] = await getDb().select({ n: sql<number>`coalesce(max(${courseModules.position}), 0)::int` }).from(courseModules).where(and(eq(courseModules.courseId, course.id), isNull(courseModules.archivedAt)));
      const from = input.source.kind === "copie" ? await requireModule(input.source.moduleId) : null;
      try {
        const props = { title: input.title, position: n + 1, status: "brouillon" as const, intention: input.intention || from?.intention || "", durationMin: from?.durationMin ?? null, videoUrl: from?.videoUrl ?? "", testUrl: from?.testUrl ?? "", coachBrief: from?.coachBrief ?? "", hashtags: [] as string[], coursePageId: course.notionPageId };
        const page = await createModulePage(props, input.source.kind === "copie" ? { kind: "copie", content: from!.content } : input.source.kind === "notion" ? { kind: "notion", templateId: input.source.templateId } : { kind: "structure" });
        const row = await syncModulePage(await getPage(page.id), course);
        await logAdmin(ctx.member, { action: "Module créé", targetType: "module", targetId: row.id, label: row.title, detail: course.title });
        return { id: row.id };
      } catch (e) { throw asTrpcError(e); }
    }),

  module: buildProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const m = await requireModule(input.id);
    const [tags, course] = await Promise.all([
      getDb().select({ id: courseModuleHashtags.hashtagId }).from(courseModuleHashtags).where(eq(courseModuleHashtags.moduleId, m.id)),
      requireCourse(m.courseId),
    ]);
    return {
      id: m.id, courseId: m.courseId, courseTitle: course.title, title: m.title, position: m.position, status: m.status, intention: m.intention, durationMin: m.durationMin, videoUrl: m.videoUrl, testUrl: m.testUrl, coachBrief: m.coachBrief,
      sections: { ...emptySections(), ...(m.content.sections ?? {}) } as Sections, headings: m.content.headings ?? {}, before: m.content.before ?? [], hashtagIds: tags.map((t) => t.id), issues: m.issues, notionPageId: m.notionPageId, notionEditedAt: m.notionEditedAt, archived: !!m.archivedAt,
    };
  }),

  /** Enregistrer un module : Notion d'abord, relecture ensuite. Refusé si la page a changé dans Notion entre-temps. */
  saveModule: buildProc
    .input(z.object({ id: z.number().int(), title: z.string().trim().min(1, "Indiquez un titre.").max(200), position: z.number().int().min(0), status: statusSchema, intention: z.string().trim().max(2000), durationMin: z.number().int().min(0).max(1000).nullable(), videoUrl: z.string().trim().max(1000), testUrl: z.string().trim().max(1000), coachBrief: z.string().trim().max(2000), hashtagIds: z.array(z.number().int()).max(10), sections: sectionsSchema }))
    .mutation(async ({ ctx, input }) => {
      assertNotionReady();
      const m = await requireModule(input.id);
      const problem = testUrlProblem(input.testUrl, env.appUrl);
      if (problem) throw badRequest(problem);
      if (input.videoUrl && !/^https?:\/\/\S+$/i.test(input.videoUrl)) throw badRequest("Vidéo : indiquez une adresse complète (https://…).");
      const old: ModuleContent = m.content;
      const sections = emptySections();
      for (const { key } of SECTIONS) sections[key] = cleanList(input.sections[key], old.sections?.[key] ?? []);
      try {
        await assertUnchanged(m.notionPageId, m.notionEditedAt);
        await updatePage(m.notionPageId, { properties: await moduleProperties({ ...input, hashtags: await tagNames(input.hashtagIds) }) });
        // L'intention existe en deux endroits : la section suit le champ quand celui-ci change
        const first = sections.intention.find((b) => b.type === "paragraph");
        if (input.intention !== m.intention) {
          if (first && "html" in first) first.html = input.intention.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          else if (input.intention) sections.intention.unshift({ id: "nouveau-intention", type: "paragraph", html: input.intention.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") });
        }
        await writeSections(m.notionPageId, old, sections);
      } catch (e) {
        await refreshModule(m).catch(() => undefined); // la copie reflète ce qui a vraiment été écrit
        throw asTrpcError(e);
      }
      const row = await refreshModule(m);
      await logAdmin(ctx.member, { action: "Module modifié", targetType: "module", targetId: row.id, label: row.title });
      return { ok: true, issues: row.issues };
    }),

  /** Monter ou descendre un module : les deux « Ordre » s'échangent dans Notion. */
  moveModule: buildProc.input(z.object({ id: z.number().int(), direction: z.enum(["up", "down"]) })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const m = await requireModule(input.id);
    const list = await getDb().select().from(courseModules).where(and(eq(courseModules.courseId, m.courseId), isNull(courseModules.archivedAt))).orderBy(asc(courseModules.position), asc(courseModules.id));
    const at = list.findIndex((x) => x.id === m.id);
    const other = list[at + (input.direction === "up" ? -1 : 1)];
    if (!other) return { ok: true };
    try {
      await assertUnchanged(m.notionPageId, m.notionEditedAt);
      await assertUnchanged(other.notionPageId, other.notionEditedAt);
      const [a, b] = m.position === other.position ? [input.direction === "up" ? other.position : other.position + 1, input.direction === "up" ? other.position + 1 : other.position] : [other.position, m.position];
      await updatePage(m.notionPageId, { properties: { Ordre: { number: a } } });
      await updatePage(other.notionPageId, { properties: { Ordre: { number: b } } });
      await refreshModule(m);
      await refreshModule(other);
    } catch (e) { throw asTrpcError(e); }
    await logAdmin(ctx.member, { action: "Ordre des modules modifié", targetType: "module", targetId: m.id, label: m.title });
    return { ok: true };
  }),

  /** Retirer un module : il part à la corbeille de Notion. La progression et le journal des membres restent. */
  archiveModule: buildProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const m = await requireModule(input.id);
    try { await updatePage(m.notionPageId, { in_trash: true }); } catch (e) { throw asTrpcError(e); }
    await getDb().update(courseModules).set({ archivedAt: new Date() }).where(eq(courseModules.id, m.id));
    await logAdmin(ctx.member, { action: "Module retiré", targetType: "module", targetId: m.id, label: m.title });
    return { ok: true };
  }),

  /** Publier ou dépublier un module en un clic : le statut change dans Notion, puis la page est relue. */
  setModuleStatus: buildProc.input(z.object({ id: z.number().int(), status: statusSchema })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const m = await requireModule(input.id);
    try {
      await assertUnchanged(m.notionPageId, m.notionEditedAt);
      await updatePage(m.notionPageId, { properties: { Statut: { status: { name: MODULE_STATUS[input.status] } } } });
      await refreshModule(m);
    } catch (e) { throw asTrpcError(e); }
    await logAdmin(ctx.member, { action: input.status === "publie" ? "Module publié" : "Module dépublié", targetType: "module", targetId: m.id, label: m.title });
    return { ok: true };
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

  /** Supprimer une formation : elle et ses modules vont à la corbeille de Notion. Le journal des membres reste. */
  archiveCourse: buildProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    assertNotionReady();
    const c = await requireCourse(input.id);
    const mods = await getDb().select().from(courseModules).where(and(eq(courseModules.courseId, c.id), isNull(courseModules.archivedAt)));
    const now = new Date();
    try {
      for (const m of mods) {
        await updatePage(m.notionPageId, { in_trash: true });
        await getDb().update(courseModules).set({ archivedAt: now }).where(eq(courseModules.id, m.id));
      }
      await updatePage(c.notionPageId, { in_trash: true });
    } catch (e) { throw asTrpcError(e); }
    await getDb().update(courses).set({ archivedAt: now }).where(eq(courses.id, c.id));
    await logAdmin(ctx.member, { action: "Formation supprimée", targetType: "formation", targetId: c.id, label: c.title, detail: `${mods.length} module(s) à la corbeille de Notion` });
    return { ok: true };
  }),

  /** Aperçu comme un membre : même affichage, quel que soit le statut, sans rien enregistrer. */
  preview: buildProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const m = await requireModule(input.id);
    const course = await requireCourse(m.courseId);
    return { ...(await moduleView(m, course)), preview: true, status: m.status, courseStatus: course.status };
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
    const mods = await db.select({ id: courseModules.id, courseId: courseModules.courseId }).from(courseModules).where(and(eq(courseModules.status, "publie"), isNull(courseModules.archivedAt)));
    const progress = await db.select({ moduleId: moduleProgress.moduleId }).from(moduleProgress).where(and(eq(moduleProgress.memberId, input.memberId), isNotNull(moduleProgress.completedAt)));
    const [prefs, sends] = await Promise.all([memberPreferences(input.memberId), db.select().from(emailSends).where(eq(emailSends.memberId, input.memberId)).orderBy(desc(emailSends.createdAt)).limit(10)]);
    return {
      courses: list.map((c) => {
        const e = enrollments.find((x) => x.courseId === c.id);
        const own = mods.filter((m) => m.courseId === c.id);
        return { id: c.id, title: c.title, status: c.status, startedAt: e?.startedAt ?? null, fullAccess: !!e?.fullAccessAt, finishedAt: e?.finishedAt ?? null, total: own.length, done: own.filter((m) => progress.some((p) => p.moduleId === m.id)).length };
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
      entries: entries.map((e) => ({ id: e.id, moduleTitle: e.moduleTitle, question: e.questionText, answer: open(input.memberId, e.answerEnc), sharedAt: e.sharedAt })),
      tests: tests.map((t) => ({ id: t.id, moduleTitle: t.moduleTitle, result: parseResult(open(input.memberId, t.resultEnc)), sharedAt: t.sharedAt })),
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
    const values = { prenom: ctx.member.firstName, module: "Exemple de module", formation: "Exemple de formation" };
    const r = await sendMemberEmail(ctx.member, { category: "formations", kind: "essai", template: model.key, subject: `[Essai] ${fillTemplate(model.emailSubject, values)}`, body: fillTemplate(model.emailBody, values), cta: { label: "Voir mes formations", href: `${env.appUrl}/parcours` } });
    if (r.status !== "envoye") throw new TRPCError({ code: "BAD_GATEWAY", message: SKIP_LABEL[r.reason] ?? "L’envoi a échoué." });
    return { to: ctx.member.email };
  }),

  /** Lancer le travail régulier sans attendre : mémoires en attente, puis relances. */
  runWorkflows: buildProc.mutation(async () => {
    await processPendingMemories();
    return runWorkflows();
  }),
});

