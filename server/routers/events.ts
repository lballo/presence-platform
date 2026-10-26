import { z } from "zod";
import { eq, and, asc, desc, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { events, eventRegistrations, hiveMembers } from "../../db/schema";
import type { TrpcContext } from "../context";
import { publicMember } from "../lib/format";
import { eventAccess } from "../lib/eventAccess";

const eventInput = z.object({
  kind: z.enum(["onsite", "online", "salon"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(""),
  startsAt: z.coerce.date(),
  durationMin: z.number().int().min(15).max(600).default(60),
  city: z.string().max(80).optional(),
  address: z.string().max(400).default(""),
  meetingUrl: z.string().max(500).default(""),
  maxSeats: z.number().int().min(2).max(500).optional(),
});
type EventInput = z.infer<typeof eventInput>;

function checkAccessInfo(input: EventInput) {
  if (input.kind === "onsite" && !input.address.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Indiquez l’adresse de l’événement." });
  if (input.kind !== "onsite" && !/^https?:\/\/\S+$/.test(input.meetingUrl.trim())) throw new TRPCError({ code: "BAD_REQUEST", message: "Indiquez le lien de la visio (https://…)." });
}
const normalize = (input: EventInput) => ({
  ...input,
  city: input.kind === "onsite" ? input.city ?? "" : null,
  where: input.kind === "onsite" ? input.city || "Présentiel" : "En ligne",
  address: input.kind === "onsite" ? input.address.trim() : "",
  meetingUrl: input.kind === "onsite" ? "" : input.meetingUrl.trim(),
  maxSeats: input.maxSeats ?? null,
});

/** Qui peut modifier ou supprimer un événement : l'administratrice, ou son organisateur (statut organisateur, ou leader de la ruche qui le porte). */
async function canEditEvent(ctx: TrpcContext, e: { hostId: number; hiveId: number | null }) {
  if (ctx.isAdmin) return true;
  if (e.hostId !== ctx.memberId) return false;
  if (ctx.isOrganizer) return true;
  if (e.hiveId) {
    const m = await getDb().query.hiveMembers.findFirst({ where: and(eq(hiveMembers.hiveId, e.hiveId), eq(hiveMembers.memberId, ctx.memberId)) });
    return m?.role === "founder" || m?.role === "leader";
  }
  return false;
}

export const eventsRouter = createRouter({
  /** Programme de Présence : uniquement les événements du cercle (les événements de ruche restent dans leur ruche). */
  program: proc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.events.findMany({ where: and(eq(events.status, "published"), isNull(events.hiveId)), with: { host: true, hive: true, registrations: { with: { member: true } } }, orderBy: [asc(events.startsAt)] });
    const leaderOf = new Set(
      (await db.query.hiveMembers.findMany({ where: eq(hiveMembers.memberId, ctx.memberId) })).filter((m) => m.role === "founder" || m.role === "leader").map((m) => m.hiveId)
    );
    return list
      .map((e) => {
        const regs = e.registrations.filter((r) => !r.waitlist);
        const mine = e.registrations.find((r) => r.memberId === ctx.memberId);
        return {
          id: e.id, kind: e.kind, title: e.title, description: e.description, startsAt: e.startsAt, durationMin: e.durationMin, days: e.days,
          city: e.city, where: e.where, lang: e.lang, maxSeats: e.maxSeats, featured: e.featured, photoUrl: e.photoUrl, withLine: e.withLine, live: e.live,
          hiveId: e.hiveId, hiveName: e.hive?.name ?? null,
          host: { ...publicMember(e.host), bio: e.host.bio, role: e.host.role },
          isMine: e.hostId === ctx.memberId,
          canEdit: ctx.isAdmin || (e.hostId === ctx.memberId && (ctx.isOrganizer || (!!e.hiveId && leaderOf.has(e.hiveId)))),
          taken: regs.length,
          faces: regs.slice(0, 3).map((r) => publicMember(r.member)),
          registered: !!mine && !mine.waitlist,
          waitlisted: !!mine && mine.waitlist,
          ...eventAccess(e, (!!mine && !mine.waitlist) || e.hostId === ctx.memberId || ctx.isAdmin),
        };
      });
  }),

  /** S'inscrire / se désinscrire (liste d'attente si complet). */
  toggleRegistration: proc.input(z.object({ eventId: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const e = await db.query.events.findFirst({ where: eq(events.id, input.eventId), with: { registrations: true } });
    if (!e) throw new TRPCError({ code: "NOT_FOUND" });
    if (e.status !== "published") throw new TRPCError({ code: "BAD_REQUEST", message: "Cet événement n’est pas encore publié." });
    if (e.hiveId && !e.inAgenda) {
      const m = await db.query.hiveMembers.findFirst({ where: and(eq(hiveMembers.hiveId, e.hiveId), eq(hiveMembers.memberId, ctx.memberId)) });
      if (!m || m.role === "pending") throw new TRPCError({ code: "FORBIDDEN", message: "Réservé aux membres de la ruche." });
    }
    const mine = e.registrations.find((r) => r.memberId === ctx.memberId);
    if (mine) {
      await db.delete(eventRegistrations).where(eq(eventRegistrations.id, mine.id));
      return { registered: false, waitlist: false };
    }
    const taken = e.registrations.filter((r) => !r.waitlist).length;
    const waitlist = !!e.maxSeats && taken >= e.maxSeats;
    await db.insert(eventRegistrations).values({ eventId: e.id, memberId: ctx.memberId, waitlist });
    return { registered: !waitlist, waitlist };
  }),

  /** Ruches dont je suis leader (pour proposer un salon). */
  myLeaderHives: proc.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.query.hiveMembers.findMany({ where: eq(hiveMembers.memberId, ctx.memberId), with: { hive: true } });
    return rows.filter((r) => r.role === "founder" || r.role === "leader").map((r) => ({ id: r.hive.id, name: r.hive.name }));
  }),

  /** Créer un événement du cercle : publié directement par les organisateurs, soumis à validation pour les membres simples. */
  create: proc.input(eventInput).mutation(async ({ ctx, input }) => {
    checkAccessInfo(input);
    const db = getDb();
    const status = ctx.isOrganizer ? "published" : "pending";
    const [ev] = await db.insert(events).values({ ...normalize(input), hostId: ctx.memberId, inAgenda: true, status }).returning();
    await db.insert(eventRegistrations).values({ eventId: ev.id, memberId: ctx.memberId });
    return { id: ev.id, status };
  }),

  /** Modifier un événement (organisateur de l'événement ou administratrice). */
  update: proc.input(eventInput.extend({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const e = await db.query.events.findFirst({ where: eq(events.id, input.id) });
    if (!e) throw new TRPCError({ code: "NOT_FOUND" });
    if (!(await canEditEvent(ctx, e))) throw new TRPCError({ code: "FORBIDDEN", message: "Seuls les organisateurs peuvent modifier cet événement." });
    checkAccessInfo(input);
    const { id, ...rest } = input;
    await db.update(events).set(normalize(rest)).where(eq(events.id, id));
    return { ok: true };
  }),

  /** Supprimer un événement (organisateur de l'événement ou administratrice). */
  remove: proc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const e = await db.query.events.findFirst({ where: eq(events.id, input.id) });
    if (!e) throw new TRPCError({ code: "NOT_FOUND" });
    const ownPending = e.hostId === ctx.memberId && e.status !== "published"; // retirer sa propre proposition
    if (!ownPending && !(await canEditEvent(ctx, e))) throw new TRPCError({ code: "FORBIDDEN", message: "Seuls les organisateurs peuvent supprimer cet événement." });
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, e.id));
    await db.delete(events).where(eq(events.id, e.id));
    return { ok: true, title: e.title };
  }),

  /** Mes propositions en attente ou refusées. */
  myProposals: proc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.events.findMany({ where: and(eq(events.hostId, ctx.memberId), inArray(events.status, ["pending", "rejected"])), orderBy: [desc(events.createdAt)] });
    return list.map((e) => ({ id: e.id, kind: e.kind, title: e.title, startsAt: e.startsAt, where: e.where, status: e.status }));
  }),

  /** Administratrice : propositions à valider. */
  pending: proc.query(async ({ ctx }) => {
    if (!ctx.isAdmin) return [];
    const db = getDb();
    const list = await db.query.events.findMany({ where: eq(events.status, "pending"), with: { host: true }, orderBy: [asc(events.startsAt)] });
    return list.map((e) => ({ id: e.id, kind: e.kind, title: e.title, description: e.description, startsAt: e.startsAt, durationMin: e.durationMin, where: e.where, address: e.address, meetingUrl: e.meetingUrl, maxSeats: e.maxSeats, createdAt: e.createdAt, host: publicMember(e.host) }));
  }),

  /** Administratrice : publier ou refuser une proposition. */
  decide: proc.input(z.object({ id: z.number(), accept: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (!ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Réservé à l’équipe Présence." });
    await getDb().update(events).set({ status: input.accept ? "published" : "rejected" }).where(and(eq(events.id, input.id), eq(events.status, "pending")));
    return { ok: true };
  }),
});
