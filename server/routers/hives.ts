import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { hives, hiveMembers, hivePosts, hiveResources, events, eventRegistrations } from "../../db/schema";
import { publicMember } from "../lib/format";
import { eventAccess } from "../lib/eventAccess";

type Role = "founder" | "leader" | "member" | "pending" | "";

async function roleOf(hiveId: number, memberId: number): Promise<Role> {
  const db = getDb();
  const row = await db.query.hiveMembers.findFirst({ where: and(eq(hiveMembers.hiveId, hiveId), eq(hiveMembers.memberId, memberId)) });
  return (row?.role ?? "") as Role;
}
const isIn = (r: Role) => r === "founder" || r === "leader" || r === "member";
const canManage = (r: Role) => r === "founder" || r === "leader";
const manages = async (hiveId: number, ctx: { memberId: number; isAdmin: boolean }) => ctx.isAdmin || canManage(await roleOf(hiveId, ctx.memberId));

async function requireHive(id: number) {
  const db = getDb();
  const h = await db.query.hives.findFirst({ where: eq(hives.id, id) });
  if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "Ruche introuvable" });
  return h;
}

export const hivesRouter = createRouter({
  /** Galerie : toutes les ruches avec mon rôle, le nombre de membres et le prochain rendez-vous. */
  list: proc.query(async ({ ctx }) => {
    const db = getDb();
    const all = await db.query.hives.findMany({ with: { memberships: { with: { member: true } }, events: true, parent: true, children: true }, orderBy: [asc(hives.id)] });
    return all.map((h) => {
      const active = h.memberships.filter((m) => m.role !== "pending");
      const mine = h.memberships.find((m) => m.memberId === ctx.memberId);
      const next = h.events.filter((e) => e.status === "published" && e.startsAt >= new Date()).sort((a, b) => +a.startsAt - +b.startsAt)[0];
      return {
        id: h.id, type: h.type, parentId: h.parentId, parentName: h.parent?.name ?? null,
        name: h.name, theme: h.theme, cover: h.cover, access: h.access, phase: h.phase, endMonth: h.endMonth,
        memberCount: active.length,
        projectCount: h.children.length,
        pendingCount: h.memberships.filter((m) => m.role === "pending").length,
        role: (mine?.role ?? "") as Role,
        faces: active.filter((m) => m.memberId !== ctx.memberId).slice(0, 3).map((m) => publicMember(m.member)),
        nextEvent: next ? { title: next.title, startsAt: next.startsAt } : null,
      };
    });
  }),

  /** Détail d'une ruche : discussions, projets, ressources, membres, événements. */
  byId: proc.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const h = await db.query.hives.findFirst({
      where: eq(hives.id, input.id),
      with: {
        memberships: { with: { member: true }, orderBy: [asc(hiveMembers.createdAt)] },
        posts: { with: { author: true }, orderBy: [desc(hivePosts.createdAt)] },
        resources: { with: { author: true }, orderBy: [desc(hiveResources.pinned), desc(hiveResources.createdAt)] },
        events: { where: eq(events.status, "published"), with: { host: true, registrations: true }, orderBy: [asc(events.startsAt)] },
        parent: true,
        children: { with: { memberships: true } },
      },
    });
    if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "Ruche introuvable" });
    const role = (h.memberships.find((m) => m.memberId === ctx.memberId)?.role ?? "") as Role;
    const inside = isIn(role);
    const open = inside || h.access === "libre";
    const leaders = h.memberships.filter((m) => m.role === "founder" || m.role === "leader");
    return {
      ...h,
      role, inside, canManage: canManage(role) || ctx.isAdmin, canDelete: role === "founder" || ctx.isAdmin, locked: !open,
      founder: publicMember(h.memberships.find((m) => m.role === "founder")?.member ?? h.memberships[0].member),
      leaders: leaders.map((m) => ({ ...publicMember(m.member), role: m.role })),
      members: h.memberships.filter((m) => m.role === "member").map((m) => publicMember(m.member)),
      requests: canManage(role) ? h.memberships.filter((m) => m.role === "pending").map((m) => ({ ...publicMember(m.member), note: m.note })) : [],
      memberCount: h.memberships.filter((m) => m.role !== "pending").length,
      posts: open ? h.posts.map((p) => ({ ...p, author: publicMember(p.author), isLeader: leaders.some((l) => l.memberId === p.authorId) })) : [],
      resources: open ? h.resources.map((r) => ({ ...r, author: publicMember(r.author) })) : [],
      events: h.events.map((e) => {
        const { address, meetingUrl, registrations, ...pub } = e;
        const registered = registrations.some((r) => r.memberId === ctx.memberId && !r.waitlist);
        return {
          ...pub, host: publicMember(e.host),
          registered,
          count: registrations.filter((r) => !r.waitlist).length,
          isMine: e.hostId === ctx.memberId,
          ...eventAccess({ address, meetingUrl, kind: e.kind }, registered || e.hostId === ctx.memberId || canManage(role) || ctx.isAdmin),
        };
      }),
      children: h.children.map((c) => ({
        id: c.id, name: c.name, goal: c.goal, phase: c.phase, endMonth: c.endMonth, needs: c.needs,
        memberCount: c.memberships.filter((m) => m.role !== "pending").length,
        myRole: (c.memberships.find((m) => m.memberId === ctx.memberId)?.role ?? "") as Role,
        leaderIds: c.memberships.filter((m) => m.role === "founder" || m.role === "leader").map((m) => m.memberId),
      })),
      memberships: undefined,
    };
  }),

  join: proc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const h = await requireHive(input.id);
    const role = await roleOf(h.id, ctx.memberId);
    if (role) return { role };
    const newRole = h.access === "libre" ? "member" : "pending";
    await db.insert(hiveMembers).values({ hiveId: h.id, memberId: ctx.memberId, role: newRole });
    return { role: newRole };
  }),

  leave: proc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const role = await roleOf(input.id, ctx.memberId);
    if (role === "founder") throw new TRPCError({ code: "BAD_REQUEST", message: "La personne fondatrice ne peut pas quitter sa ruche." });
    await db.delete(hiveMembers).where(and(eq(hiveMembers.hiveId, input.id), eq(hiveMembers.memberId, ctx.memberId)));
    return { ok: true };
  }),

  /** Leaders : accepter ou refuser une demande d'adhésion. */
  decideRequest: proc.input(z.object({ id: z.number(), memberId: z.number(), accept: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    if (!(await manages(input.id, ctx))) throw new TRPCError({ code: "FORBIDDEN" });
    const where = and(eq(hiveMembers.hiveId, input.id), eq(hiveMembers.memberId, input.memberId), eq(hiveMembers.role, "pending"));
    if (input.accept) await db.update(hiveMembers).set({ role: "member" }).where(where);
    else await db.delete(hiveMembers).where(where);
    return { ok: true };
  }),

  /** Fondateur : nommer ou retirer un leader. */
  setLeader: proc.input(z.object({ id: z.number(), memberId: z.number(), leader: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    if ((await roleOf(input.id, ctx.memberId)) !== "founder") throw new TRPCError({ code: "FORBIDDEN" });
    await db.update(hiveMembers).set({ role: input.leader ? "leader" : "member" })
      .where(and(eq(hiveMembers.hiveId, input.id), eq(hiveMembers.memberId, input.memberId), sql`${hiveMembers.role} <> 'founder'`));
    return { ok: true };
  }),

  post: proc.input(z.object({ id: z.number(), text: z.string().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    if (!isIn(await roleOf(input.id, ctx.memberId))) throw new TRPCError({ code: "FORBIDDEN", message: "Rejoignez la ruche pour écrire." });
    const [row] = await db.insert(hivePosts).values({ hiveId: input.id, authorId: ctx.memberId, text: input.text }).returning();
    return row;
  }),

  addResource: proc
    .input(z.object({ id: z.number(), kind: z.enum(["doc", "pdf", "sheet", "slides", "link"]), title: z.string().min(1).max(200), url: z.string().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!isIn(await roleOf(input.id, ctx.memberId))) throw new TRPCError({ code: "FORBIDDEN" });
      const [row] = await db.insert(hiveResources).values({ hiveId: input.id, authorId: ctx.memberId, kind: input.kind, title: input.title, url: input.url, meta: input.url }).returning();
      return row;
    }),

  /** Créer une communauté ou une ruche projet (depuis la galerie ou depuis l'onglet Projets d'une ruche). */
  create: proc
    .input(
      z.object({
        type: z.enum(["communaute", "projet"]),
        name: z.string().min(1).max(160),
        theme: z.string().max(120).default(""),
        description: z.string().max(2000).default(""),
        cover: z.string().max(20).default("rouge"),
        access: z.enum(["libre", "validation"]).default("libre"),
        goal: z.string().max(600).default(""),
        needs: z.array(z.string().min(1).max(60)).max(8).default([]),
        endMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null),
        parentId: z.number().nullable().default(null),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [h] = await db.insert(hives).values({
        ...input,
        founderId: ctx.memberId,
        phase: input.type === "projet" ? "idee" : null,
        theme: input.type === "projet" ? "Ruche projet" : input.theme || "Nouvelle ruche",
      }).returning();
      await db.insert(hiveMembers).values({ hiveId: h.id, memberId: ctx.memberId, role: "founder" });
      return h;
    }),

  setPhase: proc.input(z.object({ id: z.number(), phase: z.enum(["idee", "en_cours", "termine"]) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    if (!(await manages(input.id, ctx))) throw new TRPCError({ code: "FORBIDDEN" });
    await db.update(hives).set({ phase: input.phase }).where(eq(hives.id, input.id));
    return { ok: true };
  }),

  /** Leaders : créer un événement de ruche (ou un salon live). */
  createEvent: proc
    .input(
      z.object({
        id: z.number(),
        kind: z.enum(["onsite", "online", "salon"]).default("online"),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).default(""),
        startsAt: z.coerce.date(),
        durationMin: z.number().int().min(15).max(600).default(60),
        city: z.string().max(80).optional(),
        where: z.string().max(200).default(""),
        address: z.string().max(400).default(""),
        meetingUrl: z.string().max(500).default(""),
        maxSeats: z.number().int().min(2).max(500).optional(),
        inAgenda: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!(await manages(input.id, ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "Seuls les leaders créent des événements." });
      if (input.kind === "onsite" && !input.address.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Indiquez l’adresse de l’événement." });
      if (input.kind !== "onsite" && !/^https?:\/\/\S+$/.test(input.meetingUrl.trim())) throw new TRPCError({ code: "BAD_REQUEST", message: "Indiquez le lien de la visio (https://…)." });
      const { id, ...rest } = input;
      // Les événements de ruche restent dans la ruche : ils ne rejoignent pas le programme de Présence.
      const [ev] = await db.insert(events).values({ ...rest, inAgenda: false, hiveId: id, hostId: ctx.memberId, where: rest.where || (rest.kind === "onsite" ? rest.city ?? "" : "En ligne") }).returning();
      await db.insert(eventRegistrations).values({ eventId: ev.id, memberId: ctx.memberId });
      return ev;
    }),

  /** Fondatrice, leaders ou administratrice : changer la confidentialité de la ruche. */
  setAccess: proc.input(z.object({ id: z.number(), access: z.enum(["libre", "validation"]) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    if (!(await manages(input.id, ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "Réservé aux leaders de la ruche." });
    await db.update(hives).set({ access: input.access }).where(eq(hives.id, input.id));
    // En passant en accès libre, les demandes en attente sont acceptées.
    let accepted = 0;
    if (input.access === "libre") {
      const rows = await db.update(hiveMembers).set({ role: "member" }).where(and(eq(hiveMembers.hiveId, input.id), eq(hiveMembers.role, "pending"))).returning();
      accepted = rows.length;
    }
    return { ok: true, accepted };
  }),

  /** Fondatrice ou administratrice : supprimer la ruche et son contenu. */
  remove: proc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const h = await requireHive(input.id);
    const role = await roleOf(h.id, ctx.memberId);
    if (role !== "founder" && !ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Seule la personne fondatrice peut supprimer la ruche." });
    const evs = await db.select({ id: events.id }).from(events).where(eq(events.hiveId, h.id));
    for (const e of evs) await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, e.id));
    await db.delete(events).where(eq(events.hiveId, h.id));
    await db.delete(hivePosts).where(eq(hivePosts.hiveId, h.id));
    await db.delete(hiveResources).where(eq(hiveResources.hiveId, h.id));
    await db.delete(hiveMembers).where(eq(hiveMembers.hiveId, h.id));
    await db.update(hives).set({ parentId: null }).where(eq(hives.parentId, h.id)); // les projets nés ici continuent
    await db.delete(hives).where(eq(hives.id, h.id));
    return { ok: true, name: h.name };
  }),
});
