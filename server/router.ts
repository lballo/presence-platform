import { createRouter, publicProc } from "./middleware";
import { authRouter } from "./routers/auth";
import { membersRouter } from "./routers/members";
import { forumRouter } from "./routers/forum";
import { hashtagsRouter } from "./routers/hashtags";
import { hivesRouter } from "./routers/hives";
import { eventsRouter } from "./routers/events";
import { matchingRouter } from "./routers/matching";
import { coachRouter } from "./routers/coach";
import { speechRouter } from "./routers/speech";
import { dashboardRouter } from "./routers/dashboard";
import { talksRouter } from "./routers/talks";
import { messagesRouter } from "./routers/messages";
import { uploadsRouter } from "./routers/uploads";

export const appRouter = createRouter({
  ping: publicProc.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  members: membersRouter,
  forum: forumRouter,
  hashtags: hashtagsRouter,
  hives: hivesRouter,
  events: eventsRouter,
  matching: matchingRouter,
  coach: coachRouter,
  speech: speechRouter,
  dashboard: dashboardRouter,
  talks: talksRouter,
  messages: messagesRouter,
  uploads: uploadsRouter,
});

export type AppRouter = typeof appRouter;
