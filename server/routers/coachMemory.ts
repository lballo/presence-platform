import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { coachMemory, coachSettings, members, moduleProgress } from "../../db/schema";
import { COACH_CONSENT, consentNeeded, memoryActive, memorySettings } from "../lib/coachMemory";
import { notify } from "../lib/notify";
import { open, seal } from "../lib/privateBox";

const memoryProc = procFor("coach.use");
const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Cet élément n’existe plus." });

async function saveSettings(memberId: number, set: Partial<typeof coachSettings.$inferInsert>) {
  await getDb().insert(coachSettings).values({ memberId, ...set, updatedAt: new Date() }).onConflictDoUpdate({ target: coachSettings.memberId, set: { ...set, updatedAt: new Date() } });
}

/** « Ce que le coach retient de moi » : tout lire, corriger, effacer, mettre en pause. L'administration n'y a pas accès. */
export const coachMemoryRouter = createRouter({
  state: memoryProc.query(async ({ ctx }) => {
    const db = getDb();
    const [settings, items, pending] = await Promise.all([
      memorySettings(ctx.memberId),
      db.select().from(coachMemory).where(eq(coachMemory.memberId, ctx.memberId)).orderBy(desc(coachMemory.createdAt), desc(coachMemory.id)),
      db.select({ moduleId: moduleProgress.moduleId }).from(moduleProgress).where(and(eq(moduleProgress.memberId, ctx.memberId), eq(moduleProgress.memoryStatus, "en_attente"))).limit(1),
    ]);
    return {
      consent: COACH_CONSENT,
      consentNeeded: consentNeeded(settings),
      accepted: !!settings?.consentAt,
      refused: !!settings?.refusedAt,
      paused: !!settings?.pausedAt,
      active: memoryActive(settings),
      updating: pending.length > 0,
      items: items.map((i) => ({ id: i.id, source: i.source, sourceLabel: i.sourceLabel, text: open(ctx.memberId, i.contentEnc), createdAt: i.createdAt, correctedAt: i.correctedAt, sharedAt: i.sharedAt })),
    };
  }),

  /** Répondre à la mention : l'accord est gardé avec la version du texte. Le refus ne bloque rien. */
  answerConsent: memoryProc.input(z.object({ accept: z.boolean() })).mutation(async ({ ctx, input }) => {
    await saveSettings(ctx.memberId, input.accept
      ? { consentAt: new Date(), consentVersion: COACH_CONSENT.version, refusedAt: null, pausedAt: null }
      : { consentAt: null, consentVersion: COACH_CONSENT.version, refusedAt: new Date(), pausedAt: null });
    return { ok: true };
  }),

  /** En pause : le coach ne retient plus rien et ne s'appuie plus sur ce qu'il sait. */
  setPaused: memoryProc.input(z.object({ paused: z.boolean() })).mutation(async ({ ctx, input }) => {
    await saveSettings(ctx.memberId, { pausedAt: input.paused ? new Date() : null });
    return { ok: true };
  }),

  update: memoryProc.input(z.object({ id: z.number().int(), text: z.string().trim().min(1, "Écrivez quelque chose, ou effacez cet élément.").max(2000) })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb().update(coachMemory).set({ contentEnc: seal(ctx.memberId, input.text), correctedAt: new Date() }).where(and(eq(coachMemory.id, input.id), eq(coachMemory.memberId, ctx.memberId))).returning({ id: coachMemory.id });
    if (!row) throw notFound();
    return { ok: true };
  }),

  remove: memoryProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb().delete(coachMemory).where(and(eq(coachMemory.id, input.id), eq(coachMemory.memberId, ctx.memberId))).returning({ id: coachMemory.id });
    if (!row) throw notFound();
    return { ok: true };
  }),

  removeAll: memoryProc.mutation(async ({ ctx }) => {
    const rows = await getDb().delete(coachMemory).where(eq(coachMemory.memberId, ctx.memberId)).returning({ id: coachMemory.id });
    return { removed: rows.length };
  }),

  /** Retirer son accord : tout est effacé, la mémoire ne reprendra pas. */
  withdraw: memoryProc.mutation(async ({ ctx }) => {
    await getDb().delete(coachMemory).where(eq(coachMemory.memberId, ctx.memberId));
    await saveSettings(ctx.memberId, { consentAt: null, consentVersion: COACH_CONSENT.version, refusedAt: new Date(), pausedAt: null });
    return { ok: true };
  }),

  /** Partager un élément avec Laura : c'est la seule façon dont l'administration peut le lire. */
  share: memoryProc.input(z.object({ id: z.number().int(), shared: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [row] = await db.update(coachMemory).set({ sharedAt: input.shared ? new Date() : null }).where(and(eq(coachMemory.id, input.id), eq(coachMemory.memberId, ctx.memberId))).returning({ id: coachMemory.id });
    if (!row) throw notFound();
    if (input.shared) {
      const admins = await db.select({ id: members.id }).from(members).where(and(eq(members.role, "administrateur"), eq(members.status, "actif"), isNull(members.deletedAt)));
      await notify(admins.map((a) => a.id).filter((id) => id !== ctx.memberId), { title: `${ctx.member.firstName} ${ctx.member.lastName} a partagé un élément avec vous`.trim(), href: `/admin/membres/${ctx.memberId}` });
    }
    return { ok: true };
  }),
});
