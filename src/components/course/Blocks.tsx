import { Download, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { VideoEmbed } from "@/components/VideoEmbed";
import type { CourseBlock } from "../../../server/lib/courseBlocks";

/** Le texte vient du serveur : converti depuis Notion ou nettoyé à l'enregistrement. */
const Html = ({ html, as: Tag = "span" }: { html: string; as?: "span" | "p" | "li" | "h3" | "blockquote" | "summary" }) => <Tag dangerouslySetInnerHTML={{ __html: html }} />;

function Kids({ block }: { block: CourseBlock }) {
  return "children" in block && block.children?.length ? <BlockList blocks={block.children} nested /> : null;
}

function One({ b }: { b: CourseBlock }) {
  switch (b.type) {
    case "paragraph": return <><Html as="p" html={b.html} /><Kids block={b} /></>;
    case "heading": return <Html as="h3" html={b.html} />;
    case "quote": return <blockquote><span dangerouslySetInnerHTML={{ __html: b.html }} /><Kids block={b} /></blockquote>;
    case "callout": return <div className="not-prose flex gap-3 p-4 rounded-2xl" style={{ background: "var(--p-surface-2)" }}>{b.emoji && <span className="text-[20px] leading-tight flex-none" aria-hidden="true">{b.emoji}</span>}<div className="min-w-0 flex-1"><span dangerouslySetInnerHTML={{ __html: b.html }} /><Kids block={b} /></div></div>;
    case "toggle": return <details className="p-3 rounded-2xl border" style={{ borderColor: "var(--p-line)" }}><summary className="cursor-pointer font-medium"><span dangerouslySetInnerHTML={{ __html: b.html }} /></summary><div className="mt-2"><Kids block={b} /></div></details>;
    case "divider": return <hr />;
    case "image": return <figure className="m-0"><img src={b.url} alt={b.caption} loading="lazy" />{b.caption && <figcaption className="text-[13.5px] p-muted mt-1.5">{b.caption}</figcaption>}</figure>;
    case "video": return <figure className="m-0"><VideoEmbed url={b.url} title={b.caption || "Vidéo"} />{b.caption && <figcaption className="text-[13.5px] p-muted mt-1.5">{b.caption}</figcaption>}</figure>;
    case "file": return <a href={b.url} target="_blank" rel="noopener noreferrer" className="p-btn-outline p-btn-sm no-underline inline-flex" style={{ color: "var(--p-ink)" }}><Download size={15} /> {b.name}</a>;
    case "link": return <a href={b.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3.5 rounded-2xl border no-underline" style={{ borderColor: "var(--p-line)", color: "var(--p-ink)" }}><ExternalLink size={16} className="flex-none" style={{ color: "var(--p-accent-text)" }} /><span className="min-w-0 flex-1 break-words font-medium">{b.title || b.url}</span></a>;
    default: return null;
  }
}

/** Affiche une liste de blocs : les puces et listes numérotées qui se suivent sont regroupées. */
export function BlockList({ blocks, nested }: { blocks: CourseBlock[]; nested?: boolean }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "bullet" || b.type === "number") {
      const items: CourseBlock[] = [];
      while (i < blocks.length && blocks[i].type === b.type) items.push(blocks[i++]);
      i--;
      const lis = items.map((it) => <li key={it.id}><span dangerouslySetInnerHTML={{ __html: "html" in it ? it.html : "" }} /><Kids block={it} /></li>);
      out.push(b.type === "bullet" ? <ul key={b.id}>{lis}</ul> : <ol key={b.id}>{lis}</ol>);
    } else out.push(<One key={b.id} b={b} />);
  }
  return nested ? <div className="p-rich mt-2">{out}</div> : <div className="p-rich">{out}</div>;
}
