import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { profileThemeShares, testResults, testThemeLinks, testThemes, tests, type Test, type TestTheme } from "../../db/schema";
import { testUrlProblem } from "./courseAccess";
import { env } from "./env";
import { open } from "./privateBox";

export type TestOutcome = { label?: string; summary?: string; score?: number | string | null; details?: Record<string, string | number | boolean> };

/** Un résultat illisible ou un passage sans résultat : null. */
export function parseOutcome(raw: string | null): TestOutcome | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as TestOutcome; } catch { return { summary: raw }; }
}

/** Ce que les autres membres peuvent voir d'un résultat : son titre, jamais le texte qui l'explique. */
export const outcomeTitle = (r: TestOutcome | null) => (r?.label?.trim() || (r?.score !== null && r?.score !== undefined && r.score !== "" ? String(r.score) : ""));

/** Un test publié s'ouvre s'il a un fichier sur le réseau, ou un lien utilisable. */
export const testOpens = (t: Pick<Test, "htmlPath" | "linkUrl">) => !!t.htmlPath || (!!t.linkUrl && !testUrlProblem(t.linkUrl, env.appUrl));

/** Ce que Construire signale pour un test, calculé à la lecture : le fichier peut changer sans passer par Notion. */
export function testIssues(t: Pick<Test, "htmlPath" | "linkUrl" | "savesResult" | "htmlHasResultBlock" | "issues">, themeCount: number): string[] {
  const out = [...t.issues];
  if (!t.htmlPath && !t.linkUrl) out.push("Aucun fichier HTML ni lien : les membres ne peuvent pas l’ouvrir.");
  if (!t.htmlPath && t.linkUrl) { const problem = testUrlProblem(t.linkUrl, env.appUrl); if (problem) out.push(`Lien : ${problem}`); }
  if (!themeCount) out.push("Aucun thème : ce test n’apparaît dans aucune rubrique.");
  if (t.htmlPath && t.savesResult && !t.htmlHasResultBlock) out.push("« Résultat enregistré » est coché dans Notion, mais le fichier n’envoie aucun résultat.");
  if (t.htmlPath && !t.savesResult && t.htmlHasResultBlock) out.push("Le fichier envoie son résultat : cochez « Résultat enregistré » dans Notion.");
  return out;
}

/** Les thèmes publiés, dans l'ordre de Notion, avec leurs tests publiés qui peuvent s'ouvrir. */
export async function publishedCatalog(): Promise<{ theme: TestTheme; tests: Test[] }[]> {
  const db = getDb();
  const [themes, links] = await Promise.all([
    db.select().from(testThemes).where(and(eq(testThemes.status, "publie"), isNull(testThemes.archivedAt))).orderBy(asc(testThemes.position), asc(testThemes.id)),
    db.select({ test: tests, themeId: testThemeLinks.themeId }).from(testThemeLinks).innerJoin(tests, eq(tests.id, testThemeLinks.testId)).where(and(eq(tests.status, "publie"), isNull(tests.archivedAt))).orderBy(asc(tests.title)),
  ]);
  return themes.map((theme) => ({ theme, tests: links.filter((l) => l.themeId === theme.id && testOpens(l.test)).map((l) => l.test) }));
}

export const isStressTheme = (t: Pick<TestTheme, "name">) => /stress/i.test(t.name);

type LatestResult = { outcome: TestOutcome; passedAt: Date; testTitle: string };

/** Pour un membre : le résultat le plus récent de chaque thème. Un test à deux thèmes compte pour les deux. */
export async function latestResultByTheme(memberId: number): Promise<Map<number, LatestResult>> {
  const rows = await getDb()
    .select({ themeId: testThemeLinks.themeId, enc: testResults.resultEnc, passedAt: testResults.passedAt, testTitle: tests.title })
    .from(testResults)
    .innerJoin(tests, eq(tests.id, testResults.testId))
    .innerJoin(testThemeLinks, eq(testThemeLinks.testId, testResults.testId))
    .where(and(eq(testResults.memberId, memberId), isNotNull(testResults.testId)))
    .orderBy(desc(testResults.passedAt), desc(testResults.id));
  const out = new Map<number, LatestResult>();
  for (const r of rows) {
    if (out.has(r.themeId) || !r.enc) continue;
    const outcome = parseOutcome(open(memberId, r.enc));
    if (outcome) out.set(r.themeId, { outcome, passedAt: r.passedAt, testTitle: r.testTitle });
  }
  return out;
}

export type PublicResult = { themeId: number; themeName: string; profileLabel: string; title: string };

/** Ce qu'un membre a choisi de montrer. Rien d'autre ne sort pour les autres membres. */
export async function publicResults(memberIds: number[]): Promise<Map<number, PublicResult[]>> {
  const out = new Map<number, PublicResult[]>();
  if (!memberIds.length) return out;
  const shares = await getDb()
    .select({ memberId: profileThemeShares.memberId, themeId: testThemes.id, themeName: testThemes.name, profileLabel: testThemes.profileLabel })
    .from(profileThemeShares)
    .innerJoin(testThemes, eq(testThemes.id, profileThemeShares.themeId))
    .where(and(inArray(profileThemeShares.memberId, memberIds), eq(testThemes.status, "publie"), isNull(testThemes.archivedAt)))
    .orderBy(asc(testThemes.position));
  for (const memberId of new Set(shares.map((s) => s.memberId))) {
    const latest = await latestResultByTheme(memberId);
    for (const s of shares.filter((x) => x.memberId === memberId)) {
      const title = outcomeTitle(latest.get(s.themeId)?.outcome ?? null);
      if (title) out.set(memberId, [...(out.get(memberId) ?? []), { themeId: s.themeId, themeName: s.themeName, profileLabel: s.profileLabel || s.themeName, title }]);
    }
  }
  return out;
}
