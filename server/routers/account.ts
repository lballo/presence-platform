import { z } from "zod";
import { asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import {
  coachMemory, coachMessages, emailPreferences, eventRegistrations, forumPosts, forumReplies, honeyLedger,
  journalEntries, lessonProgress, members, messages, testResults, courseLessons,
} from "../../db/schema";
import { open } from "../lib/privateBox";
import { memorySettings } from "../lib/coachMemory";
import { memberPreferences } from "../lib/email";
import { BELL_CATEGORIES, bellKey, notify, type BellCategory } from "../lib/notify";
import { logAdmin } from "../lib/adminLog";
import { env } from "../lib/env";
import { award } from "../lib/honey";
import { isOurImage } from "../lib/storage";
import { clientView } from "./coaching";
import { cancelSubscriptionNow, describe, findSubscription, pauseSubscription, portalUrl, resumeSubscription, stripeReady } from "../lib/stripe";
import { anonymize } from "./admin";

const proc = procFor("profile.use");
const fullName = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`.trim();
const bellCategory = z.enum(Object.keys(BELL_CATEGORIES) as [BellCategory, ...BellCategory[]]);
const RETURN = "/parametres/abonnement";

export const CANCEL_REASONS = { prix: "Le prix", necessite: "Je n’en ai plus besoin", integration: "Je ne me sens pas intégré·e dans le réseau", benefices: "Pas assez de bénéfices" } as const;
type Reason = keyof typeof CANCEL_REASONS;

async function admins() {
  return (await getDb().select({ id: members.id }).from(members).where(eq(members.role, "administrateur"))).map((a) => a.id);
}

/** L'abonnement Stripe du membre connecté ; sans clé ou sans adresse, rien à chercher. */
async function mySubscription(email: string | null) {
  if (!stripeReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le paiement n’est pas encore relié à Présence." });
  if (!email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Aucune adresse e-mail sur votre fiche." });
  return findSubscription(email);
}

const stripeError = (e: unknown) => new TRPCError({ code: "BAD_GATEWAY", message: e instanceof Error ? e.message : "Stripe ne répond pas. Réessayez dans un instant." });

/** Paramètres du compte : cloche, abonnement, données, suppression ; et les sous-onglets privés du profil. */
export const accountRouter = createRouter({
  /* ───────────── Notifications dans la cloche ───────────── */

  bellPrefs: proc.query(async ({ ctx }) => {
    const rows = await getDb().select().from(emailPreferences).where(eq(emailPreferences.memberId, ctx.memberId));
    return (Object.keys(BELL_CATEGORIES) as BellCategory[]).map((key) => ({ key, ...BELL_CATEGORIES[key], enabled: rows.find((r) => r.category === bellKey(key))?.enabled ?? true }));
  }),

  setBellPref: proc.input(z.object({ category: bellCategory, enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    const category = bellKey(input.category);
    await getDb().insert(emailPreferences).values({ memberId: ctx.memberId, category, enabled: input.enabled }).onConflictDoUpdate({ target: [emailPreferences.memberId, emailPreferences.category], set: { enabled: input.enabled, updatedAt: new Date() } });
    return { ok: true };
  }),

  /* ───────────── Identité ───────────── */

  /** Ma photo, envoyée depuis les paramètres : seulement une image de notre stockage. */
  setPhoto: proc.input(z.object({ photoUrl: z.string().trim().max(1000).nullable() })).mutation(async ({ ctx, input }) => {
    if (input.photoUrl && !isOurImage("avatar", input.photoUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Importez votre photo depuis le formulaire." });
    await getDb().update(members).set({ photoUrl: input.photoUrl }).where(eq(members.id, ctx.memberId));
    const m = { ...ctx.member, photoUrl: input.photoUrl };
    if (m.photoUrl && m.jobTitle.trim() && m.city.trim() && m.bio.trim()) await award(m.id, "profil");
    return { ok: true };
  }),

  /* ───────────── Ma localisation ───────────── */

  setLocation: proc.input(z.object({ city: z.string().trim().max(80), country: z.string().trim().max(80), zone: z.enum(["Paris", "Lyon", "Genève", "France", "International"]) })).mutation(async ({ ctx, input }) => {
    await getDb().update(members).set(input).where(eq(members.id, ctx.memberId));
    const m = { ...ctx.member, ...input };
    if (m.photoUrl && m.jobTitle.trim() && m.city.trim() && m.bio.trim()) await award(m.id, "profil");
    return { ok: true };
  }),

  /* ───────────── Abonnement (Stripe) ───────────── */

  billing: proc.query(async ({ ctx }) => {
    if (!stripeReady()) return { configured: false as const };
    try {
      const { customerId, sub } = await findSubscription(ctx.member.email ?? "");
      return { configured: true as const, customer: !!customerId, subscription: sub ? describe(sub) : null };
    } catch (e) { throw stripeError(e); }
  }),

  /** Le portail client de Stripe : moyen de paiement, factures, changement de formule. */
  portal: proc.mutation(async ({ ctx }) => {
    const { customerId } = await mySubscription(ctx.member.email);
    if (!customerId) throw new TRPCError({ code: "NOT_FOUND", message: "Aucun abonnement Stripe n’est relié à votre adresse e-mail." });
    try { return { url: await portalUrl(customerId, `${env.appUrl}${RETURN}`) }; } catch (e) { throw stripeError(e); }
  }),

  /** Pause : la facturation s'arrête, le compte et les données restent. */
  pause: proc.input(z.object({ paused: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { sub } = await mySubscription(ctx.member.email);
    if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Aucun abonnement en cours." });
    try { await (input.paused ? pauseSubscription(sub.id) : resumeSubscription(sub.id)); } catch (e) { throw stripeError(e); }
    const what = input.paused ? "Abonnement mis en pause" : "Abonnement réactivé";
    await logAdmin(ctx.member, { action: what, targetType: "membre", targetId: ctx.memberId, label: fullName(ctx.member), detail: "Par le membre, depuis ses paramètres" });
    await notify(await admins(), { title: `${what} : ${fullName(ctx.member)}`, href: `/admin/membres/${ctx.memberId}` });
    return { ok: true };
  }),

  /** Résilier : la raison d'abord, pour aider l'équipe ; la résiliation elle-même se confirme dans le portail Stripe. */
  cancel: proc.input(z.object({ reasons: z.array(z.enum(Object.keys(CANCEL_REASONS) as [Reason, ...Reason[]])).max(4), comment: z.string().trim().max(1500).default("") })).mutation(async ({ ctx, input }) => {
    if (!input.reasons.length && !input.comment) throw new TRPCError({ code: "BAD_REQUEST", message: "Dites-nous en un mot ce qui vous fait partir." });
    const { customerId, sub } = await mySubscription(ctx.member.email);
    if (!customerId || !sub) throw new TRPCError({ code: "NOT_FOUND", message: "Aucun abonnement en cours." });
    const detail = [input.reasons.map((r) => CANCEL_REASONS[r]).join(", "), input.comment && `« ${input.comment} »`].filter(Boolean).join(" — ");
    await logAdmin(ctx.member, { action: "Résiliation demandée", targetType: "membre", targetId: ctx.memberId, label: fullName(ctx.member), detail });
    await notify(await admins(), { title: `Résiliation demandée : ${fullName(ctx.member)}`, body: detail.slice(0, 400), href: "/admin/journal" });
    try { return { url: await portalUrl(customerId, `${env.appUrl}${RETURN}`, sub.id) }; } catch (e) { throw stripeError(e); }
  }),

  /* ───────────── Confidentialité ───────────── */

  /** Toutes mes données, lisibles : le journal, les tests et la mémoire du coach sont déchiffrés pour moi seul. */
  exportData: proc.mutation(async ({ ctx }) => {
    const db = getDb();
    const me = ctx.memberId;
    const m = ctx.member;
    const clear = (enc: string) => (enc ? open(me, enc) : null);
    const [journal, tests, memory, memoryState, coach, sent, received, posts, replies, registrations, honey, sessions, progress, emailPrefs] = await Promise.all([
      db.select().from(journalEntries).where(eq(journalEntries.memberId, me)).orderBy(asc(journalEntries.createdAt)),
      db.select().from(testResults).where(eq(testResults.memberId, me)),
      db.select().from(coachMemory).where(eq(coachMemory.memberId, me)),
      memorySettings(me),
      db.select().from(coachMessages).where(eq(coachMessages.memberId, me)).orderBy(asc(coachMessages.createdAt)),
      db.select().from(messages).where(eq(messages.fromId, me)).orderBy(asc(messages.createdAt)),
      db.select().from(messages).where(eq(messages.toId, me)).orderBy(asc(messages.createdAt)),
      db.select().from(forumPosts).where(eq(forumPosts.authorId, me)),
      db.select().from(forumReplies).where(eq(forumReplies.authorId, me)),
      db.query.eventRegistrations.findMany({ where: eq(eventRegistrations.memberId, me), with: { event: true } }),
      db.select().from(honeyLedger).where(eq(honeyLedger.memberId, me)),
      clientView(me),
      db.select({ lesson: courseLessons.title, completedAt: lessonProgress.completedAt, challengeDoneAt: lessonProgress.challengeDoneAt, challengeNoteEnc: lessonProgress.challengeNoteEnc }).from(lessonProgress).leftJoin(courseLessons, eq(courseLessons.id, lessonProgress.lessonId)).where(eq(lessonProgress.memberId, me)),
      memberPreferences(me),
    ]);
    const peerIds = [...new Set([...sent.map((x) => x.toId), ...received.map((x) => x.fromId)])];
    const peers = peerIds.length ? await db.select({ id: members.id, firstName: members.firstName, lastName: members.lastName }).from(members).where(inArray(members.id, peerIds)) : [];
    const who = (id: number) => { const p = peers.find((x) => x.id === id); return p ? fullName(p) : `Membre n° ${id}`; };
    const visible = (x: { deletedAt: Date | null }) => !x.deletedAt;
    return {
      exportedAt: new Date(),
      profile: {
        firstName: m.firstName, lastName: m.lastName, email: m.email, jobTitle: m.jobTitle, organisation: m.org, city: m.city, country: m.country, zone: m.zone,
        intention: m.intention, bio: m.bio, ambition: m.ambition, values: m.values, passions: m.passions, bucketList: m.bucketList, intents: m.intents, goals: m.goals, goalsOther: m.goalsOther,
        linkedinUrl: m.linkedinUrl, langs: m.langs, photoUrl: m.photoUrl, visibleInDirectory: m.visibleInDirectory, role: m.role, accessType: m.accessType, accessEndsAt: m.accessEndsAt, createdAt: m.createdAt,
      },
      journal: journal.map((e) => ({ course: e.courseTitle, lesson: e.lessonTitle || e.moduleTitle, question: e.questionText, answer: clear(e.answerEnc), sharedWithLaura: !!e.sharedAt, createdAt: e.createdAt, updatedAt: e.updatedAt })),
      lessons: progress.map((p) => ({ lesson: p.lesson, completedAt: p.completedAt, challengeDoneAt: p.challengeDoneAt, challengeNote: clear(p.challengeNoteEnc) })),
      tests: tests.map((t) => ({ test: t.lessonTitle || t.moduleTitle, course: t.courseTitle, result: clear(t.resultEnc), passedAt: t.passedAt, sharedAt: t.sharedAt })),
      coachMemory: { consent: memoryState, items: memory.map((i) => ({ source: i.sourceLabel, text: clear(i.contentEnc), createdAt: i.createdAt })) },
      coachConversation: coach.map((c) => ({ from: c.role === "user" ? "moi" : "coach", text: c.text, at: c.createdAt })),
      messages: [...sent.filter(visible).map((x) => ({ to: who(x.toId), text: x.text, attachment: x.attachmentName, at: x.createdAt })), ...received.filter(visible).map((x) => ({ from: who(x.fromId), text: x.text, attachment: x.attachmentName, at: x.createdAt }))],
      forum: { posts: posts.map((p) => ({ title: p.title, text: p.text, at: p.createdAt })), replies: replies.map((r) => ({ text: r.text, at: r.createdAt })) },
      events: registrations.map((r) => ({ event: r.event.title, startsAt: r.event.startsAt, waitlist: r.waitlist, attended: !!r.attendedAt, registeredAt: r.createdAt })),
      honey: honey.map((h) => ({ action: h.action, amount: h.amount, at: h.createdAt })),
      // Mon coaching : ce qui me revient (jamais les notes privées de Laura)
      coaching: sessions ? { programme: sessions.title, statut: sessions.status, seances: sessions.meetings, objectifs: sessions.goals, comptesRendus: sessions.reports, inspiration: sessions.inspiration, exercice: sessions.exercise, carnet: sessions.journal } : null,
      emailPreferences: emailPrefs,
    };
  }),

  /**
   * Supprimer mon compte, tout de suite : l'abonnement Stripe s'arrête d'abord (sinon on n'efface rien),
   * puis la fiche est anonymisée comme le fait l'administration. Les publications restent, signées « Membre supprimé ».
   */
  deleteAccount: proc.input(z.object({ confirm: z.string() })).mutation(async ({ ctx, input }) => {
    if (input.confirm.trim().toUpperCase() !== "SUPPRIMER") throw new TRPCError({ code: "BAD_REQUEST", message: "Écrivez SUPPRIMER pour confirmer." });
    const m = ctx.member;
    if (m.role === "administrateur") throw new TRPCError({ code: "FORBIDDEN", message: "Un compte administrateur ne se supprime pas depuis ses paramètres." });
    let stopped = "";
    if (stripeReady() && m.email) {
      try {
        const { sub } = await findSubscription(m.email);
        if (sub) { await cancelSubscriptionNow(sub.id); stopped = "abonnement Stripe arrêté"; }
      } catch (e) {
        throw new TRPCError({ code: "BAD_GATEWAY", message: `Votre abonnement n’a pas pu être arrêté, rien n’a été supprimé. ${e instanceof Error ? e.message : ""}`.trim() });
      }
    }
    const name = fullName(m);
    await anonymize(m);
    await logAdmin({ id: m.id, firstName: m.firstName, lastName: m.lastName }, { action: "Compte supprimé par le membre", targetType: "membre", targetId: m.id, label: name, detail: ["Profil anonymisé, publications conservées", stopped].filter(Boolean).join(", ") });
    await notify(await admins(), { title: `Compte supprimé par le membre : ${name}`, href: "/admin/journal" });
    return { ok: true };
  }),
});
