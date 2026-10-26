/**
 * Analyse vidéo — repris de PresenceAI (lballo/presenceai), rattaché au membre courant.
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { speeches, speechScores, advice } from "../../db/schema";
import { uploadVideoToGemini, analyzeVideoWithGemini, deleteGeminiFile } from "../lib/gemini";

function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Format de vidéo invalide");
  return { mimeType: match[1], base64: match[2] };
}

async function findSpeech(id: number, memberId: number) {
  const db = getDb();
  const s = await db.query.speeches.findFirst({ where: and(eq(speeches.id, id), eq(speeches.memberId, memberId)), with: { scores: true, advice: true } });
  if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Analyse introuvable" });
  return s;
}

export const speechRouter = createRouter({
  list: proc.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.speeches.findMany({ where: eq(speeches.memberId, ctx.memberId), with: { scores: true }, orderBy: [desc(speeches.createdAt)] });
  }),

  getById: proc.input(z.object({ id: z.number() })).query(({ ctx, input }) => findSpeech(input.id, ctx.memberId)),

  create: proc.input(z.object({ title: z.string().min(1), duration: z.number().optional() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [row] = await db.insert(speeches).values({ title: input.title, duration: input.duration, videoUrl: "pending_gemini_upload", memberId: ctx.memberId }).returning({ id: speeches.id });
    return row;
  }),

  delete: proc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await findSpeech(input.id, ctx.memberId);
    await db.delete(advice).where(eq(advice.speechId, input.id));
    await db.delete(speechScores).where(eq(speechScores.speechId, input.id));
    await db.delete(speeches).where(eq(speeches.id, input.id));
    return { ok: true };
  }),

  generateAnalysis: proc.input(z.object({ id: z.number(), videoDataUrl: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await findSpeech(input.id, ctx.memberId);
    await db.update(speeches).set({ status: "processing", updatedAt: new Date() }).where(eq(speeches.id, input.id));
    let fileUri: string | null = null;
    try {
      const { base64, mimeType } = parseDataUrl(input.videoDataUrl);
      fileUri = await uploadVideoToGemini(base64, mimeType);
      const analysis = await analyzeVideoWithGemini(fileUri);
      await db.update(speeches).set({ overallScore: analysis.overallScore, summary: analysis.summary, keyInsight: analysis.keyInsight, status: "completed", updatedAt: new Date() }).where(eq(speeches.id, input.id));
      for (const [category, data] of Object.entries(analysis.scores)) {
        await db.insert(speechScores).values({ speechId: input.id, category: category as "voice" | "bodyLanguage" | "structure" | "impact", score: data.score, insight: data.insight });
      }
      for (const a of analysis.advice) {
        await db.insert(advice).values({ speechId: input.id, category: a.category, priority: a.priority, title: a.title, description: a.description, actionStep: a.actionStep });
      }
      return findSpeech(input.id, ctx.memberId);
    } catch (error) {
      console.error("[speech] analyse échouée :", error);
      await db.update(speeches).set({ status: "failed", updatedAt: new Date() }).where(eq(speeches.id, input.id));
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "L’analyse a échoué. Réessayez." });
    } finally {
      if (fileUri) deleteGeminiFile(fileUri).catch(() => {});
    }
  }),
});
