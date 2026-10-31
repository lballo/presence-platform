import { Link, useNavigate, useParams } from "react-router";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { AuthShell, FormError } from "./AuthShell";

export default function Invitation() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const info = trpc.auth.invitation.useQuery({ token }, { retry: false, enabled: token.length >= 20 });
  const [error, setError] = useState("");
  const accept = trpc.auth.acceptInvitation.useMutation({
    onSuccess: (r) => navigate(`/choisir-mot-de-passe?token_hash=${encodeURIComponent(r.tokenHash)}&type=${r.type}&invitation=1`),
    onError: (e) => setError(e.message),
  });

  if (info.isLoading) return <AuthShell title="Un instant…"><span className="p-muted text-[15px]">Vérification de votre invitation.</span></AuthShell>;
  if (!info.data?.valid) {
    const used = info.data?.reason === "utilisee";
    const expired = info.data?.reason === "expiree";
    return (
      <AuthShell title={used ? "Invitation déjà utilisée" : expired ? "Invitation expirée" : "Invitation non valable"}
        intro={used ? "Votre compte est prêt : connectez-vous avec votre e-mail et votre mot de passe." : <>Une invitation reste valable 7 jours. Écrivez à Laura pour en recevoir une nouvelle : <a href="mailto:contact@lauraballo.com">contact@lauraballo.com</a>.</>}>
        {used && <Link to="/connexion" className="p-btn-primary no-underline self-start">Me connecter</Link>}
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Bienvenue, ${info.data.firstName}`} intro={<>Laura vous invite à rejoindre Présence, le cercle de dirigeantes et de dirigeants. Votre compte sera créé pour <b>{info.data.email}</b>.</>}>
      <FormError message={error} />
      <button type="button" className="p-btn-primary" disabled={accept.isPending} onClick={() => accept.mutate({ token })}>{accept.isPending ? "Un instant…" : "Choisir mon mot de passe"}</button>
    </AuthShell>
  );
}
