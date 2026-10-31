// Petits utilitaires partagés côté serveur.

export function initialsOf(first: string, last: string): string {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export function publicMember<T extends { firstName: string; lastName: string; photoUrl: string | null }>(m: T) {
  // Compte, droits, candidature et Espace Rencontre ne sortent jamais d'une fiche publique.
  const {
    organizerRequest: _r, organizerRequestedAt: _a, email: _e, authUserId: _u, role: _ro, status: _s, accessType: _t, accessEndsAt: _d,
    invitedAt: _i, onboardingCompletedAt: _o, rencontreEnabled: _re, rencontrePref: _rp, rencontreBlurb: _rb, ...rest
  } = m as T & Partial<Record<"organizerRequest" | "organizerRequestedAt" | "email" | "authUserId" | "role" | "status" | "accessType" | "accessEndsAt" | "invitedAt" | "onboardingCompletedAt" | "rencontreEnabled" | "rencontrePref" | "rencontreBlurb", unknown>>;
  return { ...rest, name: `${m.firstName} ${m.lastName}`, initials: initialsOf(m.firstName, m.lastName) };
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}
