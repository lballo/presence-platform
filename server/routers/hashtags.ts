import { z } from "zod";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { forumPostHashtags, hashtags } from "../../db/schema";
import { logAdmin } from "../lib/adminLog";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null);
const name = z.string().trim().min(1).max(40).transform((s) => s.replace(/^#+/, "").trim().replace(/\s+/g, "-")).refine((s) => /^[\p{L}\p{N}_-]+$/u.test(s), "Lettres, chiffres et tirets uniquement.");

async function assertFree(value: string, exceptId?: number) {
  const same = await getDb().select({ id: hashtags.id }).from(hashtags).where(and(eq(sql`lower(${hashtags.name})`, value.toLowerCase()), exceptId ? ne(hashtags.id, exceptId) : undefined));
  if (same.length) throw new TRPCError({ code: "CONFLICT", message: `Le hashtag #${value} existe déjà.` });
}

/** Liste partagée par la communauté : le forum aujourd'hui, les contenus de formation demain. */
export const hashtagsRouter = createRouter({
  list: procFor("forum.use").query(() =>
    getDb()
      .select({ id: hashtags.id, name: hashtags.name, color: hashtags.color, posts: sql<number>`count(${forumPostHashtags.postId})::int` })
      .from(hashtags)
      .leftJoin(forumPostHashtags, eq(forumPostHashtags.hashtagId, hashtags.id))
      .groupBy(hashtags.id, hashtags.name, hashtags.color)
      .orderBy(asc(hashtags.name))
  ),

  create: procFor("forum.manage").input(z.object({ name, color })).mutation(async ({ ctx, input }) => {
    await assertFree(input.name);
    const [row] = await getDb().insert(hashtags).values(input).returning();
    await logAdmin(ctx.member, { action: "Hashtag ajouté", targetType: "hashtag", targetId: row.id, label: `#${row.name}` });
    return row;
  }),

  update: procFor("forum.manage").input(z.object({ id: z.number().int(), name, color })).mutation(async ({ ctx, input }) => {
    await assertFree(input.name, input.id);
    await getDb().update(hashtags).set({ name: input.name, color: input.color }).where(eq(hashtags.id, input.id));
    await logAdmin(ctx.member, { action: "Hashtag modifié", targetType: "hashtag", targetId: input.id, label: `#${input.name}` });
    return { ok: true };
  }),

  /** Le hashtag disparaît aussi des publications qui le portaient ; elles restent en ligne. */
  remove: procFor("forum.manage").input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb().delete(hashtags).where(eq(hashtags.id, input.id)).returning();
    if (row) await logAdmin(ctx.member, { action: "Hashtag supprimé", targetType: "hashtag", targetId: row.id, label: `#${row.name}` });
    return { ok: true };
  }),
});
