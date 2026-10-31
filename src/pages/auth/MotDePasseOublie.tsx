import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { AuthShell, FormError, authErrorMessage } from "./AuthShell";

export default function MotDePasseOublie() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const { error: err } = await supabase().auth.resetPasswordForEmail(email.trim());
    setPending(false);
    if (err) setError(authErrorMessage(err));
    else setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Regardez vos e-mails" intro={<>Si un compte existe pour <b>{email.trim()}</b>, vous allez recevoir un lien pour choisir un nouveau mot de passe. Il est valable une heure.</>}>
        <Link to="/connexion" className="p-btn-outline no-underline self-start">Retour à la connexion</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Mot de passe oublié" intro="Indiquez votre e-mail : nous vous envoyons un lien pour en choisir un nouveau.">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>E-mail</span><input className="p-field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <FormError message={error} />
        <button type="submit" className="p-btn-primary" disabled={pending}>{pending ? "Envoi…" : "Recevoir le lien"}</button>
      </form>
      <Link to="/connexion" className="self-center text-[14px] underline p-muted">Retour à la connexion</Link>
    </AuthShell>
  );
}
