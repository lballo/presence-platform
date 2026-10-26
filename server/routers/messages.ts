import { z } from "zod";
import { and, eq, or, desc, asc, isNull, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { messages, members } from "../../db/schema";
import { publicMember } from "../lib/format";

/** Messages échangés entre deux membres, dans les deux sens. */
const between = (a: number, b: number) =>
  or(and(eq(messages.fromId, a), eq(messages.toId, b)), and(eq(messages.fromId, b), eq(messages.toId, a)));

export const messagesRouter = createRouter({
  /** Nombre de messages non lus (badge du menu). */
  unreadCount: proc.query(async ({ ctx }) => {
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.toId, ctx.memberId), isNull(messages.readAt)));
    return row?.n ?? 0;
  }),

  /** Mes conversations : un interlocuteur par ligne, avec le dernier message et les non-lus. */
  conversations: proc.query(async ({ ctx }) => {
    const db = getDb();
    const me = ctx.memberId;
    const rows = await db
      .select()
      .from(messages)
      .where(or(eq(messages.fromId, me), eq(messages.toId, me)))
      .orderBy(desc(messages.createdAt))
      .limit(1000);
    const byPeer = new Map<number, { last: (typeof rows)[number]; unread: number }>();
    for (const m of rows) {
      const peer = m.fromId === me ? m.toId : m.fromId;
      const cur = byPeer.get(peer);
      if (!cur) byPeer.set(peer, { last: m, unread: 0 });
      const entry = byPeer.get(peer)!;
      if (m.toId === me && !m.readAt) entry.unread += 1;
    }
    const peerIds = [...byPeer.keys()];
    if (!peerIds.length) return [];
    const peers = await db.select().from(members).where(inArray(members.id, peerIds));
    return peerIds
      .map((id) => {
        const p = peers.find((x) => x.id === id);
        const { last, unread } = byPeer.get(id)!;
        return p ? { peer: publicMember(p), lastText: last.text, lastAt: last.createdAt, lastMine: last.fromId === me, unread } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }),

  /** Fil avec un membre (les messages reçus sont marqués comme lus). */
  thread: proc.input(z.object({ withId: z.number(), afterId: z.number().optional() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const peer = await db.query.members.findFirst({ where: eq(members.id, input.withId) });
    if (!peer) throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable" });
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
    const [row] = await db.insert(messages).values({ fromId: ctx.memberId, toId: input.toId, text: input.text }).returning();
    return { id: row.id, text: row.text, at: row.createdAt, mine: true, read: false };
  }),
});
