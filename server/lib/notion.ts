import { env } from "./env";

/**
 * Client de l'API Notion : file d'attente (environ 3 requêtes par seconde), nouvelles tentatives et messages clairs.
 * Version fixée : une version plus récente peut renommer des champs.
 */
const VERSION = "2026-03-11";
const GAP_MS = 340;

export const notionReady = () => !!env.notionToken;

export class NotionError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Ce que l'administratrice peut comprendre et corriger. */
export function notionMessage(e: unknown): string {
  if (e instanceof NotionError) {
    if (e.status === 401) return "Notion refuse la clé NOTION_TOKEN : vérifiez-la.";
    if (e.status === 403) return "L’intégration Notion n’a pas le droit de faire cela : vérifiez ses droits (lecture, modification, insertion).";
    if (e.status === 404) return "Notion ne trouve pas cette page : vérifiez que l’intégration est connectée à « Formations Présence ».";
    if (e.status === 429) return "Notion demande de ralentir : réessayez dans quelques minutes.";
    return `Notion a répondu : ${e.message}`;
  }
  return e instanceof Error ? e.message : "Notion est injoignable.";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let queue: Promise<void> = Promise.resolve();

function slot(): Promise<void> {
  queue = queue.then(() => sleep(GAP_MS));
  return queue;
}

async function call<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
  if (!env.notionToken) throw new NotionError(401, "no_token", "NOTION_TOKEN manquant");
  await slot();
  const res = await fetch(`${env.notionApiBase}/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.notionToken}`, "Notion-Version": VERSION, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const after = Number(res.headers.get("retry-after"));
    await sleep((after > 0 ? after : 2 ** attempt) * 1000);
    return call<T>(method, path, body, attempt + 1);
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new NotionError(res.status, e.code ?? "", e.message ?? res.statusText);
  }
  return (await res.json()) as T;
}

/* ───────────── Formes renvoyées par Notion (ce que l'application utilise) ───────────── */

export type RichText = {
  type?: string;
  plain_text?: string;
  href?: string | null;
  text?: { content: string; link?: { url: string } | null };
  annotations?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean; color?: string };
};

type FileRef = { type?: string; name?: string; file?: { url: string }; external?: { url: string } };

export type NotionProperty = {
  id?: string;
  type: string;
  title?: RichText[];
  rich_text?: RichText[];
  number?: number | null;
  url?: string | null;
  select?: { name: string } | null;
  status?: { name: string } | null;
  multi_select?: { name: string }[];
  relation?: { id: string }[];
  files?: FileRef[];
  checkbox?: boolean;
  email?: string | null;
  date?: { start: string; end: string | null } | null;
  formula?: { type: string; number?: number | null; string?: string | null; boolean?: boolean | null; date?: { start: string; end: string | null } | null };
  rollup?: { type: string; number?: number | null; date?: { start: string; end: string | null } | null };
};

export type NotionPage = {
  id: string;
  created_time?: string;
  url?: string;
  last_edited_time: string;
  last_edited_by?: { id: string };
  in_trash?: boolean;
  icon?: { type: string; emoji?: string } | null;
  cover?: FileRef | null;
  properties: Record<string, NotionProperty>;
};

export type NotionBlock = { id: string; type: string; has_children?: boolean; children?: NotionBlock[] } & Record<string, unknown>;

type List<T> = { results: T[]; has_more: boolean; next_cursor: string | null };

/* ───────────── Lecture ───────────── */

export async function listPages(dataSourceId: string): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const r = await call<List<NotionPage>>("POST", `/data_sources/${dataSourceId}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...r.results);
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

/** Les pages d'une base qui répondent à un filtre Notion (même forme que l'API). */
export async function queryPages(dataSourceId: string, filter: unknown): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const r = await call<List<NotionPage>>("POST", `/data_sources/${dataSourceId}/query`, { page_size: 100, filter, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...r.results);
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

export const getPage = (id: string) => call<NotionPage>("GET", `/pages/${id}`);

let botId: Promise<string> | null = null;
/** L'identifiant de l'intégration : pour reconnaître ses propres écritures. */
export function integrationId(): Promise<string> {
  botId ??= call<{ id: string }>("GET", "/users/me").then((u) => u.id).catch((e: unknown) => { botId = null; throw e; });
  return botId;
}

/** Ces blocs ont leur propre vie dans Notion : on ne descend pas dedans. */
const OPAQUE = new Set(["child_page", "child_database", "synced_block", "column_list", "table", "unsupported"]);

/** Les blocs d'une page, avec leurs enfants. */
export async function getBlocks(parentId: string, depth = 0): Promise<NotionBlock[]> {
  const out: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
    const r = await call<List<NotionBlock>>("GET", `/blocks/${parentId}/children?${q}`);
    out.push(...r.results);
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (cursor);
  if (depth < 2) for (const b of out) if (b.has_children && !OPAQUE.has(b.type)) b.children = await getBlocks(b.id, depth + 1);
  return out;
}

export type DataSource = { id: string; properties: Record<string, { type: string; multi_select?: { options: { name: string }[] } }> };
export const getDataSource = (id: string) => call<DataSource>("GET", `/data_sources/${id}`);

export type NotionTemplate = { id: string; name: string; is_default?: boolean };
export async function listTemplates(dataSourceId: string): Promise<NotionTemplate[]> {
  const r = await call<{ templates: NotionTemplate[] }>("GET", `/data_sources/${dataSourceId}/templates`);
  return r.templates ?? [];
}

/* ───────────── Écriture ───────────── */

export function createPage(body: { dataSourceId: string; properties: Record<string, unknown>; templateId?: string }) {
  return call<NotionPage>("POST", "/pages", {
    parent: { type: "data_source_id", data_source_id: body.dataSourceId },
    properties: body.properties,
    ...(body.templateId ? { template: { type: "template_id", template_id: body.templateId } } : {}),
  });
}

export const updatePage = (id: string, body: { properties?: Record<string, unknown>; in_trash?: boolean }) => call<NotionPage>("PATCH", `/pages/${id}`, body);

/** Ajoute des blocs à une page : à la fin, au début, ou après un bloc précis. */
export async function appendBlocks(parentId: string, children: unknown[], after?: string | "start"): Promise<NotionBlock[]> {
  const position = after === "start" ? { type: "start" } : after ? { type: "after_block", after_block: { id: after } } : undefined;
  const r = await call<List<NotionBlock>>("PATCH", `/blocks/${parentId}/children`, { children, ...(position ? { position } : {}) });
  return r.results;
}

export const updateBlock = (id: string, patch: unknown) => call<NotionBlock>("PATCH", `/blocks/${id}`, patch);
export const deleteBlock = (id: string) => call<NotionBlock>("DELETE", `/blocks/${id}`);
