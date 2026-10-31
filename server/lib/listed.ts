import { and, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import { members } from "../../db/schema";

/** Annuaire et matching : comptes actifs, invitation acceptée, accès en cours. */
export const isListed = () =>
  and(eq(members.status, "actif"), isNotNull(members.onboardingCompletedAt), or(isNull(members.accessEndsAt), gt(members.accessEndsAt, new Date())));
