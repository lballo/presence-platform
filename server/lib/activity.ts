import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { courseEnrollments, memberActivity } from "../../db/schema";

/** Le journal d'activité : ce qui s'est passé, jamais ce que le membre a écrit. */
export const ACTIVITY_LABEL: Record<string, string> = {
  formation_commencee: "Formation commencée",
  lecon_ouverte: "Leçon ouverte",
  lecon_terminee: "Leçon terminée",
  section_terminee: "Section terminée",
  test_passe: "Test passé",
  defi_releve: "Défi relevé",
  formation_terminee: "Formation terminée",
  formation_en_pause: "Formation en pause depuis 14 jours",
  section_disponible: "Nouvelle section disponible",
  // Ancien modèle : ces lignes restent lisibles dans le journal d'activité
  module_ouvert: "Module ouvert",
  module_termine: "Module terminé",
  memoire_maj: "Mémoire du coach mise à jour",
  module_disponible: "Nouveau module disponible",
  acces_complet_donne: "Accès complet donné",
  acces_complet_retire: "Accès complet retiré",
  relance_email: "Relance envoyée par e-mail",
};

export async function logActivity(memberId: number, type: keyof typeof ACTIVITY_LABEL, info: { courseId?: number | null; sectionId?: number | null; lessonId?: number | null; label?: string } = {}) {
  await getDb().insert(memberActivity).values({ memberId, type, courseId: info.courseId ?? null, sectionId: info.sectionId ?? null, lessonId: info.lessonId ?? null, label: info.label ?? "" });
}

/** Le membre avance : la relance « formation en pause » repart de zéro. */
export async function touchEnrollment(memberId: number, courseId: number) {
  await getDb().update(courseEnrollments).set({ lastActivityAt: new Date() }).where(and(eq(courseEnrollments.memberId, memberId), eq(courseEnrollments.courseId, courseId)));
}
