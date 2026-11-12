import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { coachMemory, coachSettings, courseLessons, courseSections, journalEntries, lessonProgress, sectionProgress, testResults, testThemeLinks, testThemes, type Member } from "../../db/schema";
import { answerMemory, challengeMemory, testMemory, type MemorySource } from "./coach";
import { memberCourses } from "./courseState";
import { open, privateBoxReady, seal } from "./privateBox";

/** La mention à laquelle le membre répond : sa version est gardée avec son accord. Une nouvelle version redemande l'accord. */
export const COACH_CONSENT = {
  version: "2026-11-tests",
  title: "Le coach peut se souvenir de votre chemin",
  paragraphs: [
    "Si vous acceptez, vos formations et vos tests nourrissent la mémoire du coach, au fil de l’eau : vos réponses aux exercices et vos réflexions, vos résultats de tests, ceux des leçons comme ceux de Mes ressources, vos défis réalisés. Il peut ainsi relier vos leçons et vos résultats entre eux, vous proposer une synthèse, remarquer votre évolution et adapter ses questions. Il ne donne ni note ni correction, et ne pose aucun diagnostic.",
    "Ces éléments restent chiffrés chez Présence. Ils sont transmis à Gemini, le service d’intelligence artificielle de Google, seulement quand vous parlez au coach.",
    "Vous pouvez tout lire, corriger, effacer ou mettre en pause à tout moment dans Paramètres, rubrique Confidentialité. Laura n’y a pas accès, sauf si vous partagez un élément.",
    "Si vous refusez, votre formation reste entièrement accessible : le coach ne gardera simplement rien en mémoire.",
  ],
};

export async function memorySettings(memberId: number) {
  const [row] = await getDb().select().from(coachSettings).where(eq(coachSettings.memberId, memberId)).limit(1);
  return row ?? null;
}

type Settings = Awaited<ReturnType<typeof memorySettings>>;

/** Accord donné pour cette version de la mention, et pas en pause. */
export const memoryActive = (s: Settings) => !!s?.consentAt && s.consentVersion === COACH_CONSENT.version && !s.pausedAt;
/** Le membre n'a pas encore répondu à cette version de la mention. */
export const consentNeeded = (s: Settings) => !s || (!s.refusedAt && s.consentVersion !== COACH_CONSENT.version);

export const memoryOrigin = {
  answer: (entryId: number) => `journal:${entryId}`,
  test: (resultId: number) => `test:${resultId}`,
  lessonChallenge: (lessonId: number) => `defi:lecon:${lessonId}`,
  sectionChallenge: (sectionId: number) => `defi:section:${sectionId}`,
};

export const memoryLabel = (sectionTitle: string | null | undefined, lessonTitle: string | null | undefined) => [sectionTitle, lessonTitle].filter(Boolean).join(" · ").slice(0, 240);

type Item = { origin: string; source: MemorySource; sourceLabel: string; courseId?: number | null; sectionId?: number | null; lessonId?: number | null; text: string };

const toRow = (memberId: number, i: Item) => ({ memberId, origin: i.origin, source: i.source, sourceLabel: i.sourceLabel, courseId: i.courseId ?? null, sectionId: i.sectionId ?? null, lessonId: i.lessonId ?? null, contentEnc: seal(memberId, i.text) });

/**
 * Une entrée du membre entre dans la mémoire dès qu'elle est enregistrée, si l'accord est donné et que la mémoire n'est pas en pause.
 * Modifier l'entrée met à jour le souvenir, sauf si le membre l'a corrigé ou effacé : son geste reste.
 */
export async function remember(memberId: number, item: Item) {
  if (!privateBoxReady() || !memoryActive(await memorySettings(memberId))) return;
  const row = toRow(memberId, item);
  await getDb().insert(coachMemory).values(row).onConflictDoUpdate({
    target: [coachMemory.memberId, coachMemory.origin],
    set: { contentEnc: row.contentEnc, sourceLabel: row.sourceLabel, courseId: row.courseId, sectionId: row.sectionId, lessonId: row.lessonId },
    setWhere: sql`${coachMemory.correctedAt} is null and ${coachMemory.erasedAt} is null`,
  });
}

/** L'entrée a été vidée ou le défi annulé : le souvenir part, sauf ce que le membre a corrigé lui-même. */
export async function forget(memberId: number, origin: string) {
  await getDb().delete(coachMemory).where(and(eq(coachMemory.memberId, memberId), eq(coachMemory.origin, origin), isNull(coachMemory.correctedAt), isNull(coachMemory.erasedAt)));
}

/** À l'accord : ce que le membre a déjà écrit entre aussi. Ce qu'il a corrigé ou effacé ne bouge pas. */
export async function rememberEverything(memberId: number) {
  if (!privateBoxReady() || !memoryActive(await memorySettings(memberId))) return 0;
  const db = getDb();
  const lessonSection = { lessonId: courseLessons.id, sectionId: courseSections.id, sectionTitle: courseSections.title, courseId: courseSections.courseId };
  const [entries, tests, lessonChallenges, sectionChallenges] = await Promise.all([
    db.select({ e: journalEntries, ...lessonSection }).from(journalEntries).leftJoin(courseLessons, eq(courseLessons.id, journalEntries.lessonId)).leftJoin(courseSections, eq(courseSections.id, courseLessons.sectionId)).where(eq(journalEntries.memberId, memberId)),
    db.select({ t: testResults, ...lessonSection }).from(testResults).leftJoin(courseLessons, eq(courseLessons.id, testResults.lessonId)).leftJoin(courseSections, eq(courseSections.id, courseLessons.sectionId)).where(eq(testResults.memberId, memberId)),
    db.select({ p: lessonProgress, title: courseLessons.title, sectionId: courseSections.id, sectionTitle: courseSections.title, courseId: courseSections.courseId }).from(lessonProgress).innerJoin(courseLessons, eq(courseLessons.id, lessonProgress.lessonId)).innerJoin(courseSections, eq(courseSections.id, courseLessons.sectionId)).where(and(eq(lessonProgress.memberId, memberId), isNotNull(lessonProgress.challengeDoneAt))),
    db.select({ p: sectionProgress, title: courseSections.title, courseId: courseSections.courseId }).from(sectionProgress).innerJoin(courseSections, eq(courseSections.id, sectionProgress.sectionId)).where(and(eq(sectionProgress.memberId, memberId), isNotNull(sectionProgress.challengeDoneAt))),
  ]);
  const themeRows = tests.some(({ t }) => t.testId) ? await db.select({ testId: testThemeLinks.testId, name: testThemes.name }).from(testThemeLinks).innerJoin(testThemes, eq(testThemes.id, testThemeLinks.themeId)) : [];
  const note = (enc: string) => (enc ? (open(memberId, enc) ?? "") : "");
  const items: Item[] = [
    ...entries.flatMap(({ e, lessonId, sectionId, sectionTitle, courseId }): Item[] => {
      const text = open(memberId, e.answerEnc);
      return text ? [{ origin: memoryOrigin.answer(e.id), source: e.questionText ? "exercice" : "reflexion", sourceLabel: memoryLabel(sectionTitle, e.lessonTitle), courseId, sectionId, lessonId, text: answerMemory(e.questionText, text) }] : [];
    }),
    ...tests.flatMap(({ t, lessonId, sectionId, sectionTitle, courseId }): Item[] => {
      const raw = t.resultEnc ? open(memberId, t.resultEnc) : null;
      if (!raw) return [];
      if (t.testId) return [{ origin: memoryOrigin.test(t.id), source: "test", sourceLabel: `Test · ${t.lessonTitle}`.slice(0, 240), text: testMemory(raw, t.lessonTitle, themeRows.filter((x) => x.testId === t.testId).map((x) => x.name)) }];
      return [{ origin: memoryOrigin.test(t.id), source: "test", sourceLabel: memoryLabel(sectionTitle, t.lessonTitle), courseId, sectionId, lessonId, text: testMemory(raw) }];
    }),
    ...lessonChallenges.map(({ p, title, sectionId, sectionTitle, courseId }): Item => ({ origin: memoryOrigin.lessonChallenge(p.lessonId), source: "defi", sourceLabel: memoryLabel(sectionTitle, title), courseId, sectionId, lessonId: p.lessonId, text: challengeMemory(title, note(p.challengeNoteEnc)) })),
    ...sectionChallenges.map(({ p, title, courseId }): Item => ({ origin: memoryOrigin.sectionChallenge(p.sectionId), source: "defi", sourceLabel: memoryLabel(title, ""), courseId, sectionId: p.sectionId, text: challengeMemory(title, note(p.challengeNoteEnc)) })),
  ];
  if (!items.length) return 0;
  const made = await db.insert(coachMemory).values(items.map((i) => toRow(memberId, i))).onConflictDoNothing().returning({ id: coachMemory.id });
  return made.length;
}

const MAX_ITEMS = 60;
const MAX_ITEM_CHARS = 1500; // une très longue réponse ne doit pas occuper toute la place de la conversation

/** Ce que le coach sait du parcours : seulement si le membre l'a accepté et n'a pas mis la mémoire en pause. */
export async function coachContext(member: Pick<Member, "id" | "accessType">): Promise<{ active: boolean; text: string }> {
  const db = getDb();
  const settings = await memorySettings(member.id);
  if (!memoryActive(settings)) return { active: false, text: "" };
  const items = await db.select().from(coachMemory).where(and(eq(coachMemory.memberId, member.id), isNull(coachMemory.erasedAt))).orderBy(desc(coachMemory.createdAt), desc(coachMemory.id)).limit(MAX_ITEMS);
  const lines = items.reverse().flatMap((i) => {
    const text = open(member.id, i.contentEnc);
    return text ? [`- ${i.createdAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}, ${i.sourceLabel} : ${text.length > MAX_ITEM_CHARS ? `${text.slice(0, MAX_ITEM_CHARS)}…` : text}`] : [];
  });
  const paths = (await memberCourses(member)).filter((c) => c.enrollment).map((c) => {
    const done = c.lessons.filter((l) => l.done).map((l) => l.title);
    const current = c.next?.open ? ` Leçon en cours : ${c.next.title} (section « ${c.next.sectionTitle} »).` : "";
    return `- « ${c.course.title} », commencée le ${c.enrollment!.startedAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}. Leçons terminées : ${done.join(" ; ") || "aucune pour l’instant"}.${current}`;
  });
  if (!lines.length && !paths.length) return { active: true, text: "" };
  return { active: true, text: [paths.length ? `Son parcours :\n${paths.join("\n")}` : "", lines.length ? `Ce que tu as retenu, du plus ancien au plus récent :\n${lines.join("\n")}` : ""].filter(Boolean).join("\n\n") };
}
