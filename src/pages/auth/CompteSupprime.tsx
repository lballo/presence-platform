import { AuthShell } from "./AuthShell";

/** Après la suppression du compte par le membre lui-même. */
export default function CompteSupprime() {
  return (
    <AuthShell title="Votre compte est supprimé" intro="Votre profil et vos données personnelles ont été effacés, et votre abonnement est arrêté.">
      <p className="m-0 text-[15px] leading-relaxed">Merci d’avoir fait partie du cercle. Si vous souhaitez revenir un jour, écrivez à <a className="p-link" href="mailto:contact@lauraballo.com">contact@lauraballo.com</a>.</p>
    </AuthShell>
  );
}
