import { TRPCError } from "@trpc/server";
import { env } from "./env";
import { appendBlocks, createPage, deleteBlock, getDataSource, getPage, notionMessage, notionReady, updateBlock, type NotionBlock, type NotionPage } from "./notion";
import { blockPatch, heading2, labelFromTag, moduleSkeleton, normalizeTag, plainToRichText, sameBlock, sameKind, toNotionBlock } from "./notionBlocks";
import { SECTIONS, type CourseBlock, type ModuleContent, type Sections } from "./courseBlocks";

/** Chaque enregistrement de Construire écrit d'abord dans Notion, puis relit la page. */
export function assertNotionReady() {
  if (!notionReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La clé Notion (NOTION_TOKEN) n’est pas encore configurée : rien ne peut être enregistré pour l’instant." });
}

export function asTrpcError(e: unknown): TRPCError {
  if (e instanceof TRPCError) return e;
  return new TRPCError({ code: "BAD_GATEWAY", message: notionMessage(e) });
}

/** Notion a changé depuis la dernière synchronisation : on n'écrase pas, on invite à synchroniser. */
export async function assertUnchanged(pageId: string, knownEditedAt: Date | null): Promise<NotionPage> {
  const page = await getPage(pageId);
  if (knownEditedAt && new Date(page.last_edited_time) > knownEditedAt) {
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

export type ModuleProps = { title: string; position: number; status: "brouillon" | "relecture" | "publie"; intention: string; durationMin: number | null; videoUrl: string; testUrl: string; coachBrief: string; hashtags: string[] };
const MODULE_STATUS = { brouillon: "Brouillon", relecture: "En relecture", publie: "Publié" } as const;
const COURSE_STATUS = { brouillon: "Brouillon", relecture: "En relecture", publie: "Publiée" } as const;

export async function moduleProperties(p: ModuleProps) {
  return {
    Module: { title: plainToRichText(p.title) },
    Ordre: { number: p.position },
    Statut: { status: { name: MODULE_STATUS[p.status] } },
    Intention: richProp(p.intention),
    "Durée estimée (min)": { number: p.durationMin },
    "Vidéo": { url: p.videoUrl || null },
    "Test intégré": { url: p.testUrl || null },
    "Ce que le coach IA retient": richProp(p.coachBrief),
    Hashtags: { multi_select: await notionLabels(env.notionModules, p.hashtags) },
  };
}

export type CourseProps = { title: string; tagline: string; coverUrl: string; public: "tous" | "attribution"; rhythm: "hebdo" | "complet"; status: "brouillon" | "relecture" | "publie"; position: number; hashtags: string[] };

export async function courseProperties(p: CourseProps, opts: { coverChanged: boolean }) {
  return {
    Formation: { title: plainToRichText(p.title) },
    Accroche: richProp(p.tagline),
    Public: { select: { name: p.public === "attribution" ? "Sur attribution" : "Tous les membres" } },
    Rythme: { select: { name: p.rhythm === "complet" ? "Accès complet" : "Un module par semaine" } },
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

/** Écrit les sections d'un module. Une section absente de la page est créée à sa place. */
export async function writeSections(pageId: string, old: ModuleContent, sections: Sections) {
  const lastOf = (blocks: CourseBlock[] | undefined) => blocks?.[blocks.length - 1]?.id;
  let cursor: string | "start" = lastOf(old.before) ?? "start";
  for (const { key, title } of SECTIONS) {
    const oldList = old.sections?.[key] ?? [];
    const wanted = sections[key] ?? [];
    let heading = old.headings?.[key];
    if (!heading && !wanted.length) continue;
    if (!heading) heading = (await appendBlocks(pageId, [heading2(title)], cursor))[0].id;
    cursor = (await writeList(pageId, oldList, wanted, heading)) ?? heading;
  }
}

/** Ajoute des blocs à une page neuve, par paquets. */
async function appendAll(pageId: string, blocks: unknown[]) {
  for (let i = 0; i < blocks.length; i += BATCH) await appendBlocks(pageId, blocks.slice(i, i + BATCH));
}

/** Les blocs d'un module copié : titres de sections compris. */
function copiedBlocks(content: ModuleContent): unknown[] {
  return SECTIONS.flatMap(({ key, title }) => [heading2(title), ...(content.sections?.[key] ?? []).map((b) => toNotionBlock(b)).filter(Boolean)]);
}

export type ModuleSource = { kind: "structure" } | { kind: "copie"; content: ModuleContent } | { kind: "notion"; templateId: string };

export async function createModulePage(p: ModuleProps & { coursePageId: string }, source: ModuleSource): Promise<NotionPage> {
  const page = await createPage({
    dataSourceId: env.notionModules,
    properties: { ...(await moduleProperties(p)), Formation: { relation: [{ id: p.coursePageId }] } },
    ...(source.kind === "notion" ? { templateId: source.templateId } : {}),
  });
  if (source.kind === "structure") await appendAll(page.id, moduleSkeleton(p.intention));
  if (source.kind === "copie") await appendAll(page.id, copiedBlocks(source.content));
  return page;
}

export async function createCoursePage(p: CourseProps & { description: string }): Promise<NotionPage> {
  const page = await createPage({ dataSourceId: env.notionFormations, properties: await courseProperties(p, { coverChanged: !!p.coverUrl }) });
  await appendAll(page.id, [heading2("Présentation de la formation"), { object: "block", type: "paragraph", paragraph: { rich_text: plainToRichText(p.description || "À écrire") } }]);
  return page;
}
