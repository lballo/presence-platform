import { getDb } from "../queries/connection";
import { adminLog, type Member } from "../../db/schema";

type Entry = { action: string; targetType: string; targetId?: number | null; label?: string; detail?: string };

/** Le journal d'administration : qui, quoi, quand, sur quoi. Le nom est figé : il survit à une suppression. */
export async function logAdmin(actor: Pick<Member, "id" | "firstName" | "lastName">, e: Entry) {
  await getDb().insert(adminLog).values({
    actorId: actor.id, actorName: `${actor.firstName} ${actor.lastName}`.trim(),
    action: e.action, targetType: e.targetType, targetId: e.targetId ?? null, targetLabel: e.label ?? "", detail: e.detail ?? "",
  });
}

/** Une administratrice agit sur le contenu de quelqu'un d'autre : c'est une action d'administration. */
export async function logIfOnBehalf(actor: Member, ownerId: number | null | undefined, e: Entry) {
  if (actor.role === "administrateur" && ownerId !== actor.id) await logAdmin(actor, e);
}
