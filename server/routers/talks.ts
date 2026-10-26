import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { talks } from "../../db/schema";
import { publicMember } from "../lib/format";
import { env } from "../lib/env";

const BUCKET = "talks";
const storageReady = () => !!(env.supabaseUrl && env.supabaseServiceKey);

export const talksRouter = createRouter({
  /** Talks publiés, du plus récent au plus ancien. */
  list: proc.query(async () => {
    const list = await getDb().query.talks.findMany({ where: eq(talks.status, "published"), with: { speaker: true }, orderBy: [desc(talks.publishedAt)] });
    return list.map((t) => ({ ...t, speaker: publicMember(t.speaker) }));
  }),

  /** Mes propositions (toutes, avec leur statut). */
  mine: proc.query(async ({ ctx }) => {
    return getDb().query.talks.findMany({ where: eq(talks.speakerId, ctx.memberId), orderBy: [desc(talks.submittedAt)] });
  }),

  /** Ce que le navigateur doit savoir pour envoyer une vidéo. */
  uploadConfig: proc.query(() => ({ enabled: storageReady(), maxMb: 500 })),

  /**
   * URL d'envoi signée : la vidéo part directement du navigateur vers le bucket Supabase,
   * sans transiter par le serveur (indispensable sur Vercel, limité à 4,5 Mo par requête).
   */
  createUploadUrl: proc
    .input(z.object({ filename: z.string().min(1).max(200), contentType: z.string().max(100) }))
    .mutation(async ({ ctx, input }) => {
      if (!storageReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le stockage des vidéos n’est pas configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." });
      const ext = (input.filename.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      const path = `membre-${ctx.memberId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const res = await fetch(`${env.supabaseUrl}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.supabaseServiceKey}`, apikey: env.supabaseServiceKey, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Supabase Storage : ${res.status} ${await res.text()}` });
      const data = (await res.json()) as { url: string; token?: string };
      return {
        uploadUrl: `${env.supabaseUrl}/storage/v1${data.url}`,
        apikey: env.supabaseAnonKey || env.supabaseServiceKey,
        contentType: input.contentType || "video/mp4",
        publicUrl: `${env.supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`,
      };
    }),

  /** Soumettre un talk : il attend la validation de l'équipe. */
  submit: proc
    .input(z.object({ title: z.string().min(3).max(200), description: z.string().min(10).max(3000), videoUrl: z.string().url().max(1000), durationMin: z.number().int().min(1).max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await getDb()
        .insert(talks)
        .values({ speakerId: ctx.memberId, title: input.title, description: input.description, summary: input.description.slice(0, 240), videoUrl: input.videoUrl, durationMin: input.durationMin ?? 10, status: "pending" })
        .returning();
      return row;
    }),

  /** Retirer une de mes propositions tant qu'elle n'est pas publiée. */
  withdraw: proc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(talks).where(and(eq(talks.id, input.id), eq(talks.speakerId, ctx.memberId), eq(talks.status, "pending")));
    return { ok: true };
  }),

  /** Validation (administratrice) : talks en attente. */
  pending: proc.query(async ({ ctx }) => {
    if (!ctx.isAdmin) return [];
    const list = await getDb().query.talks.findMany({ where: eq(talks.status, "pending"), with: { speaker: true }, orderBy: [desc(talks.submittedAt)] });
    return list.map((t) => ({ ...t, speaker: publicMember(t.speaker) }));
  }),

  /** Publier ou refuser un talk (administratrice). */
  decide: proc
    .input(z.object({ id: z.number(), accept: z.boolean(), summary: z.string().max(400).optional(), durationMin: z.number().int().min(1).max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Réservé à l’équipe Présence." });
      const db = getDb();
      if (input.accept) {
        await db.update(talks).set({ status: "published", publishedAt: new Date(), ...(input.summary ? { summary: input.summary } : {}), ...(input.durationMin ? { durationMin: input.durationMin } : {}) }).where(eq(talks.id, input.id));
      } else {
        await db.update(talks).set({ status: "rejected" }).where(eq(talks.id, input.id));
      }
      return { ok: true };
    }),

  /** Compteur de vues. */
  view: proc.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = getDb();
    const t = await db.query.talks.findFirst({ where: eq(talks.id, input.id) });
    if (t) await db.update(talks).set({ views: t.views + 1 }).where(eq(talks.id, input.id));
    return { ok: true };
  }),
});
