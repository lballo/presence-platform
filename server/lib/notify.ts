import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { emailPreferences, notifications } from "../../db/schema";

/**
 * Ce qu'un membre peut couper dans la cloche. Les décisions de l'équipe et de la modération passent toujours.
 * Le choix est rangé avec les préférences d'e-mail, sous la clé « cloche:… ».
 */
export const BELL_CATEGORIES = {
  evenements: { label: "Événements", description: "Un événement annulé, une place libérée.", soon: false },
  formations: { label: "Formations", description: "Une section qui s’ouvre, une formation qui vous est ouverte.", soon: false },
  ruches: { label: "Annonces de ruche", description: "Les annonces des ruches dont vous faites partie.", soon: true },
} as const;
export type BellCategory = keyof typeof BELL_CATEGORIES;
export const bellKey = (c: BellCategory) => `cloche:${c}`;

/** Prévenir des membres dans l'application (cloche de l'en-tête), sauf ceux qui ont coupé cette catégorie. */
export async function notify(memberIds: number[], n: { title: string; body?: string; href?: string }, category?: BellCategory) {
  let ids = [...new Set(memberIds)];
  if (category && ids.length) {
    const off = await getDb().select({ id: emailPreferences.memberId }).from(emailPreferences).where(and(inArray(emailPreferences.memberId, ids), eq(emailPreferences.category, bellKey(category)), eq(emailPreferences.enabled, false)));
    const muted = new Set(off.map((o) => o.id));
    ids = ids.filter((id) => !muted.has(id));
  }
  if (!ids.length) return;
  await getDb().insert(notifications).values(ids.map((memberId) => ({ memberId, title: n.title.slice(0, 200), body: n.body ?? "", href: n.href ?? "" })));
}
