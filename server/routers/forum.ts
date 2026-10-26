import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { forumPosts, forumLikes, forumReplies, opportunities, opportunityInterests } from "../../db/schema";
import { publicMember } from "../lib/format";

export const forumRouter = createRouter({
  posts: proc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.forumPosts.findMany({ with: { author: true, replyList: { with: { author: true }, orderBy: [asc(forumReplies.createdAt)] } }, orderBy: [desc(forumPosts.createdAt)] });
    const mine = await db.query.forumLikes.findMany({ where: eq(forumLikes.memberId, ctx.memberId) });
    const likedIds = new Set(mine.map((l) => l.postId));
    return list.map(({ replyList, ...p }) => ({
      ...p,
      author: publicMember(p.author),
      liked: likedIds.has(p.id), isMine: p.authorId === ctx.memberId, canEdit: p.authorId === ctx.memberId, canDelete: p.authorId === ctx.memberId || ctx.isAdmin,
      replies: replyList.length,
      replyList: replyList.map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt, editedAt: r.editedAt, author: publicMember(r.author), isMine: r.authorId === ctx.memberId, canDelete: r.authorId === ctx.memberId || ctx.isAdmin })),
    }));
  }),

  /** Modifier sa publication. */
  updatePost: proc
    .input(z.object({ id: z.number(), text: z.string().trim().min(1).max(2000), videoUrl: z.string().trim().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const post = await db.query.forumPosts.findFirst({ where: eq(forumPosts.id, input.id) });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      if (post.authorId !== ctx.memberId) throw new TRPCError({ code: "FORBIDDEN", message: "Vous ne pouvez modifier que vos propres publications." });
      if (input.videoUrl !== undefined) {
        if (input.videoUrl && !/^https?:\/\/\S+$/.test(input.videoUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Le lien de la vidéo doit commencer par https://" });
        if (post.kind === "video" && !input.videoUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Gardez une vidéo pour votre demande de retour." });
      }
      await db.update(forumPosts).set({ text: input.text, ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl } : {}), editedAt: new Date() }).where(eq(forumPosts.id, input.id));
      return { ok: true };
    }),

  /** Supprimer sa publication (ou modération par l'équipe). */
  deletePost: proc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const post = await db.query.forumPosts.findFirst({ where: eq(forumPosts.id, input.id) });
    if (!post) throw new TRPCError({ code: "NOT_FOUND" });
    if (post.authorId !== ctx.memberId && !ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Vous ne pouvez supprimer que vos propres publications." });
    await db.delete(forumLikes).where(eq(forumLikes.postId, post.id));
    await db.delete(forumReplies).where(eq(forumReplies.postId, post.id));
    await db.delete(forumPosts).where(eq(forumPosts.id, post.id));
    return { ok: true };
  }),

  createPost: proc
    .input(z.object({ kind: z.enum(["victoire", "video", "question"]), text: z.string().min(1).max(2000), askFeedback: z.boolean().default(false), videoUrl: z.string().trim().max(1000).default("") }))
    .mutation(async ({ ctx, input }) => {
      if (input.videoUrl && !/^https?:\/\/\S+$/.test(input.videoUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Le lien de la vidéo doit commencer par https://" });
      if (input.kind === "video" && !input.videoUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Ajoutez votre vidéo (lien ou fichier) pour demander un retour." });
      const db = getDb();
      const [row] = await db.insert(forumPosts).values({ ...input, authorId: ctx.memberId }).returning();
      return row;
    }),

  /** Répondre à une publication. */
  reply: proc.input(z.object({ postId: z.number(), text: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const post = await db.query.forumPosts.findFirst({ where: eq(forumPosts.id, input.postId) });
    if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Publication introuvable" });
    const [row] = await db.insert(forumReplies).values({ postId: post.id, authorId: ctx.memberId, text: input.text }).returning();
    return { id: row.id };
  }),

  updateReply: proc.input(z.object({ id: z.number(), text: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const r = await db.query.forumReplies.findFirst({ where: eq(forumReplies.id, input.id) });
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    if (r.authorId !== ctx.memberId) throw new TRPCError({ code: "FORBIDDEN", message: "Vous ne pouvez modifier que vos propres réponses." });
    await db.update(forumReplies).set({ text: input.text, editedAt: new Date() }).where(eq(forumReplies.id, input.id));
    return { ok: true };
  }),

  deleteReply: proc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const r = await db.query.forumReplies.findFirst({ where: eq(forumReplies.id, input.id) });
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    if (r.authorId !== ctx.memberId && !ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Vous ne pouvez supprimer que vos propres réponses." });
    await db.delete(forumReplies).where(eq(forumReplies.id, input.id));
    return { ok: true };
  }),

  toggleLike: proc.input(z.object({ postId: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const existing = await db.query.forumLikes.findFirst({ where: and(eq(forumLikes.postId, input.postId), eq(forumLikes.memberId, ctx.memberId)) });
    if (existing) {
      await db.delete(forumLikes).where(eq(forumLikes.id, existing.id));
      await db.update(forumPosts).set({ likes: sql`${forumPosts.likes} - 1` }).where(eq(forumPosts.id, input.postId));
      return { liked: false };
    }
    await db.insert(forumLikes).values({ postId: input.postId, memberId: ctx.memberId });
    await db.update(forumPosts).set({ likes: sql`${forumPosts.likes} + 1` }).where(eq(forumPosts.id, input.postId));
    return { liked: true };
  }),

  /** Opportunités : annonces publiées + mes annonces en relecture. */
  opportunities: proc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.opportunities.findMany({ with: { author: true }, orderBy: [desc(opportunities.createdAt)] });
    const interests = await db.query.opportunityInterests.findMany();
    const countBy = new Map<number, number>();
    const mineSet = new Set<number>();
    for (const i of interests) {
      countBy.set(i.opportunityId, (countBy.get(i.opportunityId) ?? 0) + 1);
      if (i.memberId === ctx.memberId) mineSet.add(i.opportunityId);
    }
    return list
      .filter((o) => o.status === "published" || o.authorId === ctx.memberId)
      .map((o) => ({
        ...o,
        author: publicMember(o.author),
        isMine: o.authorId === ctx.memberId,
        interestedCount: countBy.get(o.id) ?? 0,
        interested: mineSet.has(o.id),
      }));
  }),

  createOpportunity: proc
    .input(z.object({ type: z.enum(["recrut", "fin", "assoc"]), title: z.string().min(1).max(200), text: z.string().min(1).max(3000), facts: z.array(z.string().min(1).max(60)).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // chaque annonce est relue par l'équipe Présence avant publication
      const [row] = await db.insert(opportunities).values({ ...input, authorId: ctx.memberId, status: "pending" }).returning();
      return row;
    }),

  toggleInterest: proc.input(z.object({ opportunityId: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const existing = await db.query.opportunityInterests.findFirst({ where: and(eq(opportunityInterests.opportunityId, input.opportunityId), eq(opportunityInterests.memberId, ctx.memberId)) });
    if (existing) {
      await db.delete(opportunityInterests).where(eq(opportunityInterests.id, existing.id));
      return { interested: false };
    }
    await db.insert(opportunityInterests).values({ opportunityId: input.opportunityId, memberId: ctx.memberId });
    return { interested: true };
  }),
});
