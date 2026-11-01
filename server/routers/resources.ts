import { z } from "zod";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, procFor } from "../middleware";
import { getDb } from "../queries/connection";
import { profileThemeShares, testLessonLinks, testResults, testThemeLinks, testThemes, tests } from "../../db/schema";
import { logActivity } from "../lib/activity";
import { testMemory } from "../lib/coach";
import { consentNeeded, memoryOrigin, memorySettings, remember } from "../lib/coachMemory";
import { memberBlocks } from "../lib/courseBlocks";
import { memberCourses } from "../lib/courseState";
import { open, seal } from "../lib/privateBox";
import { isStressTheme, latestResultByTheme, outcomeTitle, parseOutcome, publishedCatalog, testOpens } from "../lib/testCatalog";
import { hostedSrc } from "../lib/testHost";
import { resultSchema } from "./courses";

const resourceProc = procFor("course.use");

/** Un test visible : publié, relié à un thème publié, et qu'on peut ouvrir. */
async function visibleTest(id: number) {
  const db = getDb();
  const [test] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  if (!test || test.archivedAt || test.status !== "publie" || !testOpens(test)) throw new TRPCError({ code: "NOT_FOUND", message: "Ce test n’est pas disponible." });
  const themes = await db.select({ theme: testThemes }).from(testThemeLinks).innerJoin(testThemes, eq(testThemes.id, testThemeLinks.themeId)).where(eq(testThemeLinks.testId, id));
  const published = themes.map((t) => t.theme).filter((t) => t.status === "publie" && !t.archivedAt);
  if (!published.length) throw new TRPCError({ code: "NOT_FOUND", message: "Ce test n’est pas disponible." });
  return { test, themes: published.sort((a, b) => a.position - b.position) };
}

/** Un test qui ne se refait pas : un seul passage. */
async function assertCanPass(memberId: number, test: { id: number; canRetake: boolean }) {
  if (test.canRetake) return;
  const [before] = await getDb().select({ id: testResults.id }).from(testResults).where(and(eq(testResults.memberId, memberId), eq(testResults.testId, test.id))).limit(1);
  if (before) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce test ne se passe qu’une fois." });
}

export const resourcesRouter = createRouter({
  /** Mes ressources : une rubrique par thème publié. Un test à plusieurs thèmes apparaît dans chacune. */
  catalog: resourceProc.query(async ({ ctx }) => {
    const db = getDb();
    const [catalog, passages, settings] = await Promise.all([
      publishedCatalog(),
      db.select({ testId: testResults.testId, passedAt: testResults.passedAt }).from(testResults).where(and(eq(testResults.memberId, ctx.memberId), isNotNull(testResults.testId))).orderBy(desc(testResults.passedAt)),
      memorySettings(ctx.memberId),
    ]);
    const last = new Map<number, Date>();
    for (const p of passages) if (p.testId && !last.has(p.testId)) last.set(p.testId, p.passedAt);
    return {
      consentNeeded: consentNeeded(settings),
      themes: catalog.map(({ theme, tests: list }) => ({
        id: theme.id, name: theme.name, title: theme.title || theme.name, emoji: theme.emoji, intro: memberBlocks(theme.intro),
        tests: list.map((t) => ({ id: t.id, title: t.title, description: t.description, durationMin: t.durationMin, lastPassedAt: last.get(t.id) ?? null })),
      })),
    };
  }),

  /** Un test à passer : son cadre isolé, mes passages, et les leçons liées que je peux suivre. */
  test: resourceProc.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const { test, themes } = await visibleTest(input.id);
    const [history, links, courses] = await Promise.all([
      db.select().from(testResults).where(and(eq(testResults.memberId, ctx.memberId), eq(testResults.testId, test.id))).orderBy(desc(testResults.passedAt), desc(testResults.id)),
      db.select({ lessonId: testLessonLinks.lessonId }).from(testLessonLinks).where(eq(testLessonLinks.testId, test.id)),
      memberCourses(ctx.member),
    ]);
    const linked = new Set(links.map((l) => l.lessonId));
    return {
      id: test.id, title: test.title, description: test.description, durationMin: test.durationMin, canRetake: test.canRetake,
      themes: themes.map((t) => ({ id: t.id, name: t.name, title: t.title || t.name })),
      medicalNotice: themes.some(isStressTheme),
      // Le fichier déposé sur le réseau passe avant un lien externe : c'est lui qui est isolé par nos en-têtes
      frame: test.htmlPath ? { kind: "hosted" as const, src: hostedSrc(test.id, ctx.memberId) } : { kind: "link" as const, url: test.linkUrl },
      sendsResult: test.htmlPath ? test.htmlHasResultBlock : test.savesResult,
      history: history.map((h) => ({ id: h.id, passedAt: h.passedAt, sharedAt: h.sharedAt, result: h.resultEnc ? parseOutcome(open(ctx.memberId, h.resultEnc)) : null })),
      lessons: courses.flatMap((c) => c.lessons.filter((l) => linked.has(l.id)).map((l) => ({
        id: l.id, title: l.title, courseTitle: c.course.title, open: l.open && !!c.enrollment, opensAt: l.opensAt,
        href: l.open && c.enrollment ? `/parcours/${c.course.id}/lecon/${l.id}` : `/parcours/${c.course.id}`,
      }))),
    };
  }),

  /** Le résultat reçu du cadre du test. Il part chiffré, et rejoint la mémoire du coach si le membre l'a accepté. */
  saveResult: resourceProc.input(z.object({ testId: z.number().int(), result: resultSchema })).mutation(async ({ ctx, input }) => {
    const { test, themes } = await visibleTest(input.testId);
    await assertCanPass(ctx.memberId, test);
    const raw = JSON.stringify(input.result);
    const [row] = await getDb().insert(testResults).values({ memberId: ctx.memberId, testId: test.id, lessonTitle: test.title, resultEnc: seal(ctx.memberId, raw) }).returning({ id: testResults.id });
    await logActivity(ctx.memberId, "test_passe", { label: test.title });
    await remember(ctx.memberId, { origin: memoryOrigin.test(row.id), source: "test", sourceLabel: `Test · ${test.title}`.slice(0, 240), text: testMemory(raw, test.title, themes.map((t) => t.name)) });
    return { id: row.id };
  }),

  /** Un test sans bloc de résultat : il fonctionne quand même, seul le passage est noté, sans contenu. */
  markDone: resourceProc.input(z.object({ testId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const { test } = await visibleTest(input.testId);
    await assertCanPass(ctx.memberId, test);
    const [row] = await getDb().insert(testResults).values({ memberId: ctx.memberId, testId: test.id, lessonTitle: test.title, resultEnc: "" }).returning({ id: testResults.id });
    await logActivity(ctx.memberId, "test_passe", { label: test.title });
    return { id: row.id };
  }),

  /** Mon profil : le résultat le plus récent de chaque thème, et ce que je montre aux autres. */
  myProfile: resourceProc.query(async ({ ctx }) => {
    const db = getDb();
    const [catalog, latest, shares, passages] = await Promise.all([
      publishedCatalog(),
      latestResultByTheme(ctx.memberId),
      db.select({ themeId: profileThemeShares.themeId }).from(profileThemeShares).where(eq(profileThemeShares.memberId, ctx.memberId)),
      db.select({ testId: testResults.testId }).from(testResults).where(and(eq(testResults.memberId, ctx.memberId), isNotNull(testResults.testId))),
    ]);
    const shared = new Set(shares.map((s) => s.themeId));
    const passed = new Set(passages.map((p) => p.testId));
    const all = new Set(catalog.flatMap((c) => c.tests.map((t) => t.id)));
    return {
      untaken: [...all].filter((id) => !passed.has(id)).length,
      themes: catalog.map(({ theme, tests: list }) => {
        const r = latest.get(theme.id);
        return {
          id: theme.id, name: theme.name, title: theme.title || theme.name, emoji: theme.emoji, profileLabel: theme.profileLabel || theme.name, testCount: list.length,
          result: r ? { title: outcomeTitle(r.outcome), summary: r.outcome.summary ?? "", passedAt: r.passedAt, testTitle: r.testTitle } : null,
          public: shared.has(theme.id),
        };
      }),
    };
  }),

  /** Montrer un thème aux autres membres, ou le remettre en privé. */
  setThemePublic: resourceProc.input(z.object({ themeId: z.number().int(), public: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    if (!input.public) {
      await db.delete(profileThemeShares).where(and(eq(profileThemeShares.memberId, ctx.memberId), eq(profileThemeShares.themeId, input.themeId)));
      return { ok: true };
    }
    const [theme] = await db.select({ id: testThemes.id }).from(testThemes).where(and(eq(testThemes.id, input.themeId), eq(testThemes.status, "publie"), isNull(testThemes.archivedAt))).limit(1);
    if (!theme) throw new TRPCError({ code: "NOT_FOUND", message: "Ce thème n’existe plus." });
    await db.insert(profileThemeShares).values({ memberId: ctx.memberId, themeId: input.themeId }).onConflictDoNothing();
    return { ok: true };
  }),
});
