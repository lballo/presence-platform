import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { assertCan, createRouter, procFor } from "../middleware";
import { can } from "../lib/permissions";
import { getDb } from "../queries/connection";
import { forumPosts, forumLikes, forumReplies, opportunities, opportunityInterests } from "../../db/schema";
import { publicMember } from "../lib/format";

const forumProc = procFor("forum.use");
const oppProc = procFor("opportunities.use");

export const forumRouter = createRouter({
  posts: forumProc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.forumPosts.findMany({ with: { author: true, replyList: { with: { author: true }, orderBy: [asc(forumReplies.createdAt)] } }, orderBy: [desc(forumPosts.createdAt)] });
    const mine = await db.query.forumLikes.findMany({ where: eq(forumLikes.memberId, ctx.memberId) });
    const likedIds = new Set(mine.map((l) => l.postId));
    return list.map(({ replyList, ...p }) => ({
      ...p,
      author: publicMember(p.author),
      liked: likedIds.has(p.id), isMine: p.authorId === ctx.memberId, canEdit: can(ctx.member, "content.edit", { ownerId: p.authorId }), canDelete: can(ctx.member, "content.delete", { ownerId: p.authorId }),
      replies: replyList.length,
      replyList: replyList.map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt, editedAt: r.editedAt, author: publicMember(r.author), isMine: r.authorId === ctx.memberId, canDelete: can(ctx.member, "content.delete", { ownerId: r.authorId }) })),
    }));
  }),

  /** Modifier sa publication. */
  updatePost: forumProc
    .input(z.object({ id: z.number(), text: z.string().trim().min(1).max(2000), videoUrl: z.string().trim().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const post = await db.query.forumPosts.findFirst({ where: eq(forumPosts.id, input.id) });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      assertCan(ctx.member, "content.edit", { ownerId: post.authorId }, "Vous ne pouvez modifier que vos propres publications.");
      if (input.videoUrl !== undefined) {
        if (input.videoUrl && !/^https?:\/\/\S+$/.test(input.videoUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Le lien de la vidéo doit commencer par https://" });
        if (post.kind === "video" && !input.videoUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Gardez une vidéo pour votre demande de retour." });
      }
      await db.update(forumPosts).set({ text: input.text, ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl } : {}), editedAt: new Date() }).where(eq(forumPosts.id, input.id));
      return { ok: true };
    }),

  /** Supprimer sa publication (ou modération par l'équipe). */
  deletePost: forumProc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const post = await db.query.forumPosts.findFirst({ where: eq(forumPosts.id, input.id) });
    if (!post) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "content.delete", { ownerId: post.authorId }, "Vous ne pouvez supprimer que vos propres publications.");
    await db.delete(forumLikes).where(eq(forumLikes.postId, post.id));
    await db.delete(forumReplies).where(eq(forumReplies.postId, post.id));
    await db.delete(forumPosts).where(eq(forumPosts.id, post.id));
    return { ok: true };
  }),

  createPost: forumProc
    .input(z.object({ kind: z.enum(["victoire", "video", "question"]), text: z.string().min(1).max(2000), askFeedback: z.boolean().default(false), videoUrl: z.string().trim().max(1000).default("") }))
    .mutation(async ({ ctx, input }) => {
      if (input.videoUrl && !/^https?:\/\/\S+$/.test(input.videoUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Le lien de la vidéo doit commencer par https://" });
      if (input.kind === "video" && !input.videoUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Ajoutez votre vidéo (lien ou fichier) pour demander un retour." });
      const db = getDb();
      const [row] = await db.insert(forumPosts).values({ ...input, authorId: ctx.memberId }).returning();
      return row;
    }),

  /** Répondre à une publication. */
  reply: forumProc.input(z.object({ postId: z.number(), text: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const post = await db.query.forumPosts.findFirst({ where: eq(forumPosts.id, input.postId) });
    if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Publication introuvable" });
    const [row] = await db.insert(forumReplies).values({ postId: post.id, authorId: ctx.memberId, text: input.text }).returning();
    return { id: row.id };
  }),

  updateReply: forumProc.input(z.object({ id: z.number(), text: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const r = await db.query.forumReplies.findFirst({ where: eq(forumReplies.id, input.id) });
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "content.edit", { ownerId: r.authorId }, "Vous ne pouvez modifier que vos propres réponses.");
    await db.update(forumReplies).set({ text: input.text, editedAt: new Date() }).where(eq(forumReplies.id, input.id));
    return { ok: true };
  }),

  deleteReply: forumProc.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const r = await db.query.forumReplies.findFirst({ where: eq(forumReplies.id, input.id) });
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "content.delete", { ownerId: r.authorId }, "Vous ne pouvez supprimer que vos propres réponses.");
    await db.delete(forumReplies).where(eq(forumReplies.id, input.id));
    return { ok: true };
  }),

  toggleLike: forumProc.input(z.object({ postId: z.number() })).mutation(async ({ ctx, input }) => {
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
  opportunities: oppProc.query(async ({ ctx }) => {
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

  createOpportunity: oppProc
    .input(z.object({ type: z.enum(["recrut", "fin", "assoc"]), title: z.string().min(1).max(200), text: z.string().min(1).max(3000), facts: z.array(z.string().min(1).max(60)).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // chaque annonce est relue par l'équipe Présence avant publication
      const [row] = await db.insert(opportunities).values({ ...input, authorId: ctx.memberId, status: "pending" }).returning();
      return row;
    }),

  /** Administrateur : annonces à relire. */
  pendingOpportunities: oppProc.query(async ({ ctx }) => {
    if (!can(ctx.member, "opportunity.validate")) return [];
    const list = await getDb().query.opportunities.findMany({ where: eq(opportunities.status, "pending"), with: { author: true }, orderBy: [asc(opportunities.createdAt)] });
    return list.map((o) => ({ ...o, author: publicMember(o.author) }));
  }),

  /** Administrateur : publier ou refuser une annonce. */
  decideOpportunity: procFor("opportunity.validate").input(z.object({ id: z.number(), accept: z.boolean() })).mutation(async ({ input }) => {
    await getDb().update(opportunities).set({ status: input.accept ? "published" : "rejected" }).where(and(eq(opportunities.id, input.id), eq(opportunities.status, "pending")));
    return { ok: true };
  }),

  toggleInterest: oppProc.input(z.object({ opportunityId: z.number() })).mutation(async ({ ctx, input }) => {
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
