export const ROLE_LABEL = { membre: "Membre", organisateur: "Organisateur", administrateur: "Administrateur" } as const;
export const ACCESS_LABEL = { collectif: "Collectif", individuel: "Individuel", les_deux: "Les deux" } as const;
export const STATE_LABEL = {
  actif: "Actif", invite: "Invitation envoyée", sans_compte: "Pas encore invité", suspendu: "Suspendu", termine: "Terminé", expire: "Accès expiré", supprime: "Supprimé",
} as const;
export type MemberState = keyof typeof STATE_LABEL;

export const fullDate = (d: Date | string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
export const dateTime = (d: Date | string) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export const stateTone = (s: MemberState) => (s === "actif" ? "ok" : s === "suspendu" || s === "expire" || s === "termine" ? "alert" : s === "invite" ? "wait" : "calm");
