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
import { notificationsRouter } from "./routers/notifications";
import { onboardingRouter } from "./routers/onboarding";
import { honeyRouter } from "./routers/honey";
import { adminRouter } from "./routers/admin";
import { reportsRouter } from "./routers/reports";
import { coursesRouter } from "./routers/courses";
import { resourcesRouter } from "./routers/resources";
import { coachingRouter } from "./routers/coaching";
import { coachMemoryRouter } from "./routers/coachMemory";
import { buildRouter } from "./routers/build";
import { emailPrefsRouter } from "./routers/emailPrefs";

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
  notifications: notificationsRouter,
  onboarding: onboardingRouter,
  honey: honeyRouter,
  admin: adminRouter,
  reports: reportsRouter,
  courses: coursesRouter,
  resources: resourcesRouter,
  coaching: coachingRouter,
  coachMemory: coachMemoryRouter,
  build: buildRouter,
  emailPrefs: emailPrefsRouter,
});

export type AppRouter = typeof appRouter;
