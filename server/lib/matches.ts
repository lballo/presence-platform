import { and, eq, or } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { swipes } from "../../db/schema";

export const GOAL_LABELS: Record<string, string> = { mentorat: "Mentorat", pairs: "Pairs", associe: "Associé", invest: "Investissement", recrut: "Recrutement", amitie: "Amitié", parole: "Prise de parole", amour: "Espace Rencontre" };

/** Mes relations : les membres avec qui l’intérêt est réciproque (au moins une intention en commun). */
export async function matchedPeers(memberId: number) {
  const db = getDb();
  const rows = await db.select().from(swipes).where(and(eq(swipes.liked, true), or(eq(swipes.fromId, memberId), eq(swipes.toId, memberId))));
  const mine = rows.filter((s) => s.fromId === memberId);
  const theirs = rows.filter((s) => s.toId === memberId);
  const out = new Map<number, { goals: string[]; at: Date }>();
  for (const s of mine) {
    const back = theirs.find((t) => t.fromId === s.toId && t.goal === s.goal);
    if (!back) continue;
    const at = s.createdAt > back.createdAt ? s.createdAt : back.createdAt;
    const cur = out.get(s.toId);
    if (cur) { cur.goals.push(s.goal); if (at > cur.at) cur.at = at; }
    else out.set(s.toId, { goals: [s.goal], at });
  }
  return out;
}

export async function isMatched(a: number, b: number) {
  return (await matchedPeers(a)).has(b);
}
