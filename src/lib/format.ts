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

// ─── Heure de Paris : les événements s'affichent et se saisissent dans ce fuseau, où que l'on soit ───
const PARIS = "Europe/Paris";
const parisFormat = new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
function parisFields(d: Date) {
  const get = (type: string) => parisFormat.formatToParts(d).find((p) => p.type === type)?.value ?? "";
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), h: Number(get("hour")), min: Number(get("minute")), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
}
/** « Jeudi 5 novembre » à Paris */
export function parisLongDate(d: Date): string { const p = parisFields(d); return `${cap(JOURS[p.wd])} ${p.d === 1 ? "1er" : p.d} ${MOIS[p.m - 1]}`; }
/** « 18h30 » à Paris */
export function parisHour(d: Date): string { const p = parisFields(d); return `${p.h}h${String(p.min).padStart(2, "0")}`; }
/** « 2026-11-05 » : le jour à Paris, pour placer un événement dans le calendrier */
export function parisIso(d: Date): string { const p = parisFields(d); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; }
export function parisDayMonth(d: Date): { day: number; month: string } { const p = parisFields(d); return { day: p.d, month: MABR[p.m - 1] }; }
/** Date et heure saisies dans un formulaire, lues à Paris. */
export function parisToDate(date: string, time: string): Date {
  const wall = new Date(`${date}T${time || "00:00"}:00Z`);
  const offset = (at: Date) => { const p = parisFields(at); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(at.getTime() / 60000) * 60000; };
  return new Date(wall.getTime() - offset(new Date(wall.getTime() - offset(wall))));
}
export function parisInputs(d: Date): { date: string; time: string } { const p = parisFields(d); return { date: parisIso(d), time: `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}` }; }
