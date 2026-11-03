import { Link, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { AuthShell, FormError } from "./AuthShell";

/** Le lien de bas d'e-mail : sans se connecter. Un clic de confirmation, car les antivirus de messagerie ouvrent les liens tout seuls. */
export default function Desinscription() {
  const [params] = useSearchParams();
  const link = { m: Number(params.get("m")) || 0, c: params.get("c") ?? "", t: params.get("t") ?? "" };
  const q = trpc.emailPrefs.describeLink.useQuery(link, { retry: false });
  const go = trpc.emailPrefs.unsubscribeByLink.useMutation();
  const prefs = <Link to="/parametres/notifications" className="p-link text-[14.5px] self-start">Gérer tous mes e-mails</Link>;
  if (q.isLoading) return <AuthShell title="Mes e-mails"><p className="m-0 p-muted">Chargement…</p></AuthShell>;
  if (!q.data?.valid) return <AuthShell title="Lien invalide" intro="Ce lien ne fonctionne pas. Vous pouvez choisir vos e-mails depuis votre tableau de bord.">{prefs}</AuthShell>;
  if (go.data?.ok || !q.data.enabled) return <AuthShell title="C’est noté" intro={`Vous ne recevrez plus : ${q.data.label.toLowerCase()}.`}>{prefs}</AuthShell>;
  return (
    <AuthShell title="Ne plus recevoir ces e-mails ?" intro={`Vous ne recevrez plus : ${q.data.label.toLowerCase()}. Vous pourrez changer d’avis à tout moment.`}>
      <FormError message={go.data && !go.data.ok ? "Ce lien ne fonctionne pas." : go.error?.message ?? ""} />
      <button type="button" className="p-btn-primary" disabled={go.isPending} onClick={() => go.mutate(link)}>Confirmer</button>
      {prefs}
    </AuthShell>
  );
}
