/**
 * Les règles d'accès aux formations et le calendrier d'ouverture des sections.
 * Pur : testé dans courseAccess.test.ts.
 */
type AccessType = "collectif" | "individuel" | "les_deux";

const PARIS = "Europe/Paris";
const parisFormat = new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function parisFields(d: Date) {
  const get = (type: string) => Number(parisFormat.formatToParts(d).find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** Une date et une heure à Paris : le décalage horaire change deux fois par an. */
export function parisAt(y: number, m: number, d: number, h = 0, min = 0): Date {
  const wall = Date.UTC(y, m - 1, d, h, min);
  const offsetAt = (at: number) => { const p = parisFields(new Date(at)); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(at / 60000) * 60000; };
  return new Date(wall - offsetAt(wall - offsetAt(wall)));
}

export const parisMidnight = (y: number, m: number, d: number) => parisAt(y, m, d);

/** La section n s'ouvre n−1 semaines après le démarrage, à minuit heure de Paris. La première, le jour même. */
export function sectionOpensAt(startedAt: Date, position: number): Date {
  if (position <= 1) return startedAt;
  const p = parisFields(startedAt);
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + 7 * (position - 1)));
  return parisMidnight(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
}

export type OpenInput = {
  startedAt: Date | null;
  position: number;
  rhythm: "hebdo" | "complet";
  fullAccess: boolean;
  openedAt?: Date | null;
  openedViaFullAccess?: boolean;
};

/**
 * Une section est ouverte si sa date est passée, si la formation est en accès complet, ou si elle a déjà été ouverte
 * selon le calendrier : changer l'ordre ne la referme pas. Ouverte seulement grâce à l'accès complet, elle se referme avec lui.
 * Toutes les leçons d'une section s'ouvrent ensemble.
 */
export function sectionIsOpen(i: OpenInput, now = new Date()): boolean {
  if (!i.startedAt) return false;
  if (i.rhythm === "complet" || i.fullAccess) return true;
  if (sectionOpensAt(i.startedAt, i.position) <= now) return true;
  return !!i.openedAt && !i.openedViaFullAccess;
}

/** Une section est terminée quand toutes ses leçons publiées le sont. */
export const sectionIsDone = (lessons: { done: boolean }[]) => lessons.length > 0 && lessons.every((l) => l.done);

export type Assignment = { memberId: number | null; accessType: AccessType | null; tagId: number | null };

/** Attribution reçue : directement, par son type d'accès (« les deux » comprend les deux autres), ou par une étiquette. */
export function isAssigned(member: { id: number; accessType: AccessType }, tagIds: number[], assignments: Assignment[]): boolean {
  return assignments.some((a) =>
    a.memberId === member.id ||
    (!!a.accessType && (a.accessType === member.accessType || member.accessType === "les_deux")) ||
    (a.tagId !== null && tagIds.includes(a.tagId)));
}

/** Qui voit une formation publiée : tous les membres, sinon sur attribution ou accès complet donné. */
export function courseIsVisible(course: { public: "tous" | "attribution" }, assigned: boolean, fullAccess: boolean): boolean {
  return course.public === "tous" || assigned || fullAccess;
}

/** Un test intégré vit sur un autre domaine que l'application : sinon il pourrait agir à la place du membre. */
export function testUrlProblem(url: string, appUrl: string): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return "Le lien du test n’est pas une adresse valide."; }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return "Le test doit être en https.";
  try { if (u.origin === new URL(appUrl).origin) return "Le test doit être hébergé sur un autre domaine que l’application."; } catch { /* adresse de l'application inconnue */ }
  return null;
}
