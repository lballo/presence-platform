import { useState } from "react";
import { Camera, Mail } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { supabase } from "@/lib/supabase";
import { useUpload } from "@/lib/upload";
import { Avatar } from "@/components/Avatar";
import { SettingsTitle } from "./ParametresLayout";

const MIN_LENGTH = 8;

/** Identité et connexion : mon adresse, mon mot de passe, ma photo. */
export default function Identite() {
  const me = trpc.members.me.useQuery().data;
  if (!me) return <p className="p-muted py-10 text-center">Chargement…</p>;
  return (
    <>
      <SettingsTitle title="Identité et connexion" />
      <section className="p-card p-5 sm:p-6 flex flex-col gap-2" aria-label="Adresse e-mail">
        <span className="flex items-center gap-2 font-medium"><Mail size={16} /> Adresse e-mail</span>
        <span className="text-[16px] break-all">{me.email ?? "Aucune adresse"}</span>
        <span className="text-[13.5px] p-muted">C’est votre identifiant de connexion. Pour en changer, écrivez à <a className="p-link" href="mailto:contact@lauraballo.com">contact@lauraballo.com</a> : l’adresse sert aussi à votre abonnement.</span>
      </section>
      <PasswordForm />
      <PhotoForm me={me} />
    </>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setError("");
    if (password.length < MIN_LENGTH) return setError(`Choisissez au moins ${MIN_LENGTH} caractères.`);
    if (password !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    setBusy(true);
    const { error: err } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message.includes("different") ? "Choisissez un mot de passe différent de l’actuel." : "Le mot de passe n’a pas pu être changé. Réessayez.");
    setPassword(""); setConfirm("");
    toast.success("Mot de passe changé");
  };
  return (
    <form className="p-card p-5 sm:p-6 flex flex-col gap-3" aria-label="Mot de passe" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <span className="font-medium">Changer mon mot de passe</span>
      <div className="flex flex-wrap gap-3">
        <label className="flex-[1_1_220px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Nouveau mot de passe</span><input className="p-field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="flex-[1_1_220px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Confirmer le mot de passe</span><input className="p-field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="m-0 text-[14px]" style={{ color: "var(--p-accent-text)" }}>{error}</p>}
      <button type="submit" className="p-btn-primary self-start" disabled={busy || !password}>{busy ? "Enregistrement…" : "Changer le mot de passe"}</button>
    </form>
  );
}

function PhotoForm({ me }: { me: { initials: string; photoUrl: string | null } }) {
  const utils = trpc.useUtils();
  const avatar = useUpload("avatar");
  const save = trpc.account.setPhoto.useMutation({ onSuccess: (_r, v) => { utils.members.invalidate(); utils.honey.invalidate(); toast.success(v.photoUrl ? "Photo enregistrée" : "Photo retirée"); }, onError: (e) => toast.error(e.message) });
  const pick = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1048576) return void toast.error("La photo dépasse 5 Mo.");
    try { save.mutate({ photoUrl: (await avatar.upload(file)).publicUrl }); } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); }
  };
  return (
    <section className="p-card p-5 sm:p-6 flex flex-wrap items-center gap-4" aria-label="Photo">
      <Avatar m={me} size={72} />
      <div className="flex-[1_1_220px] flex flex-col gap-1"><span className="font-medium">Ma photo</span><span className="text-[13.5px] p-muted">Elle apparaît sur votre profil, dans l’annuaire et à côté de vos messages. JPEG, PNG ou WebP, 5 Mo au plus.</span></div>
      <span className="flex flex-wrap gap-2">
        <label className="p-btn-outline p-btn-sm cursor-pointer">
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choisir ma photo" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <Camera size={15} /> {avatar.busy ? `Envoi… ${avatar.progress ?? 0} %` : me.photoUrl ? "Changer ma photo" : "Ajouter ma photo"}
        </label>
        {me.photoUrl && <button type="button" className="p-btn-ghost p-btn-sm" disabled={save.isPending} onClick={() => save.mutate({ photoUrl: null })}>Retirer</button>}
      </span>
    </section>
  );
}
