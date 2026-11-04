import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { EditorContent, getHTMLFromFragment, Mark, mergeAttributes, Node as TiptapNode, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ArrowDown, ArrowUp, ChevronRight, Copy, FileUp, GripVertical, Heading3, Image as ImageIcon, Link2, List, ListOrdered, Megaphone, Minus, Plus, Quote, Smile, Trash2, Type, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { EmojiGrid } from "@/components/forum/EmojiGrid";
import { VideoEmbed } from "@/components/VideoEmbed";
import { useUpload } from "@/lib/upload";
import { plainOf, type CourseBlock } from "../../../../server/lib/courseBlocks";
import { HIGHLIGHTS, isChartClass, TEXT_COLORS } from "../../../../server/lib/textColors";

let counter = 0;
const newId = () => `tmp${Date.now().toString(36)}${counter++}`;

type TextKind = "paragraph" | "heading" | "bullet" | "number" | "quote" | "callout" | "toggle";
type TextBlock = Extract<CourseBlock, { html: string }>;
const isText = (b: CourseBlock): b is TextBlock => "html" in b;

/** Chaque bloc garde sa place dans la page : l'identifiant change au premier enregistrement (Notion le donne), pas la clé. */
export const keyOf = (b: CourseBlock) => (b as { key?: string }).key ?? b.id;

const emptyOf = (html: string) => !html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

export function makeText(kind: TextKind, html = ""): CourseBlock {
  const id = newId();
  if (kind === "heading") return { id, type: "heading", level: 3, html };
  if (kind === "callout") return { id, type: "callout", emoji: "💡", html };
  return { id, type: kind, html } as CourseBlock;
}

/** Changer de type garde le texte et l'identifiant : le serveur recrée le bloc dans Notion, qui ne sait pas le transformer. */
function convert(b: TextBlock, kind: TextKind): CourseBlock {
  const { id, html, draft, children } = b;
  const base = { id, html, ...(draft ? { draft } : {}), ...(children ? { children } : {}), ...("key" in b ? { key: (b as { key?: string }).key } : {}) };
  if (kind === "heading") return { ...base, type: "heading", level: 3 };
  if (kind === "callout") return { ...base, type: "callout", emoji: "💡" };
  return { ...base, type: kind } as CourseBlock;
}

/** Ce que le serveur enregistre : un texte vide ou un média sans adresse attend d'être rempli. */
export const sendableBlocks = (list: CourseBlock[]) => list.filter((b) => (isText(b) ? !emptyOf(b.html) : "url" in b ? !!b.url.trim() : true));

/**
 * Après un enregistrement, chaque bloc reçoit l'identifiant que Notion lui a donné. On garde le texte en cours de saisie :
 * rien ne se recharge sous les doigts. Null si la page relue ne correspond pas : il faut alors la recharger.
 */
export function remapIds(current: CourseBlock[], sent: CourseBlock[], fresh: CourseBlock[]): CourseBlock[] | null {
  if (sent.length !== fresh.length || sent.some((b, i) => b.type !== fresh[i].type)) return null;
  const ids = new Map(sent.map((b, i) => [b.id, fresh[i].id]));
  return current.map((b) => { const id = ids.get(b.id); return id && id !== b.id ? ({ ...b, id, key: keyOf(b) } as unknown as CourseBlock) : b; });
}

/* ───────────── La couleur de la charte, comme marque de texte ───────────── */

const ChartColor = Mark.create({
  name: "chartColor",
  addAttributes() {
    return { c: { default: null, parseHTML: (el) => [...el.classList].find(isChartClass) ?? null, renderHTML: (a) => ({ class: a.c }) } };
  },
  parseHTML() { return [{ tag: "span", getAttrs: (el) => ([...(el as HTMLElement).classList].some(isChartClass) ? {} : false) }]; },
  renderHTML({ HTMLAttributes }) { return ["span", mergeAttributes(HTMLAttributes), 0]; },
});

/** Un bloc, un paragraphe : ce qui dépasse devient un autre bloc, comme dans Notion. */
const OneParagraph = TiptapNode.create({ name: "doc", topNode: true, content: "paragraph" });

const inner = (html: string) => (html === "<p></p>" ? "" : html.replace(/^<p[^>]*>/, "").replace(/<\/p>$/, ""));

/* ───────────── La page : une seule barre de mise en forme, pour le bloc où l'on écrit ───────────── */

type Active = { editor: Editor; type: CourseBlock["type"]; setKind: (k: TextKind) => void };
const DocContext = createContext<{ active: Active | null; setActive: (a: Active | null) => void } | null>(null);

export function DocProvider({ children, className }: { children: ReactNode; className?: string }) {
  const [active, setActive] = useState<Active | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setActive(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <DocContext.Provider value={value}><div ref={root} data-doc-root className={className}>{children}</div></DocContext.Provider>;
}

const KIND_OPTIONS: [TextKind, string][] = [["paragraph", "Paragraphe"], ["heading", "Titre"], ["bullet", "Puce"], ["number", "Numéro"], ["quote", "Citation"], ["callout", "Encadré"], ["toggle", "Repli"]];
const tool = "w-7 h-7 flex items-center justify-center rounded-md text-[13px] disabled:opacity-40 hover:bg-[var(--p-accent-soft)]";

/** Elle reste en haut de l'écran dans un long texte, au même endroit : la page ne bouge pas quand on passe d'un bloc à l'autre. */
export function DocToolbar() {
  const doc = useContext(DocContext);
  // Le bloc où l'on écrivait a pu être supprimé : son éditeur n'existe plus
  const a = doc?.active && !doc.active.editor.isDestroyed ? doc.active : null;
  const [open, setOpen] = useState<"color" | "link" | "emoji" | null>(null);
  const [link, setLink] = useState("");
  const state = useEditorState({
    editor: a?.editor ?? null,
    selector: ({ editor }) => (editor ? { bold: editor.isActive("bold"), italic: editor.isActive("italic"), underline: editor.isActive("underline"), link: editor.isActive("link"), color: (editor.getAttributes("chartColor").c as string | null) ?? "" } : null),
  });
  useEffect(() => { setOpen(null); }, [a?.editor]);
  const off = !a;
  const keep = (e: React.MouseEvent) => e.preventDefault(); // le texte garde sa sélection
  const paint = (cls: string) => { if (!a) return; const chain = a.editor.chain().focus(); (cls ? chain.setMark("chartColor", { c: cls }) : chain.unsetMark("chartColor")).run(); setOpen(null); };
  const applyLink = () => {
    if (!a) return;
    const raw = link.trim();
    if (raw) a.editor.chain().focus().extendMarkRange("link").setLink({ href: /^(https?:\/\/|mailto:)/i.test(raw) ? raw : `https://${raw}` }).run();
    else a.editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(null);
  };
  const current = [...TEXT_COLORS, ...HIGHLIGHTS].find((c) => c.cls === (state?.color ?? ""));
  const toggleKind = (k: TextKind) => { if (a) a.setKind(a.type === k ? "paragraph" : k); };
  return (
    <div className="cr-toolbar-wrap" data-doc-toolbar>
      <div role="toolbar" aria-label="Mise en forme du texte" className="cr-toolbar" style={{ opacity: off ? 0.55 : 1 }}>
        <label className="flex"><span className="sr-only">Style du texte</span>
          <select className="rounded-md px-1.5 py-1 text-[12px] font-medium bg-transparent cursor-pointer disabled:cursor-default" disabled={off || !KIND_OPTIONS.some(([k]) => k === a?.type)} value={a && KIND_OPTIONS.some(([k]) => k === a.type) ? a.type : "paragraph"} onChange={(e) => a?.setKind(e.target.value as TextKind)}>
            {KIND_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <span className="w-px h-[18px] mx-0.5" style={{ background: "var(--p-line)" }} />
        <button type="button" aria-label="Gras" aria-pressed={!!state?.bold} disabled={off} className={tool} style={state?.bold ? { background: "var(--p-accent-soft)", color: "var(--p-accent)" } : undefined} onMouseDown={keep} onClick={() => a?.editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" aria-label="Italique" aria-pressed={!!state?.italic} disabled={off} className={tool} style={state?.italic ? { background: "var(--p-accent-soft)", color: "var(--p-accent)" } : undefined} onMouseDown={keep} onClick={() => a?.editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button type="button" aria-label="Souligné" aria-pressed={!!state?.underline} disabled={off} className={tool} style={state?.underline ? { background: "var(--p-accent-soft)", color: "var(--p-accent)" } : undefined} onMouseDown={keep} onClick={() => a?.editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
        <button type="button" aria-label="Couleur du texte" aria-expanded={open === "color"} disabled={off} className={tool} onMouseDown={keep} onClick={() => setOpen(open === "color" ? null : "color")}><span className="flex flex-col items-center font-semibold leading-none">A<span className="block w-3.5 h-[3px] rounded-sm mt-0.5" style={{ background: current?.hex ?? "#1A1A1A" }} /></span></button>
        <button type="button" aria-label="Insérer un lien" aria-expanded={open === "link"} aria-pressed={!!state?.link} disabled={off} className={tool} style={state?.link ? { background: "var(--p-accent-soft)", color: "var(--p-accent)" } : undefined} onMouseDown={keep} onClick={() => { setLink((a?.editor.getAttributes("link").href as string | undefined) ?? ""); setOpen(open === "link" ? null : "link"); }}><Link2 size={14} /></button>
        <button type="button" aria-label="Liste à puces" aria-pressed={a?.type === "bullet"} disabled={off} className={tool} onMouseDown={keep} onClick={() => toggleKind("bullet")}><List size={14} /></button>
        <button type="button" aria-label="Citation" aria-pressed={a?.type === "quote"} disabled={off} className={tool} onMouseDown={keep} onClick={() => toggleKind("quote")}><Quote size={13} /></button>
        <button type="button" aria-label="Emoji" aria-expanded={open === "emoji"} disabled={off} className={tool} onMouseDown={keep} onClick={() => setOpen(open === "emoji" ? null : "emoji")}><Smile size={14} /></button>
      </div>
      {open === "color" && (
        <div role="dialog" aria-label="Couleur du texte" className="cr-popover w-[252px]" onMouseDown={keep}>
          <p className="m-0 mb-2 text-[10px] font-semibold tracking-[0.12em] p-muted">COULEUR DU TEXTE</p>
          <div className="flex flex-wrap gap-2">{TEXT_COLORS.map((c) => <button key={c.name} type="button" aria-label={c.name} title={c.name} className="w-[38px] h-[38px] rounded-full" style={{ background: c.hex, boxShadow: (state?.color ?? "") === c.cls ? `0 0 0 3px var(--p-surface), 0 0 0 5px ${c.hex}` : undefined }} onClick={() => paint(c.cls)} />)}</div>
          <p className="m-0 mt-3 mb-2 text-[10px] font-semibold tracking-[0.12em] p-muted">SURLIGNAGE</p>
          <div className="flex flex-wrap gap-2">{HIGHLIGHTS.map((c) => <button key={c.name} type="button" aria-label={`Surlignage ${c.name}`} title={c.name} className="w-[38px] h-[38px] rounded-full border" style={{ background: c.hex, borderColor: "var(--p-line)", boxShadow: state?.color === c.cls ? "0 0 0 3px var(--p-surface), 0 0 0 5px #AFA098" : undefined }} onClick={() => paint(c.cls)} />)}</div>
        </div>
      )}
      {open === "link" && (
        <form role="dialog" aria-label="Insérer un lien" className="cr-popover flex gap-2 w-[min(320px,86vw)]" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
          <input className="p-field h-9 min-h-0 py-0 flex-1 text-[13px] rounded-md" autoFocus type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Coller l’adresse du lien" aria-label="Adresse du lien" />
          <button type="submit" className="cr-btn cr-btn-primary">{link.trim() ? "Lier" : "Retirer"}</button>
        </form>
      )}
      {open === "emoji" && <div className="cr-popover w-[min(320px,86vw)] max-h-[180px] overflow-y-auto" onMouseDown={keep}><EmojiGrid onPick={(x) => a?.editor.chain().focus().insertContent(x).run()} /></div>}
    </div>
  );
}

/* ───────────── Le menu d'insertion ───────────── */

type Insert = { kind: TextKind } | { media: "image" | "video" | "file" | "link" | "divider" };
const MENU: { title: string; items: { id: string; label: string; desc: string; icon: ReactNode; insert: Insert }[] }[] = [
  { title: "TEXTE", items: [
    { id: "texte", label: "Texte", desc: "Un paragraphe", icon: <Type size={14} />, insert: { kind: "paragraph" } },
    { id: "titre", label: "Titre", desc: "Un titre de partie", icon: <Heading3 size={14} />, insert: { kind: "heading" } },
    { id: "puce", label: "Puce", desc: "Une liste simple", icon: <List size={14} />, insert: { kind: "bullet" } },
    { id: "numero", label: "Numéro", desc: "Une liste d’étapes", icon: <ListOrdered size={14} />, insert: { kind: "number" } },
    { id: "citation", label: "Citation", desc: "Une phrase-clé mise en avant", icon: <Quote size={14} />, insert: { kind: "quote" } },
    { id: "encadre", label: "Encadré", desc: "Un conseil, un point d’attention", icon: <Megaphone size={14} />, insert: { kind: "callout" } },
    { id: "repli", label: "Repli", desc: "Un titre qui s’ouvre", icon: <ChevronRight size={14} />, insert: { kind: "toggle" } },
  ] },
  { title: "AUTRES BLOCS", items: [
    { id: "image", label: "Image", desc: "Une photo, un schéma", icon: <ImageIcon size={14} />, insert: { media: "image" } },
    { id: "video", label: "Vidéo", desc: "Un fichier, ou un lien", icon: <Video size={14} />, insert: { media: "video" } },
    { id: "fichier", label: "Fichier à télécharger", desc: "PDF, audio, fiche d’exercice", icon: <FileUp size={14} />, insert: { media: "file" } },
    { id: "lien", label: "Lien externe", desc: "Une page à ouvrir", icon: <Link2 size={14} />, insert: { media: "link" } },
    { id: "separateur", label: "Séparateur", desc: "Une ligne entre deux parties", icon: <Minus size={14} />, insert: { media: "divider" } },
  ] },
];
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const matches = (query: string) => MENU.flatMap((g) => g.items).filter((i) => !query || fold(i.label).startsWith(fold(query)) || fold(i.id).startsWith(fold(query)));

export function makeFrom(insert: Insert): CourseBlock {
  if ("kind" in insert) return makeText(insert.kind);
  const id = newId();
  switch (insert.media) {
    case "image": case "video": return { id, type: insert.media, url: "", caption: "" };
    case "file": return { id, type: "file", url: "", name: "" };
    case "link": return { id, type: "link", url: "", title: "" };
    default: return { id, type: "divider" };
  }
}

function InsertMenu({ query, index, onPick }: { query: string; index: number; onPick: (insert: Insert) => void }) {
  const list = matches(query);
  if (!list.length) return null;
  return (
    <div role="menu" aria-label="Insérer un bloc" className="cr-menu" onMouseDown={(e) => e.preventDefault()}>
      {MENU.map((g) => {
        const items = g.items.filter((i) => list.includes(i));
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <p className="m-0 mx-2 mt-1.5 mb-1 text-[10px] font-semibold tracking-[0.12em] p-muted">{g.title}</p>
            {items.map((i) => (
              <button key={i.id} type="button" role="menuitem" className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left" style={list[index] === i ? { background: "var(--p-accent-soft)" } : undefined} onClick={() => onPick(i.insert)}>
                <span className="w-7 h-7 flex-none rounded-md border flex items-center justify-center p-muted" style={{ borderColor: "var(--p-line)" }}>{i.icon}</span>
                <span className="flex flex-col min-w-0"><span className="text-[13px] font-medium">{i.label}</span><span className="text-[11px] p-muted">{i.desc}</span></span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Le « + » du bas de page : les rubriques qui ne sont pas affichées, puis tout ce qui peut entrer dans le contenu. */
export type PageItem = { id: string; label: string; desc: string; icon: ReactNode; add: () => void };

export function PageAdd({ items, onInsert }: { items: PageItem[]; onInsert?: (b: CourseBlock) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as globalThis.Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const row = (id: string, label: string, desc: string, icon: ReactNode, run: () => void) => (
    <button key={id} type="button" role="menuitem" className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--p-accent-soft)]" onClick={() => { setOpen(false); run(); }}>
      <span className="w-7 h-7 flex-none rounded-md border flex items-center justify-center p-muted" style={{ borderColor: "var(--p-line)" }}>{icon}</span>
      <span className="flex flex-col min-w-0"><span className="text-[13px] font-medium">{label}</span><span className="text-[11px] p-muted">{desc}</span></span>
    </button>
  );
  return (
    <div ref={root} className="relative mt-6 px-2">
      <button type="button" aria-expanded={open} aria-haspopup="menu" className="cr-page-add" onClick={() => setOpen(!open)}><span className="cr-page-add-plus"><Plus size={16} /></span> Ajouter un bloc</button>
      {open && (
        <div role="menu" aria-label="Ajouter un bloc" className="cr-menu cr-menu-up">
          {items.length > 0 && <><p className="m-0 mx-2 mt-1.5 mb-1 text-[10px] font-semibold tracking-[0.12em] p-muted">BLOCS DE LA PAGE</p>{items.map((i) => row(i.id, i.label, i.desc, i.icon, i.add))}</>}
          {onInsert && MENU.map((g) => <div key={g.title}><p className="m-0 mx-2 mt-2 mb-1 text-[10px] font-semibold tracking-[0.12em] p-muted">{g.title === "TEXTE" ? "DANS LE CONTENU : TEXTE" : "DANS LE CONTENU : AUTRES BLOCS"}</p>{g.items.map((i) => row(i.id, i.label, i.desc, i.icon, () => onInsert(makeFrom(i.insert))))}</div>)}
        </div>
      )}
    </div>
  );
}

/** Le curseur va dans un bloc qui vient d'être ajouté depuis le bas de page. */
export function focusBlock(b: CourseBlock) {
  const row = document.querySelector(`[data-doc-root] [data-block-key="${keyOf(b)}"]`);
  const dom = row?.querySelector(".ProseMirror") as (Element & { editor?: Editor }) | null;
  if (dom?.editor) return focusNow(dom.editor, "end");
  (row?.querySelector("input") as HTMLInputElement | null)?.focus();
}

/* ───────────── Un média ───────────── */

/** Envoi d'un fichier depuis Construire : il rejoint notre stockage, Notion reçoit son adresse. */
function FilePick({ kind, accept, maxMb, label, onDone }: { kind: "courseImage" | "courseVideo" | "courseFile"; accept: string; maxMb: number; label: string; onDone: (url: string, name: string) => void }) {
  const up = useUpload(kind);
  const pick = async (file?: File) => {
    if (!file) return;
    if (file.size > maxMb * 1048576) return void toast.error(`Le fichier dépasse ${maxMb} Mo.`);
    try { const r = await up.upload(file); if (r.publicUrl) onDone(r.publicUrl, file.name); } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); }
  };
  return <label className="cr-btn cursor-pointer flex-none"><input type="file" accept={accept} className="hidden" aria-label={label} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} /><Upload size={14} /> {up.busy ? `Envoi… ${up.progress ?? 0} %` : label}</label>;
}

const line = "flex-[1_1_200px] min-w-0 border-0 outline-none bg-transparent text-[13px] py-1.5";

function MediaFields({ b, set }: { b: CourseBlock; set: (p: Partial<CourseBlock>) => void }) {
  switch (b.type) {
    case "image": return (
      <div className="flex flex-col gap-2">
        {b.url && <img src={b.url} alt="" className="max-h-[360px] w-auto max-w-full rounded-xl self-start" />}
        <div className="cr-drop"><ImageIcon size={18} className="flex-none" /><input className={line} value={b.url} onChange={(e) => set({ url: e.target.value })} placeholder="Ajouter une image (JPG, PNG), ou coller son adresse" aria-label="Adresse de l’image" /><FilePick kind="courseImage" accept="image/jpeg,image/png,image/webp,image/gif" maxMb={10} label={b.url ? "Changer" : "Choisir"} onDone={(url) => set({ url })} /></div>
        <input className="border-0 outline-none bg-transparent text-[13px] p-muted" value={b.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Légende (facultative)" aria-label="Légende" />
      </div>
    );
    case "video": return (
      <div className="flex flex-col gap-2">
        {b.url && /^https?:/.test(b.url) && <div className="max-w-[560px]"><VideoEmbed url={b.url} title="Vidéo" /></div>}
        <div className="cr-drop"><Video size={18} className="flex-none" /><input className={line} value={b.url} onChange={(e) => set({ url: e.target.value })} placeholder="Importer une vidéo, ou coller un lien YouTube, Vimeo, Loom" aria-label="Lien de la vidéo" /><FilePick kind="courseVideo" accept="video/mp4,video/quicktime,video/webm" maxMb={500} label={b.url ? "Changer" : "Choisir"} onDone={(url) => set({ url })} /></div>
        <input className="border-0 outline-none bg-transparent text-[13px] p-muted" value={b.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Légende (facultative)" aria-label="Légende" />
      </div>
    );
    case "file": return <div className="cr-drop"><FileUp size={18} className="flex-none" /><input className={line} value={b.name} onChange={(e) => set({ name: e.target.value })} placeholder={b.url ? "Nom affiché" : "Joindre un fichier (PDF, audio, Word…)"} aria-label="Nom du fichier" /><FilePick kind="courseFile" accept="*/*" maxMb={50} label={b.url ? "Changer" : "Choisir"} onDone={(url, name) => set({ url, name: b.name || name })} /></div>;
    case "link": return <div className="cr-drop flex-wrap"><Link2 size={18} className="flex-none" /><input className={line} value={b.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" aria-label="Adresse du lien" /><input className={line} value={b.title} onChange={(e) => set({ title: e.target.value })} placeholder="Texte affiché" aria-label="Texte du lien" /></div>;
    case "divider": return <hr className="my-3 border-0 border-t" style={{ borderColor: "var(--p-line)" }} />;
    case "unknown": return <p className="m-0 text-[13px] p-muted">Bloc Notion de type « {b.notionType} » : les membres ne le voient pas. Il reste tel quel dans Notion.</p>;
    default: return null;
  }
}

/* ───────────── Une ligne de texte ───────────── */

export type Variant = "document" | "defi";
type Handlers = {
  change: (key: string, html: string) => void;
  focus: (key: string, editor: Editor) => void;
  enter: (key: string, editor: Editor) => void;
  backspace: (key: string, editor: Editor) => void;
  paste: (key: string, editor: Editor, lines: string[]) => void;
  slash: (key: string, query: string | null) => void;
  menuKey: (e: KeyboardEvent) => boolean;
};

/** Le curseur change de bloc tout de suite, dans le même geste : la lettre suivante n'arrive jamais dans le bloc d'avant. */
const focusNow = (editor: Editor, at: "start" | "end" | number) => {
  editor.commands.setTextSelection(at === "start" ? 1 : at === "end" ? editor.state.doc.content.size - 1 : at);
  editor.view.focus();
};

const focusSibling = (dom: Element, direction: -1 | 1) => {
  const all = [...(dom.closest("[data-doc-root]") ?? document).querySelectorAll(".ProseMirror")];
  const next = all[all.indexOf(dom) + direction] as (Element & { editor?: Editor }) | undefined;
  if (!next?.editor) return false;
  focusNow(next.editor, direction < 0 ? "end" : "start");
  return true;
};

function TextLine({ b, handlers, placeholder, wantFocus }: { b: TextBlock; handlers: { current: Handlers }; placeholder: string; wantFocus: { current: { key: string; at: "start" | "end" } | null } }) {
  const k = keyOf(b);
  const draft = "draft" in b && !!b.draft;
  const editor = useEditor({
    extensions: [
      OneParagraph,
      StarterKit.configure({ document: false, heading: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, dropcursor: false, gapcursor: false, link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: draft ? plainOf(b.html) : placeholder }),
      ChartColor,
    ],
    // Un texte provisoire (« À écrire ») se lit comme une invite : on écrit par-dessus, il n'y a rien à effacer
    content: draft ? "" : `<p>${b.html}</p>`,
    // Couper une phrase devant une espace, puis la recoller, ne doit pas coller les deux mots
    parseOptions: { preserveWhitespace: "full" },
    onUpdate: ({ editor: e }) => {
      const html = inner(e.getHTML());
      handlers.current.change(k, html);
      const text = e.getText();
      handlers.current.slash(k, /^\/\S*$/.test(text) ? text.slice(1) : null);
    },
    onFocus: ({ editor: e }) => handlers.current.focus(k, e),
    editorProps: {
      attributes: { class: "cr-text", "aria-label": "Texte" },
      handleKeyDown: (view, e) => {
        if (handlers.current.menuKey(e)) return true;
        if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); handlers.current.enter(k, (view.dom as unknown as { editor: Editor }).editor); return true; }
        if (e.key === "Backspace" && view.state.selection.empty && view.state.selection.from === 1) { e.preventDefault(); handlers.current.backspace(k, (view.dom as unknown as { editor: Editor }).editor); return true; }
        if (e.key === "ArrowUp" && view.endOfTextblock("up")) return focusSibling(view.dom, -1);
        if (e.key === "ArrowDown" && view.endOfTextblock("down")) return focusSibling(view.dom, 1);
        return false;
      },
      handlePaste: (view, e) => {
        const lines = (e.clipboardData?.getData("text/plain") ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) return false;
        e.preventDefault();
        handlers.current.paste(k, (view.dom as unknown as { editor: Editor }).editor, lines);
        return true;
      },
    },
  });
  useLayoutEffect(() => {
    const want = wantFocus.current;
    if (want?.key !== k || !editor) return;
    focusNow(editor, want.at);
    // Retiré juste après : en développement, React remonte le bloc une seconde fois et le curseur doit l'y suivre
    void Promise.resolve().then(() => { if (wantFocus.current === want) wantFocus.current = null; });
  });
  return <EditorContent editor={editor} />;
}

type RowProps = {
  b: CourseBlock; index: number; total: number; number: number; marker?: string; variant: Variant; placeholder: string; focused: boolean; held: boolean;
  handlers: { current: Handlers }; wantFocus: { current: { key: string; at: "start" | "end" } | null };
  act: { current: { set: (key: string, p: Partial<CourseBlock>) => void; move: (key: string, d: number) => void; copy: (key: string) => void; remove: (key: string) => void; open: (key: string) => void; press: (key: string, title: string) => (e: ReactPointerEvent<HTMLElement>) => void } };
};

const Row = memo(function Row({ b, index, total, number, marker, variant, placeholder, focused, held, handlers, wantFocus, act }: RowProps) {
  const k = keyOf(b);
  const titleOf = isText(b) ? plainOf(b.html).slice(0, 80) : b.type;
  return (
    <div className={`cr-block relative rounded-[10px] ${isText(b) ? "px-2 py-1" : "px-2 py-2"}`} style={{ opacity: held ? 0.4 : 1, ...(focused ? { background: "var(--p-hover-soft)" } : {}) }}>
      <div className="cr-gutter">
        <button type="button" aria-label="Insérer un bloc en dessous" className="cr-gut-btn" onClick={() => act.current.open(k)}><Plus size={16} /></button>
        <span role="img" aria-label="Glisser pour déplacer" title="Glisser pour déplacer" className="cr-gut-btn cursor-grab" onPointerDown={act.current.press(k, titleOf)}><GripVertical size={15} /></span>
      </div>
      <div className="cr-float" onMouseDown={(e) => e.preventDefault()}>
        <button type="button" aria-label="Monter le bloc" disabled={index === 0} className="cr-float-btn" onClick={() => act.current.move(k, -1)}><ArrowUp size={14} /></button>
        <button type="button" aria-label="Descendre le bloc" disabled={index === total - 1} className="cr-float-btn" onClick={() => act.current.move(k, 1)}><ArrowDown size={14} /></button>
        <button type="button" aria-label="Dupliquer le bloc" disabled={b.type === "unknown"} className="cr-float-btn" onClick={() => act.current.copy(k)}><Copy size={14} /></button>
        <button type="button" aria-label="Supprimer le bloc" disabled={b.type === "unknown"} className="cr-float-btn p-muted" onClick={() => act.current.remove(k)}><Trash2 size={14} /></button>
      </div>
      {isText(b) ? (
        <div className={b.type === "callout" ? "flex gap-3 items-start rounded-xl p-3.5" : "flex gap-2.5 items-start"} style={b.type === "callout" ? { background: "var(--p-accent-soft)" } : undefined}>
          {b.type === "callout" && <input aria-label="Emoji de l’encadré" className="w-8 text-center text-[20px] bg-transparent border-0 outline-none flex-none" value={b.emoji} maxLength={4} onChange={(e) => act.current.set(k, { emoji: e.target.value })} />}
          {(b.type === "bullet" || b.type === "number" || b.type === "toggle") && (
            marker
              ? <span aria-hidden="true" className="w-5 h-5 flex-none mt-[5px] rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent)" }}>{marker}</span>
              : <span aria-hidden="true" className="flex-none min-w-[18px] text-right mt-[1px] p-muted">{b.type === "number" ? `${number}.` : b.type === "toggle" ? <ChevronRight size={16} className="inline mt-1" /> : "•"}</span>
          )}
          {/* Le style suit le type du bloc : il peut changer pendant qu'on écrit, sans perdre le curseur */}
          <div className={`flex-1 min-w-0 cr-k-${b.type} ${variant === "defi" ? "cr-defi" : ""} ${"draft" in b && b.draft ? "cr-always" : ""}`}><TextLine b={b} handlers={handlers} placeholder={placeholder} wantFocus={wantFocus} /></div>
        </div>
      ) : <MediaFields b={b} set={(p) => act.current.set(k, p)} />}
      {"children" in b && !!b.children?.length && <span className="block text-[12px] p-muted mt-1">Contient {b.children.length} sous-élément{b.children.length > 1 ? "s" : ""}, à modifier dans Notion.</span>}
    </div>
  );
});

/* ───────────── Les blocs d'une rubrique ───────────── */

type Props = { blocks: CourseBlock[]; onChange: (b: CourseBlock[]) => void; label: string; marker?: string; addLabel?: string; addKind?: TextKind; placeholder?: string; variant?: Variant; emptyHeight?: boolean };

/**
 * Écrire comme dans un document : Entrée crée le bloc suivant, Retour arrière recolle au précédent, les flèches passent d'un bloc à l'autre,
 * « / » ouvre le menu. Chaque bloc reste un bloc Notion : rien de ce que Notion contient ne change de forme.
 */
export function BlockEditor({ blocks, onChange, label, marker, addLabel, addKind = "paragraph", placeholder = "Écrivez, ou tapez « / » pour insérer un bloc…", variant = "document", emptyHeight }: Props) {
  const doc = useContext(DocContext);
  const wrap = useRef<HTMLDivElement>(null);
  const wantFocus = useRef<{ key: string; at: "start" | "end" } | null>(null);
  const live = useRef(blocks);
  live.current = blocks;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const apply = useCallback((fn: (list: CourseBlock[]) => CourseBlock[]) => { const next = fn(live.current); live.current = next; onChangeRef.current(next); }, []);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ key: string | null; query: string; index: number; slash: boolean } | null>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const editorOf = (key: string) => (wrap.current?.querySelector(`[data-block-key="${key}"] .ProseMirror`) as (Element & { editor?: Editor }) | null)?.editor;

  const insertAfter = (key: string | null, made: CourseBlock[], focus = true) => {
    const first = made.find(isText);
    if (focus && first) wantFocus.current = { key: keyOf(first), at: "start" };
    // Le nouveau bloc existe avant la fin du geste : on y écrit sans attendre
    flushSync(() => apply((list) => { const at = key ? list.findIndex((b) => keyOf(b) === key) + 1 : list.length; const out = [...list]; out.splice(at, 0, ...made); return out; }));
  };
  const setKind = (key: string, kind: TextKind) => {
    apply((list) => list.map((b) => (keyOf(b) === key && isText(b) ? convert(b, kind) : b)));
    const ed = editorOf(key);
    if (ed && !ed.view.hasFocus()) ed.view.focus();
  };

  const pick = (insert: Insert) => {
    const m = menuRef.current;
    setMenu(null);
    if (!m) return;
    const key = m.key;
    if (m.slash && key) {
      const ed = editorOf(key);
      ed?.commands.clearContent(true);
      const current = live.current.find((b) => keyOf(b) === key);
      if ("kind" in insert && current && isText(current)) return setKind(key, insert.kind);
      const made = makeFrom(insert);
      flushSync(() => apply((list) => list.map((b) => (keyOf(b) === key ? made : b))));
      (wrap.current?.querySelector(`[data-block-key="${keyOf(made)}"] input`) as HTMLInputElement | null)?.focus();
      return;
    }
    insertAfter(key, [makeFrom(insert)]);
  };

  // Les gestes passent par une référence : les lignes ne se redessinent pas à chaque frappe
  const handlers = useRef<Handlers>(null as unknown as Handlers);
  handlers.current = {
    change: (key, html) => apply((list) => list.map((b) => (keyOf(b) === key && isText(b) ? ({ ...b, html, draft: false } as CourseBlock) : b))),
    focus: (key, editor) => {
      setFocusKey(key);
      const b = live.current.find((x) => keyOf(x) === key);
      if (b) doc?.setActive({ editor, type: b.type, setKind: (kind) => setKind(key, kind) });
    },
    enter: (key, editor) => {
      if (menuRef.current) return;
      const b = live.current.find((x) => keyOf(x) === key);
      if (!b || !isText(b)) return;
      const blank = emptyOf(inner(editor.getHTML()));
      if (blank && b.type !== "paragraph" && b.type !== addKind) return setKind(key, "paragraph");
      if (blank && b.type === addKind && b.type !== "paragraph") return; // une question vide ne s'en crée pas une autre
      const { state } = editor;
      if (!state.selection.empty) editor.commands.deleteSelection();
      const from = editor.state.selection.from;
      const end = editor.state.doc.content.size - 1;
      const tail = from < end ? getHTMLFromFragment(editor.state.doc.slice(from, end).content, editor.schema) : "";
      if (from < end) editor.commands.deleteRange({ from, to: end });
      const kind: TextKind = b.type === "bullet" || b.type === "number" ? b.type : addKind;
      insertAfter(key, [makeText(kind, tail)]);
    },
    backspace: (key, editor) => {
      const list = live.current;
      const i = list.findIndex((x) => keyOf(x) === key);
      const b = list[i];
      if (!b || !isText(b)) return;
      if (b.type !== "paragraph" && b.type !== addKind) return setKind(key, "paragraph");
      const html = inner(editor.getHTML());
      const prev = list[i - 1];
      const prevEditor = prev && isText(prev) ? editorOf(keyOf(prev)) : undefined;
      if (prevEditor) {
        const join = prevEditor.state.doc.content.size - 1;
        if (!emptyOf(html)) prevEditor.commands.insertContentAt(join, html, { parseOptions: { preserveWhitespace: "full" } });
        focusNow(prevEditor, join);
        apply((l) => l.filter((x) => keyOf(x) !== key));
      } else if (emptyOf(html) && !(b as { draft?: boolean }).draft) {
        focusSibling(editor.view.dom, -1);
        apply((l) => l.filter((x) => keyOf(x) !== key));
      }
    },
    paste: (key, editor, lines) => {
      const b = live.current.find((x) => keyOf(x) === key);
      if (!b || !isText(b)) return;
      editor.commands.insertContent({ type: "text", text: lines[0].replace(/^[-•*]\s+/, "") });
      const kind: TextKind = b.type === "bullet" || b.type === "number" ? b.type : addKind;
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      insertAfter(key, lines.slice(1).map((l) => (/^[-•*]\s+/.test(l) ? makeText("bullet", esc(l.replace(/^[-•*]\s+/, ""))) : /^\d+[.)]\s+/.test(l) ? makeText("number", esc(l.replace(/^\d+[.)]\s+/, ""))) : makeText(kind, esc(l)))), false);
    },
    slash: (key, query) => {
      if (query === null) { if (menuRef.current?.slash) setMenu(null); return; }
      if (!matches(query).length) return setMenu(null);
      setMenu({ key, query, index: 0, slash: true });
    },
    menuKey: (e) => {
      const m = menuRef.current;
      if (!m) return false;
      const list = matches(m.query);
      if (e.key === "Escape") { setMenu(null); return true; }
      if (e.key === "ArrowDown") { setMenu({ ...m, index: (m.index + 1) % list.length }); return true; }
      if (e.key === "ArrowUp") { setMenu({ ...m, index: (m.index - 1 + list.length) % list.length }); return true; }
      if (e.key === "Enter") { const item = list[m.index]; if (item) pick(item.insert); return true; }
      return false;
    },
  };

  // Le glissement, comme sur le plan de la formation : clic tenu, quatre pixels, et le bloc suit le curseur
  const [drag, setDrag] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const grabbed = useRef({ title: "", width: 0 });
  const ghost = useRef<HTMLDivElement>(null);
  const dropNow = useRef<number | null>(null);

  const act = useRef<RowProps["act"]["current"]>(null as unknown as RowProps["act"]["current"]);
  act.current = {
    set: (key, p) => apply((list) => list.map((b) => (keyOf(b) === key ? ({ ...b, ...p } as CourseBlock) : b))),
    move: (key, d) => apply((list) => { const i = list.findIndex((b) => keyOf(b) === key); const out = [...list]; const [x] = out.splice(i, 1); out.splice(i + d, 0, x); return out; }),
    copy: (key) => { const b = live.current.find((x) => keyOf(x) === key); if (b) { const { key: _k, ...rest } = b as CourseBlock & { key?: string }; insertAfter(key, [{ ...rest, id: newId() } as CourseBlock], false); } },
    remove: (key) => {
      // Supprimer la ligne où l'on écrit : le curseur passe à sa voisine, on continue d'écrire
      const ed = editorOf(key);
      if (ed?.view.hasFocus() && !focusSibling(ed.view.dom, -1)) focusSibling(ed.view.dom, 1);
      apply((list) => list.filter((b) => keyOf(b) !== key));
    },
    open: (key) => setMenu((m) => (m?.key === key && !m.slash ? null : { key, query: "", index: 0, slash: false })),
    press: (key, title) => (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const width = (e.currentTarget.closest("[data-block-key]") as HTMLElement).getBoundingClientRect().width;
      const { clientX: x0, clientY: y0 } = e;
      const stop = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", stop); };
      const onMove = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        stop();
        pointer.current = { x: ev.clientX, y: ev.clientY };
        grabbed.current = { title: title || "Bloc", width };
        flushSync(() => setDrag(key));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", stop);
    },
  };

  useEffect(() => {
    if (!drag) return;
    const middle = (el: Element) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const locate = () => {
      const { x, y } = pointer.current;
      if (ghost.current) ghost.current.style.transform = `translate3d(${x - 20}px, ${y - 20}px, 0)`;
      const rows = [...(wrap.current?.querySelectorAll(":scope > [data-block-key]") ?? [])];
      const next = rows.filter((r) => y > middle(r)).length;
      if (next !== dropNow.current) { dropNow.current = next; setDropAt(next); }
    };
    const onMove = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; locate(); };
    const stop = () => { dropNow.current = null; setDrag(null); setDropAt(null); };
    const onUp = (e: PointerEvent) => {
      onMove(e);
      const to = dropNow.current;
      if (to !== null) apply((list) => { const from = list.findIndex((b) => keyOf(b) === drag); const at = to > from ? to - 1 : to; if (at === from) return list; const out = [...list]; const [x] = out.splice(from, 1); out.splice(at, 0, x); return out; });
      stop();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
    let frame = 0;
    const scroll = () => {
      const y = pointer.current.y;
      const zone = 90;
      const speed = y < zone ? (y - zone) / 5 : y > window.innerHeight - zone ? (y - window.innerHeight + zone) / 5 : 0;
      if (speed) { window.scrollBy(0, speed); locate(); }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    document.documentElement.classList.add("p-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", onKey);
    locate();
    return () => {
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove("p-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", onKey);
    };
  }, [drag, apply]);

  // Une seule ligne est marquée dans la page, et la barre connaît toujours le type du bloc où l'on écrit
  useEffect(() => {
    if (!doc) return;
    if (doc.active?.editor.isDestroyed) { doc.setActive(null); return setFocusKey(null); }
    if (!doc.active || !wrap.current?.contains(doc.active.editor.view.dom)) return setFocusKey(null);
    const b = blocks.find((x) => keyOf(x) === focusKey);
    if (b && b.type !== doc.active.type) doc.setActive({ ...doc.active, type: b.type });
  }, [doc, doc?.active, blocks, focusKey]);
  // Le menu se referme quand on clique ailleurs
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as globalThis.Node)) setMenu(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  const add = () => {
    const last = live.current[live.current.length - 1];
    const lastEditor = last && isText(last) && emptyOf(last.html) && !(last as { draft?: boolean }).draft ? editorOf(keyOf(last)) : undefined;
    if (lastEditor) return focusNow(lastEditor, "end");
    insertAfter(last ? keyOf(last) : null, [makeText(addKind)]);
  };
  const numbers = useMemo(() => { let n = 0; return blocks.map((b) => { n = b.type === "number" ? n + 1 : 0; return n; }); }, [blocks]);

  return (
    <div className="flex flex-col" aria-label={label} role="group">
      <div ref={wrap} className={`flex flex-col gap-1 relative ${emptyHeight ? "cr-writing" : ""}`} onDragStart={(e) => e.preventDefault()} onClick={(e) => { if (e.target === e.currentTarget) add(); }}>
        {blocks.map((b, i) => (
          <div key={keyOf(b)} data-block-key={keyOf(b)} className="relative">
            {drag && dropAt === i && <Marker edge="top" />}
            {drag && dropAt === blocks.length && i === blocks.length - 1 && <Marker edge="bottom" />}
            <Row b={b} index={i} total={blocks.length} number={numbers[i]} marker={b.type === "bullet" || b.type === "number" ? marker : undefined} variant={variant} placeholder={placeholder} focused={focusKey === keyOf(b)} held={drag === keyOf(b)} handlers={handlers} wantFocus={wantFocus} act={act} />
            {menu?.key === keyOf(b) && <InsertMenu query={menu.query} index={menu.index} onPick={pick} />}
          </div>
        ))}
      </div>
      <button type="button" className="cr-add" onClick={add}><Plus size={15} /> {addLabel ?? "Cliquez ou tapez « / » pour ajouter un bloc"}</button>
      {drag && createPortal(
        <div ref={ghost} aria-hidden="true" className="p-card fixed left-0 top-0 z-[60] flex items-center gap-2 px-3 py-2.5 text-[14px] font-medium pointer-events-none" style={{ width: Math.min(grabbed.current.width, 480), boxShadow: "0 12px 32px rgba(0, 0, 0, .18)", transform: `translate3d(${pointer.current.x - 20}px, ${pointer.current.y - 20}px, 0)` }}>
          <GripVertical size={16} className="flex-none p-muted" /><span className="truncate">{grabbed.current.title}</span>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Marker({ edge }: { edge: "top" | "bottom" }) {
  return (
    <div aria-hidden="true" className="absolute left-0 right-0 z-20 h-3 flex items-center pointer-events-none" style={{ [edge]: -7 }}>
      <span className="w-3 h-3 rounded-full flex-none" style={{ background: "var(--p-accent)" }} />
      <span className="flex-1 h-[3px]" style={{ background: "var(--p-accent)" }} />
    </div>
  );
}

/** Choisir des hashtags dans la liste de la communauté. */
export function HashtagPicker({ all, value, onChange }: { all: { id: number; name: string }[]; value: number[]; onChange: (ids: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hashtags">
      {all.length === 0 && <span className="text-[13px] p-muted">La liste de la communauté est vide.</span>}
      {all.map((t) => { const on = value.includes(t.id); return <button key={t.id} type="button" aria-pressed={on} className="rounded-md border px-2 py-[3px] text-[12px] font-medium" style={on ? { background: "var(--p-accent-soft)", borderColor: "var(--p-accent-soft)", color: "var(--p-accent)" } : { background: "var(--p-surface)", borderColor: "var(--p-line)", color: "var(--p-ink-2)" }} onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}>#{t.name}</button>; })}
    </div>
  );
}
