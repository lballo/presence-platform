import type { ReactNode } from "react";

/** Mise en page commune aux écrans hors connexion. */
export function AuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px] flex flex-col gap-7">
        <span className="flex flex-col items-center gap-2.5">
          <span className="text-[13px] tracking-[0.2em] uppercase p-muted">Laura Ballo</span>
          <span className="flex items-center gap-2.5">
            <span className="w-[9px] h-[9px] rounded-full" style={{ background: "var(--p-accent)" }} />
            <span className="serif leading-none text-[29px]">Présence</span>
          </span>
        </span>
        <section className="p-card p-6 sm:p-8 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-[34px] leading-tight">{title}</h1>
            {intro && <p className="m-0 text-[15.5px] leading-relaxed p-muted">{intro}</p>}
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="m-0 p-3 rounded-xl text-[14px] leading-relaxed" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}>{message}</p>;
}

/** Messages de Supabase Auth, en français. */
export function authErrorMessage(error: { message?: string; code?: string }): string {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) return "E-mail ou mot de passe incorrect.";
  if (code === "email_not_confirmed") return "Ce compte n’est pas encore activé : ouvrez le lien de votre e-mail d’invitation.";
  if (code === "same_password") return "Choisissez un mot de passe différent de l’ancien.";
  if (code === "weak_password" || /password should/i.test(message)) return "Ce mot de passe est trop simple : choisissez-en un plus long.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || /rate limit/i.test(message)) return "Trop de tentatives d’affilée : réessayez dans quelques minutes.";
  if (/fetch|network/i.test(message)) return "Connexion impossible pour le moment. Vérifiez votre réseau et réessayez.";
  return "Une erreur est survenue. Réessayez, ou écrivez à contact@lauraballo.com.";
}
