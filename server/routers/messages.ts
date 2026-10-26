import { z } from "zod";
import { and, eq, or, desc, asc, isNull, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { messages, members } from "../../db/schema";
import { publicMember } from "../lib/format";
import { signedDownloadUrl } from "../lib/storage";
import { matchedPeers, GOAL_LABELS } from "../lib/matches";

/** Messages échangés entre deux membres, dans les deux sens. */
const between = (a: number, b: number) =>
  or(and(eq(messages.fromId, a), eq(messages.toId, b)), and(eq(messages.fromId, b), eq(messages.toId, a)));

// La messagerie est ouverte à tous les membres du cercle ; un match éventuel est simplement signalé.
export const messagesRouter = createRouter({
  /** Nombre de messages non lus (badge du menu). */
  unreadCount: proc.query(async ({ ctx }) => {
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.toId, ctx.memberId), isNull(messages.readAt)));
    return row?.n ?? 0;
  }),

  /** Mes conversations : un interlocuteur par ligne, avec le dernier message, les non-lus et le match éventuel. */
  conversations: proc.query(async ({ ctx }) => {
    const db = getDb();
    const me = ctx.memberId;
    const rows = await db.select().from(messages).where(or(eq(messages.fromId, me), eq(messages.toId, me))).orderBy(desc(messages.createdAt)).limit(2000);
    const peerIds = [...new Set(rows.map((m) => (m.fromId === me ? m.toId : m.fromId)))];
    if (!peerIds.length) return [];
    const [people, matches] = await Promise.all([db.select().from(members).where(inArray(members.id, peerIds)), matchedPeers(me)]);
    return peerIds
      .map((id) => {
        const p = people.find((x) => x.id === id);
        if (!p) return null;
        const last = rows.find((m) => m.fromId === id || m.toId === id)!;
        const unread = rows.filter((m) => m.fromId === id && m.toId === me && !m.readAt).length;
        const goals = (matches.get(id)?.goals ?? []).filter((g) => g !== "amour").map((g) => GOAL_LABELS[g] ?? g);
        return {
          peer: publicMember(p),
          goals,
          lastText: last.text || (last.attachmentName ? `Pièce jointe : ${last.attachmentName}` : ""),
          lastAt: last.createdAt,
          lastMine: last.fromId === me,
          unread,
        };
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
    // liens de téléchargement temporaires pour les pièces jointes (bucket privé)
    const urls = new Map<number, { view: string | null; download: string | null }>();
    await Promise.all(
      list.filter((m) => m.attachmentPath).map(async (m) => {
        const [view, download] = await Promise.all([signedDownloadUrl("message", m.attachmentPath!), signedDownloadUrl("message", m.attachmentPath!, m.attachmentName ?? "fichier")]);
        urls.set(m.id, { view, download });
      })
    );
    return {
      peer: publicMember(peer),
      messages: list.map((m) => ({
        id: m.id, text: m.text, at: m.createdAt, mine: m.fromId === ctx.memberId, read: !!m.readAt,
        attachment: m.attachmentPath ? { name: m.attachmentName ?? "fichier", type: m.attachmentType ?? "", size: m.attachmentSize ?? 0, url: urls.get(m.id)?.view ?? null, downloadUrl: urls.get(m.id)?.download ?? null } : null,
      })),
    };
  }),

  send: proc
    .input(z.object({
      toId: z.number(),
      text: z.string().trim().max(4000).default(""),
      attachment: z.object({ path: z.string().max(300), name: z.string().max(200), type: z.string().max(120), size: z.number().int().min(0) }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
    if (input.toId === ctx.memberId) throw new TRPCError({ code: "BAD_REQUEST", message: "Vous ne pouvez pas vous écrire à vous-même." });
    if (!input.text && !input.attachment) throw new TRPCError({ code: "BAD_REQUEST", message: "Message vide." });
    if (input.attachment && !input.attachment.path.startsWith(`membre-${ctx.memberId}/`)) throw new TRPCError({ code: "FORBIDDEN", message: "Pièce jointe invalide." });
    const db = getDb();
    const peer = await db.query.members.findFirst({ where: eq(members.id, input.toId) });
    if (!peer) throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable" });
    const a = input.attachment;
    const [row] = await db.insert(messages).values({ fromId: ctx.memberId, toId: input.toId, text: input.text, attachmentPath: a?.path, attachmentName: a?.name, attachmentType: a?.type, attachmentSize: a?.size }).returning();
    return { id: row.id };
  }),
});
