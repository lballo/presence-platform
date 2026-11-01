import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ArrowDown, ArrowUp, Bold, FileUp, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Minus, Quote, Smile, Trash2, Type, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { EmojiGrid } from "@/components/forum/EmojiGrid";
import { ToolButton } from "@/components/forum/RichEditor";
import { VideoEmbed } from "@/components/VideoEmbed";
import { useUpload } from "@/lib/upload";
import type { CourseBlock } from "../../../../server/lib/courseBlocks";

let counter = 0;
const newId = () => `tmp${Date.now().toString(36)}${counter++}`;
const hasHtml = (b: CourseBlock): b is Extract<CourseBlock, { html: string }> => "html" in b;

/** Une ligne vide enregistrée redevient un vrai paragraphe : on écrit comme dans un document. */
const asParagraphs = (html: string) => (/<br\s*\/?>\s*<br\s*\/?>/i.test(html) ? `<p>${html.replace(/(<br\s*\/?>\s*){2,}/gi, "</p><p>")}</p>` : html);

/** La hauteur de la zone d'écriture : le contenu d'une leçon se rédige au large, le reste tient en moins de place. */
function writingHeight(type: CourseBlock["type"], large?: boolean) {
  if (type === "heading") return "min-h-[52px]";
  if (type === "bullet" || type === "number") return "min-h-[72px]";
  return large ? "min-h-[280px] lg:min-h-[380px]" : "min-h-[120px]";
}

/** Le texte mis en forme d'un bloc : gras, italique, lien, emoji. Une seule zone de saisie ouverte à la fois. */
function InlineEditor({ value, onChange, label, height }: { value: string; onChange: (html: string) => void; label: string; height: string }) {
  const [emoji, setEmoji] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, listItem: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, link: { openOnClick: false } }),
      Placeholder.configure({ placeholder: "Écrivez ici…" }),
    ],
    content: asParagraphs(value),
    autofocus: "end",
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
    editorProps: { attributes: { class: `p-rich p-editor ${height} px-4 py-3.5`, "aria-label": label } },
  });
  if (!editor) return null;
  const applyLink = () => {
    const raw = (link ?? "").trim();
    if (raw) editor.chain().focus().extendMarkRange("link").setLink({ href: /^(https?:\/\/|mailto:)/i.test(raw) ? raw : `https://${raw}` }).run();
    else editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLink(null);
  };
  return (
    <div className="rounded-xl border" style={{ borderColor: "var(--p-accent-line)", background: "var(--p-surface)" }}>
      {/* La barre reste en haut de l'écran dans un long texte */}
      <div role="toolbar" aria-label="Mise en forme" className="sticky top-14 lg:top-0 z-10 flex items-center gap-0.5 px-1.5 py-1 border-b rounded-t-xl" style={{ borderColor: "var(--p-line)", background: "var(--p-surface)" }}>
        <ToolButton label="Gras" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolButton>
        <ToolButton label="Italique" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolButton>
        <ToolButton label="Lien" active={editor.isActive("link") || link !== null} onClick={() => setLink(link === null ? (editor.getAttributes("link").href ?? "") : null)}><Link2 size={16} /></ToolButton>
        <ToolButton label="Emoji" active={emoji} onClick={() => setEmoji(!emoji)}><Smile size={16} /></ToolButton>
      </div>
      {link !== null && <form className="flex gap-2 px-2 pt-2" onSubmit={(e) => { e.preventDefault(); applyLink(); }}><input className="p-field h-9 py-0 flex-1 text-[14px]" autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" aria-label="Adresse du lien" /><button type="submit" className="p-btn-primary p-btn-sm h-9">{link.trim() ? "Ajouter" : "Retirer"}</button></form>}
      {emoji && <div className="px-2 pt-1 max-h-[150px] overflow-y-auto"><EmojiGrid onPick={(x) => editor.chain().focus().insertContent(x).run()} /></div>}
      <EditorContent editor={editor} />
    </div>
  );
}

const KIND_LABEL: Partial<Record<CourseBlock["type"], string>> = { paragraph: "Texte", bullet: "Puce", number: "Liste numérotée", quote: "Citation", heading: "Intertitre", callout: "Encadré", toggle: "Repli", image: "Image", video: "Vidéo", file: "Fichier", link: "Lien externe", divider: "Séparateur" };

/** Envoi d'un fichier depuis Construire : il rejoint notre stockage, Notion reçoit son adresse. */
function FilePick({ kind, accept, maxMb, label, onDone }: { kind: "courseImage" | "courseVideo" | "courseFile"; accept: string; maxMb: number; label: string; onDone: (url: string, name: string) => void }) {
  const up = useUpload(kind);
  const pick = async (file?: File) => {
    if (!file) return;
    if (file.size > maxMb * 1048576) return void toast.error(`Le fichier dépasse ${maxMb} Mo.`);
    try { const r = await up.upload(file); if (r.publicUrl) onDone(r.publicUrl, file.name); } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); }
  };
  return <label className="p-btn-outline p-btn-sm cursor-pointer"><input type="file" accept={accept} className="hidden" aria-label={label} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} /><Upload size={14} /> {up.busy ? `Envoi… ${up.progress ?? 0} %` : label}</label>;
}

function BlockFields({ b, set }: { b: CourseBlock; set: (p: Partial<CourseBlock>) => void }) {
  switch (b.type) {
    case "image": return (
      <div className="flex flex-col gap-2">
        {b.url && <img src={b.url} alt="" className="max-h-[220px] w-auto rounded-xl self-start" />}
        <div className="flex flex-wrap items-center gap-2"><FilePick kind="courseImage" accept="image/jpeg,image/png,image/webp,image/gif" maxMb={10} label={b.url ? "Changer l’image" : "Importer une image"} onDone={(url) => set({ url })} /><input className="p-field h-10 py-0 flex-[1_1_220px] text-[14px]" value={b.url} onChange={(e) => set({ url: e.target.value })} placeholder="ou l’adresse d’une image (https://…)" aria-label="Adresse de l’image" /></div>
        <input className="p-field h-10 py-0 text-[14px]" value={b.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Légende (facultative)" aria-label="Légende" />
      </div>
    );
    case "video": return (
      <div className="flex flex-col gap-2">
        {b.url && /^https?:/.test(b.url) && <div className="max-w-[420px]"><VideoEmbed url={b.url} title="Vidéo" /></div>}
        <div className="flex flex-wrap items-center gap-2"><FilePick kind="courseVideo" accept="video/mp4,video/quicktime,video/webm" maxMb={500} label="Importer une vidéo" onDone={(url) => set({ url })} /><input className="p-field h-10 py-0 flex-[1_1_220px] text-[14px]" value={b.url} onChange={(e) => set({ url: e.target.value })} placeholder="ou un lien YouTube, Vimeo, Loom…" aria-label="Lien de la vidéo" /></div>
        <input className="p-field h-10 py-0 text-[14px]" value={b.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Légende (facultative)" aria-label="Légende" />
      </div>
    );
    case "file": return <div className="flex flex-wrap items-center gap-2"><FilePick kind="courseFile" accept="*/*" maxMb={50} label={b.url ? "Changer le fichier" : "Importer un fichier"} onDone={(url, name) => set({ url, name })} /><input className="p-field h-10 py-0 flex-[1_1_220px] text-[14px]" value={b.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nom affiché" aria-label="Nom du fichier" /></div>;
    case "link": return <div className="flex flex-col gap-2"><input className="p-field h-10 py-0 text-[14px]" value={b.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" aria-label="Adresse du lien" /><input className="p-field h-10 py-0 text-[14px]" value={b.title} onChange={(e) => set({ title: e.target.value })} placeholder="Texte affiché" aria-label="Texte du lien" /></div>;
    case "divider": return <hr className="my-2" style={{ borderColor: "var(--p-line-2)" }} />;
    case "unknown": return <p className="m-0 text-[13.5px] p-muted">Bloc Notion de type « {b.notionType} » : les membres ne le voient pas. Il reste tel quel dans Notion.</p>;
    default: return null;
  }
}

/** Les blocs d'une section : ajouter, modifier, déplacer, retirer. */
export function BlockEditor({ blocks, onChange, questions, label, large }: { blocks: CourseBlock[]; onChange: (b: CourseBlock[]) => void; questions?: boolean; label: string; large?: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const update = (id: string, patch: Partial<CourseBlock>) => onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as CourseBlock) : b)));
  const remove = (id: string) => onChange(blocks.filter((b) => b.id !== id));
  const move = (i: number, d: number) => { const to = [...blocks]; const [b] = to.splice(i, 1); to.splice(i + d, 0, b); onChange(to); };
  const add = (b: CourseBlock) => { onChange([...blocks, b]); if ("html" in b) setActive(b.id); };
  // Cliquer ailleurs referme la zone de saisie
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setActive(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  return (
    <div className="flex flex-col gap-2" ref={wrap} aria-label={label}>
      {blocks.length === 0 && (large
        ? <button type="button" className="text-left text-[16px] p-faint rounded-xl border p-4 min-h-[280px] lg:min-h-[380px] w-full cursor-text" style={{ borderColor: "var(--p-line-2)" }} onClick={() => add({ id: newId(), type: "paragraph", html: "" })}>Cliquez pour écrire le contenu de la leçon…</button>
        : <p className="m-0 text-[14px] p-muted">Rien pour l’instant.</p>)}
      {blocks.map((b, i) => (
        <div key={b.id} className="group flex gap-2 items-start p-2 rounded-xl border" style={{ borderColor: "var(--p-line)" }}>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] p-faint">
              {questions && (b.type === "bullet" || b.type === "number") ? "Question" : (KIND_LABEL[b.type] ?? "Bloc Notion")}
              {"draft" in b && b.draft && <span className="normal-case tracking-normal font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(176, 134, 60, .14)", color: "var(--p-gold)" }}>Texte provisoire, caché aux membres</span>}
            </span>
            {hasHtml(b) ? (
              active === b.id
                // Un texte provisoire (« À écrire ») s'efface à l'ouverture : on commence sur une page blanche
                ? <InlineEditor value={"draft" in b && b.draft ? "" : b.html} height={writingHeight(b.type, large)} label={KIND_LABEL[b.type] ?? "Texte"} onChange={(html) => update(b.id, { html, draft: false } as Partial<CourseBlock>)} />
                // Seul ou encore vide, le bloc garde sa hauteur d'écriture ; parmi d'autres paragraphes déjà écrits, il se lit à sa taille
                : <button type="button" className={`text-left p-rich text-[16px] w-full rounded-lg px-1 cursor-text hover:bg-black/5 dark:hover:bg-white/5 ${large && b.type === "paragraph" && (blocks.length === 1 || !b.html || ("draft" in b && b.draft)) ? "min-h-[280px] lg:min-h-[380px] block" : "min-h-[28px]"}`} onClick={() => setActive(b.id)} aria-label={`Modifier : ${KIND_LABEL[b.type]}`}>{b.html ? <span dangerouslySetInnerHTML={{ __html: b.html }} /> : <span className="p-faint">Cliquez pour écrire…</span>}</button>
            ) : <BlockFields b={b} set={(p) => update(b.id, p)} />}
            {"children" in b && !!b.children?.length && <span className="text-[12.5px] p-faint">Contient {b.children.length} sous-élément{b.children.length > 1 ? "s" : ""}, à modifier dans Notion.</span>}
          </div>
          <span className="flex flex-col flex-none">
            <button type="button" aria-label="Monter" disabled={i === 0} className="w-8 h-8 flex items-center justify-center rounded-lg p-muted disabled:opacity-30" onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
            <button type="button" aria-label="Descendre" disabled={i === blocks.length - 1} className="w-8 h-8 flex items-center justify-center rounded-lg p-muted disabled:opacity-30" onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
            {b.type !== "unknown" && <button type="button" aria-label="Retirer" className="w-8 h-8 flex items-center justify-center rounded-lg p-muted" onClick={() => remove(b.id)}><Trash2 size={15} /></button>}
          </span>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label={`Ajouter à : ${label}`}>
        {questions && <AddButton icon={<List size={14} />} text="Question" onClick={() => add({ id: newId(), type: "bullet", html: "" })} />}
        <AddButton icon={<Type size={14} />} text="Texte" onClick={() => add({ id: newId(), type: "paragraph", html: "" })} />
        <AddButton icon={<Heading3 size={14} />} text="Intertitre" onClick={() => add({ id: newId(), type: "heading", level: 3, html: "" })} />
        {!questions && <AddButton icon={<List size={14} />} text="Puce" onClick={() => add({ id: newId(), type: "bullet", html: "" })} />}
        <AddButton icon={<ListOrdered size={14} />} text="Numéro" onClick={() => add({ id: newId(), type: "number", html: "" })} />
        <AddButton icon={<Quote size={14} />} text="Citation" onClick={() => add({ id: newId(), type: "quote", html: "" })} />
        <AddButton icon={<ImageIcon size={14} />} text="Image" onClick={() => add({ id: newId(), type: "image", url: "", caption: "" })} />
        <AddButton icon={<Video size={14} />} text="Vidéo" onClick={() => add({ id: newId(), type: "video", url: "", caption: "" })} />
        <AddButton icon={<Link2 size={14} />} text="Lien" onClick={() => add({ id: newId(), type: "link", url: "", title: "" })} />
        <AddButton icon={<FileUp size={14} />} text="Fichier" onClick={() => add({ id: newId(), type: "file", url: "", name: "" })} />
        <AddButton icon={<Minus size={14} />} text="Séparateur" onClick={() => add({ id: newId(), type: "divider" })} />
      </div>
    </div>
  );
}

function AddButton({ icon, text, onClick }: { icon: React.ReactNode; text: string; onClick: () => void }) {
  return <button type="button" className="p-chip h-8 text-[12.5px]" onClick={onClick}>{icon} {text}</button>;
}

/** Choisir des hashtags dans la liste de la communauté. */
export function HashtagPicker({ all, value, onChange }: { all: { id: number; name: string }[]; value: number[]; onChange: (ids: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hashtags">
      {all.length === 0 && <span className="text-[13.5px] p-muted">La liste de la communauté est vide.</span>}
      {all.map((t) => { const on = value.includes(t.id); return <button key={t.id} type="button" aria-pressed={on} className={`p-chip h-8 text-[13px] ${on ? "p-chip-on" : ""}`} onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}>#{t.name}</button>; })}
    </div>
  );
}
