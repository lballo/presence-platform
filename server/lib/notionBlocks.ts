import sanitizeHtml from "sanitize-html";
import { isQuestion, LESSON_RUBRICS, LESSON_TYPE_LABEL, memberBlocks, plainOf, SECTION_RUBRICS, type CourseBlock, type CourseContent, type LessonType, type PageContent, type Rubric, type RubricKey, type Rubrics } from "./courseBlocks";
import type { NotionBlock, RichText } from "./notion";
import { CHART_CLASSES, classOfNotionColor, isChartClass, notionColorOfClass } from "./textColors";

/* ───────────── Texte mis en forme : Notion ↔ HTML ───────────── */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const safeHref = (url: string | null | undefined) => (url && /^(https?:|mailto:)/i.test(url) ? url : null);

export function richTextToHtml(rich: RichText[] | undefined): string {
  return (rich ?? []).map((r) => {
    let h = esc(r.plain_text ?? r.text?.content ?? "").replace(/\n/g, "<br>");
    const a = r.annotations ?? {};
    if (a.code) h = `<code>${h}</code>`;
    if (a.strikethrough) h = `<s>${h}</s>`;
    if (a.underline) h = `<u>${h}</u>`;
    if (a.italic) h = `<em>${h}</em>`;
    if (a.bold) h = `<strong>${h}</strong>`;
    const color = classOfNotionColor(a.color);
    if (color) h = `<span class="${color}">${h}</span>`;
    const href = safeHref(r.href ?? r.text?.link?.url);
    return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${h}</a>` : h;
  }).join("");
}

const MARKS: Record<string, keyof NonNullable<RichText["annotations"]>> = { strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline", s: "strikethrough", code: "code" };
const MAX_TEXT = 2000; // limite de Notion par morceau de texte

/** Le texte mis en forme de l'éditeur (déjà nettoyé) vers le format de Notion. */
export function htmlToRichText(html: string): RichText[] {
  const open: Record<string, number> = {};
  let href: string | null = null;
  const colors: string[] = [];
  const parts: { text: string; marks: string; href: string | null; color: string | undefined }[] = [];
  const push = (text: string) => {
    if (!text) return;
    const marks = Object.keys(open).filter((k) => open[k] > 0).sort().join(",");
    const color = [...colors].reverse().find(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.marks === marks && last.href === href && last.color === color) last.text += text;
    else parts.push({ text, marks, href, color });
  };
  for (const token of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (!token.startsWith("<")) { push(unesc(token)); continue; }
    const m = token.match(/^<(\/?)([a-z0-9]+)/i);
    if (!m) continue;
    const name = m[2].toLowerCase();
    if (name === "br") { push("\n"); continue; }
    if (name === "a") { href = m[1] ? null : safeHref(unesc(token.match(/href="([^"]*)"/i)?.[1] ?? "")); continue; }
    if (name === "span") { if (m[1]) colors.pop(); else colors.push(notionColorOfClass((token.match(/class="([^"]*)"/i)?.[1] ?? "").split(/\s+/).find(isChartClass) ?? "") ?? ""); continue; }
    const mark = MARKS[name];
    if (mark) open[mark] = Math.max(0, (open[mark] ?? 0) + (m[1] ? -1 : 1));
  }
  const out: RichText[] = [];
  for (const p of parts) {
    const annotations = { ...Object.fromEntries(p.marks.split(",").filter(Boolean).map((k) => [k, true])), ...(p.color ? { color: p.color } : {}) };
    for (let i = 0; i < p.text.length; i += MAX_TEXT) {
      out.push({ type: "text", text: { content: p.text.slice(i, i + MAX_TEXT), link: p.href ? { url: p.href } : null }, ...(p.marks || p.color ? { annotations } : {}) });
    }
  }
  return out;
}

/** Une ligne de texte simple vers le format de Notion. */
export const plainToRichText = (text: string): RichText[] => htmlToRichText(esc(text));
export const richTextToPlain = (rich: RichText[] | undefined) => (rich ?? []).map((r) => r.plain_text ?? r.text?.content ?? "").join("");

/** Le texte vient du navigateur : seul ce nettoyage garantit qu'il ne contient aucun script. */
export function cleanInline(html: string): string {
  // Deux paragraphes restent séparés par une ligne vide, dans Notion comme pour les membres
  const flat = html.replace(/<\/p>\s*<p[^>]*>/gi, "<br><br>").replace(/<\/(p|div|h[1-6]|li|blockquote)>\s*<(p|div|h[1-6]|li|blockquote)[^>]*>/gi, "<br>");
  return sanitizeHtml(flat, {
    allowedTags: ["strong", "em", "u", "s", "code", "a", "br", "span"],
    allowedAttributes: { a: ["href", "target", "rel"], span: ["class"] },
    allowedClasses: { span: CHART_CLASSES },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      b: "strong",
      i: "em",
      a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href ?? "", target: "_blank", rel: "noopener noreferrer nofollow" } }),
    },
  }).replace(/(<br\s*\/?>\s*){3,}/gi, "<br /><br />").replace(/(<br\s*\/?>\s*)+$/i, "").trim();
}

/* ───────────── Blocs Notion → blocs de l'application ───────────── */

type Rich = { rich_text?: RichText[]; icon?: { emoji?: string } | null; caption?: RichText[]; url?: string; type?: string; name?: string; file?: { url: string }; external?: { url: string } };

const fileUrl = (f: Rich) => f.file?.url ?? f.external?.url ?? "";
/** L'adresse d'un fichier Notion change à chaque lecture (lien temporaire), son chemin non. */
const fileKey = (f: Rich) => (f.file?.url ? f.file.url.split("?")[0] : undefined);

export function toCourseBlock(raw: NotionBlock): CourseBlock {
  const v = (raw[raw.type] ?? {}) as Rich;
  const html = richTextToHtml(v.rich_text);
  const children = raw.children?.length ? { children: raw.children.map(toCourseBlock) } : {};
  switch (raw.type) {
    case "paragraph": return { id: raw.id, type: "paragraph", html, ...children };
    case "bulleted_list_item": return { id: raw.id, type: "bullet", html, ...children };
    case "numbered_list_item": return { id: raw.id, type: "number", html, ...children };
    case "quote": return { id: raw.id, type: "quote", html, ...children };
    case "heading_1":
    case "heading_2": return { id: raw.id, type: "heading", level: 2, html, ...children };
    case "heading_3":
    case "heading_4": return { id: raw.id, type: "heading", level: 3, html, ...children };
    case "callout": return { id: raw.id, type: "callout", html, emoji: v.icon?.emoji ?? "", ...children };
    case "toggle": return { id: raw.id, type: "toggle", html, ...children };
    case "divider": return { id: raw.id, type: "divider" };
    case "image": return { id: raw.id, type: "image", url: fileUrl(v), caption: richTextToPlain(v.caption), ...(fileKey(v) ? { sourceKey: fileKey(v) } : {}) };
    case "video": return { id: raw.id, type: "video", url: fileUrl(v), caption: richTextToPlain(v.caption), ...(fileKey(v) ? { sourceKey: fileKey(v) } : {}) };
    case "file":
    case "pdf":
    case "audio": return { id: raw.id, type: "file", url: fileUrl(v), name: v.name || richTextToPlain(v.caption) || "Fichier", ...(fileKey(v) ? { sourceKey: fileKey(v) } : {}) };
    case "bookmark":
    case "embed":
    case "link_preview": return { id: raw.id, type: "link", url: v.url ?? "", title: richTextToPlain(v.caption) };
    default: return { id: raw.id, type: "unknown", notionType: raw.type };
  }
}

/* ───────────── Découpage d'une page en rubriques ───────────── */

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const ALIASES: Record<string, RubricKey> = { exercices: "exercice", defi: "defi", lecon: "lecons" };

/** Textes provisoires du modèle : cachés aux membres, signalés dans Construire. */
const DRAFT_TEXT = [/^a ecrire\b/, /^a completer\b/, /^questions de reflexion\s*;/, /^texte, images, videos, liens externes/, /^proposition\s*:\s*a ecrire\b/];
const isDraftText = (html: string) => DRAFT_TEXT.some((r) => r.test(norm(plainOf(html))));

function markDraft(b: CourseBlock): CourseBlock {
  if (b.type === "callout" && (b.emoji === "✍️" || b.emoji === "✍" || isDraftText(b.html))) return { ...b, draft: true };
  if ("html" in b && isDraftText(b.html)) return { ...b, draft: true } as CourseBlock;
  return b;
}

/** Les titres de niveau 2 reconnus ouvrent une rubrique. Un autre titre reste du contenu de la rubrique en cours. */
export function pageContentFromBlocks(raw: NotionBlock[], rubrics: readonly Rubric[]): PageContent {
  const names = new Map<string, RubricKey>(rubrics.map((r) => [norm(r.title), r.key]));
  for (const [alias, key] of Object.entries(ALIASES)) if (rubrics.some((r) => r.key === key)) names.set(alias, key);
  const out: Rubrics = Object.fromEntries(rubrics.map((r) => [r.key, []]));
  const headings: PageContent["headings"] = {};
  const before: CourseBlock[] = [];
  let current: RubricKey | null = null;
  for (const r of raw) {
    const b = markDraft(toCourseBlock(r));
    const key = b.type === "heading" && b.level === 2 ? names.get(norm(plainOf(b.html))) : undefined;
    if (key && !headings[key]) { current = key; headings[key] = r.id; continue; }
    if (current) out[current]!.push(b);
    else before.push(b);
  }
  return { rubrics: out, headings, ...(before.length ? { before } : {}) };
}

export const lessonContentFromBlocks = (raw: NotionBlock[]) => pageContentFromBlocks(raw, LESSON_RUBRICS);
export const sectionContentFromBlocks = (raw: NotionBlock[]) => pageContentFromBlocks(raw, SECTION_RUBRICS);

const DESCRIPTION = norm("Présentation de la formation");

/** La page d'une formation : seule la rubrique « Présentation de la formation » s'affiche, « Déroulé » reste dans Notion. */
export function courseContentFromBlocks(raw: NotionBlock[]): CourseContent {
  const out: CourseContent = { description: [] };
  let inside = false;
  for (const r of raw) {
    const b = markDraft(toCourseBlock(r));
    if (b.type === "heading" && b.level === 2) {
      inside = norm(plainOf(b.html)) === DESCRIPTION;
      if (inside) out.descriptionHeading = r.id;
      continue;
    }
    if (inside) out.description!.push(b);
  }
  return out;
}

const INTRODUCTION = norm("Introduction");

/** La page d'un thème du catalogue : sa rubrique « Introduction », ou toute la page si elle n'a pas ce titre. */
export function themeIntroFromBlocks(raw: NotionBlock[]): CourseBlock[] {
  const blocks = raw.map((r) => markDraft(toCourseBlock(r)));
  const start = blocks.findIndex((b) => b.type === "heading" && b.level === 2 && norm(plainOf(b.html)) === INTRODUCTION);
  if (start < 0) return blocks;
  const after = blocks.slice(start + 1);
  const end = after.findIndex((b) => b.type === "heading" && b.level === 2);
  return end < 0 ? after : after.slice(0, end);
}

/* ───────────── Ce que Construire signale ───────────── */

function unknownTypes(blocks: CourseBlock[]): string[] {
  return blocks.flatMap((b) => (b.type === "unknown" ? [b.notionType] : "children" in b && b.children ? unknownTypes(b.children) : []));
}

/** Ce que toute page signale : rubriques absentes, textes encore à écrire, blocs non affichés. */
function pageIssues(content: PageContent, rubrics: readonly Rubric[], optional: readonly RubricKey[], intention: string): string[] {
  const out: string[] = [];
  for (const { key, title } of rubrics) {
    if (key === "lecons") continue;
    const blocks = content.rubrics?.[key] ?? [];
    if (!content.headings?.[key]) { if (!optional.includes(key)) out.push(`Rubrique « ${title} » absente de la page Notion.`); continue; }
    if (blocks.some((b) => "draft" in b && b.draft)) out.push(`${title} : texte encore à écrire, caché aux membres.`);
    for (const t of unknownTypes(blocks)) out.push(`${title} : un bloc Notion de type « ${t} » n’est pas affiché aux membres.`);
  }
  if (content.before?.length) out.push("Du contenu précède le premier titre de la page : il n’est pas affiché aux membres.");
  const rubric = memberBlocks(content.rubrics?.intention ?? []).map((b) => ("html" in b ? plainOf(b.html) : "")).join(" ").trim();
  if (rubric && intention && norm(rubric) !== norm(intention)) out.push("Intention : le champ de la base et la rubrique de la page diffèrent.");
  if (content.rubrics?.defi?.some((b) => "html" in b && !("draft" in b && b.draft) && /^proposition\s*:/.test(norm(plainOf(b.html))))) out.push("Défi : le texte commence encore par « Proposition ».");
  return out;
}

export function sectionIssues(content: PageContent, props: { intention: string }): string[] {
  return pageIssues(content, SECTION_RUBRICS, ["defi"], props.intention);
}

/** Le type d'une leçon sert d'étiquette et d'alerte : il ne change pas ce qu'elle peut contenir. */
export function lessonIssues(content: PageContent, props: { type: LessonType; intention: string; videoUrl: string; testUrl: string; testProblem?: string | null }): string[] {
  const out = pageIssues(content, LESSON_RUBRICS, [], props.intention);
  const shown = (key: RubricKey) => memberBlocks(content.rubrics?.[key] ?? []);
  const drafted = (key: RubricKey) => (content.rubrics?.[key] ?? []).some((b) => "draft" in b && b.draft);
  const label = LESSON_TYPE_LABEL[props.type];
  if (props.type === "contenu" && !shown("contenu").length && !drafted("contenu")) out.push(`Leçon de type ${label} : la rubrique Contenu est vide.`);
  if (props.type === "video" && !props.videoUrl) out.push(`Leçon de type ${label} : aucun lien de vidéo.`);
  if (props.type === "test" && !props.testUrl) out.push(`Leçon de type ${label} : aucun test intégré.`);
  if (props.type === "exercice" && !shown("exercice").some(isQuestion) && !drafted("exercice")) out.push(`Leçon de type ${label} : aucune question (une puce par question).`);
  if (props.type === "defi" && !shown("defi").length && !drafted("defi")) out.push(`Leçon de type ${label} : la rubrique Défi est vide.`);
  if (props.testProblem) out.push(`Test intégré : ${props.testProblem}`);
  return out;
}

export function courseIssues(content: CourseContent): string[] {
  const out: string[] = [];
  if (!content.descriptionHeading) out.push("Rubrique « Présentation de la formation » absente de la page Notion.");
  else if (content.description?.some((b) => "draft" in b && b.draft)) out.push("Présentation de la formation : texte encore à écrire, caché aux membres.");
  return out;
}

/* ───────────── Blocs de l'application → blocs Notion ───────────── */

const NOTION_TEXT = { paragraph: "paragraph", bullet: "bulleted_list_item", number: "numbered_list_item", quote: "quote", toggle: "toggle" } as const;
const external = (url: string) => ({ type: "external", external: { url } });

/** Le contenu modifiable d'un bloc, tel que Notion l'attend pour le créer ou le mettre à jour. */
function notionValue(b: CourseBlock): { type: string; value: Record<string, unknown> } | null {
  switch (b.type) {
    case "paragraph":
    case "bullet":
    case "number":
    case "quote":
    case "toggle": return { type: NOTION_TEXT[b.type], value: { rich_text: htmlToRichText(b.html) } };
    case "heading": return { type: b.level === 2 ? "heading_2" : "heading_3", value: { rich_text: htmlToRichText(b.html) } };
    case "callout": return { type: "callout", value: { rich_text: htmlToRichText(b.html), ...(b.emoji ? { icon: { type: "emoji", emoji: b.emoji } } : {}) } };
    case "divider": return { type: "divider", value: {} };
    case "image":
    case "video": return { type: b.type, value: { ...external(b.url), caption: plainToRichText(b.caption) } };
    case "file": return { type: "file", value: { ...external(b.url), name: b.name.slice(0, 100), caption: [] } };
    case "link": return { type: "bookmark", value: { url: b.url, caption: plainToRichText(b.title) } };
    default: return null;
  }
}

/** Un bloc à créer. Notion accepte deux niveaux d'enfants dans une même requête. */
export function toNotionBlock(b: CourseBlock, depth = 0): Record<string, unknown> | null {
  const n = notionValue(b);
  if (!n) return null;
  const kids = "children" in b && b.children?.length && depth < 1 ? b.children.map((c) => toNotionBlock(c, depth + 1)).filter(Boolean) : [];
  return { object: "block", type: n.type, [n.type]: { ...n.value, ...(kids.length ? { children: kids } : {}) } };
}

/** La mise à jour d'un bloc existant. */
export function blockPatch(b: CourseBlock): Record<string, unknown> | null {
  const n = notionValue(b);
  if (!n) return null;
  return { [n.type]: n.value };
}

/** Le texte d'un bloc est comparé après conversion : deux écritures HTML du même texte ne sont pas une modification. */
const comparable = (b: CourseBlock) => JSON.stringify(notionValue(b));
export const sameBlock = (a: CourseBlock, b: CourseBlock) => comparable(a) === comparable(b);
/** Notion ne change pas le type d'un bloc : il faut le recréer. */
export const sameKind = (a: CourseBlock, b: CourseBlock) => notionValue(a)?.type === notionValue(b)?.type;

export const heading2 = (title: string) => ({ object: "block", type: "heading_2", heading_2: { rich_text: plainToRichText(title) } });

const paragraph = (text: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: plainToRichText(text) } });
export const bullet = (text: string) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: plainToRichText(text) } });

/** La structure d'une leçon, identique à celle de la base Notion. */
export function lessonSkeleton(intention: string): Record<string, unknown>[] {
  return [
    heading2("Intention"), paragraph(intention || "À écrire"),
    heading2("Contenu"), paragraph("À écrire : texte, images, vidéos, liens externes, emojis."),
    heading2("Exercice"), bullet("À écrire"),
    heading2("Défi dans le réseau"), paragraph("Proposition : à écrire."),
    heading2("Pour aller plus loin"), bullet("À compléter"),
  ];
}

/** La structure d'une section. Le défi est facultatif : sa rubrique se crée au premier enregistrement. */
export function sectionSkeleton(intention: string): Record<string, unknown>[] {
  return [heading2("Intention"), paragraph(intention || "À écrire"), heading2("Objectifs"), bullet("À écrire"), heading2("Leçons")];
}

/* ───────────── Hashtags ───────────── */

/** « Prise de parole » dans Notion, #prise-de-parole dans la communauté. */
export const normalizeTag = (label: string) => label.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 40);
export const labelFromTag = (name: string) => { const t = name.replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
