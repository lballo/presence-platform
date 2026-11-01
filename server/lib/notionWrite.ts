import { TRPCError } from "@trpc/server";
import { env } from "./env";
import { appendBlocks, createPage, deleteBlock, getDataSource, getPage, integrationId, notionMessage, notionReady, updateBlock, type NotionBlock, type NotionPage } from "./notion";
import { blockPatch, bullet, heading2, labelFromTag, lessonSkeleton, normalizeTag, plainToRichText, sameBlock, sameKind, sectionSkeleton, toNotionBlock } from "./notionBlocks";
import { LESSON_RUBRICS, LESSON_TYPE_LABEL, plainOf, SECTION_RUBRICS, type CourseBlock, type LessonType, type PageContent, type Rubric, type RubricKey, type Rubrics } from "./courseBlocks";

/** Chaque enregistrement de Construire écrit d'abord dans Notion, puis relit la page. */
export function assertNotionReady() {
  if (!notionReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La clé Notion (NOTION_TOKEN) n’est pas encore configurée : rien ne peut être enregistré pour l’instant." });
}

export function asTrpcError(e: unknown): TRPCError {
  if (e instanceof TRPCError) return e;
  return new TRPCError({ code: "BAD_GATEWAY", message: notionMessage(e) });
}

/**
 * Quelqu'un a changé cette page dans Notion depuis la dernière synchronisation : on n'écrase pas, on invite à synchroniser.
 * Une date plus récente laissée par nos propres écritures n'est pas un conflit.
 */
export async function assertUnchanged(pageId: string, knownEditedAt: Date | null): Promise<NotionPage> {
  const page = await getPage(pageId);
  if (knownEditedAt && new Date(page.last_edited_time) > knownEditedAt && page.last_edited_by?.id !== (await integrationId())) {
    throw new TRPCError({ code: "CONFLICT", message: "Cette page a changé dans Notion depuis la dernière synchronisation. Cliquez sur « Synchroniser maintenant », puis reprenez votre modification." });
  }
  return page;
}

/* ───────────── Propriétés ───────────── */

const richProp = (text: string) => ({ rich_text: plainToRichText(text) });

/** Les noms des hashtags tels qu'ils existent dans la base Notion (« Prise de parole »). */
async function notionLabels(dataSourceId: string, names: string[]): Promise<{ name: string }[]> {
  if (!names.length) return [];
  const source = await getDataSource(dataSourceId);
  const options = source.properties["Hashtags"]?.multi_select?.options ?? [];
  const byNorm = new Map(options.map((o) => [normalizeTag(o.name), o.name]));
  return names.map((n) => ({ name: byNorm.get(normalizeTag(n)) ?? labelFromTag(n) }));
}

type Status = "brouillon" | "relecture" | "publie";
export const SECTION_STATUS = { brouillon: "Brouillon", relecture: "En relecture", publie: "Publié" } as const;
export const LESSON_STATUS = { brouillon: "Brouillon", relecture: "En relecture", publie: "Publiée" } as const;
export const COURSE_STATUS = { brouillon: "Brouillon", relecture: "En relecture", publie: "Publiée" } as const;

export type SectionProps = { title: string; position: number; status: Status; intention: string; hashtags: string[] };

export async function sectionProperties(p: SectionProps) {
  return {
    Section: { title: plainToRichText(p.title) },
    Ordre: { number: p.position },
    Statut: { status: { name: SECTION_STATUS[p.status] } },
    Intention: richProp(p.intention),
    Hashtags: { multi_select: await notionLabels(env.notionSections, p.hashtags) },
  };
}

export type LessonProps = { title: string; position: number; type: LessonType; status: Status; intention: string; durationMin: number | null; videoUrl: string; testUrl: string; hashtags: string[] };

export async function lessonProperties(p: LessonProps) {
  return {
    "Leçon": { title: plainToRichText(p.title) },
    Ordre: { number: p.position },
    Type: { select: { name: LESSON_TYPE_LABEL[p.type] } },
    Statut: { status: { name: LESSON_STATUS[p.status] } },
    Intention: richProp(p.intention),
    "Durée estimée (min)": { number: p.durationMin },
    "Vidéo": { url: p.videoUrl || null },
    "Test intégré": { url: p.testUrl || null },
    Hashtags: { multi_select: await notionLabels(env.notionLecons, p.hashtags) },
  };
}

export type CourseProps = { title: string; tagline: string; coverUrl: string; public: "tous" | "attribution"; rhythm: "hebdo" | "complet"; status: Status; position: number; hashtags: string[] };

export async function courseProperties(p: CourseProps, opts: { coverChanged: boolean }) {
  return {
    Formation: { title: plainToRichText(p.title) },
    Accroche: richProp(p.tagline),
    Public: { select: { name: p.public === "attribution" ? "Sur attribution" : "Tous les membres" } },
    Rythme: { select: { name: p.rhythm === "complet" ? "Accès complet" : "Une section par semaine" } },
    Statut: { status: { name: COURSE_STATUS[p.status] } },
    "Ordre d'affichage": { number: p.position },
    Hashtags: { multi_select: await notionLabels(env.notionFormations, p.hashtags) },
    // Une couverture recopiée depuis Notion n'est pas réécrite : le fichier d'origine y reste
    ...(opts.coverChanged ? { Couverture: { files: p.coverUrl ? [{ name: "Couverture", type: "external", external: { url: p.coverUrl } }] : [] } } : {}),
  };
}

/* ───────────── Contenu : écriture bloc par bloc ───────────── */

const BATCH = 100;

/** Les blocs qui peuvent rester à leur place : la plus longue suite déjà dans le bon ordre. */
function stableIds(oldList: CourseBlock[], newList: CourseBlock[]): Set<string> {
  const index = new Map(oldList.map((b, i) => [b.id, i]));
  const seq = newList.filter((b) => { const i = index.get(b.id); return i !== undefined && sameKind(oldList[i], b); });
  const best: number[] = seq.map(() => 1);
  const prev: number[] = seq.map(() => -1);
  for (let i = 0; i < seq.length; i++) for (let j = 0; j < i; j++) if (index.get(seq[j].id)! < index.get(seq[i].id)! && best[j] + 1 > best[i]) { best[i] = best[j] + 1; prev[i] = j; }
  let at = best.indexOf(Math.max(0, ...best));
  const keep = new Set<string>();
  while (at >= 0) { keep.add(seq[at].id); at = prev[at]; }
  return keep;
}

/** Un bloc que l'application ne sait pas afficher ne disparaît jamais, même si l'éditeur l'a oublié. */
function keepUnknown(oldList: CourseBlock[], newList: CourseBlock[]): CourseBlock[] {
  const out = [...newList];
  const ids = new Set(newList.map((b) => b.id));
  oldList.forEach((b, i) => { if (b.type === "unknown" && !ids.has(b.id)) out.splice(Math.min(i, out.length), 0, b); });
  return out;
}

/** Met une liste de blocs à jour après `start` et renvoie l'identifiant du dernier bloc. */
export async function writeList(pageId: string, oldList: CourseBlock[], wanted: CourseBlock[], start: string | "start" | undefined): Promise<string | undefined> {
  const newList = keepUnknown(oldList, wanted);
  const keep = stableIds(oldList, newList);
  const oldById = new Map(oldList.map((b) => [b.id, b]));
  for (const b of oldList) if (!keep.has(b.id)) await deleteBlock(b.id);
  let after = start;
  let pending: unknown[] = [];
  const flush = async () => {
    if (!pending.length) return;
    const created: NotionBlock[] = await appendBlocks(pageId, pending, after);
    after = created[created.length - 1]?.id ?? after;
    pending = [];
  };
  for (const b of newList) {
    if (keep.has(b.id)) {
      await flush();
      const old = oldById.get(b.id)!;
      if (!sameBlock(old, b)) { const patch = blockPatch(b); if (patch) await updateBlock(b.id, patch); }
      after = b.id;
      continue;
    }
    const block = toNotionBlock(b);
    if (block) pending.push(block);
    if (pending.length === BATCH) await flush();
  }
  await flush();
  return after === "start" ? undefined : after;
}

/** Écrit les rubriques d'une page. Une rubrique absente de la page est créée à sa place. La liste « Leçons » n'est pas touchée ici. */
export async function writeRubrics(pageId: string, old: PageContent, wanted: Rubrics, rubrics: readonly Rubric[]) {
  const lastOf = (blocks: CourseBlock[] | undefined) => blocks?.[blocks.length - 1]?.id;
  let cursor: string | "start" = lastOf(old.before) ?? "start";
  for (const { key, title } of rubrics) {
    const oldList = old.rubrics?.[key] ?? [];
    if (key === "lecons") { cursor = lastOf(oldList) ?? old.headings?.lecons ?? cursor; continue; }
    const list = wanted[key] ?? [];
    let heading = old.headings?.[key];
    if (!heading && !list.length) continue;
    if (!heading) heading = (await appendBlocks(pageId, [heading2(title)], cursor))[0].id;
    cursor = (await writeList(pageId, oldList, list, heading)) ?? heading;
  }
}

/** Ajoute des blocs à une page neuve, par paquets. */
async function appendAll(pageId: string, blocks: unknown[]) {
  for (let i = 0; i < blocks.length; i += BATCH) await appendBlocks(pageId, blocks.slice(i, i + BATCH));
}

/** Les blocs d'une page copiée : titres de rubriques compris. Une rubrique sans titre dans l'original ne se crée pas. */
function copiedBlocks(content: PageContent, rubrics: readonly Rubric[], lessonTitles: string[] = []): unknown[] {
  return rubrics.flatMap(({ key, title }) => {
    if (key === "lecons") return [heading2(title), ...lessonTitles.map(bullet)];
    if (!content.headings?.[key]) return [];
    return [heading2(title), ...(content.rubrics?.[key] ?? []).map((b) => toNotionBlock(b)).filter(Boolean)];
  });
}

export type PageSource = { kind: "structure" } | { kind: "copie"; content: PageContent; lessonTitles?: string[] } | { kind: "notion"; templateId: string };

export async function createSectionPage(p: SectionProps & { coursePageId: string }, source: PageSource): Promise<NotionPage> {
  const page = await createPage({ dataSourceId: env.notionSections, properties: { ...(await sectionProperties(p)), Formation: { relation: [{ id: p.coursePageId }] } } });
  if (source.kind === "copie") await appendAll(page.id, copiedBlocks(source.content, SECTION_RUBRICS, source.lessonTitles));
  else await appendAll(page.id, sectionSkeleton(p.intention));
  return page;
}

export async function createLessonPage(p: LessonProps & { sectionPageId: string }, source: PageSource): Promise<NotionPage> {
  const page = await createPage({
    dataSourceId: env.notionLecons,
    properties: { ...(await lessonProperties(p)), Section: { relation: [{ id: p.sectionPageId }] } },
    ...(source.kind === "notion" ? { templateId: source.templateId } : {}),
  });
  if (source.kind === "structure") await appendAll(page.id, lessonSkeleton(p.intention));
  if (source.kind === "copie") await appendAll(page.id, copiedBlocks(source.content, LESSON_RUBRICS));
  return page;
}

/**
 * La liste « Leçons » d'une page de section, tenue par l'application : réécrite quand ses leçons changent.
 * Rien n'est écrit si elle est déjà à jour. Renvoie true si la page a changé.
 */
export async function writeLessonList(pageId: string, content: PageContent, titles: string[]): Promise<boolean> {
  const oldList = (content.rubrics?.lecons ?? []).filter((b) => b.type !== "unknown");
  const current = oldList.map((b) => ("html" in b ? plainOf(b.html) : ""));
  if (content.headings?.lecons && current.length === titles.length && current.every((t, i) => t === titles[i])) return false;
  for (const b of oldList) await deleteBlock(b.id);
  let heading = content.headings?.lecons;
  if (!heading) {
    const lastOf = (key: RubricKey) => content.rubrics?.[key]?.at(-1)?.id ?? content.headings?.[key];
    heading = (await appendBlocks(pageId, [heading2("Leçons")], lastOf("objectifs") ?? lastOf("intention")))[0].id;
  }
  let after = heading;
  for (let i = 0; i < titles.length; i += BATCH) {
    const made = await appendBlocks(pageId, titles.slice(i, i + BATCH).map(bullet), after);
    after = made[made.length - 1]?.id ?? after;
  }
  return true;
}

export async function createCoursePage(p: CourseProps & { description: string }): Promise<NotionPage> {
  const page = await createPage({ dataSourceId: env.notionFormations, properties: await courseProperties(p, { coverChanged: !!p.coverUrl }) });
  await appendAll(page.id, [heading2("Présentation de la formation"), { object: "block", type: "paragraph", paragraph: { rich_text: plainToRichText(p.description || "À écrire") } }]);
  return page;
}
