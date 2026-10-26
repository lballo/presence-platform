import { createRouter, proc } from "./middleware";
import { membersRouter } from "./routers/members";
import { forumRouter } from "./routers/forum";
import { hivesRouter } from "./routers/hives";
import { eventsRouter } from "./routers/events";
import { matchingRouter } from "./routers/matching";
import { coachRouter } from "./routers/coach";
import { speechRouter } from "./routers/speech";
import { dashboardRouter } from "./routers/dashboard";
import { talksRouter } from "./routers/talks";

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
  talks: talksRouter,
});

export type AppRouter = typeof appRouter;
