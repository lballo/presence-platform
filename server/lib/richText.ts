import sanitizeHtml from "sanitize-html";
import { env } from "./env";

/** Une image du forum : uniquement celles chargées dans notre stockage, jamais une image externe (pixel de suivi). */
export const isForumImage = (url: string) => url.startsWith(`${env.supabaseUrl}/storage/v1/object/public/forum-images/`) && !url.includes("..");

/**
 * Le texte mis en forme vient du navigateur : seul ce nettoyage garantit qu'il ne contient
 * aucun script. C'est ce résultat, et lui seul, qui est enregistré puis affiché tel quel.
 */
export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "em", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "img", "hr"],
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href ?? "", target: "_blank", rel: "noopener noreferrer nofollow" } }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !isForumImage(frame.attribs.src ?? ""),
  }).trim();
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** Version sans mise en forme : extraits du tableau de bord et publications sans mise en forme. */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<\/(p|h2|h3|li|blockquote)>|<br\s*\/?>/gi, "$&\n");
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e] ?? e)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
