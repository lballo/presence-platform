import { z } from "zod";
import { eq, and, desc, asc, sql, or, ne, inArray, isNull, isNotNull, notInArray, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { assertCan, createRouter, procFor } from "../middleware";
import { can, type HiveRole } from "../lib/permissions";
import { audiencesOf, canReadPost, feedFilter, hiveFilter, isLive, postState, spaceFilter } from "../lib/forumAccess";
import { cleanHtml, htmlToText, isForumImage } from "../lib/richText";
import { signedDownloadUrl } from "../lib/storage";
import { getDb } from "../queries/connection";
import { forumDrafts, forumLikes, forumPostHashtags, forumPostInterests, forumPostReads, forumPosts, forumReplies, forumSpaces, hashtags, hiveMembers, hives, type ForumPost, type Member } from "../../db/schema";
import { publicMember } from "../lib/format";

const forumProc = procFor("forum.use");
const manageProc = procFor("forum.manage");

const OPP_TYPES = ["recrut", "fin", "assoc"] as const;
const draftKey = z.string().regex(/^(new|annonce|hive-\d+|edit-\d+)$/);

const postInput = z.object({
  spaceId: z.number().int().nullable().default(null),
  hiveId: z.number().int().nullable().default(null),
  title: z.string().trim().max(200),
  html: z.string().max(60000),
  coverUrl: z.string().trim().max(1000).default(""),
  videoUrl: z.string().trim().max(1000).default(""),
  attachments: z.array(z.object({ path: z.string().max(300), name: z.string().max(200), type: z.string().max(120), size: z.number().int().min(0) })).max(10).default([]),
  hashtagIds: z.array(z.number().int()).max(5, "Cinq hashtags au plus.").default([]),
  // annonces
  pinned: z.boolean().default(false),
  audience: z.enum(["tous", "collectif", "accompagnement"]).default("tous"),
  publishAt: z.coerce.date().nullable().default(null),
  endsAt: z.coerce.date().nullable().default(null),
  // opportunités
  oppType: z.enum(OPP_TYPES).nullable().default(null),
  facts: z.array(z.string().trim().min(1).max(60)).max(6).default([]),
  draftKey: draftKey.optional(),
});
type PostInput = z.infer<typeof postInput>;

const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

async function hiveContext(hiveId: number, memberId: number) {
  const db = getDb();
  const [hive, row] = await Promise.all([
    db.query.hives.findFirst({ where: eq(hives.id, hiveId) }),
    db.query.hiveMembers.findFirst({ where: and(eq(hiveMembers.hiveId, hiveId), eq(hiveMembers.memberId, memberId)) }),
  ]);
  return { hive, hiveRole: (row?.role ?? "") as HiveRole, hiveOpen: hive?.access === "libre" };
}

/** Une publication que ce membre a le droit de lire, sinon « introuvable ». */
async function readablePost(member: Member, postId: number) {
  const post = await getDb().query.forumPosts.findFirst({ where: eq(forumPosts.id, postId), with: { space: true } });
  const hive = post?.hiveId ? await hiveContext(post.hiveId, member.id) : null;
  if (!post || !canReadPost(member, post, hive ?? {})) throw new TRPCError({ code: "NOT_FOUND", message: "Publication introuvable" });
  return { post, hiveRole: hive?.hiveRole ?? ("" as HiveRole) };
}

/** Réagir ou répondre : publication validée et, pour une annonce de ruche, faire partie de la ruche. */
async function interactablePost(member: Member, postId: number) {
  const { post, hiveRole } = await readablePost(member, postId);
  if (post.status !== "published") throw badRequest("Cette publication n’est pas encore publiée.");
  if (post.hiveId) assertCan(member, "hive.contribute", { hiveRole }, "Rejoignez la ruche pour participer.");
  return post;
}

async function myHiveIds(memberId: number) {
  const rows = await getDb().select({ hiveId: hiveMembers.hiveId }).from(hiveMembers).where(and(eq(hiveMembers.memberId, memberId), ne(hiveMembers.role, "pending")));
  return rows.map((r) => r.hiveId);
}

/** Annonces en ligne qui concernent ce membre et qu'il n'a pas encore lues. */
async function unreadCounts(member: Member) {
  const db = getDb();
  const rows = await db
    .select({ hiveId: forumPosts.hiveId })
    .from(forumPosts)
    .leftJoin(forumSpaces, eq(forumSpaces.id, forumPosts.spaceId))
    .leftJoin(forumPostReads, and(eq(forumPostReads.postId, forumPosts.id), eq(forumPostReads.memberId, member.id)))
    .where(and(
      isLive(),
      ne(forumPosts.authorId, member.id),
      isNull(forumPostReads.postId),
      or(and(eq(forumSpaces.kind, "annonces"), inArray(forumPosts.audience, audiencesOf(member.accessType))), inArray(forumPosts.hiveId, await myHiveIds(member.id))),
    ));
  const hivesUnread: Record<number, number> = {};
  for (const r of rows) if (r.hiveId) hivesUnread[r.hiveId] = (hivesUnread[r.hiveId] ?? 0) + 1;
  const annonces = rows.filter((r) => !r.hiveId).length;
  return { annonces, hives: hivesUnread, total: rows.length };
}

const postWith = {
  author: true as const,
  space: true as const,
  hive: true as const,
  tags: { with: { hashtag: true as const } },
  replyList: { with: { author: true as const }, orderBy: [asc(forumReplies.createdAt)] },
};

type LoadedPost = NonNullable<Awaited<ReturnType<typeof loadPost>>>;
const loadPost = (id: number) => getDb().query.forumPosts.findFirst({ where: eq(forumPosts.id, id), with: postWith });

/** Ce que voit le navigateur : réactions, lectures et droits du membre sur chaque publication. */
async function shapePosts(member: Member, rows: LoadedPost[]) {
  const db = getDb();
  const ids = rows.map((p) => p.id);
  if (!ids.length) return [];
  const [liked, reads, readCounts, interests] = await Promise.all([
    db.select({ id: forumLikes.postId }).from(forumLikes).where(and(eq(forumLikes.memberId, member.id), inArray(forumLikes.postId, ids))),
    db.select({ id: forumPostReads.postId }).from(forumPostReads).where(and(eq(forumPostReads.memberId, member.id), inArray(forumPostReads.postId, ids))),
    db.select({ id: forumPostReads.postId, n: sql<number>`count(*)::int` }).from(forumPostReads).innerJoin(forumPosts, eq(forumPosts.id, forumPostReads.postId))
      .where(and(inArray(forumPostReads.postId, ids), ne(forumPostReads.memberId, forumPosts.authorId))).groupBy(forumPostReads.postId),
    db.select().from(forumPostInterests).where(inArray(forumPostInterests.postId, ids)),
  ]);
  const likedIds = new Set(liked.map((r) => r.id));
  const readIds = new Set(reads.map((r) => r.id));
  const counts = new Map(readCounts.map((r) => [r.id, r.n]));
  return Promise.all(rows.map(async ({ replyList, tags, space, hive, ...p }) => {
    const isMine = p.authorId === member.id;
    const isAnnouncement = !!p.hiveId || space?.kind === "annonces";
    const state = postState(p);
    const postInterests = interests.filter((i) => i.postId === p.id);
    const canEdit = can(member, "content.edit", { ownerId: p.authorId });
    return {
      id: p.id, title: p.title, text: p.text, html: p.html, coverUrl: p.coverUrl, videoUrl: p.videoUrl, askFeedback: p.askFeedback,
      status: p.status, state, publishedAt: p.publishedAt, endsAt: p.endsAt, editedAt: p.editedAt, audience: p.audience,
      pinned: !!p.pinnedAt, oppType: p.oppType, facts: p.facts, likes: p.likes, spaceId: p.spaceId, hiveId: p.hiveId,
      author: publicMember(p.author),
      space: space ? { id: space.id, slug: space.slug, name: space.name, emoji: space.emoji, kind: space.kind } : null,
      hive: hive ? { id: hive.id, name: hive.name } : null,
      hashtags: tags.map((t) => ({ id: t.hashtag.id, name: t.hashtag.name, color: t.hashtag.color })),
      attachments: await Promise.all(p.attachments.map(async (a) => ({ ...a, path: canEdit ? a.path : "", url: await signedDownloadUrl("forumFile", a.path, a.type.startsWith("audio/") ? undefined : a.name) }))),
      isMine, isAnnouncement, canEdit,
      canDelete: can(member, "content.delete", { ownerId: p.authorId }),
      liked: likedIds.has(p.id),
      unread: isAnnouncement && state === "live" && !isMine && !readIds.has(p.id),
      readCount: isAnnouncement && (isMine || can(member, "moderate")) ? counts.get(p.id) ?? 0 : null,
      interestedCount: postInterests.length,
      interested: postInterests.some((i) => i.memberId === member.id),
      replies: replyList.length,
      replyList: replyList.map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt, editedAt: r.editedAt, author: publicMember(r.author), isMine: r.authorId === member.id, canDelete: can(member, "content.delete", { ownerId: r.authorId }) })),
    };
  }));
}

/** Où va la publication, et le droit d'y publier. */
async function resolveTarget(member: Member, input: PostInput, existing?: ForumPost) {
  const hiveId = existing ? existing.hiveId : input.hiveId;
  if (hiveId) {
    const { hive, hiveRole } = await hiveContext(hiveId, member.id);
    if (!hive) throw new TRPCError({ code: "NOT_FOUND", message: "Ruche introuvable" });
    assertCan(member, "hive.announce", { hiveRole }, "Réservé aux leaders de la ruche.");
    return { hiveId, space: null };
  }
  if (!input.spaceId) throw badRequest("Choisissez l’espace de publication.");
  const space = await getDb().query.forumSpaces.findFirst({ where: eq(forumSpaces.id, input.spaceId) });
  if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "Espace introuvable" });
  if (space.adminOnly) assertCan(member, "forum.post_restricted", {}, "Cet espace est réservé aux administrateurs.");
  return { hiveId: null, space };
}

/** Les règles d'une publication selon son espace : contenu obligatoire, relecture, options des annonces. */
function postValues(member: Member, input: PostInput, target: Awaited<ReturnType<typeof resolveTarget>>, existing?: ForumPost) {
  const { space } = target;
  const isAnnouncement = !!target.hiveId || space?.kind === "annonces";
  const isOpp = space?.kind === "opportunites";
  const html = cleanHtml(input.html);
  const text = htmlToText(html);
  if (text.length > 10000) throw badRequest("Le texte dépasse 10 000 caractères.");
  if (!input.title && (!existing || existing.title)) throw badRequest("Donnez un titre à votre publication.");
  if (!text && !input.videoUrl && !input.attachments.length && !html.includes("<img")) throw badRequest("Ajoutez un texte, une image, une vidéo ou une pièce jointe.");
  if (input.videoUrl && !/^https?:\/\/\S+$/.test(input.videoUrl)) throw badRequest("Le lien de la vidéo doit commencer par https://");
  if (space?.kind === "video" && !input.videoUrl) throw badRequest("Ajoutez votre vidéo (lien ou fichier) pour demander un retour.");
  if (input.coverUrl && !isForumImage(input.coverUrl)) throw badRequest("Cette image de couverture n’a pas été chargée sur Présence.");
  // Le lien de téléchargement est signé à partir de ce chemin : uniquement les fichiers envoyés par ce membre.
  if (input.attachments.some((a) => !new RegExp(`^membre-${member.id}/[\\w-]+\\.\\w+$`).test(a.path))) throw badRequest("Pièce jointe invalide.");
  if (isOpp && !input.oppType) throw badRequest("Choisissez le type d’opportunité.");

  const now = new Date();
  const publishedAt = isAnnouncement && input.publishAt && input.publishAt > now ? input.publishAt : existing && existing.publishedAt <= now ? existing.publishedAt : now;
  const endsAt = isAnnouncement ? input.endsAt : null;
  if (endsAt && endsAt <= publishedAt) throw badRequest("La date de fin d’affichage doit suivre la publication.");
  const keptPin = existing && existing.spaceId === target.space?.id ? existing.pinnedAt : null;

  return {
    spaceId: space?.id ?? null,
    hiveId: target.hiveId,
    title: input.title,
    html,
    text,
    coverUrl: input.coverUrl,
    videoUrl: input.videoUrl,
    attachments: input.attachments,
    askFeedback: space?.kind === "video",
    // Les opportunités sont relues par l'équipe avant publication, y compris après une modification.
    status: isOpp && !can(member, "opportunity.validate") ? ("pending" as const) : ("published" as const),
    pinnedAt: isAnnouncement ? (input.pinned ? keptPin ?? now : null) : keptPin,
    audience: isAnnouncement && space ? input.audience : ("tous" as const),
    publishedAt,
    endsAt,
    oppType: isOpp ? input.oppType : null,
    facts: isOpp ? input.facts : [],
  };
}

async function setHashtags(tx: Pick<ReturnType<typeof getDb>, "delete" | "insert" | "select">, postId: number, ids: number[]) {
  await tx.delete(forumPostHashtags).where(eq(forumPostHashtags.postId, postId));
  const wanted = [...new Set(ids)];
  if (!wanted.length) return;
  const known = await tx.select({ id: hashtags.id }).from(hashtags).where(inArray(hashtags.id, wanted));
  if (known.length) await tx.insert(forumPostHashtags).values(known.map((h) => ({ postId, hashtagId: h.id })));
}

/** Supprime des publications et ce qui s'y rattache (hashtags, lectures et intérêts suivent par cascade). */
export async function deleteForumPosts(ids: number[]) {
  if (!ids.length) return;
  const db = getDb();
  await db.delete(forumLikes).where(inArray(forumLikes.postId, ids));
  await db.delete(forumReplies).where(inArray(forumReplies.postId, ids));
  await db.delete(forumPosts).where(inArray(forumPosts.id, ids));
}

export const forumRouter = createRouter({
  /** Les espaces, ce que le membre peut y faire, et le point de couleur des annonces non lues. */
  spaces: forumProc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.select().from(forumSpaces).orderBy(asc(forumSpaces.position), asc(forumSpaces.id));
    const [unread, pending] = await Promise.all([
      unreadCounts(ctx.member),
      can(ctx.member, "opportunity.validate") ? db.select({ n: sql<number>`count(*)::int` }).from(forumPosts).where(eq(forumPosts.status, "pending")) : Promise.resolve([{ n: 0 }]),
    ]);
    return {
      spaces: list.map((s) => ({
        id: s.id, slug: s.slug, name: s.name, emoji: s.emoji, description: s.description, groupKey: s.groupKey, kind: s.kind, adminOnly: s.adminOnly,
        canPost: !s.adminOnly || can(ctx.member, "forum.post_restricted"),
        unread: s.kind === "annonces" ? unread.annonces : 0,
        pending: s.kind === "opportunites" ? pending[0]?.n ?? 0 : 0,
      })),
      canManage: can(ctx.member, "forum.manage"),
      canAnnounce: can(ctx.member, "forum.post_restricted"),
    };
  }),

  /** Fil d'actualité, espace, annonces d'une ruche ou publications d'un hashtag. */
  posts: forumProc
    .input(z.object({ space: z.string().max(60).optional(), hive: z.number().int().optional(), hashtagId: z.number().int().optional(), oppType: z.enum(OPP_TYPES).optional(), limit: z.number().int().min(1).max(200).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const where: (SQL | undefined)[] = [];
      let pinnedFirst = true;
      if (input.hive) {
        const { hive, hiveRole, hiveOpen } = await hiveContext(input.hive, ctx.memberId);
        if (!hive) throw new TRPCError({ code: "NOT_FOUND", message: "Ruche introuvable" });
        if (!hiveOpen && !can(ctx.member, "hive.read_private", { hiveRole })) return { posts: [], hasMore: false };
        where.push(hiveFilter(ctx.member, input.hive, hiveRole));
      } else if (input.space) {
        const space = await db.query.forumSpaces.findFirst({ where: eq(forumSpaces.slug, input.space) });
        if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "Espace introuvable" });
        where.push(eq(forumPosts.spaceId, space.id), spaceFilter(ctx.member));
      } else if (input.hashtagId) {
        // Un hashtag rassemble toutes les publications visibles, annonces de mes ruches comprises.
        pinnedFirst = false;
        where.push(or(feedFilter(ctx.member), and(isLive(), inArray(forumPosts.hiveId, await myHiveIds(ctx.memberId)))));
      } else {
        pinnedFirst = false;
        where.push(feedFilter(ctx.member));
      }
      if (input.hashtagId) where.push(inArray(forumPosts.id, db.select({ id: forumPostHashtags.postId }).from(forumPostHashtags).where(eq(forumPostHashtags.hashtagId, input.hashtagId))));
      if (input.oppType) where.push(eq(forumPosts.oppType, input.oppType));
      const rows = await db.query.forumPosts.findMany({
        where: and(...where),
        with: postWith,
        orderBy: [...(pinnedFirst ? [sql`${forumPosts.pinnedAt} desc nulls last`] : []), desc(forumPosts.publishedAt), desc(forumPosts.id)],
        limit: input.limit + 1,
      });
      return { posts: await shapePosts(ctx.member, rows.slice(0, input.limit)), hasMore: rows.length > input.limit };
    }),

  /** Une publication seule (lien depuis le tableau de bord). */
  post: forumProc.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    await readablePost(ctx.member, input.id);
    const row = await loadPost(input.id);
    const [shaped] = await shapePosts(ctx.member, row ? [row] : []);
    return shaped;
  }),

  /** Hashtags présents dans un espace ou dans le fil, pour le filtre. */
  hashtagFacets: forumProc.input(z.object({ space: z.string().max(60).optional() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const space = input.space ? await db.query.forumSpaces.findFirst({ where: eq(forumSpaces.slug, input.space) }) : null;
    return db
      .select({ id: hashtags.id, name: hashtags.name, color: hashtags.color, count: sql<number>`count(*)::int` })
      .from(forumPostHashtags)
      .innerJoin(hashtags, eq(hashtags.id, forumPostHashtags.hashtagId))
      .innerJoin(forumPosts, eq(forumPosts.id, forumPostHashtags.postId))
      .where(space ? and(eq(forumPosts.spaceId, space.id), spaceFilter(ctx.member)) : feedFilter(ctx.member))
      .groupBy(hashtags.id, hashtags.name, hashtags.color)
      .orderBy(asc(hashtags.name));
  }),

  createPost: forumProc.input(postInput).mutation(async ({ ctx, input }) => {
    const target = await resolveTarget(ctx.member, input);
    const values = postValues(ctx.member, input, target);
    const row = await getDb().transaction(async (tx) => {
      const [post] = await tx.insert(forumPosts).values({ ...values, authorId: ctx.memberId }).returning();
      await setHashtags(tx, post.id, input.hashtagIds);
      if (input.draftKey) await tx.delete(forumDrafts).where(and(eq(forumDrafts.memberId, ctx.memberId), eq(forumDrafts.key, input.draftKey)));
      return post;
    });
    return { id: row.id, status: row.status, publishedAt: row.publishedAt };
  }),

  /** La même fenêtre sert à modifier : contenu, espace, hashtags et options d'annonce. */
  updatePost: forumProc.input(postInput.extend({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const post = await db.query.forumPosts.findFirst({ where: eq(forumPosts.id, input.id) });
    if (!post) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "content.edit", { ownerId: post.authorId }, "Vous ne pouvez modifier que vos propres publications.");
    const target = await resolveTarget(ctx.member, input, post);
    const values = postValues(ctx.member, input, target, post);
    await db.transaction(async (tx) => {
      await tx.update(forumPosts).set({ ...values, editedAt: new Date() }).where(eq(forumPosts.id, input.id));
      await setHashtags(tx, input.id, input.hashtagIds);
      if (input.draftKey) await tx.delete(forumDrafts).where(and(eq(forumDrafts.memberId, ctx.memberId), eq(forumDrafts.key, input.draftKey)));
    });
    return { id: input.id, status: values.status };
  }),

  /** Supprimer sa publication (ou modération par l'équipe). */
  deletePost: forumProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const post = await getDb().query.forumPosts.findFirst({ where: eq(forumPosts.id, input.id) });
    if (!post) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "content.delete", { ownerId: post.authorId }, "Vous ne pouvez supprimer que vos propres publications.");
    await deleteForumPosts([post.id]);
    return { ok: true };
  }),

  /** Brouillon de la fenêtre de publication, enregistré automatiquement. */
  draft: forumProc.input(z.object({ key: draftKey })).query(async ({ ctx, input }) => {
    const row = await getDb().query.forumDrafts.findFirst({ where: and(eq(forumDrafts.memberId, ctx.memberId), eq(forumDrafts.key, input.key)) });
    return row ? { data: row.data, updatedAt: row.updatedAt } : null;
  }),

  saveDraft: forumProc.input(z.object({ key: draftKey, data: z.record(z.string(), z.unknown()) })).mutation(async ({ ctx, input }) => {
    if (JSON.stringify(input.data).length > 100000) throw badRequest("Ce brouillon est trop long pour être enregistré.");
    const updatedAt = new Date();
    await getDb().insert(forumDrafts).values({ memberId: ctx.memberId, key: input.key, data: input.data, updatedAt })
      .onConflictDoUpdate({ target: [forumDrafts.memberId, forumDrafts.key], set: { data: input.data, updatedAt } });
    return { updatedAt };
  }),

  deleteDraft: forumProc.input(z.object({ key: draftKey })).mutation(async ({ ctx, input }) => {
    await getDb().delete(forumDrafts).where(and(eq(forumDrafts.memberId, ctx.memberId), eq(forumDrafts.key, input.key)));
    return { ok: true };
  }),

  /** Point de couleur : annonces non lues du réseau et de mes ruches. */
  unread: forumProc.query(({ ctx }) => unreadCounts(ctx.member)),

  /** Annonces épinglées du tableau de bord, jusqu'à ce que la personne les ferme. */
  pinned: forumProc.query(async ({ ctx }) => {
    const db = getDb();
    const spaces = await db.select({ id: forumSpaces.id }).from(forumSpaces).where(eq(forumSpaces.kind, "annonces"));
    const rows = await db.query.forumPosts.findMany({
      where: and(
        isLive(),
        isNotNull(forumPosts.pinnedAt),
        or(and(inArray(forumPosts.spaceId, spaces.map((s) => s.id)), inArray(forumPosts.audience, audiencesOf(ctx.member.accessType))), inArray(forumPosts.hiveId, await myHiveIds(ctx.memberId))),
        notInArray(forumPosts.id, db.select({ id: forumPostReads.postId }).from(forumPostReads).where(and(eq(forumPostReads.memberId, ctx.memberId), isNotNull(forumPostReads.dismissedAt)))),
      ),
      with: { author: true, space: true, hive: true },
      orderBy: [desc(forumPosts.pinnedAt)],
    });
    return rows.map((p) => ({
      id: p.id, title: p.title, excerpt: p.text.slice(0, 220), publishedAt: p.publishedAt,
      origin: p.hive ? `🐝 ${p.hive.name}` : `${p.space?.emoji ?? ""} ${p.space?.name ?? ""}`.trim(),
      author: publicMember(p.author),
    }));
  }),

  markRead: forumProc.input(z.object({ postId: z.number().int() })).mutation(async ({ ctx, input }) => {
    await readablePost(ctx.member, input.postId);
    await getDb().insert(forumPostReads).values({ postId: input.postId, memberId: ctx.memberId }).onConflictDoNothing();
    return { ok: true };
  }),

  /** Fermer une annonce épinglée : elle quitte le tableau de bord et compte comme lue. */
  dismiss: forumProc.input(z.object({ postId: z.number().int() })).mutation(async ({ ctx, input }) => {
    await readablePost(ctx.member, input.postId);
    const dismissedAt = new Date();
    await getDb().insert(forumPostReads).values({ postId: input.postId, memberId: ctx.memberId, dismissedAt })
      .onConflictDoUpdate({ target: [forumPostReads.postId, forumPostReads.memberId], set: { dismissedAt } });
    return { ok: true };
  }),

  /** Répondre à une publication. */
  reply: forumProc.input(z.object({ postId: z.number().int(), text: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const post = await interactablePost(ctx.member, input.postId);
    const [row] = await getDb().insert(forumReplies).values({ postId: post.id, authorId: ctx.memberId, text: input.text }).returning();
    return { id: row.id };
  }),

  updateReply: forumProc.input(z.object({ id: z.number().int(), text: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const r = await db.query.forumReplies.findFirst({ where: eq(forumReplies.id, input.id) });
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "content.edit", { ownerId: r.authorId }, "Vous ne pouvez modifier que vos propres réponses.");
    await db.update(forumReplies).set({ text: input.text, editedAt: new Date() }).where(eq(forumReplies.id, input.id));
    return { ok: true };
  }),

  deleteReply: forumProc.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const r = await db.query.forumReplies.findFirst({ where: eq(forumReplies.id, input.id) });
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    assertCan(ctx.member, "content.delete", { ownerId: r.authorId }, "Vous ne pouvez supprimer que vos propres réponses.");
    await db.delete(forumReplies).where(eq(forumReplies.id, input.id));
    return { ok: true };
  }),

  toggleLike: forumProc.input(z.object({ postId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await interactablePost(ctx.member, input.postId);
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

  /** « Ça m'intéresse » sur une opportunité. */
  toggleInterest: forumProc.input(z.object({ postId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const post = await interactablePost(ctx.member, input.postId);
    if (!post.oppType) throw badRequest("Cette publication n’est pas une opportunité.");
    const where = and(eq(forumPostInterests.postId, input.postId), eq(forumPostInterests.memberId, ctx.memberId));
    const existing = await db.query.forumPostInterests.findFirst({ where });
    if (existing) {
      await db.delete(forumPostInterests).where(where);
      return { interested: false };
    }
    await db.insert(forumPostInterests).values({ postId: input.postId, memberId: ctx.memberId });
    return { interested: true };
  }),

  /** Équipe : publications à relire avant publication. */
  pending: procFor("opportunity.validate").query(async ({ ctx }) => {
    const rows = await getDb().query.forumPosts.findMany({ where: eq(forumPosts.status, "pending"), with: postWith, orderBy: [asc(forumPosts.createdAt)] });
    return shapePosts(ctx.member, rows);
  }),

  /** Équipe : publier ou refuser. Publiée, elle prend sa place en tête du fil. */
  decide: procFor("opportunity.validate").input(z.object({ id: z.number().int(), accept: z.boolean() })).mutation(async ({ input }) => {
    await getDb().update(forumPosts).set(input.accept ? { status: "published", publishedAt: new Date() } : { status: "rejected" }).where(and(eq(forumPosts.id, input.id), eq(forumPosts.status, "pending")));
    return { ok: true };
  }),

  // ─── Page provisoire d'administration ───────────────────────
  updateSpace: manageProc
    .input(z.object({ id: z.number().int(), name: z.string().trim().min(1).max(80), emoji: z.string().trim().max(16), description: z.string().trim().max(400) }))
    .mutation(async ({ input }) => {
      const { id, ...values } = input;
      await getDb().update(forumSpaces).set(values).where(eq(forumSpaces.id, id));
      return { ok: true };
    }),

  /** Monter ou descendre un espace dans son groupe. */
  moveSpace: manageProc.input(z.object({ id: z.number().int(), direction: z.enum(["up", "down"]) })).mutation(async ({ input }) => {
    const db = getDb();
    const space = await db.query.forumSpaces.findFirst({ where: eq(forumSpaces.id, input.id) });
    if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "Espace introuvable" });
    const group = await db.select().from(forumSpaces).where(eq(forumSpaces.groupKey, space.groupKey)).orderBy(asc(forumSpaces.position), asc(forumSpaces.id));
    const from = group.findIndex((s) => s.id === space.id);
    const to = from + (input.direction === "up" ? -1 : 1);
    if (to < 0 || to >= group.length) return { ok: true };
    [group[from], group[to]] = [group[to], group[from]];
    await db.transaction(async (tx) => {
      for (const [i, s] of group.entries()) await tx.update(forumSpaces).set({ position: i + 1 }).where(eq(forumSpaces.id, s.id));
    });
    return { ok: true };
  }),

  /** Dernières publications d'un espace, pour choisir celles à épingler. */
  pinCandidates: manageProc.input(z.object({ spaceId: z.number().int() })).query(async ({ input }) => {
    const rows = await getDb().query.forumPosts.findMany({
      where: and(eq(forumPosts.spaceId, input.spaceId), eq(forumPosts.status, "published")),
      with: { author: true },
      orderBy: [sql`${forumPosts.pinnedAt} desc nulls last`, desc(forumPosts.publishedAt)],
      limit: 50,
    });
    return rows.map((p) => ({ id: p.id, title: p.title, excerpt: p.text.slice(0, 120), author: publicMember(p.author).name, publishedAt: p.publishedAt, pinned: !!p.pinnedAt }));
  }),

  setPinned: manageProc.input(z.object({ postId: z.number().int(), pinned: z.boolean() })).mutation(async ({ input }) => {
    await getDb().update(forumPosts).set({ pinnedAt: input.pinned ? new Date() : null }).where(and(eq(forumPosts.id, input.postId), isNotNull(forumPosts.spaceId)));
    return { ok: true };
  }),
});
