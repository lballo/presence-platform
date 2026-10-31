import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth";
import { trpc } from "@/providers/trpc";
import { AuthShell, FormError, authErrorMessage } from "./AuthShell";

const MIN_LENGTH = 8;

// Un lien Supabase ne sert qu'une fois : on garde sa vérification en cours (double rendu de React en développement).
const verifications = new Map<string, Promise<boolean>>();
function verifyOnce(tokenHash: string, type: "invite" | "recovery") {
  if (!verifications.has(tokenHash)) {
    verifications.set(tokenHash, supabase().auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => !error));
  }
  return verifications.get(tokenHash)!;
}

export default function ChoisirMotDePasse() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const utils = trpc.useUtils();
  const passwordChosen = trpc.auth.passwordChosen.useMutation();
  const tokenHash = params.get("token_hash");
  const type = params.get("type") === "invite" ? "invite" : "recovery";
  const welcome = params.get("invitation") === "1";

  const [verified, setVerified] = useState<boolean | null>(tokenHash ? null : true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (tokenHash) verifyOnce(tokenHash, type).then(setVerified);
  }, [tokenHash, type]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_LENGTH) return setError(`Choisissez au moins ${MIN_LENGTH} caractères.`);
    if (password !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    setPending(true);
    setError("");
    const { error: err } = await supabase().auth.updateUser({ password });
    if (err) {
      setPending(false);
      return setError(authErrorMessage(err));
    }
    try {
      await passwordChosen.mutateAsync();
    } catch (err2) {
      setPending(false);
      return setError(err2 instanceof Error ? err2.message : "Une erreur est survenue.");
    }
    await utils.auth.status.invalidate();
    navigate("/", { replace: true });
  };

  if (verified === null || loading) return <AuthShell title="Un instant…"><span className="p-muted text-[15px]">Vérification de votre lien.</span></AuthShell>;
  if (!verified || !session) {
    return (
      <AuthShell title="Ce lien n’est plus valable" intro="Il a expiré ou a déjà servi. Demandez-en un nouveau, cela ne prend qu’un instant.">
        <Link to="/mot-de-passe-oublie" className="p-btn-primary no-underline self-start">Recevoir un nouveau lien</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choisir mon mot de passe" intro={welcome ? "Bienvenue dans le cercle. Plus qu’une étape avant d’entrer." : `Au moins ${MIN_LENGTH} caractères.`}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Nouveau mot de passe</span><input className="p-field" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Confirmer le mot de passe</span><input className="p-field" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <FormError message={error} />
        <button type="submit" className="p-btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer et entrer"}</button>
      </form>
    </AuthShell>
  );
}
