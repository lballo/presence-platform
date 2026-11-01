import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { members } from "../../db/schema";
import { award } from "../lib/honey";
import { env } from "../lib/env";
import { GOALS, OFFER_OPTIONS, PROFILE_TYPES, SECTORS, SEEK_OPTIONS } from "../lib/onboardingOptions";
import { INTENT_CODES } from "../lib/intents";

const proc = procFor("profile.use");
const code = z.string().trim().min(1).max(40);

export type Tour = { status: "pending" | "done" | "skipped"; step: number; seen: string[] };

async function setTour(memberId: number, change: (t: Tour) => Tour) {
  const db = getDb();
  const [m] = await db.select({ tour: members.tour }).from(members).where(eq(members.id, memberId)).limit(1);
  const tour = change((m?.tour as Tour) ?? { status: "pending", step: 0, seen: [] });
  await db.update(members).set({ tour }).where(eq(members.id, memberId));
  return tour;
}

export const onboardingRouter = createRouter({
  /** Panneaux d'accueil : où en est le membre, ses réponses et les choix proposés. */
  state: proc.query(({ ctx }) => {
    const m = ctx.member;
    return {
      firstName: m.firstName,
      step: m.onboardingStep,
      goals: m.goals, goalsOther: m.goalsOther,
      matchProfiles: m.matchProfiles, matchSectors: m.matchSectors, profileType: m.profileType, sector: m.sector, intents: m.intents,
      videoUrl: env.welcomeVideoUrl,
      options: { goals: GOALS, profileTypes: PROFILE_TYPES, sectors: SECTORS, seek: SEEK_OPTIONS, offer: OFFER_OPTIONS },
    };
  }),

  /** Sauvegarde à chaque panneau : le membre reprend là où il s'est arrêté. */
  save: proc
    .input(z.object({
      step: z.number().int().min(0).max(2),
      goals: z.array(code).max(10).optional(),
      goalsOther: z.string().trim().max(500).optional(),
      matchProfiles: z.array(code).max(10).optional(),
      matchSectors: z.array(code).max(12).optional(),
      profileType: z.string().trim().max(40).optional(),
      sector: z.string().trim().max(40).optional(),
      intents: z.array(z.enum(INTENT_CODES)).max(3).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { step, ...answers } = input;
      await getDb().update(members).set({ ...answers, onboardingStep: step }).where(eq(members.id, ctx.memberId));
      return { ok: true };
    }),

  /** Panneaux terminés : le tuto du coach prend le relais. */
  complete: proc.mutation(async ({ ctx }) => {
    if (ctx.member.onboardingCompletedAt) return { ok: true, gained: 0 };
    await getDb().update(members).set({ onboardingCompletedAt: new Date() }).where(eq(members.id, ctx.memberId));
    return { ok: true, gained: await award(ctx.memberId, "accueil") };
  }),

  /** Tuto : l'étape atteinte, enregistrée par membre. */
  tourStep: proc.input(z.object({ step: z.number().int().min(0).max(20) })).mutation(async ({ ctx, input }) => {
    await setTour(ctx.memberId, (t) => ({ ...t, step: input.step }));
    return { ok: true };
  }),

  /** Fin du tuto : seul celui suivi jusqu'au bout rapporte du miel. */
  tourFinish: proc.input(z.object({ followed: z.boolean() })).mutation(async ({ ctx, input }) => {
    await setTour(ctx.memberId, (t) => ({ ...t, status: input.followed ? "done" : "skipped", step: 0 }));
    return { gained: input.followed ? await award(ctx.memberId, "tuto") : 0 };
  }),

  tourRestart: proc.mutation(async ({ ctx }) => {
    await setTour(ctx.memberId, (t) => ({ ...t, status: "pending", step: 0 }));
    return { ok: true };
  }),

  /** Bulle d'une rubrique vue à la première visite. */
  sectionSeen: proc.input(z.object({ key: z.string().max(40) })).mutation(async ({ ctx, input }) => {
    await setTour(ctx.memberId, (t) => ({ ...t, seen: [...new Set([...t.seen, input.key])] }));
    return { ok: true };
  }),
});
