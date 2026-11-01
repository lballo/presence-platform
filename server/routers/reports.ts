import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { assertCan, createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { hiveMembers, hivePosts, hives, forumReplies, members, messages, reports } from "../../db/schema";
import { notify } from "../lib/notify";
import { readablePost } from "./forum";
import type { HiveRole } from "../lib/permissions";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Ce contenu n’existe plus." });

export const REPORT_KINDS = ["post", "reply", "message", "hive_post"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** Signaler un contenu que l'on a le droit de lire : une publication, une réponse, un message reçu. */
export const reportsRouter = createRouter({
  create: procFor("profile.use")
    .input(z.object({ kind: z.enum(REPORT_KINDS), id: z.number().int(), reason: z.string().trim().min(3, "Indiquez le motif.").max(800) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let authorId: number;
      let snapshot: string;
      if (input.kind === "post") {
        const { post } = await readablePost(ctx.member, input.id);
        authorId = post.authorId;
        snapshot = [post.title, post.text].filter(Boolean).join("\n");
      } else if (input.kind === "reply") {
        const r = await db.query.forumReplies.findFirst({ where: eq(forumReplies.id, input.id) });
        if (!r) throw notFound();
        await readablePost(ctx.member, r.postId);
        authorId = r.authorId;
        snapshot = r.text;
      } else if (input.kind === "message") {
        const m = await db.query.messages.findFirst({ where: eq(messages.id, input.id) });
        // Seulement un message reçu : l'intérêt de l'autre conversation ne regarde personne d'autre.
        if (!m || m.toId !== ctx.memberId) throw notFound();
        authorId = m.fromId;
        snapshot = m.text || (m.attachmentName ? `Pièce jointe : ${m.attachmentName}` : "");
      } else {
        const p = await db.query.hivePosts.findFirst({ where: eq(hivePosts.id, input.id) });
        if (!p) throw notFound();
        const hive = await db.query.hives.findFirst({ where: eq(hives.id, p.hiveId) });
        const mine = await db.query.hiveMembers.findFirst({ where: and(eq(hiveMembers.hiveId, p.hiveId), eq(hiveMembers.memberId, ctx.memberId)) });
        if (hive?.access !== "libre") assertCan(ctx.member, "hive.read_private", { hiveRole: (mine?.role ?? "") as HiveRole }, "Ce contenu n’existe plus.");
        authorId = p.authorId;
        snapshot = p.text;
      }
      if (authorId === ctx.memberId) throw new TRPCError({ code: "BAD_REQUEST", message: "Vous ne pouvez pas signaler votre propre contenu." });
      const [row] = await db.insert(reports).values({ reporterId: ctx.memberId, kind: input.kind, targetId: input.id, authorId, reason: input.reason, snapshot: snapshot.slice(0, 4000) }).onConflictDoNothing().returning();
      if (row) {
        const admins = await db.select({ id: members.id }).from(members).where(and(eq(members.role, "administrateur"), eq(members.status, "actif")));
        await notify(admins.map((a) => a.id), { title: "Nouveau signalement à examiner", href: "/admin/moderation" });
      }
      return { ok: true, already: !row };
    }),
});
