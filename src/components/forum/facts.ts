import type { Post } from "./shared";
import { AUDIENCES } from "./shared";

/** Étiquettes et libellés des publications : partagés par la fenêtre de publication et les cartes. */

/** Le public d'une publication, tel qu'affiché sur sa carte. */
export const AUDIENCE_LABELS: Record<Post["audience"], string> = { ...AUDIENCES, moderateurs: "Visible des modérateurs seulement" };

// Étiquettes sous une publication (facts). Le serveur vérifie les mêmes valeurs : server/routers/forum.ts.
export const WORK_MODES = ["Sur site", "À distance", "Hybride"] as const;
export const SCHEDULES = ["Temps plein", "Temps partiel"] as const;
export const PAY_UNITS = { h: "€/h", mois: "€/mois" } as const;
export type PayUnit = keyof typeof PAY_UNITS;
export type Job = { workMode: string; schedule: string; location: string; payAmount: string; payUnit: PayUnit };
export const HELP = { propose: "Propose son aide", demande: "Cherche de l’aide" } as const;
export type HelpKind = keyof typeof HELP;

/** « 2000 », « 2 000 », « 12,5 » → « 2 000 », « 12,5 » ; null si ce n'est pas un montant. */
export function formatPay(amount: string): string | null {
  const n = Number(amount.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
}

/** Recrutement : lieu de travail, temps de travail, localisation, rémunération, dans cet ordre. */
export function jobFacts(j: Job): string[] | null {
  const pay = formatPay(j.payAmount);
  if (!j.workMode || !j.schedule || !j.location.trim() || !pay) return null;
  return [j.workMode, j.schedule, j.location.trim(), `${pay} ${PAY_UNITS[j.payUnit]}`];
}

/** L'inverse, pour modifier une annonce de recrutement ; null pour une ancienne annonce au format libre. */
export function parseJobFacts(facts: string[]): Job | null {
  const [workMode, schedule, location, pay] = facts;
  const m = pay?.match(/^(.+?)\s?€\/(h|mois)$/u);
  if (facts.length !== 4 || !(WORK_MODES as readonly string[]).includes(workMode) || !(SCHEDULES as readonly string[]).includes(schedule) || !m) return null;
  return { workMode, schedule, location, payAmount: m[1], payUnit: m[2] as PayUnit };
}
