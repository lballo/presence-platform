import { Navigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/providers/auth";
import { membershipUrl } from "@/lib/supabase";
import { AuthShell } from "./AuthShell";

export default function AccesTermine() {
  const { session, loading, signOut } = useAuth();
  const status = trpc.auth.status.useQuery(undefined, { enabled: !!session, retry: false });

  if (loading || (session && status.isLoading)) return <AuthShell title="Un instant…"><span className="p-muted text-[15px]">Vérification de votre accès.</span></AuthShell>;
  if (!session) return <Navigate to="/connexion" replace />;
  if (status.data?.state === "ok") return <Navigate to="/" replace />;

  const blocked = status.data?.state === "blocked" ? status.data : null;
  const suspended = blocked?.block === "suspendu";
  const url = membershipUrl();
  return (
    <AuthShell title={suspended ? "Compte suspendu" : "Accès terminé"} intro={blocked?.message ?? "Votre accès à Présence est terminé."}>
      {!suspended && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[15px] leading-relaxed">Votre place dans le cercle peut se rouvrir à tout moment : votre profil et vos échanges vous attendent. Pour revenir, il suffit de renouveler votre accompagnement.</p>
          {url
            ? <a href={url} className="p-btn-primary no-underline self-start">Revenir dans le cercle</a>
            : <a href="mailto:contact@lauraballo.com" className="p-btn-primary no-underline self-start">Écrire à Laura</a>}
          {url && <span className="text-[13.5px] p-muted">Une question ? <a href="mailto:contact@lauraballo.com">contact@lauraballo.com</a></span>}
        </div>
      )}
      <button type="button" className="p-btn-ghost self-start text-[14px]" onClick={() => signOut()}>Me déconnecter</button>
    </AuthShell>
  );
}
