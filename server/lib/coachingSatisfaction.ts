import type { CoachingEngagement } from "../../db/schema";
import { env } from "./env";
import { NotionError, queryPages, type NotionPage } from "./notion";
import { richTextToPlain } from "./notionBlocks";

/**
 * Questionnaire de satisfaction du coaching individuel (pas celui des stagiaires des formations, qui reste dans l'outil Qualiopi).
 * Le questionnaire vit sur lauraballo.com/satisfaction (toujours éveillé, sans délai de démarrage).
 * Présence donne le lien de chaque accompagnement et lit les réponses dans la base Notion « Réponses Satisfaction Clients ».
 */

const SITE = "https://lauraballo.com/satisfaction";

/** Le lien du questionnaire, relié à l'inscription (i) et à la fiche CRM (client), avec le prénom et le programme affichés. */
export function satisfactionUrl(e: Pick<CoachingEngagement, "notionPageId" | "clientPageId" | "clientName" | "title">, firstName?: string | null) {
  const q = new URLSearchParams();
  q.set("i", e.notionPageId);
  if (e.clientPageId) q.set("client", e.clientPageId);
  const prenom = (firstName || e.clientName.split(" ")[0] || "").trim();
  if (prenom) q.set("prenom", prenom);
  if (e.title) q.set("p", e.title);
  return `${SITE}?${q.toString()}`;
}

/** Les réponses de cet accompagnement : par l'inscription, ou par la fiche CRM pour les anciennes. */
async function answersOf(e: CoachingEngagement): Promise<NotionPage[]> {
  const or: unknown[] = [{ property: "Inscription", relation: { contains: e.notionPageId } }];
  if (e.clientPageId) or.push({ property: "Client lié", relation: { contains: e.clientPageId } });
  return queryPages(env.notionCoachingSatisfaction, { or });
}

/** Pour Laura, dans la fiche de l'accompagnement : le lien à envoyer et les réponses reçues. */
export async function satisfactionFor(e: CoachingEngagement) {
  const url = satisfactionUrl(e);
  try {
    const pages = await answersOf(e);
    const n = (p: NotionPage, k: string) => p.properties[k]?.number ?? null;
    const responses = pages
      .map((p) => ({
        id: p.id, at: p.created_time ?? null, notionUrl: p.url ?? `https://www.notion.so/${p.id.replace(/-/g, "")}`,
        satisfaction: n(p, "Satisfaction générale"), besoin: n(p, "Réponse à votre besoin initial"), professionnalisme: n(p, "Professionnalisme du coach"), disponibilite: n(p, "Disponibilité du coach"),
        remarques: richTextToPlain(p.properties["Axes d amélioration et remarques"]?.rich_text).trim(),
        status: p.properties["Statut traitement"]?.select?.name ?? "",
      }))
      .sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
    return { url, responses, error: "" };
  } catch (err) {
    const missing = err instanceof NotionError && err.status === 404;
    return { url, responses: [], error: missing ? "Notion ne trouve pas la base « Réponses Satisfaction Clients » : ajoutez-y la connexion de l’intégration Présence." : err instanceof Error ? err.message : "Notion est injoignable." };
  }
}
