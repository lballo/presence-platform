import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { coachingEngagements, coachingMeetings, members, workflows } from "../../db/schema";
import { env } from "./env";
import { fillTemplate as fill } from "./email";
import { notify } from "./notify";
import { sendMemberEmail } from "./reminders";
import { counted } from "./coachingSync";

export const MIDPOINT = "coaching_mi_parcours";

/**
 * À mi-parcours : la moitié des séances prévues est faite et la séance de mi-parcours n'est pas encore planifiée.
 * Le client est invité à la réserver, dans la cloche et par e-mail (Resend). Une seule fois par accompagnement.
 * Laura coupe l'e-mail depuis le suivi coaching ; le modèle « coaching_mi_parcours » garde le texte.
 */
export async function runCoachingMidpoint(now = new Date()) {
  const db = getDb();
  const [model] = await db.select().from(workflows).where(eq(workflows.key, MIDPOINT));
  if (!model?.active) return 0;
  const open = await db.select().from(coachingEngagements).where(and(eq(coachingEngagements.status, "En cours"), isNull(coachingEngagements.archivedAt), isNull(coachingEngagements.midpointEmailAt)));
  let sent = 0;
  for (const e of open) {
    if (!e.memberId || !e.sessionsPlanned || e.sessionsPlanned < 2) continue;
    const meetings = await db.select().from(coachingMeetings).where(and(eq(coachingMeetings.engagementId, e.id), isNull(coachingMeetings.archivedAt)));
    if (meetings.filter(counted).length * 2 < e.sessionsPlanned) continue;
    if (meetings.some((m) => m.kind === "Mi-parcours" && ["Planifié", "Terminé"].includes(m.state))) continue;
    const [member] = await db.select().from(members).where(eq(members.id, e.memberId));
    if (!member || member.deletedAt) continue;
    // Marqué d'abord : une panne d'envoi ne déclenche pas de rafale au passage suivant
    const [claimed] = await db.update(coachingEngagements).set({ midpointEmailAt: now }).where(and(eq(coachingEngagements.id, e.id), isNull(coachingEngagements.midpointEmailAt))).returning({ id: coachingEngagements.id });
    if (!claimed) continue;
    const values = { prenom: member.firstName, programme: e.title };
    await notify([member.id], { title: fill(model.title, values), body: fill(model.body, values), href: "/profil/coaching" });
    if (model.emailEnabled) {
      await sendMemberEmail(member, {
        category: "coaching", kind: "auto", template: MIDPOINT, subject: fill(model.emailSubject, values), body: fill(model.emailBody, values),
        cta: env.calendlyUrl ? { label: "Réserver ma séance", href: env.calendlyUrl } : { label: "Voir mon coaching", href: `${env.appUrl}/profil/coaching` },
      });
    }
    sent++;
  }
  return sent;
}
