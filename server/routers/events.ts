import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { events, eventRegistrations, hiveMembers } from "../../db/schema";
import { publicMember } from "../lib/format";
import { eventAccess } from "../lib/eventAccess";

export const eventsRouter = createRouter({
  /** Programme de la communauté : événements du cercle + salons live (+ événements de ruche où je suis inscrite). */
  program: proc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.events.findMany({ with: { host: true, hive: true, registrations: { with: { member: true } } }, orderBy: [asc(events.startsAt)] });
    return list
      .filter((e) => e.inAgenda || e.registrations.some((r) => r.memberId === ctx.memberId))
      .map((e) => {
        const regs = e.registrations.filter((r) => !r.waitlist);
        const mine = e.registrations.find((r) => r.memberId === ctx.memberId);
        return {
          id: e.id, kind: e.kind, title: e.title, description: e.description, startsAt: e.startsAt, durationMin: e.durationMin, days: e.days,
          city: e.city, where: e.where, lang: e.lang, maxSeats: e.maxSeats, featured: e.featured, photoUrl: e.photoUrl, withLine: e.withLine, live: e.live,
          hiveId: e.hiveId, hiveName: e.hive?.name ?? null,
          host: { ...publicMember(e.host), bio: e.host.bio, role: e.host.role },
          isMine: e.hostId === ctx.memberId,
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

  /** Administratrice : créer un événement du cercle (sans ruche). */
  create: proc
    .input(
      z.object({
        kind: z.enum(["onsite", "online", "salon"]),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).default(""),
        startsAt: z.coerce.date(),
        durationMin: z.number().int().min(15).max(600).default(60),
        city: z.string().max(80).optional(),
        address: z.string().max(400).default(""),
        meetingUrl: z.string().max(500).default(""),
        maxSeats: z.number().int().min(2).max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Réservé à l’équipe Présence." });
      if (input.kind === "onsite" && !input.address.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Indiquez l’adresse de l’événement." });
      if (input.kind !== "onsite" && !/^https?:\/\/\S+$/.test(input.meetingUrl.trim())) throw new TRPCError({ code: "BAD_REQUEST", message: "Indiquez le lien de la visio (https://…)." });
      const db = getDb();
      const [ev] = await db.insert(events).values({ ...input, hostId: ctx.memberId, where: input.kind === "onsite" ? input.city || "Présentiel" : "En ligne", inAgenda: true }).returning();
      await db.insert(eventRegistrations).values({ eventId: ev.id, memberId: ctx.memberId });
      return ev;
    }),
});
