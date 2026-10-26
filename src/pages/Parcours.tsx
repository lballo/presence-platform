import { PageHeader } from "@/components/Layout";

/** Onglet volontairement vide en v1 : le parcours individuel sera construit plus tard. */
export default function Parcours() {
  return (
    <>
      <PageHeader eyebrow="Mon parcours" title="Mon parcours" intro="Cet espace arrive bientôt." />
      <div className="p-soft p-10 text-center p-muted">Votre parcours individuel sera disponible dans une prochaine version.</div>
    </>
  );
}
