import { Briefcase, Link2, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router";
import type { RouterOutputs } from "@/providers/trpc";

export type Post = RouterOutputs["forum"]["posts"]["posts"][number];
export type Space = RouterOutputs["forum"]["spaces"]["spaces"][number];

export const OPP = {
  recrut: { label: "Recrutement", icon: Briefcase, ph: "Ex. Responsable marketing (H/F)" },
  fin: { label: "Financement", icon: TrendingUp, ph: "Ex. Levée d’amorçage pour une jeune entreprise" },
  assoc: { label: "Recherche d’associé", icon: Link2, ph: "Ex. Un associé pour développer mon cabinet" },
} as const;
export type OppType = keyof typeof OPP;

export const AUDIENCES = { tous: "Tout le réseau", collectif: "Membres du collectif", accompagnement: "Clients en accompagnement" } as const;
export const SPACE_GROUPS = [["arriver", "Arriver dans le réseau"], ["echanger", "Échanger"]] as const;

/** Point de couleur des annonces non lues. */
export function UnreadDot({ label = "Annonce non lue", light }: { label?: string; light?: boolean }) {
  return <span role="img" aria-label={label} title={label} className="p-dot" style={light ? { background: "#fff" } : undefined} />;
}

type Tag = { id: number; name: string; color: string | null };

/** Un hashtag : sa couleur reste un simple point, pour rester lisible en thème clair comme en thème sombre. */
export function TagLabel({ tag }: { tag: Tag }) {
  return <>{tag.color && <span className="w-2 h-2 rounded-full flex-none" style={{ background: tag.color }} />}#{tag.name}</>;
}

/** Sur une publication : un clic affiche toutes les publications qui portent ce hashtag. */
export function HashtagChip({ tag }: { tag: Tag }) {
  const navigate = useNavigate();
  return <button type="button" className="p-pill h-[26px] text-[12.5px] hover:brightness-95" style={{ color: "var(--p-ink)" }} onClick={() => navigate(`/forum?tag=${tag.id}`)}><TagLabel tag={tag} /></button>;
}
