import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth";
import { AuthShell, FormError, authErrorMessage } from "./AuthShell";

export default function Connexion() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const { error: err } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setPending(false);
    if (err) setError(authErrorMessage(err));
  };

  return (
    <AuthShell title="Connexion" intro="Heureuse de vous retrouver dans le cercle.">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>E-mail</span><input className="p-field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Mot de passe</span><input className="p-field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <FormError message={error} />
        <button type="submit" className="p-btn-primary" disabled={pending}>{pending ? "Connexion…" : "Me connecter"}</button>
      </form>
      <Link to="/mot-de-passe-oublie" className="self-center text-[14px] underline p-muted">Mot de passe oublié ?</Link>
      <p className="m-0 text-center text-[13px] p-faint leading-relaxed">Présence est un réseau sur invitation.</p>
    </AuthShell>
  );
}
