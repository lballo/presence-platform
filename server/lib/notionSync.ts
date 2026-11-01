import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { courseHashtags, courseLessonHashtags, courseLessons, courseSectionHashtags, courseSections, courses, hashtags, notionSyncRuns, type Course, type CourseLesson, type CourseSection } from "../../db/schema";
import { env } from "./env";
import { getBlocks, getPage, listPages, notionMessage, notionReady, type NotionPage, type NotionProperty } from "./notion";
import { courseContentFromBlocks, courseIssues, lessonContentFromBlocks, lessonIssues, normalizeTag, richTextToPlain, sectionContentFromBlocks, sectionIssues } from "./notionBlocks";
import { storageReady, uploadBuffer, type UploadKind } from "./storage";
import { testUrlProblem } from "./courseAccess";
import { LESSON_RUBRICS, SECTION_RUBRICS, type CourseBlock, type LessonType, type PageContent, type Rubric } from "./courseBlocks";
import { resumeLegacyProgress } from "./courseResume";

type Status = "brouillon" | "relecture" | "publie";

const prop = (p: NotionPage, name: string): NotionProperty | undefined => p.properties[name];
const text = (p: NotionPage, name: string) => { const v = prop(p, name); return richTextToPlain(v?.title ?? v?.rich_text); };
const num = (p: NotionPage, name: string) => prop(p, name)?.number ?? null;
const url = (p: NotionPage, name: string) => prop(p, name)?.url ?? "";
const choice = (p: NotionPage, name: string) => { const v = prop(p, name); return v?.status?.name ?? v?.select?.name ?? ""; };
const labels = (p: NotionPage, name: string) => (prop(p, name)?.multi_select ?? []).map((o) => o.name);

/** Seul « Publiée » ou « Publié » est visible des membres. */
const statusOf = (name: string): Status => (/^publi/i.test(name) ? "publie" : /relecture/i.test(name) ? "relecture" : "brouillon");

/* ───────────── Fichiers : les liens de Notion expirent, ils sont recopiés dans notre stockage ───────────── */

const MAX_COPY = 100 * 1024 * 1024;
const extOf = (u: string) => (u.split("?")[0].split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";

async function copyFile(kind: UploadKind, key: string, source: string): Promise<string> {
  const res = await fetch(source);
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  const size = Number(res.headers.get("content-length"));
  if (size > MAX_COPY) throw new Error("Fichier trop lourd : utilisez plutôt un lien.");
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_COPY) throw new Error("Fichier trop lourd : utilisez plutôt un lien.");
  const name = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return uploadBuffer(kind, `notion/${name}.${extOf(source)}`, data, res.headers.get("content-type") ?? "application/octet-stream");
}

const KIND_OF = { image: "courseImage", video: "courseVideo", file: "courseFile" } as const;

/** Recopie les fichiers Notion d'une liste de blocs. Déjà recopié : l'adresse connue est réutilisée. */
async function copyBlockFiles(blocks: CourseBlock[], known: Map<string, string>, issues: string[]): Promise<CourseBlock[]> {
  const out: CourseBlock[] = [];
  for (const b of blocks) {
    if ("children" in b && b.children) { out.push({ ...b, children: await copyBlockFiles(b.children, known, issues) } as CourseBlock); continue; }
    if (!("sourceKey" in b) || !b.sourceKey) { out.push(b); continue; }
    const seen = known.get(b.sourceKey);
    if (seen) { out.push({ ...b, url: seen }); continue; }
    if (!storageReady()) { issues.push("Un fichier Notion n’a pas pu être recopié : son lien expirera."); out.push(b); continue; }
    try {
      const copied = await copyFile(KIND_OF[b.type], b.sourceKey, b.url);
      known.set(b.sourceKey, copied);
      out.push({ ...b, url: copied });
    } catch (e) {
      issues.push(`Un fichier Notion n’a pas pu être recopié : ${e instanceof Error ? e.message : "erreur"}`);
      out.push(b);
    }
  }
  return out;
}

function knownFiles(content: PageContent | undefined, rubrics: readonly Rubric[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (blocks: CourseBlock[]) => { for (const b of blocks) { if ("sourceKey" in b && b.sourceKey) map.set(b.sourceKey, b.url); if ("children" in b && b.children) walk(b.children); } };
  for (const { key } of rubrics) walk(content?.rubrics?.[key] ?? []);
  return map;
}

async function copyPageFiles(content: PageContent, existing: PageContent | undefined, rubrics: readonly Rubric[]): Promise<string[]> {
  const issues: string[] = [];
  const known = knownFiles(existing, rubrics);
  for (const { key } of rubrics) content.rubrics![key] = await copyBlockFiles(content.rubrics![key] ?? [], known, issues);
  return issues;
}

/* ───────────── Hashtags : reliés par nom à la liste de la communauté ───────────── */

async function hashtagIdsFor(names: string[]): Promise<number[]> {
  const wanted = [...new Set(names.map(normalizeTag).filter(Boolean))];
  if (!wanted.length) return [];
  const db = getDb();
  await db.insert(hashtags).values(wanted.map((name) => ({ name }))).onConflictDoNothing();
  const rows = await db.select({ id: hashtags.id }).from(hashtags).where(inArray(sql`lower(${hashtags.name})`, wanted.map((w) => w.toLowerCase())));
  return rows.map((r) => r.id);
}

/* ───────────── Lecture d'une page ───────────── */

export async function syncCoursePage(page: NotionPage, existing?: Course): Promise<Course> {
  const db = getDb();
  const content = courseContentFromBlocks(await getBlocks(page.id));
  const issues = courseIssues(content);
  // La couverture : le champ de la base, sinon la couverture de la page
  const file = prop(page, "Couverture")?.files?.[0] ?? page.cover ?? null;
  const source = file?.file?.url ?? file?.external?.url ?? "";
  const key = file?.file?.url ? file.file.url.split("?")[0] : "";
  let coverUrl = source;
  let coverKey = key;
  if (key && existing?.coverKey === key) coverUrl = existing.coverUrl;
  else if (key && storageReady()) {
    try { coverUrl = await copyFile("courseImage", key, source); } catch (e) { issues.push(`La couverture n’a pas pu être recopiée : ${e instanceof Error ? e.message : "erreur"}`); }
  } else if (key) { issues.push("La couverture n’a pas pu être recopiée : son lien expirera."); coverKey = ""; }
  const values = {
    notionPageId: page.id, title: text(page, "Formation").slice(0, 200) || "Sans titre", tagline: text(page, "Accroche"), emoji: page.icon?.emoji ?? "",
    coverUrl, coverKey, public: choice(page, "Public") === "Sur attribution" ? ("attribution" as const) : ("tous" as const),
    rhythm: choice(page, "Rythme") === "Accès complet" ? ("complet" as const) : ("hebdo" as const), status: statusOf(choice(page, "Statut")),
    position: num(page, "Ordre d'affichage") ?? 0, content, issues, notionEditedAt: new Date(page.last_edited_time), archivedAt: null, updatedAt: new Date(),
  };
  const [row] = await db.insert(courses).values(values).onConflictDoUpdate({ target: courses.notionPageId, set: values }).returning();
  const ids = await hashtagIdsFor(labels(page, "Hashtags"));
  await db.delete(courseHashtags).where(eq(courseHashtags.courseId, row.id));
  if (ids.length) await db.insert(courseHashtags).values(ids.map((hashtagId) => ({ courseId: row.id, hashtagId }))).onConflictDoNothing();
  return row;
}

export async function syncSectionPage(page: NotionPage, course: Pick<Course, "id">, existing?: CourseSection): Promise<CourseSection> {
  const db = getDb();
  const content = sectionContentFromBlocks(await getBlocks(page.id));
  const intention = text(page, "Intention");
  const copyIssues = await copyPageFiles(content, existing?.content, SECTION_RUBRICS);
  const values = {
    courseId: course.id, notionPageId: page.id, title: text(page, "Section").slice(0, 200) || "Sans titre", position: num(page, "Ordre") ?? 0, status: statusOf(choice(page, "Statut")),
    intention, content, issues: [...sectionIssues(content, { intention }), ...copyIssues],
    notionEditedAt: new Date(page.last_edited_time), archivedAt: null, updatedAt: new Date(),
  };
  const [row] = await db.insert(courseSections).values(values).onConflictDoUpdate({ target: courseSections.notionPageId, set: values }).returning();
  const ids = await hashtagIdsFor(labels(page, "Hashtags"));
  await db.delete(courseSectionHashtags).where(eq(courseSectionHashtags.sectionId, row.id));
  if (ids.length) await db.insert(courseSectionHashtags).values(ids.map((hashtagId) => ({ sectionId: row.id, hashtagId }))).onConflictDoNothing();
  return row;
}

const TYPE_OF: Record<string, LessonType> = { "Contenu": "contenu", "Vidéo": "video", "Exercice": "exercice", "Test": "test", "Défi dans le réseau": "defi" };

export async function syncLessonPage(page: NotionPage, section: Pick<CourseSection, "id">, existing?: CourseLesson): Promise<CourseLesson> {
  const db = getDb();
  const content = lessonContentFromBlocks(await getBlocks(page.id));
  const intention = text(page, "Intention");
  const videoUrl = url(page, "Vidéo");
  const testUrl = url(page, "Test intégré");
  const type = TYPE_OF[choice(page, "Type")] ?? "contenu";
  const copyIssues = await copyPageFiles(content, existing?.content, LESSON_RUBRICS);
  const values = {
    sectionId: section.id, notionPageId: page.id, title: text(page, "Leçon").slice(0, 200) || "Sans titre", position: num(page, "Ordre") ?? 0, type, status: statusOf(choice(page, "Statut")),
    intention, durationMin: num(page, "Durée estimée (min)"), videoUrl, testUrl, content,
    issues: [...lessonIssues(content, { type, intention, videoUrl, testUrl, testProblem: testUrlProblem(testUrl, env.appUrl) }), ...copyIssues],
    notionEditedAt: new Date(page.last_edited_time), archivedAt: null, updatedAt: new Date(),
  };
  const [row] = await db.insert(courseLessons).values(values).onConflictDoUpdate({ target: courseLessons.notionPageId, set: values }).returning();
  const ids = await hashtagIdsFor(labels(page, "Hashtags"));
  await db.delete(courseLessonHashtags).where(eq(courseLessonHashtags.lessonId, row.id));
  if (ids.length) await db.insert(courseLessonHashtags).values(ids.map((hashtagId) => ({ lessonId: row.id, hashtagId }))).onConflictDoNothing();
  return row;
}

/** Après une écriture : on relit la page, Notion reste la référence. */
export async function refreshCourse(course: Course): Promise<Course> {
  return syncCoursePage(await getPage(course.notionPageId), course);
}

export async function refreshSection(section: CourseSection): Promise<CourseSection> {
  return syncSectionPage(await getPage(section.notionPageId), { id: section.courseId }, section);
}

export async function refreshLesson(lesson: CourseLesson): Promise<CourseLesson> {
  return syncLessonPage(await getPage(lesson.notionPageId), { id: lesson.sectionId }, lesson);
}

/* ───────────── Synchronisation ───────────── */

/**
 * La date de modification de Notion est arrondie à la minute : une page modifiée peu avant
 * la dernière synchronisation est relue, pour ne pas manquer une modification de la même minute.
 */
const MARGIN_MS = 3 * 60 * 1000;

function needsRead(page: NotionPage, row: { notionEditedAt: Date | null; archivedAt: Date | null } | undefined, lastOk: Date | null): boolean {
  if (!row?.notionEditedAt || row.archivedAt) return true;
  const edited = new Date(page.last_edited_time);
  if (edited > row.notionEditedAt) return true;
  return !lastOk || edited.getTime() >= lastOk.getTime() - MARGIN_MS;
}

let current: Promise<SyncResult> | null = null;
export type SyncResult = { ok: boolean; changed: number; detail: string };

/** Notion fait foi : ce qui a changé remonte, ce qui a disparu de Notion est caché (la progression des membres reste). */
export function syncAll(opts: { trigger: "auto" | "manuel" | "demarrage"; full?: boolean }): Promise<SyncResult> {
  if (current) return current;
  current = run(opts).finally(() => { current = null; });
  return current;
}

export const syncRunning = () => !!current;

async function run({ trigger, full }: { trigger: string; full?: boolean }): Promise<SyncResult> {
  if (!notionReady()) return { ok: false, changed: 0, detail: "La clé NOTION_TOKEN n’est pas encore configurée." };
  const db = getDb();
  const [lastOk] = await db.select({ startedAt: notionSyncRuns.startedAt }).from(notionSyncRuns).where(eq(notionSyncRuns.status, "ok")).orderBy(desc(notionSyncRuns.startedAt)).limit(1);
  const [runRow] = await db.insert(notionSyncRuns).values({ trigger }).returning({ id: notionSyncRuns.id });
  const finish = async (status: string, changed: number, detail: string) => {
    await db.update(notionSyncRuns).set({ status, finishedAt: new Date(), pagesChanged: changed, detail }).where(eq(notionSyncRuns.id, runRow.id));
    return { ok: status === "ok", changed, detail };
  };
  try {
    const [coursePages, sectionPages, lessonPages] = [await listPages(env.notionFormations), await listPages(env.notionSections), await listPages(env.notionLecons)];
    const knownCourses = new Map((await db.select().from(courses)).map((c) => [c.notionPageId, c]));
    const knownSections = new Map((await db.select().from(courseSections)).map((x) => [x.notionPageId, x]));
    const knownLessons = new Map((await db.select().from(courseLessons)).map((l) => [l.notionPageId, l]));
    const since = lastOk?.startedAt ?? null;
    let changed = 0;
    const notes: string[] = [];
    const isNew = (page: NotionPage, row: { notionEditedAt: Date | null } | undefined) => !row?.notionEditedAt || new Date(page.last_edited_time) > row.notionEditedAt;
    const courseByPage = new Map<string, Pick<Course, "id">>();
    for (const page of coursePages) {
      const row = knownCourses.get(page.id);
      if (full || needsRead(page, row, since)) {
        courseByPage.set(page.id, await syncCoursePage(page, row));
        if (isNew(page, row)) changed++;
      } else if (row) courseByPage.set(page.id, row);
    }
    const sectionByPage = new Map<string, Pick<CourseSection, "id">>();
    for (const page of sectionPages) {
      const parent = prop(page, "Formation")?.relation?.[0]?.id;
      const course = parent ? courseByPage.get(parent) : undefined;
      const row = knownSections.get(page.id);
      if (!course) { notes.push(`Section sans formation : « ${text(page, "Section")} »`); continue; }
      if (full || needsRead(page, row, since) || row?.courseId !== course.id) {
        sectionByPage.set(page.id, await syncSectionPage(page, course, row));
        if (isNew(page, row)) changed++;
      } else if (row) sectionByPage.set(page.id, row);
    }
    for (const page of lessonPages) {
      const parent = prop(page, "Section")?.relation?.[0]?.id;
      const section = parent ? sectionByPage.get(parent) : undefined;
      const row = knownLessons.get(page.id);
      if (!section) { notes.push(`Leçon sans section : « ${text(page, "Leçon")} »`); continue; }
      if (full || needsRead(page, row, since) || row?.sectionId !== section.id) {
        await syncLessonPage(page, section, row);
        if (isNew(page, row)) changed++;
      }
    }
    // Disparu de Notion : caché, jamais supprimé (la progression et le journal des membres restent)
    const coursesSeen = new Set(coursePages.map((p) => p.id));
    const sectionsSeen = new Set(sectionPages.map((p) => p.id));
    const lessonsSeen = new Set(lessonPages.map((p) => p.id));
    const now = new Date();
    for (const c of knownCourses.values()) if (!coursesSeen.has(c.notionPageId) && !c.archivedAt) { await db.update(courses).set({ archivedAt: now }).where(eq(courses.id, c.id)); changed++; }
    for (const x of knownSections.values()) if (!sectionsSeen.has(x.notionPageId) && !x.archivedAt) { await db.update(courseSections).set({ archivedAt: now }).where(eq(courseSections.id, x.id)); changed++; }
    for (const l of knownLessons.values()) if (!lessonsSeen.has(l.notionPageId) && !l.archivedAt) { await db.update(courseLessons).set({ archivedAt: now }).where(eq(courseLessons.id, l.id)); changed++; }
    // Ce que les membres ont fait dans les anciens modules passe sur les leçons du même nom
    const resume = await resumeLegacyProgress();
    for (const title of resume.waiting) notes.push(`Progression mise de côté : aucune leçon ne porte le nom « ${title} »`);
    return await finish("ok", changed, notes.join(" · "));
  } catch (e) {
    return finish("erreur", 0, notionMessage(e));
  }
}

export async function lastSync() {
  const [row] = await getDb().select().from(notionSyncRuns).where(and(sql`${notionSyncRuns.status} <> 'en_cours'`)).orderBy(desc(notionSyncRuns.startedAt)).limit(1);
  return row ?? null;
}
