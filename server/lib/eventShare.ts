import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { events } from "../../db/schema";
import { env } from "./env";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tag = (property: string, content: string) => `    <meta property="${property}" content="${escape(content)}" />`;

const GENERIC = { title: "Présence · un événement du réseau", description: "Le réseau des dirigeants sensibles et ambitieux." };

/**
 * Balises Open Graph d'une page d'événement. Seul un événement public et publié montre son titre,
 * son accroche et sa photo ; tous les autres gardent un aperçu générique, sans aucun détail.
 */
export async function eventShareTags(slug: string) {
  const e = await getDb().query.events.findFirst({ where: eq(events.slug, slug) }).catch(() => undefined);
  const open = !!e && e.status === "published" && e.visibility === "public" && !e.hiveId;
  const url = `${env.appUrl}/e/${encodeURIComponent(slug)}`;
  const title = open ? e.title : GENERIC.title;
  const description = open ? e.tagline || e.description.slice(0, 200) || GENERIC.description : GENERIC.description;
  const image = open && e.photoUrl ? (e.photoUrl.startsWith("http") ? e.photoUrl : `${env.appUrl}${e.photoUrl}`) : "";
  const head = [
    `    <title>${escape(title)}</title>`,
    `    <meta name="description" content="${escape(description)}" />`,
    tag("og:type", "website"),
    tag("og:site_name", "Présence"),
    tag("og:title", title),
    tag("og:description", description),
    tag("og:url", url),
    ...(image ? [tag("og:image", image)] : []),
    `    <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
  ].join("\n");
  return { head, indexable: open };
}
