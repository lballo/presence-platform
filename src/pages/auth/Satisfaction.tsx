import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Star } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AuthShell, FormError } from "./AuthShell";

type Key = "satisfaction" | "besoin" | "professionnalisme" | "disponibilite";

const QUESTIONS: [Key, string][] = [
  ["satisfaction", "Quelle est votre satisfaction générale concernant votre programme ?"],
  ["besoin", "A-t-il répondu à votre besoin initial ?"],
  ["professionnalisme", "Évaluation du professionnalisme du coach (respect du cadre, horaires, posture)"],
  ["disponibilite", "À combien évalueriez-vous la disponibilité de votre coach ?"],
];

/**
 * Le questionnaire de satisfaction du coaching, sans connexion.
 * /satisfaction/:token : le lien personnel d'un accompagnement. /satisfaction?prenom=…&p=… : l'ancien lien du site, anonyme.
 */
export default function Satisfaction() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const q = trpc.coaching.satisfactionForm.useQuery({ token }, { retry: false });
  const send = trpc.coaching.submitSatisfaction.useMutation();
  const [notes, setNotes] = useState<Partial<Record<Key, number>>>({});
  const [remarques, setRemarques] = useState("");
  const [missing, setMissing] = useState(false);

  if (q.isLoading) return <AuthShell title="Votre avis compte"><p className="m-0 p-muted">Chargement…</p></AuthShell>;
  if (!q.data?.valid) return <AuthShell title="Lien invalide" intro="Ce lien ne fonctionne pas. Écrivez à contact@lauraballo.com et Laura vous renverra le bon."><span /></AuthShell>;
  const f = q.data;
  const prenom = f.personal ? f.prenom : params.get("prenom") ?? "";
  const programme = f.personal ? f.programme : params.get("p") ?? "";
  const thanks = <AuthShell title="Merci pour votre retour" intro="Votre évaluation a bien été transmise. Votre avis contribue à l'amélioration continue de mes accompagnements."><span className="text-[14px] p-muted">Laura Ballo</span></AuthShell>;
  if (send.data?.ok || f.answered) return thanks;

  const submit = () => {
    if (QUESTIONS.some(([k]) => !notes[k])) { setMissing(true); return; }
    setMissing(false);
    send.mutate({ token, satisfaction: notes.satisfaction!, besoin: notes.besoin!, professionnalisme: notes.professionnalisme!, disponibilite: notes.disponibilite!, remarques, prenom, programme });
  };

  return (
    <AuthShell
      title={`${prenom ? `${prenom}, c` : "C"}omment avez-vous vécu l’accompagnement ${programme ? `«\u00a0${programme}\u00a0»` : "votre programme"}\u00a0?`}
      intro="Votre retour d'expérience est précieux. Il me permet d'améliorer continuellement la qualité de l'accompagnement et de mieux servir mes futurs clients."
    >
      <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {QUESTIONS.map(([k, label]) => <Stars key={k} label={label} value={notes[k] ?? 0} onChange={(n) => setNotes({ ...notes, [k]: n })} />)}
        <label className="flex flex-col gap-1.5 text-[14.5px]">
          <span className="font-semibold">Avez-vous des axes d'amélioration, des remarques ou recommandations ?</span>
          <textarea className="p-field" rows={5} maxLength={8000} value={remarques} onChange={(e) => setRemarques(e.target.value)} placeholder="Partagez librement vos observations…" />
        </label>
        <FormError message={missing ? "Merci de renseigner toutes les évaluations." : send.error?.message ?? ""} />
        <button type="submit" className="p-btn-primary" disabled={send.isPending}>{send.isPending ? "Envoi en cours…" : "Envoyer mon évaluation"}</button>
        <span className="text-[12.5px] p-muted text-center">Questionnaire confidentiel</span>
      </form>
    </AuthShell>
  );
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
      <legend className="p-0 mb-2 text-[14.5px] font-semibold leading-snug">{label} <span aria-hidden style={{ color: "var(--p-accent-text)" }}>*</span></legend>
      <div role="radiogroup" aria-label={label} className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} sur 5`} onClick={() => onChange(n)} className="p-1 rounded-lg bg-transparent border-0 cursor-pointer">
            <Star size={30} strokeWidth={1.6} style={{ color: "var(--p-accent)", fill: n <= value ? "var(--p-accent)" : "transparent" }} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
