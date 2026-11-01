import { and, asc, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { eventRegistrations, eventSeries, events, eventSpeakers, members } from "../../db/schema";
import { slugify } from "./eventAccess";
import { datesBetween, HORIZON_DAYS, type Repeat } from "./recurrence";

/** Une adresse libre, à partir du titre ou de celle choisie par l'organisateur. */
export async function freeSlug(wanted: string, exceptId?: number) {
  const db = getDb();
  const base = slugify(wanted);
  for (let i = 1; i < 500; i++) {
    const slug = i === 1 ? base : `${base.slice(0, 95)}-${i}`;
    const used = await db.select({ id: events.id }).from(events).where(and(eq(events.slug, slug), exceptId ? ne(events.id, exceptId) : undefined)).limit(1);
    if (!used.length) return slug;
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Choisissez une autre adresse pour cette page." });
}

export async function setSpeakers(eventId: number, ids: number[]) {
  const db = getDb();
  await db.delete(eventSpeakers).where(eq(eventSpeakers.eventId, eventId));
  const wanted = [...new Set(ids)];
  if (!wanted.length) return;
  const known = await db.select({ id: members.id }).from(members).where(inArray(members.id, wanted));
  const ok = new Set(known.map((k) => k.id));
  const rows = wanted.filter((id) => ok.has(id)).map((memberId, position) => ({ eventId, memberId, position }));
  if (rows.length) await db.insert(eventSpeakers).values(rows);
}

const isoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

/**
 * Crée les dates qui manquent à une série, ou à toutes, sur les trois mois à venir. Rejouable sans doublon :
 * on repart toujours de la dernière date existante. Chaque nouvelle date reprend la dernière qui n'est pas annulée,
 * avec ses éventuelles modifications, et l'organisateur y est inscrit comme sur toute date qu'il crée.
 */
export async function extendSeries(seriesId?: number): Promise<number> {
  const db = getDb();
  const list = await db.select().from(eventSeries).where(and(isNull(eventSeries.stoppedAt), seriesId ? eq(eventSeries.id, seriesId) : undefined));
  const horizon = new Date(Date.now() + HORIZON_DAYS * 86400000);
  let made = 0;
  for (const s of list) {
    const dates = await db.query.events.findMany({ where: eq(events.seriesId, s.id), with: { speakers: { orderBy: [asc(eventSpeakers.position)] } }, orderBy: [desc(events.startsAt)] });
    const model = dates.find((e) => !e.cancelledAt);
    if (!model || !dates.length) continue;
    const limit = s.untilAt && s.untilAt < horizon ? s.untilAt : horizon;
    for (const startsAt of datesBetween(s.anchorAt, s.every, dates[0].startsAt, limit)) {
      const { id: _id, slug: _slug, startsAt: _start, createdAt: _created, cancelledAt: _cancelled, views: _views, live: _live, featured: _featured, speakers, ...copy } = model;
      const slug = await freeSlug(`${slugify(model.title).slice(0, 85)}-${isoDay(startsAt)}`);
      const [ev] = await db.insert(events).values({ ...copy, slug, startsAt }).returning({ id: events.id });
      await setSpeakers(ev.id, speakers.map((x) => x.memberId));
      await db.insert(eventRegistrations).values({ eventId: ev.id, memberId: model.hostId });
      made++;
    }
  }
  return made;
}

/** Démarre une série à partir d'un événement existant, et crée ses prochaines dates. */
export async function startSeries(eventId: number, startsAt: Date, every: Repeat, until: Date | null): Promise<number> {
  const db = getDb();
  const [series] = await db.insert(eventSeries).values({ every, anchorAt: startsAt, untilAt: until }).returning({ id: eventSeries.id });
  await db.update(events).set({ seriesId: series.id }).where(eq(events.id, eventId));
  return extendSeries(series.id);
}

/** Les dates d'une série qui suivent une date, annulées comprises si on le demande. */
export function laterDates(seriesId: number, after: Date) {
  return getDb().query.events.findMany({ where: and(eq(events.seriesId, seriesId), gt(events.startsAt, after)), with: { registrations: true }, orderBy: [asc(events.startsAt)] });
}
