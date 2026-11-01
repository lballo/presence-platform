import { INTENT_GROUPS } from "./intents";
// Choix proposés dans les panneaux d'accueil. Les textes sont repris dans docs/textes-accueil.md.

export const GOALS = [
  ["pairs", "Rencontrer des pairs"],
  ["oral", "Gagner en aisance à l’oral"],
  ["recul", "Prendre du recul sur mon rôle"],
  ["partenaires", "Trouver des partenaires ou des clients"],
  ["projet", "Lancer un projet"],
  ["inspiration", "M’inspirer d’autres parcours"],
] as const;

export const PROFILE_TYPES = [
  ["dirigeant", "Dirigeants"],
  ["fondateur", "Fondateurs"],
  ["cadre", "Cadres dirigeants"],
  ["independant", "Indépendants"],
  ["expert", "Experts"],
  ["mentor", "Mentors"],
  ["investisseur", "Investisseurs"],
] as const;

export const SECTORS = [
  ["industrie", "Industrie"],
  ["services", "Services"],
  ["tech", "Numérique"],
  ["finance", "Finance"],
  ["sante", "Santé"],
  ["education", "Éducation"],
  ["conseil", "Conseil"],
  ["commerce", "Commerce"],
  ["culture", "Culture"],
  ["associatif", "Associatif"],
] as const;

export const labelOf = (list: readonly (readonly [string, string])[], code: string) => list.find(([k]) => k === code)?.[1] ?? code;
export const goalLabels = (codes: string[]) => codes.map((c) => labelOf(GOALS, c));

const INTENT_OPTIONS = INTENT_GROUPS.flatMap((g) => g.options as readonly (readonly [string, string])[]);
// « Trouver un poste » répond à « Recruter » pour le matching, mais c'est bien quelque chose que l'on cherche
const isOffer = (code: string) => code.endsWith(":offer") && code !== "recrut:offer";
export const SEEK_OPTIONS = INTENT_OPTIONS.filter(([code]) => !isOffer(code));
export const OFFER_OPTIONS = INTENT_OPTIONS.filter(([code]) => isOffer(code));
