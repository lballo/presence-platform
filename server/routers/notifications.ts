import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { notifications } from "../../db/schema";

const proc = procFor("profile.use");

export const notificationsRouter = createRouter({
  list: proc.query(({ ctx }) => getDb().select().from(notifications).where(eq(notifications.memberId, ctx.memberId)).orderBy(desc(notifications.createdAt)).limit(30)),

  unreadCount: proc.query(async ({ ctx }) => {
    const [row] = await getDb().select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.memberId, ctx.memberId), isNull(notifications.readAt)));
    return row?.n ?? 0;
  }),

  markRead: proc.input(z.object({ id: z.number().int().optional() })).mutation(async ({ ctx, input }) => {
    await getDb().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.memberId, ctx.memberId), isNull(notifications.readAt), input.id ? eq(notifications.id, input.id) : undefined));
    return { ok: true };
  }),
});
