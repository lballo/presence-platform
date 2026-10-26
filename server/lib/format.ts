// Petits utilitaires partagés côté serveur.

export function initialsOf(first: string, last: string): string {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export function publicMember<T extends { firstName: string; lastName: string; photoUrl: string | null; organizerRequest?: string; organizerRequestedAt?: Date | null }>(m: T) {
  // la motivation d'une candidature organisateur reste entre le membre et l'équipe
  const { organizerRequest: _r, organizerRequestedAt: _a, ...rest } = m;
  return { ...rest, name: `${m.firstName} ${m.lastName}`, initials: initialsOf(m.firstName, m.lastName) };
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}
