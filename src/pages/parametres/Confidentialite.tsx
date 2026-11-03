import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/providers/auth";
import { ConsentDialog } from "@/components/course/ConsentDialog";
import { Danger, Status } from "@/pages/parcours/CoachMemoryPage";
import { SettingsTitle } from "./ParametresLayout";

/** Confidentialité : la mémoire du coach IA, mes données à télécharger, la suppression du compte. */
export default function Confidentialite() {
  return (
    <>
      <SettingsTitle title="Confidentialité" intro="Ce que le coach IA garde de vous, vos données, et votre compte." />
      <CoachConsent />
      <ExportData />
      <DeleteAccount />
    </>
  );
}

function CoachConsent() {
  const q = trpc.coachMemory.state.useQuery();
  const [asking, setAsking] = useState(false);
  return (
    <section className="flex flex-col gap-3" aria-label="Mémoire du coach IA">
      <h3 className="m-0 text-[22px]">Mémoire du coach IA</h3>
      <ConsentDialog open={asking} onDone={() => setAsking(false)} />
      {q.data && <Status s={q.data} onAsk={() => setAsking(true)} />}
      {q.data && q.data.accepted && <Danger s={q.data} />}
      <Link to="/parcours/coach" className="p-link text-[14.5px] self-start">Lire et corriger ce que le coach retient de moi</Link>
    </section>
  );
}

function ExportData() {
  const exp = trpc.account.exportData.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mes-donnees-presence-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Vos données sont téléchargées");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section className="p-card p-5 sm:p-6 flex flex-wrap items-center gap-4" aria-label="Télécharger mes données">
      <div className="flex-[1_1_280px] flex flex-col gap-1">
        <span className="font-medium">Télécharger mes données</span>
        <span className="text-[13.5px] p-muted leading-relaxed">Un fichier avec votre profil, votre journal, vos tests, la mémoire du coach, vos messages, vos publications, vos inscriptions et votre miel.</span>
      </div>
      <button type="button" className="p-btn-outline p-btn-sm" disabled={exp.isPending} onClick={() => exp.mutate()}><Download size={15} /> {exp.isPending ? "Préparation…" : "Télécharger"}</button>
    </section>
  );
}

function DeleteAccount() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const me = trpc.members.me.useQuery().data;
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const remove = trpc.account.deleteAccount.useMutation({
    // La page d'adieu d'abord : déconnecté sur une page réservée, on serait renvoyé à la connexion
    onSuccess: async () => { navigate("/compte-supprime", { replace: true }); await signOut(); },
    onError: (e) => toast.error(e.message, { duration: 10000 }),
  });
  if (me?.memberRole === "administrateur") return <section className="p-soft p-5 text-[14px] p-muted">Un compte administrateur ne se supprime pas depuis ses paramètres.</section>;
  return (
    <section className="p-card p-5 sm:p-6 flex flex-col gap-3" aria-label="Supprimer mon compte" style={{ borderColor: "var(--p-accent-line)" }}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-[1_1_280px] flex flex-col gap-1">
          <span className="font-medium" style={{ color: "var(--p-accent-text)" }}>Supprimer mon compte</span>
          <span className="text-[13.5px] p-muted leading-relaxed">Votre profil, votre journal, vos tests, la mémoire du coach et vos conversations avec le coach sont effacés tout de suite, et votre abonnement s’arrête. Vos publications restent, signées « Membre supprimé ». Cela ne s’annule pas.</span>
        </div>
        {!open && <button type="button" className="p-btn-outline p-btn-sm" style={{ color: "var(--p-accent-text)" }} onClick={() => setOpen(true)}><Trash2 size={15} /> Supprimer…</button>}
      </div>
      {open && (
        <form className="flex flex-col gap-3 pt-3 border-t" style={{ borderColor: "var(--p-line)" }} onSubmit={(e) => { e.preventDefault(); remove.mutate({ confirm }); }}>
          <span className="text-[14px]">Pensez à télécharger vos données avant. Pour confirmer, écrivez <strong>SUPPRIMER</strong>.</span>
          <input className="p-field max-w-[320px]" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Écrivez SUPPRIMER pour confirmer" autoComplete="off" />
          <span className="flex flex-wrap gap-2">
            <button type="submit" className="p-btn-primary p-btn-sm" disabled={confirm.trim().toUpperCase() !== "SUPPRIMER" || remove.isPending}>{remove.isPending ? "Suppression…" : "Supprimer définitivement mon compte"}</button>
            <button type="button" className="p-btn-outline p-btn-sm" onClick={() => { setOpen(false); setConfirm(""); }}>Annuler</button>
          </span>
        </form>
      )}
    </section>
  );
}
