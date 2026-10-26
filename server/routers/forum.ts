import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { forumPosts, forumLikes, opportunities, opportunityInterests } from "../../db/schema";
import { publicMember } from "../lib/format";

export const forumRouter = createRouter({
  posts: proc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.forumPosts.findMany({ with: { author: true }, orderBy: [desc(forumPosts.createdAt)] });
    const mine = await db.query.forumLikes.findMany({ where: eq(forumLikes.memberId, ctx.memberId) });
    const likedIds = new Set(mine.map((l) => l.postId));
    return list.map((p) => ({ ...p, author: publicMember(p.author), liked: likedIds.has(p.id), isMine: p.authorId === ctx.memberId }));
  }),

  createPost: proc
    .input(z.object({ kind: z.enum(["victoire", "video", "question"]), text: z.string().min(1).max(2000), askFeedback: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db.insert(forumPosts).values({ ...input, authorId: ctx.memberId }).returning();
      return row;
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
