/**
 * Les rythmes d'un événement récurrent et le calcul de ses dates, à la même heure de Paris toute l'année.
 * Pur : testé dans recurrence.test.ts, et utilisé aussi par la fenêtre de création pour annoncer les prochaines dates.
 */
import { parisAt, parisFields } from "./courseAccess";

export const REPEATS = ["semaine", "deux_semaines", "mois"] as const;
export type Repeat = (typeof REPEATS)[number];
export const REPEAT_LABEL: Record<Repeat, string> = { semaine: "Chaque semaine", deux_semaines: "Toutes les deux semaines", mois: "Chaque mois" };

/** Les dates d'une série se créent à l'avance, sur cette durée : les membres peuvent s'inscrire, et la série continue seule. */
export const HORIZON_DAYS = 92;

/**
 * La date n de la série. On repart toujours de la première : un 31 janvier donne bien le 28 février puis le 31 mars,
 * alors que passer d'une date à la suivante resterait bloqué au 28.
 */
export function occurrence(anchor: Date, every: Repeat, n: number): Date {
  const p = parisFields(anchor);
  if (every === "mois") {
    const month = new Date(Date.UTC(p.y, p.m - 1 + n, 1));
    const y = month.getUTCFullYear();
    const m = month.getUTCMonth() + 1;
    return parisAt(y, m, Math.min(p.d, new Date(Date.UTC(y, m, 0)).getUTCDate()), p.h, p.min);
  }
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + (every === "semaine" ? 7 : 14) * n));
  return parisAt(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), p.h, p.min);
}

/** Les dates de la série après une date, jusqu'à une limite. */
export function datesBetween(anchor: Date, every: Repeat, after: Date, until: Date): Date[] {
  const out: Date[] = [];
  for (let n = 1; n < 400; n++) {
    const d = occurrence(anchor, every, n);
    if (d > until) break;
    if (d > after) out.push(d);
  }
  return out;
}
