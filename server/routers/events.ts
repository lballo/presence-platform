import { z } from "zod";
import { eq, and, asc, desc, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { assertCan, createRouter, procFor, publicProc } from "../middleware";
import { accountBlock, can, type HiveRole } from "../lib/permissions";
import type { Member } from "../../db/schema";
import { getDb } from "../queries/connection";
import { events, eventRegistrations, eventSeries, eventSpeakers, hiveMembers, members } from "../../db/schema";
import { publicMember } from "../lib/format";
import { canViewEvent, eventAccess, eventDenial, SLUG_PATTERN } from "../lib/eventAccess";
import { freeSlug, laterDates, setSpeakers, startSeries } from "../lib/eventSeries";
import { REPEAT_LABEL, REPEATS } from "../lib/recurrence";
import { isOurImage } from "../lib/storage";
import { notify } from "../lib/notify";
import { award, revoke } from "../lib/honey";
import { logIfOnBehalf } from "../lib/adminLog";

const eventInput = z.object({
  kind: z.enum(["onsite", "online", "salon"]),
  title: z.string().trim().min(1).max(200),
  tagline: z.string().trim().max(240).default(""),
  description: z.string().trim().max(4000).default(""),
  program: z.string().trim().max(4000).default(""),
  takeaways: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
  faq: z.array(z.object({ q: z.string().trim().min(1).max(200), a: z.string().trim().min(1).max(1000) })).max(10).default([]),
  photoUrl: z.string().trim().max(1000).default(""),
  cover: z.enum(["", "rouge", "or", "vin", "bronze", "nuit", "braise"]).default(""),
  photoPosition: z.string().regex(/^\d{1,3}% \d{1,3}%$/).default("50% 50%"),
  repeat: z.enum(REPEATS).nullable().default(null),
  until: z.coerce.date().nullable().default(null),
  startsAt: z.coerce.date(),
  durationMin: z.number().int().min(15).max(1440).default(60),
  city: z.string().trim().max(80).optional(),
  address: z.string().trim().max(400).default(""),
  meetingUrl: z.string().trim().max(500).default(""),
  maxSeats: z.number().int().min(2).max(2000).nullable().optional(),
  visibility: z.enum(["membres", "public"]).default("membres"),
  type: z.enum(["standard", "bienvenue"]).default("standard"),
  speakerIds: z.array(z.number().int()).max(8).default([]),
  slug: z.string().trim().max(100).optional(),
  hiveId: z.number().int().nullable().default(null), // depuis la page d'une ruche
});
type EventInput = z.infer<typeof eventInput>;

const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

function checkInput(input: EventInput, currentPhoto?: string | null) {
  if (input.kind === "onsite" && !input.address) throw badRequest("Indiquez l’adresse de l’événement.");
  if (input.kind !== "onsite" && !/^https?:\/\/\S+$/.test(input.meetingUrl)) throw badRequest("Indiquez le lien de la visio (https://…).");
  if (input.photoUrl && input.photoUrl !== currentPhoto && !isOurImage("eventImage", input.photoUrl)) throw badRequest("Importez la photo de couverture depuis le formulaire.");
  if (input.repeat && input.until && input.until <= input.startsAt) throw badRequest("La fin de la répétition doit suivre la première date.");
}

/** Colonnes d'un événement. Une ruche n'a aucun réglage de visibilité : ses événements lui restent réservés. */
function eventValues(input: EventInput, member: Member, hiveId: number | null) {
  const { speakerIds: _s, slug: _sl, hiveId: _h, repeat: _r, until: _u, ...rest } = input;
  return {
    ...rest,
    photoUrl: input.photoUrl || null,
    city: input.kind === "onsite" ? input.city ?? "" : null,
    where: input.kind === "onsite" ? input.city || "Présentiel" : "En ligne",
    address: input.kind === "onsite" ? input.address : "",
    meetingUrl: input.kind === "onsite" ? "" : input.meetingUrl,
    maxSeats: input.maxSeats ?? null,
    visibility: hiveId ? ("membres" as const) : input.visibility,
    type: !hiveId && can(member, "event.publish_directly") ? input.type : ("standard" as const),
  };
}

async function hiveRoleOf(hiveId: number | null, memberId: number | undefined): Promise<HiveRole> {
  if (!hiveId || !memberId) return "";
  const m = await getDb().query.hiveMembers.findFirst({ where: and(eq(hiveMembers.hiveId, hiveId), eq(hiveMembers.memberId, memberId)) });
  return m?.role ?? "";
}

/** Ce que can() doit savoir d'un événement : son organisateur, sa ruche et mon rôle dans cette ruche. */
async function eventResource(member: Member, e: { hostId: number; hiveId: number | null; status: string }) {
  return { ownerId: e.hostId, hiveId: e.hiveId, hiveRole: await hiveRoleOf(e.hiveId, member.id), status: e.status };
}

const person = (m: { id: number; firstName: string; lastName: string; photoUrl: string | null; jobTitle: string }) => {
  const { name, initials } = publicMember(m);
  return { id: m.id, name, initials, photoUrl: m.photoUrl, jobTitle: m.jobTitle };
};

/** Inscription : une place si elle est libre, sinon la liste d'attente. Sous verrou pour ne jamais dépasser la jauge. */
export async function registerMember(eventId: number, memberId: number) {
  return getDb().transaction(async (tx) => {
    const [e] = await tx.select().from(events).where(eq(events.id, eventId)).for("update");
    const existing = await tx.query.eventRegistrations.findFirst({ where: and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.memberId, memberId)) });
    if (existing) return { registered: !existing.waitlist, waitlist: existing.waitlist, event: e };
    const [{ taken }] = await tx.select({ taken: sql<number>`count(*)::int` }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.waitlist, false)));
    const waitlist = !!e.maxSeats && taken >= e.maxSeats;
    await tx.insert(eventRegistrations).values({ eventId, memberId, waitlist });
    return { registered: !waitlist, waitlist, event: e };
  });
}

/** Miel d'une place confirmée : réunion de bienvenue, ou premier autre événement. */
const awardRegistration = (memberId: number, e: { type: string }) => award(memberId, e.type === "bienvenue" ? "bienvenue_inscription" : "premier_evenement");

/** Désinscription : la première personne de la liste d'attente prend la place libérée. */
export async function unregisterMember(eventId: number, memberId: number) {
  const promoted = await getDb().transaction(async (tx) => {
    const [e] = await tx.select().from(events).where(eq(events.id, eventId)).for("update");
    const [mine] = await tx.delete(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.memberId, memberId))).returning();
    if (!mine || mine.waitlist || e.cancelledAt || e.startsAt < new Date()) return null;
    const [{ taken }] = await tx.select({ taken: sql<number>`count(*)::int` }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.waitlist, false)));
    if (e.maxSeats && taken >= e.maxSeats) return null;
    const [next] = await tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.waitlist, true))).orderBy(asc(eventRegistrations.id)).limit(1);
    if (!next) return null;
    await tx.update(eventRegistrations).set({ waitlist: false }).where(eq(eventRegistrations.id, next.id));
    return { memberId: next.memberId, event: e };
  });
  if (promoted) await awardRegistration(promoted.memberId, promoted.event);
  if (promoted) await notify([promoted.memberId], { title: `Une place s’est libérée : ${promoted.event.title}`, body: "Vous êtes inscrit·e. L’adresse ou le lien sont sur la page de l’événement.", href: `/e/${promoted.event.slug}` });
  return promoted?.memberId ?? null;
}

const readProc = procFor("events.read");

export const eventsRouter = createRouter({
  /** Programme du réseau : les événements de ruche restent dans leur ruche. */
  program: readProc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.events.findMany({ where: and(eq(events.status, "published"), isNull(events.hiveId)), with: { host: true, registrations: true, series: true }, orderBy: [asc(events.startsAt)] });
    // Une série n'occupe qu'une carte, celle de sa prochaine date : les autres sont dans l'agenda et sur la page de l'événement
    const now = Date.now();
    const ended = (e: (typeof list)[number]) => e.startsAt.getTime() + e.durationMin * 60000 < now;
    const nextOfSeries = new Map<number, number>();
    for (const e of list) if (e.seriesId && !e.cancelledAt && !ended(e) && !nextOfSeries.has(e.seriesId)) nextOfSeries.set(e.seriesId, e.id);
    return list
      .filter((e) => !e.cancelledAt || e.hostId === ctx.memberId || can(ctx.member, "moderate"))
      .filter((e) => !e.seriesId || ended(e) || nextOfSeries.get(e.seriesId) === e.id)
      .map((e) => {
        const taken = e.registrations.filter((r) => !r.waitlist).length;
        const mine = e.registrations.find((r) => r.memberId === ctx.memberId);
        return {
          id: e.id, slug: e.slug, kind: e.kind, type: e.type, visibility: e.visibility, title: e.title, tagline: e.tagline, photoUrl: e.photoUrl, photoPosition: e.photoPosition, cover: e.cover, repeatLabel: e.series && !e.series.stoppedAt ? REPEAT_LABEL[e.series.every] : null, startsAt: e.startsAt, durationMin: e.durationMin, days: e.days,
          city: e.city, where: e.where, maxSeats: e.maxSeats, featured: e.featured, live: e.live, cancelled: !!e.cancelledAt, host: person(e.host),
          taken, seatsLeft: e.maxSeats ? Math.max(0, e.maxSeats - taken) : null,
          registered: !!mine && !mine.waitlist, waitlisted: !!mine && mine.waitlist,
          canManage: can(ctx.member, "event.edit", { ownerId: e.hostId }),
        };
      });
  }),

  /** Agenda : les événements du réseau et ceux des ruches du membre. Un an en arrière, pour naviguer dans le calendrier. */
  agenda: readProc.query(async ({ ctx }) => {
    const db = getDb();
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const myHives = (await db.select({ hiveId: hiveMembers.hiveId, role: hiveMembers.role }).from(hiveMembers).where(eq(hiveMembers.memberId, ctx.memberId))).filter((m) => m.role !== "pending").map((m) => m.hiveId);
    const list = await db.query.events.findMany({
      where: and(eq(events.status, "published"), isNull(events.cancelledAt), gte(events.startsAt, since), or(isNull(events.hiveId), inArray(events.hiveId, myHives))),
      with: { registrations: { where: eq(eventRegistrations.memberId, ctx.memberId) }, hive: true },
      orderBy: [asc(events.startsAt)],
    });
    return list.map((e) => ({
      id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt, days: e.days, where: e.where, kind: e.kind, type: e.type,
      scope: e.hiveId ? ("ruche" as const) : ("reseau" as const), hiveName: e.hive?.name ?? null,
      registered: e.registrations.some((r) => !r.waitlist), waitlisted: e.registrations.some((r) => r.waitlist),
    }));
  }),

  /**
   * Page d'un événement, ouverte sans connexion. Un visiteur ne reçoit un détail que si l'événement est public ;
   * l'adresse et le lien de visio ne partent que pour les personnes inscrites et l'équipe de l'événement.
   */
  page: publicProc.input(z.object({ slug: z.string().max(100) })).query(async ({ ctx, input }) => {
    const db = getDb();
    const member = ctx.member && !accountBlock(ctx.member) ? ctx.member : null;
    const e = await db.query.events.findFirst({
      where: eq(events.slug, input.slug),
      with: { host: true, hive: true, series: true, registrations: true, speakers: { with: { member: true }, orderBy: [asc(eventSpeakers.position)] } },
    });
    if (!e) return { state: "introuvable" as const, connected: !!member };
    const hiveRole = await hiveRoleOf(e.hiveId, member?.id);
    if (!canViewEvent(member, e, hiveRole)) {
      const denial = eventDenial(member, e);
      return { state: denial, connected: !!member, hiveName: denial === "ruche" ? e.hive?.name ?? "" : "" };
    }
    const mine = member ? e.registrations.find((r) => r.memberId === member.id) : undefined;
    const taken = e.registrations.filter((r) => !r.waitlist).length;
    const manager = !!member && can(member, "event.edit", { ownerId: e.hostId, hiveId: e.hiveId, hiveRole });
    const insider = (!!mine && !mine.waitlist) || manager || (!!member && e.hiveId !== null && can(member, "hive.manage", { hiveRole }));
    const past = new Date(e.startsAt.getTime() + e.durationMin * 60000) < new Date();
    // Les autres dates de la série, pour choisir celle qui convient
    const others = e.seriesId ? (await laterDates(e.seriesId, new Date())).filter((o) => o.id !== e.id && !o.cancelledAt && o.status === "published" && canViewEvent(member, o, hiveRole)).slice(0, 6) : [];
    return {
      state: "ok" as const,
      connected: !!member,
      event: {
        id: e.id, slug: e.slug, title: e.title, tagline: e.tagline, description: e.description, program: e.program, takeaways: e.takeaways, faq: e.faq, photoUrl: e.photoUrl, photoPosition: e.photoPosition, cover: e.cover,
        series: e.series && !e.series.stoppedAt ? { label: REPEAT_LABEL[e.series.every], dates: others.map((o) => ({ slug: o.slug, startsAt: o.startsAt })) } : null,
        kind: e.kind, type: e.type, visibility: e.visibility, status: e.status, startsAt: e.startsAt, durationMin: e.durationMin, days: e.days, city: e.city, where: e.where,
        hive: e.hive ? { id: e.hive.id, name: e.hive.name } : null,
        host: person(e.host),
        speakers: e.speakers.map((s) => person(s.member)),
        maxSeats: e.maxSeats, taken, seatsLeft: e.maxSeats ? Math.max(0, e.maxSeats - taken) : null,
        cancelled: !!e.cancelledAt, past,
        registered: !!mine && !mine.waitlist, waitlisted: !!mine && mine.waitlist,
        canRegister: !!member && e.status === "published" && !e.cancelledAt && !past,
        canManage: manager,
        ...eventAccess(e, insider),
      },
    };
  }),

  /** Compteur de vues de la page. */
  trackView: publicProc.input(z.object({ slug: z.string().max(100) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const member = ctx.member && !accountBlock(ctx.member) ? ctx.member : null;
    const e = await db.query.events.findFirst({ where: eq(events.slug, input.slug) });
    if (!e || e.hostId === member?.id) return { ok: true };
    if (canViewEvent(member, e, await hiveRoleOf(e.hiveId, member?.id))) await db.update(events).set({ views: sql`${events.views} + 1` }).where(eq(events.id, e.id));
    return { ok: true };
  }),

  /** S'inscrire : réservé aux membres qui peuvent voir l'événement. Complet : liste d'attente. */
  register: procFor("events.register").input(z.object({ eventId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const e = await getDb().query.events.findFirst({ where: eq(events.id, input.eventId) });
    if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Événement introuvable" });
    if (!canViewEvent(ctx.member, e, await hiveRoleOf(e.hiveId, ctx.memberId))) throw new TRPCError({ code: "FORBIDDEN", message: e.hiveId ? "Réservé aux membres de la ruche." : "Vous n’avez pas accès à cet événement." });
    if (e.status !== "published") throw badRequest("Cet événement n’est pas encore publié.");
    if (e.cancelledAt) throw badRequest("Cet événement est annulé.");
    if (new Date(e.startsAt.getTime() + e.durationMin * 60000) < new Date()) throw badRequest("Cet événement est passé.");
    const r = await registerMember(e.id, ctx.memberId);
    if (r.registered) await awardRegistration(ctx.memberId, e);
    return { registered: r.registered, waitlist: r.waitlist, slug: e.slug };
  }),

  unregister: procFor("events.register").input(z.object({ eventId: z.number().int() })).mutation(async ({ ctx, input }) => {
    await unregisterMember(input.eventId, ctx.memberId);
    return { ok: true };
  }),

  /** Créer : publié directement par les organisateurs et l'administratrice, proposé pour validation par un membre. Ruche : fondatrice et leaders. */
  create: procFor("event.propose").input(eventInput).mutation(async ({ ctx, input }) => {
    checkInput(input);
    const db = getDb();
    if (input.hiveId) assertCan(ctx.member, "hive.create_event", { hiveRole: await hiveRoleOf(input.hiveId, ctx.memberId) }, "Seuls les leaders créent des événements de ruche.");
    const status = input.hiveId || can(ctx.member, "event.publish_directly") ? "published" : "pending";
    if (input.repeat && status !== "published") throw badRequest("Seuls les organisateurs créent des événements récurrents.");
    if (input.slug && !SLUG_PATTERN.test(input.slug)) throw badRequest("L’adresse ne peut contenir que des lettres, des chiffres et des tirets.");
    const slug = await freeSlug(input.slug || input.title);
    const [ev] = await db.insert(events).values({ ...eventValues(input, ctx.member, input.hiveId), slug, hiveId: input.hiveId, hostId: ctx.memberId, inAgenda: !input.hiveId, status }).returning();
    await setSpeakers(ev.id, input.speakerIds);
    await db.insert(eventRegistrations).values({ eventId: ev.id, memberId: ctx.memberId });
    const more = input.repeat ? await startSeries(ev.id, ev.startsAt, input.repeat, input.until) : 0;
    return { id: ev.id, slug: ev.slug, status, dates: 1 + more };
  }),

  /** Modifier : celui qui l'a créé ou l'administratrice. */
  update: readProc.input(eventInput.extend({ id: z.number().int(), scope: z.enum(["one", "following"]).default("one") })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const e = await db.query.events.findFirst({ where: eq(events.id, input.id), with: { registrations: true } });
    if (!e) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "event.edit", await eventResource(ctx.member, e), "Seuls ses organisateurs peuvent modifier cet événement.");
    checkInput(input, e.photoUrl);
    const { scope: _scope, id: _id, ...fields } = input;
    const values = eventValues(fields, ctx.member, e.hiveId);
    // Un membre ne rend pas public, sans validation, un événement déjà accepté.
    if (values.visibility === "public" && e.visibility !== "public" && e.status === "published" && !can(ctx.member, "event.publish_directly")) throw badRequest("Pour rendre cet événement public, écrivez à l’équipe Présence.");
    if (!can(ctx.member, "event.publish_directly")) values.type = e.type;
    let slug = e.slug;
    if (input.slug && input.slug !== e.slug) {
      if (!SLUG_PATTERN.test(input.slug)) throw badRequest("L’adresse ne peut contenir que des lettres, des chiffres et des tirets.");
      const used = await db.select({ id: events.id }).from(events).where(and(eq(events.slug, input.slug), ne(events.id, e.id))).limit(1);
      if (used.length) throw new TRPCError({ code: "CONFLICT", message: "Cette adresse est déjà prise." });
      slug = input.slug;
    }
    await db.update(events).set({ ...values, slug }).where(eq(events.id, e.id));
    await setSpeakers(e.id, input.speakerIds);
    // Toute la suite d'une série suit cette date : mêmes informations, et même décalage si l'heure ou le jour change
    let following = 0;
    if (e.seriesId && input.scope === "following") {
      const shift = values.startsAt.getTime() - e.startsAt.getTime();
      // Cette date vient d'être déplacée : elle peut se retrouver après son ancienne heure, et ne doit pas bouger deux fois
      for (const later of (await laterDates(e.seriesId, e.startsAt)).filter((x) => x.id !== e.id && !x.cancelledAt)) {
        await db.update(events).set({ ...values, startsAt: new Date(later.startsAt.getTime() + shift) }).where(eq(events.id, later.id));
        await setSpeakers(later.id, input.speakerIds);
        following++;
      }
      if (shift) await db.update(eventSeries).set({ anchorAt: values.startsAt }).where(eq(eventSeries.id, e.seriesId));
    }
    // Un événement seul peut devenir récurrent : la réunion de bienvenue existante, par exemple
    if (!e.seriesId && input.repeat) {
      if (!e.hiveId && !can(ctx.member, "event.publish_directly")) throw badRequest("Seuls les organisateurs créent des événements récurrents.");
      if (e.status !== "published") throw badRequest("Un événement récurrent doit d’abord être publié.");
      following = await startSeries(e.id, values.startsAt, input.repeat, input.until);
    }
    // Visibilité restreinte après coup : les personnes inscrites gardent leur place, l'organisateur le sait.
    const registered = e.registrations.filter((r) => r.memberId !== e.hostId).length;
    const restricted = e.visibility === "public" && values.visibility === "membres";
    if (restricted) await notify([e.hostId], { title: `Visibilité restreinte : ${input.title}`, body: registered ? `La page est désormais réservée aux membres. Les ${registered} personne(s) déjà inscrite(s) gardent leur place.` : "La page est désormais réservée aux membres connectés.", href: `/e/${slug}/gerer` });
    await logIfOnBehalf(ctx.member, e.hostId, { action: "Événement modifié", targetType: "evenement", targetId: e.id, label: input.title });
    return { ok: true, slug, restricted, registered, following };
  }),

  /** Page « Gérer » : inscrits, présences, vues. */
  manage: readProc.input(z.object({ slug: z.string().max(100) })).query(async ({ ctx, input }) => {
    const db = getDb();
    const e = await db.query.events.findFirst({ where: eq(events.slug, input.slug), with: { registrations: { with: { member: true }, orderBy: [asc(eventRegistrations.id)] }, speakers: { with: { member: true }, orderBy: [asc(eventSpeakers.position)] }, hive: true, series: true } });
    if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Événement introuvable" });
    assertCan(ctx.member, "event.edit", await eventResource(ctx.member, e), "Seuls ses organisateurs peuvent gérer cet événement.");
    const { registrations, speakers, hive, series, ...rest } = e;
    const later = series ? (await laterDates(series.id, new Date(Date.now() - e.durationMin * 60000))) : [];
    return {
      ...rest,
      series: series ? {
        label: REPEAT_LABEL[series.every], stopped: !!series.stoppedAt,
        following: later.filter((x) => x.startsAt > e.startsAt && !x.cancelledAt).length,
        dates: later.map((x) => ({ slug: x.slug, startsAt: x.startsAt, cancelled: !!x.cancelledAt, registered: x.registrations.filter((r) => !r.waitlist).length })),
      } : null,
      hive: hive ? { id: hive.id, name: hive.name } : null,
      speakers: speakers.map((s) => person(s.member)),
      cancelled: !!e.cancelledAt,
      registrants: registrations.map((r) => ({ memberId: r.memberId, ...person(r.member), city: r.member.city, waitlist: r.waitlist, attended: !!r.attendedAt, at: r.createdAt })),
      stats: { views: e.views, registered: registrations.filter((r) => !r.waitlist).length, waitlist: registrations.filter((r) => r.waitlist).length, attended: registrations.filter((r) => r.attendedAt).length },
    };
  }),

  /** Cocher les présents. */
  setAttendance: readProc.input(z.object({ eventId: z.number().int(), memberId: z.number().int(), attended: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const e = await db.query.events.findFirst({ where: eq(events.id, input.eventId) });
    if (!e) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "event.edit", await eventResource(ctx.member, e), "Seuls ses organisateurs cochent les présents.");
    const rows = await db.update(eventRegistrations).set({ attendedAt: input.attended ? new Date() : null }).where(and(eq(eventRegistrations.eventId, e.id), eq(eventRegistrations.memberId, input.memberId), eq(eventRegistrations.waitlist, false))).returning();
    if (!rows.length) throw badRequest("Cette personne n’est pas inscrite.");
    if (e.type === "bienvenue") {
      if (input.attended) await award(input.memberId, "bienvenue_presence");
      else await revoke(input.memberId, "bienvenue_presence");
    }
    await logIfOnBehalf(ctx.member, e.hostId, { action: input.attended ? "Présence cochée" : "Présence décochée", targetType: "evenement", targetId: e.id, label: e.title, detail: `Fiche n° ${input.memberId}` });
    return { ok: true };
  }),

  /**
   * Annuler : l'événement reste visible avec la mention « annulé », et les inscrits sont prévenus.
   * Dans une série, on annule cette date seule, ou cette date et toutes les suivantes : la série s'arrête alors.
   */
  cancel: readProc.input(z.object({ id: z.number().int(), following: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const e = await db.query.events.findFirst({ where: eq(events.id, input.id), with: { registrations: true } });
    if (!e) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "event.edit", await eventResource(ctx.member, e), "Seuls ses organisateurs peuvent annuler cet événement.");
    const stopping = input.following && !!e.seriesId;
    if (e.cancelledAt && !stopping) return { ok: true, notified: 0 };
    const dates = [e, ...(stopping ? await laterDates(e.seriesId!, e.startsAt) : [])].filter((x) => !x.cancelledAt);
    const now = new Date();
    const notified = new Set<number>();
    for (const x of dates) {
      await db.update(events).set({ cancelledAt: now }).where(eq(events.id, x.id));
      const others = x.registrations.map((r) => r.memberId).filter((id) => id !== ctx.memberId);
      others.forEach((id) => notified.add(id));
      await notify(others, { title: `Événement annulé : ${x.title}`, body: "L’organisation a annulé cet événement. Votre inscription est levée.", href: `/e/${x.slug}` });
    }
    if (stopping) await db.update(eventSeries).set({ stoppedAt: now }).where(eq(eventSeries.id, e.seriesId!));
    await logIfOnBehalf(ctx.member, e.hostId, { action: stopping ? "Série d’événements arrêtée" : "Événement annulé", targetType: "evenement", targetId: e.id, label: e.title, detail: notified.size ? `${notified.size} personne(s) prévenue(s)` : "" });
    return { ok: true, notified: notified.size, cancelled: dates.length };
  }),

  /** Retirer sa proposition tant qu'elle n'est pas publiée. Un événement publié s'annule. */
  withdraw: readProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const e = await db.query.events.findFirst({ where: eq(events.id, input.id) });
    if (!e) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "event.withdraw", await eventResource(ctx.member, e), "Un événement publié s’annule depuis sa page « Gérer ».");
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, e.id));
    await db.delete(events).where(eq(events.id, e.id));
    return { ok: true, title: e.title };
  }),

  /** Mes propositions en attente ou refusées. */
  myProposals: readProc.query(async ({ ctx }) => {
    const list = await getDb().query.events.findMany({ where: and(eq(events.hostId, ctx.memberId), inArray(events.status, ["pending", "rejected"])), orderBy: [desc(events.createdAt)] });
    return list.map((e) => ({ id: e.id, slug: e.slug, kind: e.kind, title: e.title, startsAt: e.startsAt, where: e.where, status: e.status, reviewNote: e.reviewNote }));
  }),

  /** Membres qu'un organisateur peut citer comme intervenants. */
  speakerChoices: readProc.query(async () => {
    const rows = await getDb().select().from(members).where(eq(members.status, "actif")).orderBy(asc(members.lastName));
    return rows.map(person);
  }),
});
