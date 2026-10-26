import { desc } from "drizzle-orm";
import { createRouter, proc } from "./middleware";
import { getDb } from "./queries/connection";
import { talks } from "../db/schema";
import { publicMember } from "./lib/format";
import { membersRouter } from "./routers/members";
import { forumRouter } from "./routers/forum";
import { hivesRouter } from "./routers/hives";
import { eventsRouter } from "./routers/events";
import { matchingRouter } from "./routers/matching";
import { coachRouter } from "./routers/coach";
import { speechRouter } from "./routers/speech";
import { dashboardRouter } from "./routers/dashboard";

export const appRouter = createRouter({
  ping: proc.query(() => ({ ok: true, ts: Date.now() })),
  members: membersRouter,
  forum: forumRouter,
  hives: hivesRouter,
  events: eventsRouter,
  matching: matchingRouter,
  coach: coachRouter,
  speech: speechRouter,
  dashboard: dashboardRouter,
  talks: createRouter({
    list: proc.query(async () => {
      const list = await getDb().query.talks.findMany({ with: { speaker: true }, orderBy: [desc(talks.publishedAt)] });
      return list.map((t) => ({ ...t, speaker: publicMember(t.speaker) }));
    }),
  }),
});

export type AppRouter = typeof appRouter;
