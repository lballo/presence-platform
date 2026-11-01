import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { coachMemory, coachSettings, courseModules, courses, journalEntries, moduleProgress, testResults, type Member } from "../../db/schema";
import { logActivity } from "./activity";
import { summarizeForMemory, type MemoryInput } from "./coach";
import { memberCourses } from "./courseState";
import { open, privateBoxReady, seal } from "./privateBox";

/** La mention à laquelle le membre répond : sa version est gardée avec son accord. */
export const COACH_CONSENT = {
  version: "2026-11",
  title: "Le coach peut se souvenir de votre chemin",
  paragraphs: [
    "Après chaque module terminé, le coach retient l’essentiel de vos réponses aux exercices, de vos résultats de tests et de vos défis. Il peut ainsi relier les modules entre eux, remarquer votre évolution et adapter ses questions. Il ne donne ni note ni correction.",
    "Pour cela, vos réponses sont transmises à Gemini, le service d’intelligence artificielle de Google.",
    "Vous pouvez tout lire, corriger, effacer ou mettre en pause à tout moment sur la page « Ce que le coach retient de moi ». Laura n’y a pas accès, sauf si vous partagez un élément.",
    "Si vous refusez, votre formation reste entièrement accessible : le coach ne gardera simplement rien en mémoire.",
  ],
};

const DEFAULT_BRIEF = "Retiens seulement ce que la personne a écrit, sans interprétation.";

export async function memorySettings(memberId: number) {
  const [row] = await getDb().select().from(coachSettings).where(eq(coachSettings.memberId, memberId)).limit(1);
  return row ?? null;
}

type Settings = Awaited<ReturnType<typeof memorySettings>>;

/** Accord donné pour cette version de la mention, et pas en pause. */
export const memoryActive = (s: Settings) => !!s?.consentAt && s.consentVersion === COACH_CONSENT.version && !s.pausedAt;
/** Le membre n'a pas encore répondu à cette version de la mention. */
export const consentNeeded = (s: Settings) => !s || (!s.refusedAt && s.consentVersion !== COACH_CONSENT.version);

/** Ce que le membre a produit dans un module, déchiffré. */
async function moduleMaterial(memberId: number, moduleId: number): Promise<Omit<MemoryInput, "brief" | "moduleTitle" | "courseTitle">> {
  const db = getDb();
  const [answers, tests, [progress]] = await Promise.all([
    db.select().from(journalEntries).where(and(eq(journalEntries.memberId, memberId), eq(journalEntries.moduleId, moduleId))).orderBy(asc(journalEntries.id)),
    db.select().from(testResults).where(and(eq(testResults.memberId, memberId), eq(testResults.moduleId, moduleId))).orderBy(desc(testResults.passedAt)).limit(1),
    db.select().from(moduleProgress).where(and(eq(moduleProgress.memberId, memberId), eq(moduleProgress.moduleId, moduleId))).limit(1),
  ]);
  const test = tests[0] ? open(memberId, tests[0].resultEnc) : null;
  return {
    answers: answers.flatMap((a) => { const text = open(memberId, a.answerEnc); return text ? [{ question: a.questionText || "Réflexion libre", answer: text }] : []; }),
    test,
    challenge: progress?.challengeDoneAt ? { note: progress.challengeNoteEnc ? (open(memberId, progress.challengeNoteEnc) ?? "") : "" } : null,
  };
}

/**
 * Après un module terminé : retenir l'essentiel, en suivant la consigne du module.
 * Une seule fois par module : un élément effacé par le membre ne revient pas tout seul.
 */
export async function rememberModule(memberId: number, moduleId: number) {
  const db = getDb();
  const setStatus = (memoryStatus: string) => db.update(moduleProgress).set({ memoryStatus }).where(and(eq(moduleProgress.memberId, memberId), eq(moduleProgress.moduleId, moduleId)));
  try {
    const settings = await memorySettings(memberId);
    if (!memoryActive(settings) || !privateBoxReady()) { await setStatus(""); return; }
    const [mod] = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
    if (!mod) { await setStatus(""); return; }
    const [course] = await db.select().from(courses).where(eq(courses.id, mod.courseId)).limit(1);
    const material = await moduleMaterial(memberId, moduleId);
    if (!material.answers.length && !material.test && !material.challenge) { await setStatus("fait"); return; }
    const items = await summarizeForMemory({ ...material, brief: mod.coachBrief.trim() || DEFAULT_BRIEF, moduleTitle: mod.title, courseTitle: course?.title ?? "" });
    if (items.length) {
      const sourceLabel = `Module ${mod.position} · ${mod.title}`.slice(0, 240);
      await db.insert(coachMemory).values(items.map((i) => ({ memberId, source: i.source, sourceLabel, courseId: mod.courseId, moduleId: mod.id, contentEnc: seal(memberId, i.text) })));
      await logActivity(memberId, "memoire_maj", { courseId: mod.courseId, moduleId: mod.id, label: sourceLabel });
    }
    await setStatus("fait");
  } catch (e) {
    console.error("Mémoire du coach :", e instanceof Error ? e.message : "erreur");
    await setStatus("echec").catch(() => undefined);
  }
}

/** Reprend ce qui attend, ou ce qui a échoué (service d'IA indisponible). */
export async function processPendingMemories() {
  const rows = await getDb().select({ memberId: moduleProgress.memberId, moduleId: moduleProgress.moduleId }).from(moduleProgress).where(inArray(moduleProgress.memoryStatus, ["en_attente", "echec"])).limit(20);
  for (const r of rows) await rememberModule(r.memberId, r.moduleId);
  return rows.length;
}

const MAX_ITEMS = 60;

/** Ce que le coach sait du parcours : seulement si le membre l'a accepté et n'a pas mis la mémoire en pause. */
export async function coachContext(member: Pick<Member, "id" | "accessType">): Promise<{ active: boolean; text: string }> {
  const db = getDb();
  const settings = await memorySettings(member.id);
  if (!memoryActive(settings)) return { active: false, text: "" };
  const items = await db.select().from(coachMemory).where(eq(coachMemory.memberId, member.id)).orderBy(desc(coachMemory.createdAt), desc(coachMemory.id)).limit(MAX_ITEMS);
  const lines = items.reverse().flatMap((i) => {
    const text = open(member.id, i.contentEnc);
    return text ? [`- ${i.createdAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}, ${i.sourceLabel} : ${text}`] : [];
  });
  const paths = (await memberCourses(member)).filter((c) => c.enrollment).map((c) => {
    const done = c.modules.filter((m) => m.done).map((m) => `${m.position}. ${m.title}`);
    const current = c.next?.open ? c.next.title : "";
    return `- « ${c.course.title} », commencée le ${c.enrollment!.startedAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}. Modules terminés : ${done.join(" ; ") || "aucun pour l’instant"}.${current ? ` Module en cours : ${current}.` : ""}`;
  });
  if (!lines.length && !paths.length) return { active: true, text: "" };
  return { active: true, text: [paths.length ? `Son parcours :\n${paths.join("\n")}` : "", lines.length ? `Ce que tu as retenu, du plus ancien au plus récent :\n${lines.join("\n")}` : ""].filter(Boolean).join("\n\n") };
}
