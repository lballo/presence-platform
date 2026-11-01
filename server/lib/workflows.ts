import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { courseEnrollments, courseModules, courses, members, moduleProgress, workflowRuns, workflows } from "../../db/schema";
import { logActivity } from "./activity";
import { moduleOpensAt } from "./courseAccess";
import { fillTemplate as fill } from "./email";
import { notify } from "./notify";
import { reminderPlan, sendCourseReminder } from "./reminders";

const DAY = 86400000;

/** Une relance ne part qu'une fois pour un même objet. Renvoie true si elle vient d'être enregistrée. */
async function once(workflowKey: string, memberId: number, ref: string): Promise<boolean> {
  const [row] = await getDb().insert(workflowRuns).values({ workflowKey, memberId, ref: ref.slice(0, 80) }).onConflictDoNothing().returning({ id: workflowRuns.id });
  return !!row;
}

/**
 * Les modèles de relance : une notification dans la cloche, et un e-mail si l'administration a activé l'envoi automatique.
 * Activer l'e-mail ne rattrape pas les relances déjà parties : pas d'envoi en rafale.
 * Appelé régulièrement (server/lib/scheduler.ts) et depuis l'onglet Construire.
 */
export async function runWorkflows(now = new Date()) {
  const db = getDb();
  const models = await db.select().from(workflows).where(eq(workflows.active, true));
  const counts: Record<string, number> = {};
  const enrollments = await db
    .select({ enrollment: courseEnrollments, course: courses, member: members })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .innerJoin(members, eq(members.id, courseEnrollments.memberId))
    .where(and(isNull(courseEnrollments.finishedAt), eq(courses.status, "publie"), isNull(courses.archivedAt), eq(members.status, "actif"), isNull(members.deletedAt)));

  const fresh = models.find((m) => m.key === "nouveau_module");
  if (fresh) {
    counts[fresh.key] = 0;
    for (const { enrollment: e, course, member } of enrollments) {
      if (course.rhythm === "complet" || e.fullAccessAt) continue; // tout est déjà ouvert
      const mods = await db.select().from(courseModules).where(and(eq(courseModules.courseId, course.id), eq(courseModules.status, "publie"), isNull(courseModules.archivedAt)));
      for (const m of mods) {
        if (m.position <= 1) continue; // le premier s'ouvre au démarrage : le membre est déjà là
        const opensAt = moduleOpensAt(e.startedAt, m.position);
        // Seulement le module qui vient de s'ouvrir : pas de rattrapage en rafale après une longue absence
        if (opensAt > now || now.getTime() - opensAt.getTime() > 8 * DAY) continue;
        const [seen] = await db.select({ openedAt: moduleProgress.openedAt }).from(moduleProgress).where(and(eq(moduleProgress.memberId, e.memberId), eq(moduleProgress.moduleId, m.id))).limit(1);
        if (seen?.openedAt) continue;
        if (!(await once(fresh.key, e.memberId, `module:${m.id}`))) continue;
        const values = { module: m.title, formation: course.title };
        await notify([e.memberId], { title: fill(fresh.title, values), body: fill(fresh.body, values), href: `/parcours/${course.id}/module/${m.id}` });
        await logActivity(e.memberId, "module_disponible", { courseId: course.id, moduleId: m.id, label: m.title });
        counts[fresh.key]++;
        if (fresh.emailEnabled) await sendCourseReminder(member, course, { template: "nouveau_module", moduleId: m.id, moduleTitle: m.title }, { kind: "auto" });
      }
    }
  }

  const pause = models.find((m) => m.key === "formation_pause");
  if (pause) {
    counts[pause.key] = 0;
    const limit = new Date(now.getTime() - pause.delayDays * DAY);
    for (const { enrollment: e, course, member } of enrollments) {
      if (e.lastActivityAt > limit) continue;
      // Une relance par période d'inactivité : reprendre puis s'arrêter à nouveau en redéclenche une
      if (!(await once(pause.key, e.memberId, `pause:${course.id}:${e.lastActivityAt.toISOString().slice(0, 10)}`))) continue;
      const values = { formation: course.title };
      await notify([e.memberId], { title: fill(pause.title, values), body: fill(pause.body, values), href: `/parcours/${course.id}` });
      await logActivity(e.memberId, "formation_en_pause", { courseId: course.id, label: course.title });
      counts[pause.key]++;
      if (pause.emailEnabled) {
        const plan = await reminderPlan(member, course.id);
        if (plan) await sendCourseReminder(member, course, { ...plan, template: "formation_pause" }, { kind: "auto" });
      }
    }
  }
  return counts;
}

export async function workflowOverview() {
  const db = getDb();
  const [rows, runs] = await Promise.all([
    db.select().from(workflows),
    db.select({ key: workflowRuns.workflowKey, n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${workflowRuns.createdAt})` }).from(workflowRuns).groupBy(workflowRuns.workflowKey),
  ]);
  return rows.map((w) => { const r = runs.find((x) => x.key === w.key); return { ...w, sent: r?.n ?? 0, lastSent: r?.last ? new Date(r.last) : null }; });
}
