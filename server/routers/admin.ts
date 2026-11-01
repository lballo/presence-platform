import { z } from "zod";
import { and, asc, count, desc, eq, gte, gt, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import {
  adminLog, coachMemory, coachMessages, coachSettings, courseAssignments, courseEnrollments, emailPreferences, emailSends, eventRegistrations, events, forumDrafts, forumPosts, forumReplies, hiveMembers, hivePosts, hives,
  honeyLedger, invitations, journalEntries, memberActivity, memberTagLinks, members, messages, moduleProgress, notifications, reports, swipes, talks, testResults, workflowRuns, type Member,
} from "../../db/schema";
import { logAdmin } from "../lib/adminLog";
import { accountBlock } from "../lib/permissions";
import { inviteMember } from "../lib/invitations";
import { notify } from "../lib/notify";
import { publicMember } from "../lib/format";
import { unregisterMember } from "./events";
import { deleteForumPosts } from "./forum";

const adminProc = procFor("admin.panel");
const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const DAY = 86400000;
const fullName = (m: Pick<Member, "firstName" | "lastName">) => `${m.firstName} ${m.lastName}`.trim();
const ROLE_LABEL = { membre: "Membre", organisateur: "Organisateur", administrateur: "Administrateur" } as const;
const ACCESS_LABEL = { collectif: "Collectif", individuel: "Individuel", les_deux: "Les deux" } as const;
const parisDay = (d: Date | null) => (d ? d.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }) : "aucune");

/** Où en est le compte, en un mot : ce que la liste et la fiche affichent. */
export function memberState(m: Pick<Member, "status" | "accessEndsAt" | "deletedAt" | "passwordChosenAt" | "invitedAt">, now = new Date()) {
  if (m.deletedAt) return "supprime" as const;
  const block = accountBlock(m, now);
  if (block) return block === "expire" ? ("expire" as const) : block;
  if (m.passwordChosenAt) return "actif" as const;
  return m.invitedAt ? ("invite" as const) : ("sans_compte" as const);
}

async function requireMember(id: number) {
  const [m] = await getDb().select().from(members).where(eq(members.id, id)).limit(1);
  if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable" });
  return m;
}

/** Les comptes qui ont accès aujourd'hui. */
const hasAccess = (now: Date) => and(eq(members.status, "actif"), isNull(members.deletedAt), isNotNull(members.passwordChosenAt), or(isNull(members.accessEndsAt), gt(members.accessEndsAt, now)));

/** Inscriptions aux réunions de bienvenue, membre par membre. */
async function welcomeOf() {
  const rows = await getDb().select({ memberId: eventRegistrations.memberId, attendedAt: eventRegistrations.attendedAt })
    .from(eventRegistrations).innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(and(eq(events.type, "bienvenue"), isNull(events.cancelledAt)));
  const out = new Map<number, { registered: boolean; attended: boolean }>();
  for (const r of rows) out.set(r.memberId, { registered: true, attended: !!r.attendedAt || !!out.get(r.memberId)?.attended });
  return out;
}

async function pendingCounts() {
  const db = getDb();
  const [[e], [t], [o], [c]] = await Promise.all([
    db.select({ n: count() }).from(events).where(eq(events.status, "pending")),
    db.select({ n: count() }).from(talks).where(eq(talks.status, "pending")),
    db.select({ n: count() }).from(forumPosts).where(eq(forumPosts.status, "pending")),
    db.select({ n: count() }).from(members).where(and(isNotNull(members.organizerRequestedAt), eq(members.role, "membre"), isNull(members.deletedAt))),
  ]);
  return { event: e.n, talk: t.n, opportunity: o.n, organizer: c.n, total: e.n + t.n + o.n + c.n };
}

/** Supprimer un membre : le compte est désactivé et la fiche anonymisée, ses publications restent en ligne. */
async function anonymize(m: Member) {
  const db = getDb();
  const now = new Date();
  // Les places libérées profitent à la liste d'attente
  const upcoming = await db.select({ id: events.id }).from(eventRegistrations).innerJoin(events, eq(events.id, eventRegistrations.eventId)).where(and(eq(eventRegistrations.memberId, m.id), gt(events.startsAt, now)));
  for (const e of upcoming) await unregisterMember(e.id, m.id);
  await db.update(members).set({
    firstName: "Membre", lastName: "supprimé", gender: "f", jobTitle: "", org: "", city: "", country: "", zone: "France", photoUrl: null,
    bio: "", intention: "", ambition: "", passions: [], linkedinUrl: "", values: [], intents: [], pole: "", langs: "",
    visibleInDirectory: false, rencontreEnabled: false, rencontreBlurb: "", isCoached: false,
    goals: [], goalsOther: "", matchProfiles: [], matchSectors: [], profileType: "", sector: "",
    organizerRequest: "", organizerRequestedAt: null,
    role: "membre", status: "termine", accessEndsAt: now, deletedAt: now,
    // Le compte de connexion reste dans Supabase, partagé avec PresenceAI : seul le lien avec cette fiche est coupé.
    email: null, authUserId: null,
  }).where(eq(members.id, m.id));
  await Promise.all([
    db.update(invitations).set({ revokedAt: now }).where(and(eq(invitations.memberId, m.id), isNull(invitations.usedAt), isNull(invitations.revokedAt))),
    db.delete(coachMessages).where(eq(coachMessages.memberId, m.id)),
    db.delete(forumDrafts).where(eq(forumDrafts.memberId, m.id)),
    db.delete(notifications).where(eq(notifications.memberId, m.id)),
    db.delete(swipes).where(or(eq(swipes.fromId, m.id), eq(swipes.toId, m.id))),
    db.delete(hiveMembers).where(and(eq(hiveMembers.memberId, m.id), ne(hiveMembers.role, "founder"))),
    // Formations : le journal, les tests, la mémoire du coach et la progression disparaissent avec le membre
    db.delete(journalEntries).where(eq(journalEntries.memberId, m.id)),
    db.delete(testResults).where(eq(testResults.memberId, m.id)),
    db.delete(coachMemory).where(eq(coachMemory.memberId, m.id)),
    db.delete(coachSettings).where(eq(coachSettings.memberId, m.id)),
    db.delete(moduleProgress).where(eq(moduleProgress.memberId, m.id)),
    db.delete(courseEnrollments).where(eq(courseEnrollments.memberId, m.id)),
    db.delete(courseAssignments).where(eq(courseAssignments.memberId, m.id)),
    db.delete(memberTagLinks).where(eq(memberTagLinks.memberId, m.id)),
    db.delete(memberActivity).where(eq(memberActivity.memberId, m.id)),
    db.delete(workflowRuns).where(eq(workflowRuns.memberId, m.id)),
    db.delete(emailPreferences).where(eq(emailPreferences.memberId, m.id)),
    db.delete(emailSends).where(eq(emailSends.memberId, m.id)),
  ]);
}

/* ───────────── Modération ───────────── */

const KIND_LABEL = { post: "publication", reply: "réponse", message: "message privé", hive_post: "message de ruche" } as const;

/** Où retrouver le contenu signalé. Un message privé n'a pas de lien : seul son contexte strict est montré. */
async function reportTarget(kind: keyof typeof KIND_LABEL, id: number) {
  const db = getDb();
  if (kind === "post") {
    const [p] = await db.select({ id: forumPosts.id, hiddenAt: forumPosts.hiddenAt }).from(forumPosts).where(eq(forumPosts.id, id)).limit(1);
    return p ? { exists: true, hidden: !!p.hiddenAt, href: `/forum/publication/${p.id}` } : { exists: false, hidden: false, href: null };
  }
  if (kind === "reply") {
    const [r] = await db.select({ postId: forumReplies.postId, hiddenAt: forumReplies.hiddenAt }).from(forumReplies).where(eq(forumReplies.id, id)).limit(1);
    return r ? { exists: true, hidden: !!r.hiddenAt, href: `/forum/publication/${r.postId}` } : { exists: false, hidden: false, href: null };
  }
  if (kind === "hive_post") {
    const [p] = await db.select({ hiveId: hivePosts.hiveId, hiddenAt: hivePosts.hiddenAt }).from(hivePosts).where(eq(hivePosts.id, id)).limit(1);
    return p ? { exists: true, hidden: !!p.hiddenAt, href: `/ruches/${p.hiveId}` } : { exists: false, hidden: false, href: null };
  }
  const [m] = await db.select({ hiddenAt: messages.hiddenAt, deletedAt: messages.deletedAt }).from(messages).where(eq(messages.id, id)).limit(1);
  return m ? { exists: !m.deletedAt, hidden: !!m.hiddenAt, href: null } : { exists: false, hidden: false, href: null };
}

async function setHidden(kind: keyof typeof KIND_LABEL, id: number, hiddenAt: Date | null) {
  const db = getDb();
  if (kind === "post") await db.update(forumPosts).set({ hiddenAt }).where(eq(forumPosts.id, id));
  else if (kind === "reply") await db.update(forumReplies).set({ hiddenAt }).where(eq(forumReplies.id, id));
  else if (kind === "message") await db.update(messages).set({ hiddenAt }).where(eq(messages.id, id));
  else await db.update(hivePosts).set({ hiddenAt }).where(eq(hivePosts.id, id));
}

async function removeTarget(kind: keyof typeof KIND_LABEL, id: number) {
  const db = getDb();
  if (kind === "post") await deleteForumPosts([id]);
  else if (kind === "reply") await db.delete(forumReplies).where(eq(forumReplies.id, id));
  else if (kind === "message") await db.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, id)); // la trace « Message supprimé » reste
  else await db.delete(hivePosts).where(eq(hivePosts.id, id));
}

const reportActions = ["masquer", "supprimer", "classer", "suspendre", "retablir"] as const;

export const adminRouter = createRouter({
  /** Accueil : les compteurs. */
  overview: adminProc.query(async () => {
    const db = getDb();
    const now = new Date();
    const [[active], [recent], [open], [ending], pending] = await Promise.all([
      db.select({ n: count() }).from(members).where(hasAccess(now)),
      db.select({ n: count() }).from(members).where(and(hasAccess(now), gte(members.passwordChosenAt, new Date(now.getTime() - 30 * DAY)))),
      db.select({ n: count() }).from(reports).where(eq(reports.status, "ouvert")),
      db.select({ n: count() }).from(members).where(and(eq(members.status, "actif"), isNull(members.deletedAt), gt(members.accessEndsAt, now), lte(members.accessEndsAt, new Date(now.getTime() + 15 * DAY)))),
      pendingCounts(),
    ]);
    return { activeMembers: active.n, newMembers: recent.n, openReports: open.n, endingAccess: ending.n, pending };
  }),

  /* ───────────── Membres ───────────── */

  members: adminProc.query(async () => {
    const db = getDb();
    const [rows, welcome] = await Promise.all([db.select().from(members).orderBy(asc(members.lastName), asc(members.firstName)), welcomeOf()]);
    return rows.map((m) => ({
      id: m.id, name: fullName(m), firstName: m.firstName, lastName: m.lastName, initials: `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase(), photoUrl: m.photoUrl,
      email: m.email, jobTitle: m.jobTitle, role: m.role, accessType: m.accessType, accessEndsAt: m.accessEndsAt, state: memberState(m),
      invitedAt: m.invitedAt, joinedAt: m.passwordChosenAt, onboardingDone: !!m.onboardingCompletedAt, createdAt: m.createdAt,
      welcomeRegistered: !!welcome.get(m.id)?.registered, welcomeAttended: !!welcome.get(m.id)?.attended,
    }));
  }),

  member: adminProc.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const db = getDb();
    const m = await requireMember(input.id);
    const [welcome, honey, [posts], lastInvite] = await Promise.all([
      welcomeOf(),
      db.select({ n: sql<number>`coalesce(sum(${honeyLedger.amount}), 0)::int` }).from(honeyLedger).where(eq(honeyLedger.memberId, m.id)),
      db.select({ n: count() }).from(forumPosts).where(eq(forumPosts.authorId, m.id)),
      db.query.invitations.findFirst({ where: eq(invitations.memberId, m.id), orderBy: [desc(invitations.createdAt)] }),
    ]);
    return {
      id: m.id, name: fullName(m), initials: `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase(), photoUrl: m.photoUrl, firstName: m.firstName, lastName: m.lastName,
      email: m.email, jobTitle: m.jobTitle, city: m.city, role: m.role, accessType: m.accessType, accessEndsAt: m.accessEndsAt, state: memberState(m),
      invitedAt: m.invitedAt, joinedAt: m.passwordChosenAt, onboardingDone: !!m.onboardingCompletedAt, createdAt: m.createdAt,
      invitationExpiresAt: lastInvite && !lastInvite.usedAt && !lastInvite.revokedAt ? lastInvite.expiresAt : null,
      welcomeRegistered: !!welcome.get(m.id)?.registered, welcomeAttended: !!welcome.get(m.id)?.attended,
      honey: honey[0]?.n ?? 0, posts: posts.n,
    };
  }),

  /** Inviter : envoie un vrai e-mail d'invitation. */
  invite: adminProc
    .input(z.object({
      email: z.string().trim().email("Adresse e-mail invalide.").max(255),
      firstName: z.string().trim().min(1, "Indiquez le prénom.").max(80), lastName: z.string().trim().max(80).default(""),
      role: z.enum(["membre", "organisateur", "administrateur"]), accessType: z.enum(["collectif", "individuel", "les_deux"]),
      accessEndsAt: z.coerce.date().nullable().default(null),
      ficheId: z.number().int().optional(), // relier une fiche existante
    }))
    .mutation(async ({ ctx, input }) => {
      const r = await inviteMember({ ...input, sendEmail: true }).catch((e: unknown) => { throw badRequest(e instanceof Error ? e.message : "Invitation impossible."); });
      await logAdmin(ctx.member, { action: "Invitation envoyée", targetType: "membre", targetId: r.memberId, label: `${input.firstName} ${input.lastName}`.trim(), detail: `${ROLE_LABEL[input.role]} · ${ACCESS_LABEL[input.accessType]}${input.accessEndsAt ? ` · accès jusqu’au ${parisDay(input.accessEndsAt)}` : ""}` });
      return { memberId: r.memberId, url: r.url, expiresAt: r.expiresAt };
    }),

  /** Renvoyer une invitation à une personne qui n'a pas encore choisi son mot de passe. */
  resendInvitation: adminProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const m = await requireMember(input.id);
    if (m.deletedAt) throw badRequest("Ce membre a été supprimé.");
    if (!m.email) throw badRequest("Cette fiche n’a pas d’adresse e-mail : invitez-la en indiquant son adresse.");
    const r = await inviteMember({ email: m.email, firstName: m.firstName, lastName: m.lastName, role: m.role, accessType: m.accessType, ficheId: m.id, sendEmail: true }).catch((e: unknown) => { throw badRequest(e instanceof Error ? e.message : "Invitation impossible."); });
    await logAdmin(ctx.member, { action: "Invitation renvoyée", targetType: "membre", targetId: m.id, label: fullName(m) });
    return { url: r.url, expiresAt: r.expiresAt };
  }),

  /** Changer le rôle, le type d'accès ou la date de fin d'accès. */
  updateMember: adminProc
    .input(z.object({ id: z.number().int(), role: z.enum(["membre", "organisateur", "administrateur"]).optional(), accessType: z.enum(["collectif", "individuel", "les_deux"]).optional(), accessEndsAt: z.coerce.date().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(input.id);
      if (m.deletedAt) throw badRequest("Ce membre a été supprimé.");
      const changes: Partial<Member> = {};
      const log: string[] = [];
      if (input.role && input.role !== m.role) {
        if (m.id === ctx.memberId) throw badRequest("Vous ne pouvez pas changer votre propre rôle.");
        changes.role = input.role;
        if (input.role !== "membre") Object.assign(changes, { organizerRequest: "", organizerRequestedAt: null });
        log.push(`Rôle : ${ROLE_LABEL[m.role]} → ${ROLE_LABEL[input.role]}`);
      }
      if (input.accessType && input.accessType !== m.accessType) {
        changes.accessType = input.accessType;
        log.push(`Accès : ${ACCESS_LABEL[m.accessType]} → ${ACCESS_LABEL[input.accessType]}`);
      }
      if (input.accessEndsAt !== undefined && +(input.accessEndsAt ?? 0) !== +(m.accessEndsAt ?? 0)) {
        if (m.id === ctx.memberId && input.accessEndsAt && input.accessEndsAt <= new Date()) throw badRequest("Vous ne pouvez pas mettre fin à votre propre accès.");
        changes.accessEndsAt = input.accessEndsAt;
        log.push(`Fin d’accès : ${parisDay(m.accessEndsAt)} → ${parisDay(input.accessEndsAt)}`);
      }
      if (!log.length) return { ok: true };
      await getDb().update(members).set(changes).where(eq(members.id, m.id));
      await logAdmin(ctx.member, { action: "Fiche membre modifiée", targetType: "membre", targetId: m.id, label: fullName(m), detail: log.join(" · ") });
      return { ok: true };
    }),

  setSuspended: adminProc.input(z.object({ id: z.number().int(), suspended: z.boolean() })).mutation(async ({ ctx, input }) => {
    const m = await requireMember(input.id);
    if (m.deletedAt) throw badRequest("Ce membre a été supprimé.");
    if (m.id === ctx.memberId) throw badRequest("Vous ne pouvez pas suspendre votre propre compte.");
    await getDb().update(members).set({ status: input.suspended ? "suspendu" : "actif" }).where(eq(members.id, m.id));
    await logAdmin(ctx.member, { action: input.suspended ? "Compte suspendu" : "Compte réactivé", targetType: "membre", targetId: m.id, label: fullName(m) });
    return { ok: true };
  }),

  /** Double confirmation : le mot SUPPRIMER est vérifié ici aussi. */
  deleteMember: adminProc.input(z.object({ id: z.number().int(), confirm: z.string() })).mutation(async ({ ctx, input }) => {
    if (input.confirm !== "SUPPRIMER") throw badRequest("Écrivez SUPPRIMER pour confirmer.");
    const m = await requireMember(input.id);
    if (m.deletedAt) return { ok: true };
    if (m.id === ctx.memberId) throw badRequest("Vous ne pouvez pas supprimer votre propre compte.");
    await anonymize(m);
    await logAdmin(ctx.member, { action: "Membre supprimé", targetType: "membre", targetId: m.id, label: fullName(m), detail: "Compte désactivé, profil anonymisé, publications conservées" });
    return { ok: true };
  }),

  /* ───────────── Validations ───────────── */

  /** Une seule file : événements, talks, opportunités et candidatures organisateur. */
  validations: adminProc.query(async () => {
    const db = getDb();
    const [evs, tks, opps, cands] = await Promise.all([
      db.query.events.findMany({ where: eq(events.status, "pending"), with: { host: true, hive: true } }),
      db.query.talks.findMany({ where: eq(talks.status, "pending"), with: { speaker: true } }),
      db.query.forumPosts.findMany({ where: eq(forumPosts.status, "pending"), with: { author: true, space: true } }),
      db.select().from(members).where(and(isNotNull(members.organizerRequestedAt), eq(members.role, "membre"), isNull(members.deletedAt))),
    ]);
    const items = [
      ...evs.map((e) => ({ kind: "event" as const, id: e.id, title: e.title, author: publicMember(e.host), at: e.createdAt, summary: e.description || e.tagline, href: `/e/${e.slug}`, videoUrl: null, html: "", facts: [] as string[], startsAt: e.startsAt, eventKind: e.kind, visibility: e.visibility, place: e.kind === "onsite" ? e.address : e.meetingUrl, durationMin: e.durationMin })),
      ...tks.map((t) => ({ kind: "talk" as const, id: t.id, title: t.title, author: publicMember(t.speaker), at: t.submittedAt, summary: t.description, href: null, videoUrl: t.videoUrl, html: "", facts: [] as string[], startsAt: null, eventKind: null, visibility: null, place: "", durationMin: t.durationMin })),
      ...opps.map((o) => ({ kind: "opportunity" as const, id: o.id, title: o.title, author: publicMember(o.author), at: o.createdAt, summary: o.text, href: null, videoUrl: null, html: o.html, facts: o.facts, startsAt: null, eventKind: null, visibility: null, place: "", durationMin: 0 })),
      ...cands.map((m) => ({ kind: "organizer" as const, id: m.id, title: fullName(m), author: publicMember(m), at: m.organizerRequestedAt!, summary: m.organizerRequest, href: `/membres/${m.id}`, videoUrl: null, html: "", facts: [] as string[], startsAt: null, eventKind: null, visibility: null, place: "", durationMin: 0 })),
    ];
    return items.sort((a, b) => +new Date(a.at) - +new Date(b.at));
  }),

  /** Accepter ou refuser, avec un message facultatif : l'auteur le lit dans ses notifications. */
  decide: adminProc
    .input(z.object({ kind: z.enum(["event", "talk", "opportunity", "organizer"]), id: z.number().int(), accept: z.boolean(), message: z.string().trim().max(800).default("") }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { kind, id, accept, message } = input;
      const body = message || undefined;
      const note = message;
      if (kind === "event") {
        const [e] = await db.update(events).set({ status: accept ? "published" : "rejected", reviewNote: note }).where(and(eq(events.id, id), eq(events.status, "pending"))).returning();
        if (!e) throw badRequest("Cette proposition a déjà été traitée.");
        await notify([e.hostId], accept ? { title: `Votre événement est publié : ${e.title}`, body, href: `/e/${e.slug}` } : { title: `Votre proposition n’a pas été retenue : ${e.title}`, body, href: "/evenements" });
        await logAdmin(ctx.member, { action: accept ? "Événement publié" : "Événement refusé", targetType: "evenement", targetId: e.id, label: e.title, detail: message });
      } else if (kind === "talk") {
        const [t] = await db.update(talks).set(accept ? { status: "published", publishedAt: new Date(), reviewNote: note } : { status: "rejected", reviewNote: note }).where(and(eq(talks.id, id), eq(talks.status, "pending"))).returning();
        if (!t) throw badRequest("Cette proposition a déjà été traitée.");
        await notify([t.speakerId], { title: accept ? `Votre talk est publié : ${t.title}` : `Votre talk n’a pas été retenu : ${t.title}`, body, href: "/talk-show" });
        await logAdmin(ctx.member, { action: accept ? "Talk publié" : "Talk refusé", targetType: "talk", targetId: t.id, label: t.title, detail: message });
      } else if (kind === "opportunity") {
        const [o] = await db.update(forumPosts).set(accept ? { status: "published", publishedAt: new Date(), reviewNote: note } : { status: "rejected", reviewNote: note }).where(and(eq(forumPosts.id, id), eq(forumPosts.status, "pending"))).returning();
        if (!o) throw badRequest("Cette proposition a déjà été traitée.");
        await notify([o.authorId], { title: accept ? `Votre opportunité est publiée : ${o.title}` : `Votre opportunité n’a pas été retenue : ${o.title}`, body, href: accept ? `/forum/publication/${o.id}` : "/forum" });
        await logAdmin(ctx.member, { action: accept ? "Opportunité publiée" : "Opportunité refusée", targetType: "publication", targetId: o.id, label: o.title, detail: message });
      } else {
        const m = await requireMember(id);
        if (!m.organizerRequestedAt || m.role !== "membre") throw badRequest("Cette candidature a déjà été traitée.");
        await db.update(members).set({ organizerRequest: "", organizerRequestedAt: null, ...(accept ? { role: "organisateur" as const } : {}) }).where(eq(members.id, id));
        await notify([id], { title: accept ? "Votre candidature est acceptée : vous êtes organisateur" : "Votre candidature d’organisateur n’a pas été retenue", body, href: "/evenements" });
        await logAdmin(ctx.member, { action: accept ? "Candidature organisateur acceptée" : "Candidature organisateur refusée", targetType: "membre", targetId: id, label: fullName(m), detail: message });
      }
      return { ok: true };
    }),

  /* ───────────── Modération ───────────── */

  reports: adminProc.input(z.object({ status: z.enum(["ouvert", "traite", "classe"]).default("ouvert") })).query(async ({ input }) => {
    const db = getDb();
    const rows = await db.select().from(reports).where(eq(reports.status, input.status)).orderBy(desc(reports.createdAt)).limit(200);
    const ids = [...new Set(rows.flatMap((r) => [r.reporterId, r.authorId]))];
    const people = ids.length ? await db.select().from(members).where(inArray(members.id, ids)) : [];
    const who = (id: number) => { const m = people.find((p) => p.id === id); return m ? { id: m.id, name: fullName(m), suspended: m.status === "suspendu" } : { id, name: "Membre", suspended: false }; };
    return Promise.all(rows.map(async (r) => ({
      id: r.id, kind: r.kind, kindLabel: KIND_LABEL[r.kind], reason: r.reason, status: r.status, decision: r.decision, at: r.createdAt, decidedAt: r.decidedAt,
      reporter: who(r.reporterId), author: who(r.authorId), snapshot: r.kind === "message" ? "" : r.snapshot, target: await reportTarget(r.kind, r.targetId),
    })));
  }),

  /**
   * Le contenu d'un signalement. Pour un message privé : ce message et les deux avant et après, jamais le reste.
   * Chaque première lecture d'un message privé est inscrite au journal.
   */
  reportContext: adminProc.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const [r] = await db.select().from(reports).where(eq(reports.id, input.id)).limit(1);
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    if (r.kind !== "message") return { snapshot: r.snapshot, messages: [] };
    const [m] = await db.select().from(messages).where(eq(messages.id, r.targetId)).limit(1);
    if (!m) return { snapshot: r.snapshot, messages: [] };
    const pair = or(and(eq(messages.fromId, m.fromId), eq(messages.toId, m.toId)), and(eq(messages.fromId, m.toId), eq(messages.toId, m.fromId)));
    const [before, after, people] = await Promise.all([
      db.select().from(messages).where(and(pair, lt(messages.id, m.id))).orderBy(desc(messages.id)).limit(2),
      db.select().from(messages).where(and(pair, gt(messages.id, m.id))).orderBy(asc(messages.id)).limit(2),
      db.select().from(members).where(inArray(members.id, [m.fromId, m.toId])),
    ]);
    const nameOf = (id: number) => { const p = people.find((x) => x.id === id); return p ? fullName(p) : "Membre"; };
    const seen = await db.select({ id: adminLog.id }).from(adminLog).where(and(eq(adminLog.actorId, ctx.memberId), eq(adminLog.action, "Lecture d’un message signalé"), eq(adminLog.targetId, r.id))).limit(1);
    if (!seen.length) await logAdmin(ctx.member, { action: "Lecture d’un message signalé", targetType: "signalement", targetId: r.id, label: `Message de ${nameOf(m.fromId)}` });
    return {
      snapshot: r.snapshot,
      messages: [...before.reverse(), m, ...after].map((x) => ({
        id: x.id, from: nameOf(x.fromId), at: x.createdAt, reported: x.id === m.id, deleted: !!x.deletedAt, hidden: !!x.hiddenAt,
        text: x.deletedAt && x.id !== m.id ? "" : x.text || (x.attachmentName ? `Pièce jointe : ${x.attachmentName}` : ""),
      })),
    };
  }),

  /** Masquer, supprimer, classer sans suite, suspendre l'auteur, ou rétablir un contenu masqué. */
  resolveReport: adminProc.input(z.object({ id: z.number().int(), action: z.enum(reportActions) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [r] = await db.select().from(reports).where(eq(reports.id, input.id)).limit(1);
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    const author = await requireMember(r.authorId);
    const label = `${KIND_LABEL[r.kind]} de ${fullName(author)}`;
    const now = new Date();
    const same = and(eq(reports.kind, r.kind), eq(reports.targetId, r.targetId), eq(reports.status, "ouvert"));
    const close = async (status: "traite" | "classe", decision: string) => {
      const closed = await db.update(reports).set({ status, decision, decidedBy: ctx.memberId, decidedAt: now }).where(or(same, eq(reports.id, r.id))).returning({ reporterId: reports.reporterId });
      await notify([...new Set(closed.map((c) => c.reporterId))], { title: "Votre signalement a été examiné", body: "Merci de veiller sur le réseau." });
    };
    if (input.action === "masquer") {
      await setHidden(r.kind, r.targetId, now);
      await close("traite", "masque");
      await notify([r.authorId], { title: `Votre ${KIND_LABEL[r.kind]} a été masqué·e par la modération` });
      await logAdmin(ctx.member, { action: "Contenu masqué", targetType: r.kind, targetId: r.targetId, label });
    } else if (input.action === "retablir") {
      await setHidden(r.kind, r.targetId, null);
      await db.update(reports).set({ decision: "retabli", decidedBy: ctx.memberId, decidedAt: now }).where(eq(reports.id, r.id));
      await logAdmin(ctx.member, { action: "Contenu rétabli", targetType: r.kind, targetId: r.targetId, label });
    } else if (input.action === "supprimer") {
      await removeTarget(r.kind, r.targetId);
      await close("traite", "supprime");
      await notify([r.authorId], { title: `Votre ${KIND_LABEL[r.kind]} a été supprimé·e par la modération` });
      await logAdmin(ctx.member, { action: "Contenu supprimé", targetType: r.kind, targetId: r.targetId, label });
    } else if (input.action === "classer") {
      await close("classe", "sans_suite");
      await logAdmin(ctx.member, { action: "Signalement classé sans suite", targetType: "signalement", targetId: r.id, label });
    } else {
      if (r.authorId === ctx.memberId) throw badRequest("Vous ne pouvez pas suspendre votre propre compte.");
      if (author.deletedAt) throw badRequest("Ce membre a été supprimé.");
      await db.update(members).set({ status: "suspendu" }).where(eq(members.id, r.authorId));
      await close("traite", r.decision && r.decision !== "sans_suite" ? r.decision : "auteur_suspendu");
      await logAdmin(ctx.member, { action: "Compte suspendu", targetType: "membre", targetId: r.authorId, label: fullName(author), detail: `Après signalement d’un·e ${KIND_LABEL[r.kind]}` });
    }
    return { ok: true };
  }),

  /* ───────────── Ruches ───────────── */

  hives: adminProc.query(async () => {
    const rows = await getDb().query.hives.findMany({ with: { memberships: true, events: true, posts: true, founder: true }, orderBy: [asc(hives.name)] });
    return rows.map((h) => ({
      id: h.id, name: h.name, type: h.type, access: h.access, theme: h.theme, cover: h.cover, createdAt: h.createdAt, founder: h.founder ? fullName(h.founder) : "",
      memberCount: h.memberships.filter((m) => m.role !== "pending").length, pendingCount: h.memberships.filter((m) => m.role === "pending").length,
      eventCount: h.events.length, postCount: h.posts.length,
    }));
  }),

  /* ───────────── Événements ───────────── */

  events: adminProc.query(async () => {
    const rows = await getDb().query.events.findMany({ with: { host: true, hive: true, registrations: true }, orderBy: [desc(events.startsAt)] });
    return rows.map((e) => ({
      id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt, past: e.startsAt < new Date(), status: e.status, type: e.type, visibility: e.visibility, kind: e.kind, cancelled: !!e.cancelledAt,
      hive: e.hive ? { id: e.hive.id, name: e.hive.name } : null, host: e.host ? fullName(e.host) : "",
      stats: { views: e.views, registered: e.registrations.filter((r) => !r.waitlist).length, waitlist: e.registrations.filter((r) => r.waitlist).length, attended: e.registrations.filter((r) => r.attendedAt).length },
    }));
  }),

  /** Un événement du réseau passe en public (ou redevient réservé aux membres) en un clic. */
  setEventPublic: adminProc.input(z.object({ id: z.number().int(), public: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const e = await db.query.events.findFirst({ where: eq(events.id, input.id), with: { registrations: true } });
    if (!e) throw new TRPCError({ code: "NOT_FOUND" });
    if (e.hiveId) throw badRequest("Un événement de ruche reste réservé à sa ruche.");
    const visibility = input.public ? ("public" as const) : ("membres" as const);
    if (visibility === e.visibility) return { ok: true };
    await db.update(events).set({ visibility }).where(eq(events.id, e.id));
    if (!input.public && e.hostId !== ctx.memberId) {
      const registered = e.registrations.filter((r) => r.memberId !== e.hostId).length;
      await notify([e.hostId], { title: `Visibilité restreinte : ${e.title}`, body: registered ? `La page est désormais réservée aux membres. Les ${registered} personne(s) déjà inscrite(s) gardent leur place.` : "La page est désormais réservée aux membres.", href: `/e/${e.slug}` });
    }
    await logAdmin(ctx.member, { action: input.public ? "Événement passé en public" : "Événement réservé aux membres", targetType: "evenement", targetId: e.id, label: e.title });
    return { ok: true };
  }),

  /* ───────────── Annonces ───────────── */

  /** Retirer une annonce (elle ne s'affiche plus, sa date de fin est passée) ou la remettre en ligne. */
  setAnnouncementLive: adminProc.input(z.object({ id: z.number().int(), live: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const post = await db.query.forumPosts.findFirst({ where: eq(forumPosts.id, input.id), with: { space: true } });
    if (!post || !(post.hiveId || post.space?.kind === "annonces")) throw new TRPCError({ code: "NOT_FOUND", message: "Annonce introuvable" });
    await db.update(forumPosts).set(input.live ? { endsAt: null } : { endsAt: new Date(), pinnedAt: null }).where(eq(forumPosts.id, input.id));
    await logAdmin(ctx.member, { action: input.live ? "Annonce remise en ligne" : "Annonce retirée", targetType: "publication", targetId: post.id, label: post.title || post.text.slice(0, 80) });
    return { ok: true };
  }),

  /* ───────────── Journal ───────────── */

  log: adminProc.input(z.object({ limit: z.number().int().min(1).max(500).default(50) })).query(async ({ input }) => {
    const rows = await getDb().select().from(adminLog).orderBy(desc(adminLog.createdAt), desc(adminLog.id)).limit(input.limit + 1);
    return { rows: rows.slice(0, input.limit), hasMore: rows.length > input.limit };
  }),
});
