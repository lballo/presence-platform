import { Link, useParams } from "react-router";
import { AuthShell } from "@/pages/auth/AuthShell";

/**
 * Les documents du réseau, lisibles sans compte. Trois textes distincts : les CGV (la vente),
 * les CGU (les règles d'usage de la communauté) et la politique de confidentialité.
 * Laura les rédige : tant qu'un texte n'est pas fourni, la page le dit.
 */
export const DOCUMENTS = {
  cgv: { title: "Conditions générales de vente", summary: "L’abonnement, le paiement, la résiliation." },
  cgu: { title: "Conditions générales d’utilisation", summary: "Les règles d’usage de la communauté." },
  confidentialite: { title: "Politique de confidentialité", summary: "Les données que nous gardons, pourquoi, et vos droits." },
} as const;

export default function DocumentPage() {
  const { doc = "" } = useParams();
  const d = DOCUMENTS[doc as keyof typeof DOCUMENTS];
  if (!d) return <AuthShell title="Document introuvable"><Link to="/parametres/documents" className="p-link">Voir les documents</Link></AuthShell>;
  return (
    <AuthShell title={d.title} intro={d.summary}>
      <p className="m-0 p-4 rounded-xl text-[15px] leading-relaxed" style={{ background: "var(--p-surface-2)" }}>Ce document est en cours de rédaction. Pour toute question, écrivez à <a className="p-link" href="mailto:contact@lauraballo.com">contact@lauraballo.com</a>.</p>
      <Link to="/parametres/documents" className="p-link text-[14px] self-start">Tous les documents</Link>
    </AuthShell>
  );
}
