import { eq, and, asc, desc, gte, isNotNull, isNull } from "drizzle-orm";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { coachingSessions, events, talks, forumPosts, hivePosts } from "../../db/schema";
import { publicMember } from "../lib/format";
import { isLive } from "../lib/forumAccess";
import { env } from "../lib/env";

const dashProc = procFor("dashboard.read");

export const dashboardRouter = createRouter({
  /** Bandeau coaching : prochaine séance, séances restantes, liens Calendly. */
  coaching: dashProc.query(async ({ ctx }) => {
    const db = getDb();
    const sessions = await db.query.coachingSessions.findMany({ where: eq(coachingSessions.memberId, ctx.memberId), orderBy: [asc(coachingSessions.number)] });
    const next = sessions.find((s) => !s.done);
    const total = sessions[0]?.total ?? 12;
    const done = sessions.filter((s) => s.done).length;
    return {
      isCoached: sessions.length > 0,
      next: next ? { title: next.title, startsAt: next.startsAt, durationMin: next.durationMin, format: next.format, number: next.number } : null,
      done, total, remaining: total - done,
      calendlyUrl: env.calendlyUrl, calendlyExploUrl: env.calendlyExploUrl,
    };
  }),

  /** « Cette semaine dans Présence » : actualités du cercle. */
  news: dashProc.query(async () => {
    const db = getDb();
    const now = new Date();
    const talk = await db.query.talks.findFirst({ where: eq(talks.status, "published"), with: { speaker: true }, orderBy: [desc(talks.publishedAt)] });
    const post = await db.query.forumPosts.findFirst({ where: and(isNotNull(forumPosts.spaceId), isLive(), eq(forumPosts.audience, "tous")), with: { author: true }, orderBy: [desc(forumPosts.likes)] });
    const hivePost = await db.query.hivePosts.findFirst({ with: { author: true, hive: true }, orderBy: [desc(hivePosts.createdAt)] });
    const live = await db.query.events.findFirst({ where: and(eq(events.kind, "salon"), eq(events.status, "published"), isNull(events.hiveId), isNull(events.cancelledAt), gte(events.startsAt, new Date(now.getTime() - 60 * 60 * 1000))), with: { host: true, registrations: true }, orderBy: [asc(events.startsAt)] });
    const featured = await db.query.events.findFirst({ where: and(eq(events.featured, true), eq(events.status, "published"), isNull(events.hiveId), isNull(events.cancelledAt), gte(events.startsAt, now)), orderBy: [asc(events.startsAt)] });
    const items: { cat: string; title: string; sub: string; href: string; photoUrl?: string | null }[] = [];
    if (talk) items.push({ cat: "Talk Show", title: `Nouveau talk : « ${talk.title} »`, sub: `${publicMember(talk.speaker).name} partage ${talk.summary.slice(0, 90)}…`, href: "/talk-show", photoUrl: talk.speaker.photoUrl });
    if (post) items.push({ cat: "Forum", title: `${post.author.firstName} : ${post.title || `${post.text.slice(0, 50)}…`}`, sub: `Déjà ${post.likes} applaudissements.`, href: `/forum/publication/${post.id}`, photoUrl: post.author.photoUrl });
    if (hivePost) items.push({ cat: "Ruches", title: `Chez ${hivePost.hive.name}`, sub: hivePost.text.slice(0, 110), href: `/ruches/${hivePost.hiveId}` });
    if (live) items.push({ cat: "Salons live", title: live.live ? `Un salon en direct : ${live.title}` : `Prochain salon : ${live.title}`, sub: `Animé par ${publicMember(live.host).name}${live.maxSeats ? ` · ${Math.max(0, live.maxSeats - live.registrations.length)} places` : ""}`, href: `/e/${live.slug}` });
    if (featured) items.push({ cat: "Événements", title: featured.title, sub: featured.where, href: `/e/${featured.slug}` });
    items.push({ cat: "Matching", title: "Vos affinités de la semaine", sub: "De nouveaux profils correspondent à ce que vous cherchez.", href: "/matching" });
    return items.slice(0, 6);
  }),
});
