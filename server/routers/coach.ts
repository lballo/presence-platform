import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { coachMessages, members } from "../../db/schema";
import { coachReply, EXERCISES, type ChatTurn } from "../lib/coach";

export const coachRouter = createRouter({
  exercises: proc.query(() => EXERCISES),

  history: proc.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.coachMessages.findMany({ where: eq(coachMessages.memberId, ctx.memberId), orderBy: [asc(coachMessages.createdAt)] });
  }),

  send: proc.input(z.object({ text: z.string().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const m = await db.query.members.findFirst({ where: eq(members.id, ctx.memberId) });
    if (!m) throw new TRPCError({ code: "NOT_FOUND" });
    await db.insert(coachMessages).values({ memberId: ctx.memberId, role: "user", text: input.text });
    const prev = await db.query.coachMessages.findMany({ where: eq(coachMessages.memberId, ctx.memberId), orderBy: [asc(coachMessages.createdAt)] });
    const history: ChatTurn[] = prev.slice(-16).map((p) => ({ role: p.role as "user" | "coach", text: p.text }));
    const reply = await coachReply(history, m);
    const [row] = await db.insert(coachMessages).values({ memberId: ctx.memberId, role: "coach", text: reply }).returning();
    return row;
  }),

  reset: proc.mutation(async ({ ctx }) => {
    await getDb().delete(coachMessages).where(eq(coachMessages.memberId, ctx.memberId));
    return { ok: true };
  }),
});
