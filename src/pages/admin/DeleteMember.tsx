import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";

/**
 * Supprimer un membre, en deux confirmations : l'explication, puis le mot SUPPRIMER à écrire.
 * Servi par la fiche d'un membre et par la liste des membres.
 */
export function DeleteMemberSteps({ id, name, onCancel, onDeleted, scroll }: { id: number; name: string; onCancel: () => void; onDeleted: () => void; scroll?: boolean }) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroll) box.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [scroll, id]);
  useEffect(() => { setStep(1); setTyped(""); }, [id]);
  const remove = trpc.admin.deleteMember.useMutation({
    onSuccess: () => { utils.admin.invalidate(); utils.members.invalidate(); toast.success("Membre supprimé, ses publications restent en ligne"); onDeleted(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div ref={box} role="region" aria-label={`Supprimer ${name}`} className="p-3.5 rounded-xl flex flex-col gap-2.5 text-[14.5px]" style={{ background: "var(--p-accent-soft)" }}>
      {step === 1 ? (
        <>
          <p className="m-0"><b>Supprimer {name} ?</b> Le compte sera désactivé et le profil anonymisé : nom, photo, bio et adresse e-mail disparaissent. Ses publications et ses messages restent, sous le nom « Membre supprimé ». Cette action ne s’annule pas.</p>
          <span className="flex flex-wrap gap-2">
            <button type="button" className="p-btn-primary p-btn-sm" onClick={() => setStep(2)}>Continuer</button>
            <button type="button" className="p-btn-outline p-btn-sm" onClick={onCancel}>Annuler</button>
          </span>
        </>
      ) : (
        <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); if (typed === "SUPPRIMER") remove.mutate({ id, confirm: typed }); }}>
          <label className="flex flex-col gap-1.5"><span><b>Dernière confirmation.</b> Écrivez SUPPRIMER pour supprimer {name}.</span><input className="p-field" value={typed} autoComplete="off" autoFocus onChange={(e) => setTyped(e.target.value)} /></label>
          <span className="flex flex-wrap gap-2">
            <button type="submit" className="p-btn-primary p-btn-sm" disabled={typed !== "SUPPRIMER" || remove.isPending}>Supprimer définitivement</button>
            <button type="button" className="p-btn-outline p-btn-sm" onClick={onCancel}>Annuler</button>
          </span>
        </form>
      )}
    </div>
  );
}
