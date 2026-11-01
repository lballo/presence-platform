import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { emailSends, workflows, type Course, type Member } from "../../db/schema";
import { logActivity } from "./activity";
import { memberCourses } from "./courseState";
import { EMAIL_CATEGORIES, emailReady, fillTemplate, renderEmail, sendEmail, unsubscribePage, wantsEmail, type EmailCategory } from "./email";
import { env } from "./env";
import { accountBlock } from "./permissions";

const DAY = 86400000;

export const SKIP_LABEL: Record<string, string> = {
  sans_cle: "L’envoi d’e-mails n’est pas encore configuré",
  sans_adresse: "Pas d’adresse e-mail",
  compte_inactif: "Compte inactif",
  desinscrit: "S’est désinscrit·e de ces e-mails",
  deja_relance: "Déjà relancé·e dans les dernières 24 heures",
  a_jour: "À jour : rien à relancer",
  erreur: "L’envoi a échoué",
};

export type SendOutcome = { status: "envoye" | "ignore" | "echec"; reason: string };
type Kind = "manuel" | "auto" | "essai";

/** Un e-mail à un membre : ses préférences d'abord, puis l'envoi, et une trace dans tous les cas. */
export async function sendMemberEmail(member: Member, m: { category: EmailCategory; kind: Kind; template: string; subject: string; body: string; cta?: { label: string; href: string }; courseId?: number; sectionId?: number | null; lessonId?: number | null; sentBy?: number; activity?: string }): Promise<SendOutcome> {
  const db = getDb();
  const log = async (status: SendOutcome["status"], reason: string, providerId = "") => {
    await db.insert(emailSends).values({ memberId: member.id, category: m.category, kind: m.kind, template: m.template, courseId: m.courseId ?? null, sectionId: m.sectionId ?? null, lessonId: m.lessonId ?? null, subject: m.subject.slice(0, 300), status, reason, providerId, sentBy: m.sentBy ?? null });
    return { status, reason };
  };
  if (!emailReady()) return log("ignore", "sans_cle");
  if (!member.email) return log("ignore", "sans_adresse");
  if (member.deletedAt || accountBlock(member) || !member.passwordChosenAt) return log("ignore", "compte_inactif");
  if (m.kind !== "essai" && !(await wantsEmail(member.id, m.category))) return log("ignore", "desinscrit");
  const rendered = renderEmail({ body: m.body, cta: m.cta, reason: `Vous recevez ce message au titre de : ${EMAIL_CATEGORIES[m.category].label.toLowerCase()}.`, unsubscribeUrl: unsubscribePage(member.id, m.category) });
  try {
    const id = await sendEmail({ to: member.email, subject: m.subject, ...rendered, memberId: member.id, category: m.category });
    if (m.activity) await logActivity(member.id, "relance_email", { courseId: m.courseId, sectionId: m.sectionId, lessonId: m.lessonId, label: m.activity });
    return log("envoye", "", id);
  } catch (e) {
    console.error("Envoi d'e-mail :", e instanceof Error ? e.message : "erreur");
    return log("echec", "erreur");
  }
}

export type ReminderPlan = { template: "nouvelle_section" | "formation_pause"; sectionId: number | null; sectionTitle: string; lessonId: number | null; lessonTitle: string };

/** La page de la formation, ouverte sur cette section. */
export const sectionPath = (courseId: number, sectionId: number) => `/parcours/${courseId}#section-${sectionId}`;

/**
 * Quelle relance a du sens pour ce membre : la section qui vient de s'ouvrir s'il n'y est pas encore allé,
 * sinon une invitation à reprendre. Rien s'il a fini tout ce qui est ouvert.
 */
export async function reminderPlan(member: Pick<Member, "id" | "accessType">, courseId: number): Promise<ReminderPlan | null> {
  const [state] = await memberCourses(member, courseId);
  if (!state?.enrollment || state.enrollment.finishedAt) return null;
  const open = state.sections.filter((s) => s.open && !s.done);
  const fresh = [...open].reverse().find((s) => !s.opened);
  if (fresh && fresh.position > 1) return { template: "nouvelle_section", sectionId: fresh.id, sectionTitle: fresh.title, lessonId: null, lessonTitle: "" };
  const lesson = open[0]?.lessons.find((l) => !l.done);
  if (open[0] && lesson) return { template: "formation_pause", sectionId: open[0].id, sectionTitle: open[0].title, lessonId: lesson.id, lessonTitle: lesson.title };
  return null;
}

/** Une relance de formation, manuelle ou automatique, avec les textes du modèle. */
export async function sendCourseReminder(member: Member, course: Pick<Course, "id" | "title">, plan: ReminderPlan, o: { kind: "manuel" | "auto"; sentBy?: number }): Promise<SendOutcome> {
  const db = getDb();
  // Jamais deux relances en 24 heures pour une même formation
  const [recent] = await db.select({ id: emailSends.id }).from(emailSends).where(and(eq(emailSends.memberId, member.id), eq(emailSends.courseId, course.id), eq(emailSends.status, "envoye"), gt(emailSends.createdAt, new Date(Date.now() - DAY)))).orderBy(desc(emailSends.createdAt)).limit(1);
  if (recent) return { status: "ignore", reason: "deja_relance" };
  const [model] = await db.select().from(workflows).where(eq(workflows.key, plan.template)).limit(1);
  if (!model) return { status: "ignore", reason: "erreur" };
  const values = { prenom: member.firstName, section: plan.sectionTitle, lecon: plan.lessonTitle, formation: course.title };
  const path = plan.lessonId ? `/parcours/${course.id}/lecon/${plan.lessonId}` : plan.sectionId ? sectionPath(course.id, plan.sectionId) : `/parcours/${course.id}`;
  return sendMemberEmail(member, {
    category: "formations", kind: o.kind, template: plan.template, courseId: course.id, sectionId: plan.sectionId, lessonId: plan.lessonId, sentBy: o.sentBy,
    subject: fillTemplate(model.emailSubject, values), body: fillTemplate(model.emailBody, values),
    cta: { label: plan.template === "nouvelle_section" ? "Ouvrir ma section" : "Reprendre ma formation", href: `${env.appUrl}${path}` },
    activity: `${model.name} · ${course.title}`,
  });
}
