// Intentions "ce que je cherche ou propose", partagées par l'annuaire, le matching et le profil.

export const INTENT_GROUPS = [
  { key: "mentorat", label: "Mentorat", options: [["mentorat:seek", "Trouver un mentor"], ["mentorat:offer", "Être mentor"]] },
  { key: "pairs", label: "Pairs", options: [["pairs:sym", "Échanger entre pairs"]] },
  { key: "associe", label: "Associé", options: [["associe:sym", "M’associer"]] },
  { key: "invest", label: "Investissement", options: [["invest:seek", "Lever des fonds"], ["invest:offer", "Investir"]] },
  { key: "recrut", label: "Recrutement", options: [["recrut:seek", "Recruter"], ["recrut:offer", "Trouver un poste"]] },
  { key: "amitie", label: "Amitié", options: [["amitie:sym", "Nouvelles amitiés"]] },
  { key: "parole", label: "Prise de parole", options: [["parole:seek", "Trouver un intervenant"], ["parole:offer", "Intervenir en conférence"]] },
] as const;

export const INTENT_CODES = INTENT_GROUPS.flatMap((g) => g.options.map((o) => o[0]));
export type IntentCode = (typeof INTENT_CODES)[number];

/** Libellé tel qu'il apparaît sur la fiche d'un membre (3e personne). */
export function intentLabel(code: string, gender: string): string {
  const f = gender === "f";
  const L: Record<string, string> = {
    "mentorat:seek": "Cherche un mentor",
    "mentorat:offer": "Propose du mentorat",
    "pairs:sym": "Échanges entre pairs",
    "associe:sym": "Cherche à s’associer",
    "invest:seek": "Cherche des investisseurs",
    "invest:offer": "Investit dans des projets",
    "recrut:seek": "Recrute",
    "recrut:offer": f ? "Ouverte à un poste" : "Ouvert à un poste",
    "amitie:sym": "Nouvelles amitiés",
    "parole:seek": "Cherche un intervenant",
    "parole:offer": f ? "Intervenante, conférencière" : "Intervenant, conférencier",
  };
  return L[code] ?? code;
}

/** Libellé à la première personne (mon profil, matching). */
export function myIntentLabel(code: string): string {
  const L: Record<string, string> = {
    "mentorat:seek": "Je cherche un mentor",
    "mentorat:offer": "Je transmets en tant que mentor",
    "pairs:sym": "J’échange entre pairs",
    "associe:sym": "Je cherche à m’associer",
    "invest:seek": "Je cherche des investisseurs",
    "invest:offer": "J’investis dans des projets",
    "recrut:seek": "Je recrute",
    "recrut:offer": "Je suis à l’écoute d’un poste",
    "amitie:sym": "Je cherche de nouvelles amitiés",
    "parole:seek": "Je cherche un intervenant",
    "parole:offer": "J’interviens en conférence",
    amour: "Espace Rencontre",
  };
  return L[code] ?? code;
}

/** Intention complémentaire : qui dois-je rencontrer si j'ai cette intention ? */
export function complement(code: string): string {
  const [key, side] = code.split(":");
  if (side === "sym") return code;
  return `${key}:${side === "offer" ? "seek" : "offer"}`;
}

export function intentKey(code: string): string {
  return code.split(":")[0];
}
