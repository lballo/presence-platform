// Petits utilitaires partagés côté serveur.

export function initialsOf(first: string, last: string): string {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export function publicMember<T extends { firstName: string; lastName: string; photoUrl: string | null }>(m: T) {
  return { ...m, name: `${m.firstName} ${m.lastName}`, initials: initialsOf(m.firstName, m.lastName) };
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}
