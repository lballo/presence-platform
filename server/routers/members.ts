import { z } from "zod";
import { eq, and, ne, or, inArray, isNull, desc, asc, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { can } from "../lib/permissions";
import { isListed } from "../lib/listed";
import { getDb } from "../queries/connection";
import { members, swipes, messages, hiveMembers, talks, events } from "../../db/schema";
import { publicMember } from "../lib/format";
import { publicResults } from "../lib/testCatalog";
import { INTENT_CODES, INTENT_GROUPS, intentLabel, myIntentLabel } from "../lib/intents";
import { isOurImage } from "../lib/storage";
import { award } from "../lib/honey";

async function requireMember(id: number) {
  const db = getDb();
  const m = await db.query.members.findFirst({ where: eq(members.id, id) });
  if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable" });
  return m;
}

const profileProc = procFor("profile.use");

export const membersRouter = createRouter({
  /** Le membre "connecté" et son profil complet. */
  me: profileProc.query(async ({ ctx }) => {
    const m = await requireMember(ctx.memberId);
    return {
      ...publicMember(m),
      intentLabels: m.intents.map((c) => ({ code: c, label: myIntentLabel(c) })),
      intentGroups: INTENT_GROUPS,
      email: m.email,
      memberRole: m.role,
      accessType: m.accessType,
      accessEndsAt: m.accessEndsAt,
      goals: m.goals,
      tour: m.tour,
      rencontreEnabled: m.rencontreEnabled, rencontrePref: m.rencontrePref, rencontreBlurb: m.rencontreBlurb,
      // Ce que l'interface affiche ou masque : la décision reste celle de can()
      permissions: {
        publishEventsDirectly: can(m, "event.publish_directly"),
        validateEvents: can(m, "event.validate"),
        validateTalks: can(m, "talk.validate"),
        validateOpportunities: can(m, "opportunity.validate"),
        validateOrganizers: can(m, "organizer.validate"),
        manageMembers: can(m, "members.manage"),
        moderate: can(m, "moderate"),
        adminPanel: can(m, "admin.panel"),
        buildCourses: can(m, "course.build"),
        applyOrganizer: can(m, "organizer.apply"),
      },
      organizerRequest: m.organizerRequest,
      organizerRequestedAt: m.organizerRequestedAt,
    };
  }),

  /** Membre simple : postuler pour devenir organisateur. */
  requestOrganizer: procFor("organizer.apply").input(z.object({ motivation: z.string().trim().min(10).max(1500) })).mutation(async ({ ctx, input }) => {
    await getDb().update(members).set({ organizerRequest: input.motivation, organizerRequestedAt: new Date() }).where(eq(members.id, ctx.memberId));
    return { ok: true };
  }),

  cancelOrganizerRequest: profileProc.mutation(async ({ ctx }) => {
    await getDb().update(members).set({ organizerRequest: "", organizerRequestedAt: null }).where(eq(members.id, ctx.memberId));
    return { ok: true };
  }),

  updateProfile: profileProc
    .input(
      z.object({
        firstName: z.string().min(1).max(80),
        lastName: z.string().max(80).default(""),
        jobTitle: z.string().max(160).default(""),
        city: z.string().max(80).default(""),
        country: z.string().trim().max(80).default(""),
        photoUrl: z.string().trim().max(1000).nullable().optional(),
        intention: z.string().max(400).default(""),
        bio: z.string().max(1500).default(""),
        ambition: z.string().max(600).default(""),
        passions: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
        linkedinUrl: z.string().trim().max(300).default("").refine((u) => !u || /^https?:\/\/([\w-]+\.)?linkedin\.com\/\S+$/i.test(u), "Le lien LinkedIn doit ressembler à https://www.linkedin.com/in/votre-nom"),
        values: z.array(z.string().min(1).max(40)).max(5),
        intents: z.array(z.enum(INTENT_CODES)).max(3),
        langs: z.string().max(160).default(""),
        visibleInDirectory: z.boolean(),
        rencontreEnabled: z.boolean(),
        rencontrePref: z.enum(["f", "m", "all"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (input.photoUrl && input.photoUrl !== ctx.member.photoUrl && !isOurImage("avatar", input.photoUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Importez votre photo depuis le formulaire." });
      await db.update(members).set(input).where(eq(members.id, ctx.memberId));
      const m = await requireMember(ctx.memberId);
      if (m.photoUrl && m.jobTitle.trim() && m.city.trim() && m.bio.trim()) await award(m.id, "profil");
      return m;
    }),

  /** Annuaire : tous les membres visibles sauf moi. */
  /**
   * Mes relations : membres avec qui j'ai matché (hors Espace Rencontre, qui reste privé)
   * ou avec qui une conversation est engagée dans les deux sens.
   */
  relations: profileProc.query(async ({ ctx }) => {
    const db = getDb();
    const me = ctx.memberId;
    const GOALS: Record<string, string> = { mentorat: "Mentorat", pairs: "Pairs", associe: "Associé", invest: "Investissement", recrut: "Recrutement", amitie: "Amitié", parole: "Prise de parole" };
    const liked = await db.select().from(swipes).where(and(eq(swipes.liked, true), or(eq(swipes.fromId, me), eq(swipes.toId, me))));
    const rel = new Map<number, { goals: Set<string>; since: Date; lastMessageAt: Date | null; sent: boolean; received: boolean }>();
    const get = (id: number, at: Date) => {
      if (!rel.has(id)) rel.set(id, { goals: new Set(), since: at, lastMessageAt: null, sent: false, received: false });
      return rel.get(id)!;
    };
    for (const s of liked.filter((x) => x.fromId === me && x.goal !== "amour")) {
      const back = liked.find((t) => t.fromId === s.toId && t.toId === me && t.goal === s.goal);
      if (back) {
        const at = back.createdAt > s.createdAt ? back.createdAt : s.createdAt;
        const r = get(s.toId, at);
        r.goals.add(s.goal);
        if (at < r.since) r.since = at;
      }
    }
    const msgs = await db.select({ fromId: messages.fromId, toId: messages.toId, at: messages.createdAt }).from(messages).where(or(eq(messages.fromId, me), eq(messages.toId, me)));
    const talk = new Map<number, { sent: boolean; received: boolean; first: Date; last: Date }>();
    for (const m of msgs) {
      const peer = m.fromId === me ? m.toId : m.fromId;
      const t = talk.get(peer) ?? { sent: false, received: false, first: m.at, last: m.at };
      if (m.fromId === me) t.sent = true; else t.received = true;
      if (m.at < t.first) t.first = m.at;
      if (m.at > t.last) t.last = m.at;
      talk.set(peer, t);
    }
    for (const [peer, t] of talk) {
      if (rel.has(peer) || (t.sent && t.received)) {
        const r = get(peer, t.first);
        r.lastMessageAt = t.last; r.sent = t.sent; r.received = t.received;
      }
    }
    const ids = [...rel.keys()];
    if (!ids.length) return [];
    const people = await db.select().from(members).where(inArray(members.id, ids));
    return people
      .map((m) => {
        const r = rel.get(m.id)!;
        const reasons = [...r.goals].map((g) => `Match · ${GOALS[g] ?? g}`);
        if (r.sent && r.received) reasons.push("Échange en cours");
        return {
          ...publicMember(m),
          memberRole: m.role,
          tags: m.intents.map((code) => ({ code, key: code.split(":")[0], offer: code.endsWith(":offer"), label: intentLabel(code, m.gender) })),
          reasons,
          since: r.since,
          lastMessageAt: r.lastMessageAt,
        };
      })
      .sort((a, b) => +(b.lastMessageAt ?? b.since) - +(a.lastMessageAt ?? a.since));
  }),

  directory: profileProc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.members.findMany({
      where: and(eq(members.visibleInDirectory, true), ne(members.id, ctx.memberId), isListed()),
      orderBy: (m, { asc }) => [asc(m.lastName)],
    });
    return list.map((m) => ({
      ...publicMember(m),
      memberRole: m.role,
      tags: m.intents.map((code) => ({ code, key: code.split(":")[0], offer: code.endsWith(":offer"), label: intentLabel(code, m.gender) })),
    }));
  }),

  byId: profileProc.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const m = await requireMember(input.id);
    return { ...publicMember(m), tags: m.intents.map((code) => ({ code, label: intentLabel(code, m.gender) })) };
  }),

  /** Profil complet d'un membre : présentation, ruches, talks, événements animés, et notre lien éventuel. */
  profile: profileProc.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const m = await requireMember(input.id);
    const [memberships, myTalks, hosted, liked, msgs] = await Promise.all([
      db.query.hiveMembers.findMany({ where: eq(hiveMembers.memberId, m.id), with: { hive: true } }),
      db.query.talks.findMany({ where: and(eq(talks.speakerId, m.id), eq(talks.status, "published")), orderBy: [desc(talks.publishedAt)] }),
      db.query.events.findMany({ where: and(eq(events.hostId, m.id), eq(events.status, "published"), isNull(events.hiveId), isNull(events.cancelledAt), gte(events.startsAt, new Date())), orderBy: [asc(events.startsAt)], limit: 4 }),
      db.select().from(swipes).where(and(eq(swipes.liked, true), or(and(eq(swipes.fromId, ctx.memberId), eq(swipes.toId, m.id)), and(eq(swipes.fromId, m.id), eq(swipes.toId, ctx.memberId))))),
      db.select({ id: messages.id, at: messages.createdAt }).from(messages).where(or(and(eq(messages.fromId, ctx.memberId), eq(messages.toId, m.id)), and(eq(messages.fromId, m.id), eq(messages.toId, ctx.memberId)))).orderBy(desc(messages.createdAt)),
    ]);
    const GOALS: Record<string, string> = { mentorat: "Mentorat", pairs: "Pairs", associe: "Associé", invest: "Investissement", recrut: "Recrutement", amitie: "Amitié", parole: "Prise de parole" };
    const matchGoals = liked
      .filter((s) => s.fromId === ctx.memberId && s.goal !== "amour" && liked.some((t) => t.fromId === m.id && t.goal === s.goal))
      .map((s) => GOALS[s.goal] ?? s.goal);
    return {
      ...publicMember(m),
      memberRole: m.role,
      isMe: m.id === ctx.memberId,
      tags: m.intents.map((code) => ({ code, offer: code.endsWith(":offer"), label: intentLabel(code, m.gender) })),
      hives: memberships.filter((h) => h.role !== "pending").map((h) => ({ id: h.hive.id, name: h.hive.name, type: h.hive.type, cover: h.hive.cover, role: h.role })),
      talks: myTalks.map((t) => ({ id: t.id, title: t.title, summary: t.summary, durationMin: t.durationMin, views: t.views })),
      hosting: hosted.map((e) => ({ id: e.id, slug: e.slug, title: e.title, kind: e.kind, startsAt: e.startsAt, where: e.where })),
      // Seulement ce que le membre a choisi de montrer, thème par thème
      themeResults: (await publicResults([m.id])).get(m.id) ?? [],
      relation: { matchGoals, messageCount: msgs.length, lastMessageAt: msgs[0]?.at ?? null },
    };
  }),
});
