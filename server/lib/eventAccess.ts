import { accountBlock, can, type Actor, type HiveRole } from "./permissions";

/**
 * Adresse précise (présentiel) et lien visio (en ligne, salon) :
 * transmis uniquement aux personnes inscrites, à l’organisatrice et aux leaders/administratrices.
 */
export function eventAccess(e: { address: string; meetingUrl: string; kind: string }, allowed: boolean) {
  const hasAccessInfo = e.kind === "onsite" ? !!e.address : !!e.meetingUrl;
  return {
    hasAccessInfo,
    address: allowed && e.kind === "onsite" ? e.address : "",
    meetingUrl: allowed && e.kind !== "onsite" ? e.meetingUrl : "",
  };
}

type EventFacts = { hostId: number; hiveId: number | null; status: string; visibility: string };

/**
 * Qui voit un événement :
 * - ruche : ses membres seulement, jamais public ;
 * - réseau : tous les membres connectés, ou tout le monde s'il est public ;
 * - pas encore publié : celui qui l'a créé et l'administrateur.
 * La RLS (0012_event_pages.sql) en est le second rempart.
 */
export function canViewEvent(member: Actor | null, e: EventFacts, hiveRole: HiveRole = ""): boolean {
  const active = !!member && !accountBlock(member);
  if (active && (e.hostId === member.id || can(member, "moderate"))) return true;
  if (e.status !== "published") return false;
  if (e.hiveId) return active && can(member, "hive.contribute", { hiveRole });
  return e.visibility === "public" || active;
}

/** Pourquoi l'événement n'est pas affiché : se connecter, ou réservé à une ruche. */
export function eventDenial(member: Actor | null, e: { hiveId: number | null; status: string }): "connexion" | "ruche" | "introuvable" {
  const active = !!member && !accountBlock(member);
  if (!active) return "connexion"; // aucun détail pour un visiteur, même pas l'existence de la ruche
  if (e.status !== "published") return "introuvable";
  return e.hiveId ? "ruche" : "introuvable";
}

const ACCENTS: Record<string, string> = { à: "a", â: "a", ä: "a", á: "a", ã: "a", é: "e", è: "e", ê: "e", ë: "e", í: "i", î: "i", ï: "i", ì: "i", ó: "o", ô: "o", ö: "o", ò: "o", õ: "o", ú: "u", û: "u", ü: "u", ù: "u", ç: "c", ñ: "n", œ: "oe", æ: "ae" };

/** « Dîner du Cercle : oser son autorité » → « diner-du-cercle-oser-son-autorite » */
export function slugify(text: string): string {
  const s = text.toLowerCase().replace(/[àâäáãéèêëíîïìóôöòõúûüùçñœæ]/g, (c) => ACCENTS[c] ?? c).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
  return s || "evenement";
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
