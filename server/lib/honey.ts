import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { honeyLedger, honeyRules } from "../../db/schema";

/**
 * Le miel : les points du réseau. Le barème vit dans honey_rules et le grand livre dans honey_ledger,
 * pour pouvoir ajouter plus tard des niveaux ou changer le barème sans toucher aux actions.
 */
export const FIRST_STEPS = ["accueil", "tuto", "profil", "bienvenue_inscription", "bienvenue_presence", "presentation", "premier_message", "premier_evenement"] as const;
export type HoneyAction = (typeof FIRST_STEPS)[number];

/**
 * Crédite une action, une seule fois par membre. Si la même action vaut désormais plus (présentation à
 * laquelle on ajoute une vidéo), seule la différence est gagnée. Renvoie le miel gagné, 0 si déjà crédité.
 */
export async function award(memberId: number, action: HoneyAction, opts: { rule?: string } = {}): Promise<number> {
  const db = getDb();
  const [rule] = await db.select().from(honeyRules).where(eq(honeyRules.action, opts.rule ?? action)).limit(1);
  if (!rule?.active) return 0;
  const [created] = await db.insert(honeyLedger).values({ memberId, action, amount: rule.amount }).onConflictDoNothing().returning();
  if (created) return created.amount;
  const [existing] = await db.select().from(honeyLedger).where(and(eq(honeyLedger.memberId, memberId), eq(honeyLedger.action, action), isNull(honeyLedger.ref))).limit(1);
  if (!existing || existing.amount >= rule.amount) return 0;
  await db.update(honeyLedger).set({ amount: rule.amount }).where(and(eq(honeyLedger.id, existing.id), lt(honeyLedger.amount, rule.amount)));
  return rule.amount - existing.amount;
}

/** Une présence décochée par erreur : le miel correspondant est repris. */
export async function revoke(memberId: number, action: HoneyAction) {
  await getDb().delete(honeyLedger).where(and(eq(honeyLedger.memberId, memberId), eq(honeyLedger.action, action), isNull(honeyLedger.ref)));
}

export async function honeyTotal(memberId: number): Promise<number> {
  const [row] = await getDb().select({ n: sql<number>`coalesce(sum(${honeyLedger.amount}), 0)::int` }).from(honeyLedger).where(eq(honeyLedger.memberId, memberId));
  return row?.n ?? 0;
}
