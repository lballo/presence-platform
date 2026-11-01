import { z } from "zod";
import { eq, and, desc, asc, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { assertCan, createRouter, procFor } from "../middleware";
import { can } from "../lib/permissions";
import { getDb } from "../queries/connection";
import { hives, hiveMembers, hivePosts, hiveResources, events, eventRegistrations, forumPosts, type Member } from "../../db/schema";
import { logAdmin } from "../lib/adminLog";
import { publicMember } from "../lib/format";
import { eventAccess } from "../lib/eventAccess";
import { deleteForumPosts } from "./forum";

type Role = "founder" | "leader" | "member" | "pending" | "";

async function roleOf(hiveId: number, memberId: number): Promise<Role> {
  const db = getDb();
  const row = await db.query.hiveMembers.findFirst({ where: and(eq(hiveMembers.hiveId, hiveId), eq(hiveMembers.memberId, memberId)) });
  return (row?.role ?? "") as Role;
}
/** Une administratrice qui n'est ni fondatrice ni leader de la ruche agit au titre de l'administration. */
async function logAsAdmin(actor: Member, role: Role, hiveId: number, action: string, detail = "") {
  if (actor.role !== "administrateur" || role === "founder" || role === "leader") return;
  const [h] = await getDb().select({ name: hives.name }).from(hives).where(eq(hives.id, hiveId)).limit(1);
  await logAdmin(actor, { action, targetType: "ruche", targetId: hiveId, label: h?.name ?? "", detail });
}

const isIn = (r: Role) => r === "founder" || r === "leader" || r === "member";
const hiveProc = procFor("hive.read");

async function requireHive(id: number) {
  const db = getDb();
  const h = await db.query.hives.findFirst({ where: eq(hives.id, id) });
  if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "Ruche introuvable" });
  return h;
}

export const hivesRouter = createRouter({
  /** Galerie : toutes les ruches avec mon rôle, le nombre de membres et le prochain rendez-vous. */
  list: hiveProc.query(async ({ ctx }) => {
    const db = getDb();
    const all = await db.query.hives.findMany({ with: { memberships: { with: { member: true } }, events: true, parent: true, children: true }, orderBy: [asc(hives.id)] });
    return all.map((h) => {
      const active = h.memberships.filter((m) => m.role !== "pending");
      const mine = h.memberships.find((m) => m.memberId === ctx.memberId);
      // Les événements d'une ruche restent réservés à ses membres.
      const seesEvents = isIn((mine?.role ?? "") as Role) || can(ctx.member, "moderate");
      const next = seesEvents ? h.events.filter((e) => e.status === "published" && !e.cancelledAt && e.startsAt >= new Date()).sort((a, b) => +a.startsAt - +b.startsAt)[0] : undefined;
      return {
        id: h.id, type: h.type, parentId: h.parentId, parentName: h.parent?.name ?? null,
        name: h.name, theme: h.theme, cover: h.cover, access: h.access, phase: h.phase, endMonth: h.endMonth,
        memberCount: active.length,
        projectCount: h.children.length,
        pendingCount: h.memberships.filter((m) => m.role === "pending").length,
        role: (mine?.role ?? "") as Role,
        canManage: can(ctx.member, "hive.manage", { hiveRole: (mine?.role ?? "") as Role }),
        faces: active.filter((m) => m.memberId !== ctx.memberId).slice(0, 3).map((m) => publicMember(m.member)),
        nextEvent: next ? { title: next.title, startsAt: next.startsAt } : null,
      };
    });
  }),

  /** Détail d'une ruche : discussions, projets, ressources, membres, événements. */
  byId: hiveProc.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const h = await db.query.hives.findFirst({
      where: eq(hives.id, input.id),
      with: {
        memberships: { with: { member: true }, orderBy: [asc(hiveMembers.createdAt)] },
        posts: { with: { author: true }, orderBy: [desc(hivePosts.createdAt)] },
        resources: { with: { author: true }, orderBy: [desc(hiveResources.pinned), desc(hiveResources.createdAt)] },
        events: { where: and(eq(events.status, "published"), isNull(events.cancelledAt)), with: { host: true, registrations: true }, orderBy: [asc(events.startsAt)] },
        parent: true,
        children: { with: { memberships: true } },
      },
    });
    if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "Ruche introuvable" });
    const role = (h.memberships.find((m) => m.memberId === ctx.memberId)?.role ?? "") as Role;
    const inside = isIn(role);
    const manager = can(ctx.member, "hive.manage", { hiveRole: role });
    const open = h.access === "libre" || can(ctx.member, "hive.read_private", { hiveRole: role });
    const leaders = h.memberships.filter((m) => m.role === "founder" || m.role === "leader");
    return {
      ...h,
      role, inside, canManage: manager, canDelete: can(ctx.member, "hive.delete"), locked: !open,
      canAnnounce: can(ctx.member, "hive.announce", { hiveRole: role }),
      canNameLeader: can(ctx.member, "hive.name_leader", { hiveRole: role }), canRemoveLeader: can(ctx.member, "hive.remove_leader", { hiveRole: role }),
      founder: publicMember(h.memberships.find((m) => m.role === "founder")?.member ?? h.memberships[0].member),
      leaders: leaders.map((m) => ({ ...publicMember(m.member), role: m.role })),
      members: h.memberships.filter((m) => m.role === "member").map((m) => publicMember(m.member)),
      requests: can(ctx.member, "hive.validate_member", { hiveRole: role }) ? h.memberships.filter((m) => m.role === "pending").map((m) => ({ ...publicMember(m.member), note: m.note })) : [],
      memberCount: h.memberships.filter((m) => m.role !== "pending").length,
      posts: open ? h.posts.filter((p) => !p.hiddenAt || p.authorId === ctx.memberId || can(ctx.member, "moderate")).map((p) => ({ ...p, hidden: !!p.hiddenAt, author: publicMember(p.author), isLeader: leaders.some((l) => l.memberId === p.authorId) })) : [],
      resources: open ? h.resources.map((r) => ({ ...r, author: publicMember(r.author) })) : [],
      seesEvents: inside || can(ctx.member, "moderate"),
      events: (inside || can(ctx.member, "moderate") ? h.events : []).map((e) => {
        const { address, meetingUrl, registrations, ...pub } = e;
        const registered = registrations.some((r) => r.memberId === ctx.memberId && !r.waitlist);
        return {
          ...pub, host: publicMember(e.host),
          registered,
          count: registrations.filter((r) => !r.waitlist).length,
          isMine: e.hostId === ctx.memberId,
          canManage: can(ctx.member, "event.edit", { ownerId: e.hostId, hiveId: e.hiveId, hiveRole: role }),
          ...eventAccess({ address, meetingUrl, kind: e.kind }, registered || e.hostId === ctx.memberId || manager),
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

  join: procFor("hive.join").input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const h = await requireHive(input.id);
    const role = await roleOf(h.id, ctx.memberId);
    if (role) return { role };
    const newRole = h.access === "libre" ? "member" : "pending";
    await db.insert(hiveMembers).values({ hiveId: h.id, memberId: ctx.memberId, role: newRole });
    return { role: newRole };
  }),

  leave: hiveProc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const role = await roleOf(input.id, ctx.memberId);
    if (role === "founder") throw new TRPCError({ code: "BAD_REQUEST", message: "La personne fondatrice ne peut pas quitter sa ruche." });
    await db.delete(hiveMembers).where(and(eq(hiveMembers.hiveId, input.id), eq(hiveMembers.memberId, ctx.memberId)));
    return { ok: true };
  }),

  /** Leaders : accepter ou refuser une demande d'adhésion. */
  decideRequest: hiveProc.input(z.object({ id: z.number(), memberId: z.number(), accept: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const role = await roleOf(input.id, ctx.memberId);
    assertCan(ctx.member, "hive.validate_member", { hiveRole: role });
    const where = and(eq(hiveMembers.hiveId, input.id), eq(hiveMembers.memberId, input.memberId), eq(hiveMembers.role, "pending"));
    if (input.accept) await db.update(hiveMembers).set({ role: "member" }).where(where);
    else await db.delete(hiveMembers).where(where);
    await logAsAdmin(ctx.member, role, input.id, input.accept ? "Demande d’adhésion acceptée" : "Demande d’adhésion refusée", `Fiche n° ${input.memberId}`);
    return { ok: true };
  }),

  /** Fondatrice, leaders ou administrateur : nommer un leader. Retirer le rôle : fondatrice ou administrateur. */
  setLeader: hiveProc.input(z.object({ id: z.number(), memberId: z.number(), leader: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const role = await roleOf(input.id, ctx.memberId);
    assertCan(ctx.member, input.leader ? "hive.name_leader" : "hive.remove_leader", { hiveRole: role });
    const rows = await db.update(hiveMembers).set({ role: input.leader ? "leader" : "member" })
      .where(and(eq(hiveMembers.hiveId, input.id), eq(hiveMembers.memberId, input.memberId), sql`${hiveMembers.role} in ('member', 'leader')`)).returning();
    if (!rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette personne doit d’abord être membre de la ruche." });
    await logAsAdmin(ctx.member, role, input.id, input.leader ? "Leader nommé" : "Rôle de leader retiré", `Fiche n° ${input.memberId}`);
    return { ok: true };
  }),

  post: hiveProc.input(z.object({ id: z.number(), text: z.string().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    assertCan(ctx.member, "hive.contribute", { hiveRole: await roleOf(input.id, ctx.memberId) }, "Rejoignez la ruche pour écrire.");
    const [row] = await db.insert(hivePosts).values({ hiveId: input.id, authorId: ctx.memberId, text: input.text }).returning();
    return row;
  }),

  addResource: hiveProc
    .input(z.object({ id: z.number(), kind: z.enum(["doc", "pdf", "sheet", "slides", "link"]), title: z.string().min(1).max(200), url: z.string().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      assertCan(ctx.member, "hive.contribute", { hiveRole: await roleOf(input.id, ctx.memberId) });
      const [row] = await db.insert(hiveResources).values({ hiveId: input.id, authorId: ctx.memberId, kind: input.kind, title: input.title, url: input.url, meta: input.url }).returning();
      return row;
    }),

  /** Créer une communauté ou une ruche projet (depuis la galerie ou depuis l'onglet Projets d'une ruche). */
  create: procFor("hive.create")
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

  setPhase: hiveProc.input(z.object({ id: z.number(), phase: z.enum(["idee", "en_cours", "termine"]) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    assertCan(ctx.member, "hive.manage", { hiveRole: await roleOf(input.id, ctx.memberId) });
    await db.update(hives).set({ phase: input.phase }).where(eq(hives.id, input.id));
    return { ok: true };
  }),

  /** Fondatrice, leaders ou administratrice : changer la confidentialité de la ruche. */
  setAccess: hiveProc.input(z.object({ id: z.number(), access: z.enum(["libre", "validation"]) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const role = await roleOf(input.id, ctx.memberId);
    assertCan(ctx.member, "hive.manage", { hiveRole: role }, "Réservé aux leaders de la ruche.");
    await db.update(hives).set({ access: input.access }).where(eq(hives.id, input.id));
    await logAsAdmin(ctx.member, role, input.id, "Confidentialité de la ruche modifiée", input.access === "libre" ? "Adhésion libre" : "Sur validation, contenu réservé aux membres");
    // En passant en accès libre, les demandes en attente sont acceptées.
    let accepted = 0;
    if (input.access === "libre") {
      const rows = await db.update(hiveMembers).set({ role: "member" }).where(and(eq(hiveMembers.hiveId, input.id), eq(hiveMembers.role, "pending"))).returning();
      accepted = rows.length;
    }
    return { ok: true, accepted };
  }),

  /** Administrateur : supprimer la ruche et son contenu. */
  remove: procFor("hive.delete").input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const h = await requireHive(input.id);
    const evs = await db.select({ id: events.id }).from(events).where(eq(events.hiveId, h.id));
    for (const e of evs) await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, e.id));
    await db.delete(events).where(eq(events.hiveId, h.id));
    await db.delete(hivePosts).where(eq(hivePosts.hiveId, h.id));
    await deleteForumPosts((await db.select({ id: forumPosts.id }).from(forumPosts).where(eq(forumPosts.hiveId, h.id))).map((p) => p.id));
    await db.delete(hiveResources).where(eq(hiveResources.hiveId, h.id));
    await db.delete(hiveMembers).where(eq(hiveMembers.hiveId, h.id));
    await db.update(hives).set({ parentId: null }).where(eq(hives.parentId, h.id)); // les projets nés ici continuent
    await db.delete(hives).where(eq(hives.id, h.id));
    await logAdmin(ctx.member, { action: "Ruche supprimée", targetType: "ruche", targetId: h.id, label: h.name });
    return { ok: true, name: h.name };
  }),
});
