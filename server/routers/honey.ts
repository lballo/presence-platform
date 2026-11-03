import { z } from "zod";
import { and, asc, desc, eq, gte, gt, inArray, isNull, sql } from "drizzle-orm";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { eventRegistrations, events, forumPosts, forumSpaces, honeyLedger, honeyRules } from "../../db/schema";
import { FIRST_STEPS } from "../lib/honey";
import { goalLabels, OFFER_OPTIONS, SEEK_OPTIONS } from "../lib/onboardingOptions";

const proc = procFor("profile.use");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const honeyRouter = createRouter({
  /** Carte « Mes premiers pas » : chaque action, ce qu'elle rapporte, et de quoi la faire en un clic. */
  firstSteps: proc.query(async ({ ctx }) => {
    const db = getDb();
    const m = ctx.member;
    const [ledger, rules, welcome] = await Promise.all([
      db.select().from(honeyLedger).where(eq(honeyLedger.memberId, m.id)),
      db.select().from(honeyRules).orderBy(asc(honeyRules.position)),
      db.query.events.findMany({
        where: and(eq(events.type, "bienvenue"), eq(events.status, "published"), isNull(events.cancelledAt), gte(events.startsAt, new Date())),
        with: { registrations: true }, orderBy: [asc(events.startsAt)], limit: 6,
      }),
    ]);
    const done = new Map(ledger.map((l) => [l.action, l.amount]));
    const [presentations] = await db.select({ id: forumSpaces.id }).from(forumSpaces).where(eq(forumSpaces.slug, "presentations")).limit(1);
    const [mine] = presentations ? await db.select({ id: forumPosts.id }).from(forumPosts).where(and(eq(forumPosts.authorId, m.id), eq(forumPosts.spaceId, presentations.id))).limit(1) : [];
    const myWelcome = await db.query.eventRegistrations.findFirst({
      where: and(eq(eventRegistrations.memberId, m.id), inArray(eventRegistrations.eventId, db.select({ id: events.id }).from(events).where(eq(events.type, "bienvenue")))),
      with: { event: true },
    });
    const steps = FIRST_STEPS.map((action) => ({
      action,
      amount: rules.find((r) => r.action === (action === "presentation" && done.get(action) === 20 ? "presentation_video" : action))?.amount ?? 0,
      bonus: action === "presentation" ? rules.find((r) => r.action === "presentation_video")?.amount ?? 0 : 0,
      done: done.has(action),
    }));
    const goals = goalLabels(m.goals);
    const labels = (options: typeof SEEK_OPTIONS) => options.filter(([code]) => m.intents.includes(code)).map(([, label]) => label).join(", ").toLowerCase();
    const prefill = {
      title: `Bonjour, je suis ${m.firstName}`,
      html: [
        m.jobTitle.trim() && `<p>Je suis ${esc(m.jobTitle)}${m.city ? ` à ${esc(m.city)}` : ""}.</p>`,
        (goals.length || m.goalsOther) && `<p>Ce qui m’amène ici : ${esc([...goals, m.goalsOther].filter(Boolean).join(", ").toLowerCase())}.</p>`,
        labels(SEEK_OPTIONS) && `<p>Ce que je cherche : ${esc(labels(SEEK_OPTIONS))}.</p>`,
        labels(OFFER_OPTIONS) && `<p>Ce que je propose : ${esc(labels(OFFER_OPTIONS))}.</p>`,
      ].filter(Boolean).join("") || "<p></p>",
    };
    return {
      total: ledger.reduce((n, l) => n + l.amount, 0),
      allDone: steps.every((s) => s.done),
      steps,
      welcomeDates: welcome.map((e) => {
        const taken = e.registrations.filter((r) => !r.waitlist).length;
        return { id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt, kind: e.kind, full: !!e.maxSeats && taken >= e.maxSeats };
      }),
      myWelcome: myWelcome ? { slug: myWelcome.event.slug, title: myWelcome.event.title, startsAt: myWelcome.event.startsAt, waitlist: myWelcome.waitlist } : null,
      presentationId: mine?.id ?? null,
      prefill,
    };
  }),

  /** Gains pas encore annoncés par l'animation du coach. */
  unannounced: proc.query(async ({ ctx }) => {
    const rows = await getDb().select().from(honeyLedger).where(and(eq(honeyLedger.memberId, ctx.memberId), gt(honeyLedger.amount, honeyLedger.announced))).orderBy(asc(honeyLedger.createdAt));
    return rows.map((r) => ({ id: r.id, action: r.action, gained: r.amount - r.announced }));
  }),

  /** Ma progression : chaque miel récolté, le plus récent d'abord. */
  history: proc.query(async ({ ctx }) => {
    const rows = await getDb().select().from(honeyLedger).where(eq(honeyLedger.memberId, ctx.memberId)).orderBy(desc(honeyLedger.createdAt));
    return { total: rows.reduce((n, r) => n + r.amount, 0), items: rows.map((r) => ({ id: r.id, action: r.action, amount: r.amount, at: r.createdAt })) };
  }),

  markAnnounced: proc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    await getDb().update(honeyLedger).set({ announced: sql`${honeyLedger.amount}` }).where(and(eq(honeyLedger.id, input.id), eq(honeyLedger.memberId, ctx.memberId)));
    return { ok: true };
  }),
});
