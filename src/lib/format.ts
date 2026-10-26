const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MABR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const dayNum = (d: Date) => (d.getDate() === 1 ? "1er" : String(d.getDate()));

/** « Jeudi 5 novembre » */
export function longDate(d: Date): string {
  return `${cap(JOURS[d.getDay()])} ${dayNum(d)} ${MOIS[d.getMonth()]}`;
}
/** « 18h30 » ou « 18h » si short */
export function hour(d: Date, short = false): string {
  const m = d.getMinutes();
  return `${d.getHours()}h${short && m === 0 ? "" : String(m).padStart(2, "0")}`;
}
export function monthAbr(d: Date): string { return MABR[d.getMonth()]; }
export function monthLabel(ym: string): string { const [y, m] = ym.split("-").map(Number); return `${MOIS[m - 1]} ${y}`; }
export function monthTitle(y: number, m: number): string { return `${cap(MOIS[m])} ${y}`; }
export function addMin(d: Date, mins: number): Date { return new Date(d.getTime() + mins * 60000); }
export function duration(min: number): string { return min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}` : `${min} min`; }
export function plural(n: number, one: string, many: string): string { return `${n} ${n > 1 ? many : one}`; }
export function ago(d: Date): string {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  const j = Math.round(s / 86400);
  if (j === 1) return "hier";
  if (j < 7) return `il y a ${j} jours`;
  return `${dayNum(d)} ${MABR[d.getMonth()]}`;
}
export function iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
