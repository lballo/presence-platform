import { useRef, useState, type ReactNode } from "react";
import { useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Heading2, Image as ImageIcon, Italic, Link2, List, ListOrdered, Quote, Smile } from "lucide-react";
import { EmojiGrid } from "./EmojiGrid";

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export type ToolPanel = "tags" | "video" | "voice" | "link" | "emoji" | null;

/** Bouton de la barre d'outils. */
export function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active} disabled={disabled} className="w-9 h-9 flex-none rounded-lg flex items-center justify-center disabled:opacity-40 hover:bg-black/5 dark:hover:bg-white/10" style={active ? { background: "var(--p-accent-soft)", color: "var(--p-accent-text)" } : { color: "var(--p-ink-2)" }} onClick={onClick}>{children}</button>;
}

/** L'éditeur du texte mis en forme : son contenu s'affiche dans la fenêtre, sa barre d'outils en bas. */
export function useRichEditor({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (html: string) => void }) {
  return useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" } },
      }),
      Image,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onCreate: ({ editor: e }) => { e.commands.setTextSelection(e.state.doc.content.size); }, // on écrit à la suite d'un brouillon repris
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
    editorProps: { attributes: { class: "p-rich p-editor", "aria-label": "Texte de la publication" } },
  });
}

/**
 * Barre d'outils : les médias d'abord, la mise en forme ensuite.
 * « start » et « end » viennent de la fenêtre de publication (hashtags, pièce jointe, vidéo, note vocale).
 */
export function EditorToolbar({ editor, panel, setPanel, uploadImage, start, end }: {
  editor: Editor;
  panel: ToolPanel;
  setPanel: (p: ToolPanel) => void;
  uploadImage: (file: File) => Promise<string | null>;
  start?: ReactNode;
  end?: ReactNode;
}) {
  const [link, setLink] = useState({ url: "", label: "", onText: false });
  const imageInput = useRef<HTMLInputElement>(null);
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ bold: e.isActive("bold"), italic: e.isActive("italic"), h2: e.isActive("heading", { level: 2 }), ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), quote: e.isActive("blockquote"), link: e.isActive("link") }),
  });

  const openLink = () => {
    if (panel === "link") return setPanel(null);
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to).trim();
    setLink({ url: editor.getAttributes("link").href ?? "", label: "", onText: !!selected || editor.isActive("link") });
    setPanel("link");
  };
  const applyLink = () => {
    const raw = link.url.trim();
    if (!raw) {
      if (link.onText) editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setPanel(null);
      return;
    }
    const href = /^(https?:\/\/|mailto:)/i.test(raw) ? raw : `https://${raw}`;
    if (link.onText) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    else editor.chain().focus().insertContentAt(editor.state.selection.to, { type: "text", text: link.label.trim() || raw, marks: [{ type: "link", attrs: { href } }] }).run();
    setPanel(null);
  };
  const pickImage = async (file?: File) => {
    if (!file) return;
    const url = await uploadImage(file);
    if (!url) return;
    editor.chain().focus().setImage({ src: url, alt: "" }).run();
    editor.commands.setTextSelection(editor.state.selection.to + 1); // le curseur passe sous l'image
  };

  return (
    <>
      {panel === "link" && (
        <form className="flex flex-wrap gap-2 px-4 sm:px-6 py-3 border-b" style={{ borderColor: "var(--p-line)" }} onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
          <input className="p-field flex-[2_1_220px]" value={link.url} autoFocus onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://…" aria-label="Adresse du lien" />
          {!link.onText && <input className="p-field flex-[1_1_160px]" value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} placeholder="Texte affiché (facultatif)" aria-label="Texte du lien" />}
          <button type="submit" className="p-btn-primary p-btn-sm h-[46px]">{link.url.trim() || !link.onText ? "Ajouter le lien" : "Retirer le lien"}</button>
        </form>
      )}
      {panel === "emoji" && <div className="px-4 sm:px-6 py-2 border-b max-h-[190px] overflow-y-auto" style={{ borderColor: "var(--p-line)" }}><EmojiGrid onPick={(e) => editor.chain().focus().insertContent(e).run()} /></div>}
      <div role="toolbar" aria-label="Médias et mise en forme" className="flex flex-wrap items-center gap-0.5 px-3 sm:px-5 py-1.5">
        {start}
        <ToolButton label="Image" onClick={() => imageInput.current?.click()}><ImageIcon size={18} /></ToolButton>
        <ToolButton label="Lien externe" active={active.link || panel === "link"} onClick={openLink}><Link2 size={18} /></ToolButton>
        <ToolButton label="Emoji" active={panel === "emoji"} onClick={() => setPanel(panel === "emoji" ? null : "emoji")}><Smile size={18} /></ToolButton>
        {end}
        <span className="w-px h-6 mx-1.5 flex-none" style={{ background: "var(--p-line-2)" }} />
        <ToolButton label="Gras" active={active.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={17} /></ToolButton>
        <ToolButton label="Italique" active={active.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={17} /></ToolButton>
        <ToolButton label="Intertitre" active={active.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={18} /></ToolButton>
        <ToolButton label="Liste à puces" active={active.ul} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={18} /></ToolButton>
        <ToolButton label="Liste numérotée" active={active.ol} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={18} /></ToolButton>
        <ToolButton label="Citation" active={active.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={17} /></ToolButton>
        <input ref={imageInput} type="file" accept={IMAGE_ACCEPT} className="hidden" aria-label="Choisir une image à insérer" onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </>
  );
}
