import { z } from "zod";
import { and, eq, or, desc, asc, isNull, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { messages, members } from "../../db/schema";
import { publicMember } from "../lib/format";
import { matchedPeers, isMatched, GOAL_LABELS } from "../lib/matches";

const NOT_MATCHED = "La messagerie est réservée à vos relations : les membres avec qui vous avez matché.";

/** Messages échangés entre deux membres, dans les deux sens. */
const between = (a: number, b: number) =>
  or(and(eq(messages.fromId, a), eq(messages.toId, b)), and(eq(messages.fromId, b), eq(messages.toId, a)));

export const messagesRouter = createRouter({
  /** Nombre de messages non lus (badge du menu). */
  unreadCount: proc.query(async ({ ctx }) => {
    const peerIds = [...(await matchedPeers(ctx.memberId)).keys()];
    if (!peerIds.length) return 0;
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.toId, ctx.memberId), isNull(messages.readAt), inArray(messages.fromId, peerIds)));
    return row?.n ?? 0;
  }),

  /** Mes relations (= mes matchs), avec le dernier message échangé et les non-lus. */
  conversations: proc.query(async ({ ctx }) => {
    const db = getDb();
    const me = ctx.memberId;
    const peers = await matchedPeers(me);
    const peerIds = [...peers.keys()];
    if (!peerIds.length) return [];
    const rows = await db
      .select()
      .from(messages)
      .where(or(and(eq(messages.fromId, me), inArray(messages.toId, peerIds)), and(eq(messages.toId, me), inArray(messages.fromId, peerIds))))
      .orderBy(desc(messages.createdAt))
      .limit(2000);
    const people = await db.select().from(members).where(inArray(members.id, peerIds));
    return peerIds
      .map((id) => {
        const p = people.find((x) => x.id === id);
        if (!p) return null;
        const last = rows.find((m) => m.fromId === id || m.toId === id);
        const unread = rows.filter((m) => m.fromId === id && m.toId === me && !m.readAt).length;
        const match = peers.get(id)!;
        return {
          peer: publicMember(p),
          goals: match.goals.map((g) => GOAL_LABELS[g] ?? g),
          matchedAt: match.at,
          lastText: last?.text ?? null,
          lastAt: last?.createdAt ?? null,
          lastMine: last ? last.fromId === me : false,
          unread,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((x, y) => +(y.lastAt ?? y.matchedAt) - +(x.lastAt ?? x.matchedAt));
  }),

  /** Fil avec un membre (les messages reçus sont marqués comme lus). */
  thread: proc.input(z.object({ withId: z.number(), afterId: z.number().optional() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const peer = await db.query.members.findFirst({ where: eq(members.id, input.withId) });
    if (!peer) throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable" });
    if (!(await isMatched(ctx.memberId, input.withId))) throw new TRPCError({ code: "FORBIDDEN", message: NOT_MATCHED });
    const list = await db.select().from(messages).where(between(ctx.memberId, input.withId)).orderBy(asc(messages.createdAt)).limit(500);
    if (list.some((m) => m.toId === ctx.memberId && !m.readAt)) {
      await db
        .update(messages)
        .set({ readAt: new Date() })
        .where(and(eq(messages.fromId, input.withId), eq(messages.toId, ctx.memberId), isNull(messages.readAt)));
    }
    return {
      peer: publicMember(peer),
      messages: list.map((m) => ({ id: m.id, text: m.text, at: m.createdAt, mine: m.fromId === ctx.memberId, read: !!m.readAt })),
    };
  }),

  send: proc.input(z.object({ toId: z.number(), text: z.string().trim().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
    if (input.toId === ctx.memberId) throw new TRPCError({ code: "BAD_REQUEST", message: "Vous ne pouvez pas vous écrire à vous-même." });
    const db = getDb();
    const peer = await db.query.members.findFirst({ where: eq(members.id, input.toId) });
    if (!peer) throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable" });
    if (!(await isMatched(ctx.memberId, input.toId))) throw new TRPCError({ code: "FORBIDDEN", message: NOT_MATCHED });
    const [row] = await db.insert(messages).values({ fromId: ctx.memberId, toId: input.toId, text: input.text }).returning();
    return { id: row.id, text: row.text, at: row.createdAt, mine: true, read: false };
  }),
});
