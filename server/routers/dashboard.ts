import { eq, and, asc, desc, gte } from "drizzle-orm";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { coachingSessions, events, eventRegistrations, talks, forumPosts, hivePosts } from "../../db/schema";
import { publicMember } from "../lib/format";
import { env } from "../lib/env";

export const dashboardRouter = createRouter({
  /** Bandeau coaching : prochaine séance, séances restantes, liens Calendly. */
  coaching: proc.query(async ({ ctx }) => {
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

  /** Mon agenda : tout ce à quoi je suis inscrite (événements, ruches, salons) + coachings. */
  agenda: proc.query(async ({ ctx }) => {
    const db = getDb();
    const regs = await db.query.eventRegistrations.findMany({ where: and(eq(eventRegistrations.memberId, ctx.memberId), eq(eventRegistrations.waitlist, false)), with: { event: { with: { hive: true, host: true } } } });
    const items = regs.map((r) => ({
      id: `e${r.event.id}`, eventId: r.event.id, type: r.event.kind === "salon" ? "salon" : r.event.hiveId ? "ruche" : "event",
      title: r.event.title, startsAt: r.event.startsAt, durationMin: r.event.durationMin, days: r.event.days,
      where: [r.event.where, r.event.hive?.name, r.event.hostId === ctx.memberId ? "vous l’organisez" : null].filter(Boolean).join(" · "),
      href: r.event.hiveId ? `/ruches/${r.event.hiveId}` : `/evenements?e=${r.event.id}`,
    }));
    const sessions = await db.query.coachingSessions.findMany({ where: and(eq(coachingSessions.memberId, ctx.memberId), eq(coachingSessions.done, false)) });
    for (const s of sessions) {
      items.push({ id: `c${s.id}`, eventId: 0, type: "coaching", title: `Coaching avec Laura Ballo : ${s.title}`, startsAt: s.startsAt, durationMin: s.durationMin, days: 1, where: `${s.format} · séance ${s.number} sur ${s.total}`, href: "/" });
    }
    return items.sort((a, b) => +a.startsAt - +b.startsAt);
  }),

  /** « Cette semaine dans Présence » : actualités du cercle. */
  news: proc.query(async () => {
    const db = getDb();
    const now = new Date();
    const talk = await db.query.talks.findFirst({ where: eq(talks.status, "published"), with: { speaker: true }, orderBy: [desc(talks.publishedAt)] });
    const post = await db.query.forumPosts.findFirst({ with: { author: true }, orderBy: [desc(forumPosts.likes)] });
    const hivePost = await db.query.hivePosts.findFirst({ with: { author: true, hive: true }, orderBy: [desc(hivePosts.createdAt)] });
    const live = await db.query.events.findFirst({ where: and(eq(events.kind, "salon"), gte(events.startsAt, new Date(now.getTime() - 60 * 60 * 1000))), with: { host: true, registrations: true }, orderBy: [asc(events.startsAt)] });
    const featured = await db.query.events.findFirst({ where: and(eq(events.featured, true), gte(events.startsAt, now)), orderBy: [asc(events.startsAt)] });
    const items: { cat: string; title: string; sub: string; href: string; photoUrl?: string | null }[] = [];
    if (talk) items.push({ cat: "Talk Show", title: `Nouveau talk : « ${talk.title} »`, sub: `${publicMember(talk.speaker).name} partage ${talk.summary.slice(0, 90)}…`, href: "/talk-show", photoUrl: talk.speaker.photoUrl });
    if (post) items.push({ cat: "Forum", title: `${post.author.firstName} : ${post.text.slice(0, 50)}…`, sub: `Déjà ${post.likes} applaudissements.`, href: "/forum", photoUrl: post.author.photoUrl });
    if (hivePost) items.push({ cat: "Ruches", title: `Chez ${hivePost.hive.name}`, sub: hivePost.text.slice(0, 110), href: `/ruches/${hivePost.hiveId}` });
    if (live) items.push({ cat: "Salons live", title: live.live ? `Un salon en direct : ${live.title}` : `Prochain salon : ${live.title}`, sub: `Animé par ${publicMember(live.host).name}${live.maxSeats ? ` · ${Math.max(0, live.maxSeats - live.registrations.length)} places` : ""}`, href: `/evenements?e=${live.id}` });
    if (featured) items.push({ cat: "Événements", title: featured.title, sub: featured.where, href: `/evenements?e=${featured.id}` });
    items.push({ cat: "Matching", title: "Vos affinités de la semaine", sub: "De nouveaux profils correspondent à ce que vous cherchez.", href: "/matching" });
    return items.slice(0, 6);
  }),
});
