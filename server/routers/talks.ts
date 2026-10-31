import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { createRouter, procFor } from "../middleware";
import { can } from "../lib/permissions";
import { getDb } from "../queries/connection";
import { talks } from "../../db/schema";
import { publicMember } from "../lib/format";
import { BUCKETS, createSignedUpload, storageReady } from "../lib/storage";


const talkProc = procFor("talks.use");

export const talksRouter = createRouter({
  /** Talks publiés, du plus récent au plus ancien. */
  list: talkProc.query(async () => {
    const list = await getDb().query.talks.findMany({ where: eq(talks.status, "published"), with: { speaker: true }, orderBy: [desc(talks.publishedAt)] });
    return list.map((t) => ({ ...t, speaker: publicMember(t.speaker) }));
  }),

  /** Mes propositions (toutes, avec leur statut). */
  mine: talkProc.query(async ({ ctx }) => {
    return getDb().query.talks.findMany({ where: eq(talks.speakerId, ctx.memberId), orderBy: [desc(talks.submittedAt)] });
  }),

  /** Ce que le navigateur doit savoir pour envoyer une vidéo. */
  uploadConfig: talkProc.query(() => ({ enabled: storageReady(), maxMb: BUCKETS.talk.maxMb })),

  /** URL d'envoi signée : la vidéo part directement du navigateur vers Supabase Storage. */
  createUploadUrl: talkProc
    .input(z.object({ filename: z.string().min(1).max(200), contentType: z.string().max(100), size: z.number().int().min(0).default(0) }))
    .mutation(({ ctx, input }) => createSignedUpload("talk", ctx.memberId, input.filename, input.contentType || "video/mp4", input.size)),

  /** Soumettre un talk : il attend la validation de l'équipe. */
  submit: talkProc
    .input(z.object({ title: z.string().min(3).max(200), description: z.string().min(10).max(3000), videoUrl: z.string().url().max(1000), durationMin: z.number().int().min(1).max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await getDb()
        .insert(talks)
        .values({ speakerId: ctx.memberId, title: input.title, description: input.description, summary: input.description.slice(0, 240), videoUrl: input.videoUrl, durationMin: input.durationMin ?? 10, status: "pending" })
        .returning();
      return row;
    }),

  /** Retirer une de mes propositions tant qu'elle n'est pas publiée. */
  withdraw: talkProc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(talks).where(and(eq(talks.id, input.id), eq(talks.speakerId, ctx.memberId), eq(talks.status, "pending")));
    return { ok: true };
  }),

  /** Validation (administratrice) : talks en attente. */
  pending: talkProc.query(async ({ ctx }) => {
    if (!can(ctx.member, "talk.validate")) return [];
    const list = await getDb().query.talks.findMany({ where: eq(talks.status, "pending"), with: { speaker: true }, orderBy: [desc(talks.submittedAt)] });
    return list.map((t) => ({ ...t, speaker: publicMember(t.speaker) }));
  }),

  /** Publier ou refuser un talk (administratrice). */
  decide: procFor("talk.validate")
    .input(z.object({ id: z.number(), accept: z.boolean(), summary: z.string().max(400).optional(), durationMin: z.number().int().min(1).max(120).optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (input.accept) {
        await db.update(talks).set({ status: "published", publishedAt: new Date(), ...(input.summary ? { summary: input.summary } : {}), ...(input.durationMin ? { durationMin: input.durationMin } : {}) }).where(eq(talks.id, input.id));
      } else {
        await db.update(talks).set({ status: "rejected" }).where(eq(talks.id, input.id));
      }
      return { ok: true };
    }),

  /** Compteur de vues. */
  view: talkProc.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = getDb();
    const t = await db.query.talks.findFirst({ where: eq(talks.id, input.id) });
    if (t) await db.update(talks).set({ views: t.views + 1 }).where(eq(talks.id, input.id));
    return { ok: true };
  }),
});
