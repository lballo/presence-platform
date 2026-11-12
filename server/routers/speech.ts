/**
 * Analyse vidéo — repris de PresenceAI (lballo/presenceai), rattaché au membre courant.
 * L'envoi et l'analyse sont dans server/lib/videoUpload.ts.
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { speeches, speechScores, advice } from "../../db/schema";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, UploadError, markStaleSpeeches, startVideoUpload } from "../lib/videoUpload";

async function findSpeech(id: number, memberId: number) {
  const db = getDb();
  const s = await db.query.speeches.findFirst({ where: and(eq(speeches.id, id), eq(speeches.memberId, memberId)), with: { scores: true, advice: true } });
  if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Analyse introuvable" });
  return s;
}

const speechProc = procFor("speech.use");

export const speechRouter = createRouter({
  list: speechProc.query(async ({ ctx }) => {
    await markStaleSpeeches(ctx.memberId);
    const db = getDb();
    return db.query.speeches.findMany({ where: eq(speeches.memberId, ctx.memberId), with: { scores: true }, orderBy: [desc(speeches.createdAt)] });
  }),

  getById: speechProc.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    await markStaleSpeeches(ctx.memberId);
    return findSpeech(input.id, ctx.memberId);
  }),

  /** Ouvre l'envoi d'une vidéo : les morceaux arrivent ensuite par PUT /api/speech/:id/chunk. */
  startUpload: speechProc
    .input(z.object({ title: z.string().trim().min(1).max(200), size: z.number().int().positive().max(MAX_VIDEO_BYTES), type: z.string().max(100), durationSec: z.number().positive().max(MAX_VIDEO_SECONDS + 30).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await startVideoUpload(ctx.memberId, input);
      } catch (e) {
        if (e instanceof UploadError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        console.error("[speech] ouverture de l’envoi :", e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gemini n’est pas joignable pour le moment. Réessayez dans quelques minutes." });
      }
    }),

  delete: speechProc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await findSpeech(input.id, ctx.memberId);
    await db.delete(advice).where(eq(advice.speechId, input.id));
    await db.delete(speechScores).where(eq(speechScores.speechId, input.id));
    await db.delete(speeches).where(eq(speeches.id, input.id));
    return { ok: true };
  }),
});
