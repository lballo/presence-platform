import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { coachingEngagements, coachingMeetings, eventRegistrations, events, members } from "../../db/schema";
import { accountBlock } from "./permissions";
import { env } from "./env";

/**
 * Mon calendrier, en abonnement : Google Agenda, Apple Calendrier ou Outlook lisent un fichier .ics
 * à une adresse personnelle, signée comme les liens de désinscription. Le lien ne s'ouvre que pour un compte actif.
 */

export const agendaReady = () => !!env.privateDataKey;

export function agendaToken(memberId: number): string {
  return createHmac("sha256", env.privateDataKey).update(`agenda:${memberId}`).digest("base64url").slice(0, 32);
}

/** Les adresses à donner à la personne : le fichier, l'abonnement (webcal) et l'ajout direct dans Google Agenda. */
export function agendaLinks(memberId: number) {
  const feedUrl = `${env.appUrl}/api/agenda/${memberId}-${agendaToken(memberId)}.ics`;
  const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");
  return { feedUrl, webcalUrl, googleUrl: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}` };
}

/** « 12-abc….ics » → la fiche, si la signature est la bonne. */
export function memberFromAgendaFile(file: string): number | null {
  if (!agendaReady()) return null;
  const m = /^(\d{1,9})-([A-Za-z0-9_-]{32})\.ics$/.exec(file);
  if (!m) return null;
  const id = Number(m[1]);
  const want = Buffer.from(agendaToken(id));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

export type AgendaItem = {
  uid: string; title: string; start: Date; end: Date; location?: string; description?: string; url?: string;
  status: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
};

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Texte d'iCalendar : antislash, point-virgule, virgule et retours à la ligne s'échappent. */
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Les lignes de plus de 75 octets se replient (RFC 5545), sans couper un caractère accentué. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(items: AgendaItem[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Presence//Mon calendrier//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Présence", "X-WR-CALDESC:Mes rendez-vous du réseau Présence", "X-WR-TIMEZONE:Europe/Paris",
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H", "X-PUBLISHED-TTL:PT4H",
  ];
  for (const i of items) {
    lines.push("BEGIN:VEVENT", `UID:${i.uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(i.start)}`, `DTEND:${stamp(i.end)}`, `SUMMARY:${icsText(i.title)}`);
    if (i.location) lines.push(`LOCATION:${icsText(i.location)}`);
    if (i.description) lines.push(`DESCRIPTION:${icsText(i.description)}`);
    if (i.url) lines.push(`URL:${i.url}`);
    lines.push(`STATUS:${i.status}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

const DAY = 86400000;

/**
 * Les rendez-vous de la personne : ses événements (inscrite, en liste d'attente ou qu'elle organise, annulés compris pour qu'ils
 * disparaissent de son agenda) depuis trois mois, et ses séances de coaching planifiées ou faites.
 * L'adresse et le lien de visio ne figurent que pour une inscription confirmée, comme sur la page de l'événement.
 */
export async function agendaItems(memberId: number, now = new Date()): Promise<AgendaItem[] | null> {
  const db = getDb();
  const [m] = await db.select().from(members).where(eq(members.id, memberId));
  if (!m || accountBlock(m, now)) return null;
  const since = new Date(now.getTime() - 90 * DAY);
  const registered = await db.select({ e: events, waitlist: eventRegistrations.waitlist }).from(eventRegistrations)
    .innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(and(eq(eventRegistrations.memberId, memberId), eq(events.status, "published"), gte(events.startsAt, since)));
  // Les événements que j'organise, même sans m'y être inscrite
  const hosted = await db.select().from(events).where(and(eq(events.hostId, memberId), eq(events.status, "published"), gte(events.startsAt, since)));
  const seen = new Set(registered.map((r) => r.e.id));
  const regs = [...registered, ...hosted.filter((e) => !seen.has(e.id)).map((e) => ({ e, waitlist: false }))];
  const items: AgendaItem[] = regs.map(({ e, waitlist }) => {
    const page = `${env.appUrl}/e/${e.slug}`;
    const confirmed = !waitlist;
    const online = e.kind !== "onsite";
    const location = confirmed && !online && e.address ? [e.address, e.city].filter(Boolean).join(", ") : online ? (confirmed && e.meetingUrl ? e.meetingUrl : e.where || "En ligne") : e.where || e.city || "";
    const description = [
      waitlist ? "Vous êtes sur la liste d’attente." : "",
      confirmed && online && e.meetingUrl ? `Lien de connexion : ${e.meetingUrl}` : "",
      `La page de l’événement : ${page}`,
    ].filter(Boolean).join("\n");
    return {
      uid: `evenement-${e.id}@presence`, title: waitlist ? `Liste d’attente · ${e.title}` : e.title,
      start: e.startsAt, end: new Date(e.startsAt.getTime() + Math.max(0, e.days - 1) * DAY + e.durationMin * 60000),
      location, description, url: page, status: e.cancelledAt ? "CANCELLED" : waitlist ? "TENTATIVE" : "CONFIRMED",
    };
  });
  const engagements = await db.select({ id: coachingEngagements.id }).from(coachingEngagements).where(and(eq(coachingEngagements.memberId, memberId), isNull(coachingEngagements.archivedAt)));
  if (engagements.length) {
    const meetings = await db.select().from(coachingMeetings).where(and(
      inArray(coachingMeetings.engagementId, engagements.map((x) => x.id)), isNull(coachingMeetings.archivedAt),
      isNotNull(coachingMeetings.startsAt), inArray(coachingMeetings.state, ["Planifié", "Terminé"]), gte(coachingMeetings.startsAt, since),
    ));
    for (const s of meetings) {
      items.push({
        uid: `coaching-${s.id}@presence`, title: `Coaching avec Laura Ballo · ${s.kind || "Séance"}${s.number ? ` n° ${s.number}` : ""}`,
        start: s.startsAt!, end: s.endsAt && s.endsAt > s.startsAt! ? s.endsAt : new Date(s.startsAt!.getTime() + 60 * 60000),
        description: `Mon accompagnement : ${env.appUrl}/profil/coaching`, url: `${env.appUrl}/profil/coaching`, status: "CONFIRMED",
      });
    }
  }
  return items.sort((a, b) => a.start.getTime() - b.start.getTime());
}
