import { useState } from "react";
import { CreditCard, ExternalLink, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { parisLongDate } from "@/lib/format";
import { ConfirmButton } from "@/pages/admin/shared";
import { SettingsTitle } from "./ParametresLayout";

type Sub = NonNullable<Extract<RouterOutputs["account"]["billing"], { configured: true }>["subscription"]>;

// Les raisons proposées à la résiliation : la clé est gardée côté serveur (server/routers/account.ts)
const REASONS = [["prix", "Le prix"], ["necessite", "Je n’en ai plus besoin"], ["integration", "Je ne me sens pas intégré·e dans le réseau"], ["benefices", "Pas assez de bénéfices"]] as const;
type Reason = (typeof REASONS)[number][0];

const money = (cents: number, currency: string) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
const EVERY: Record<string, string> = { day: "par jour", week: "par semaine", month: "par mois", year: "par an" };
const every = (i: string) => EVERY[i] ?? `tous les ${i.replace("month", "mois").replace("year", "ans").replace("week", "semaines")}`;
const go = (url: string) => { window.location.href = url; };

/** Abonnement : ma formule et sa prochaine échéance ; le reste se fait dans le portail client de Stripe. */
export default function Abonnement() {
  const q = trpc.account.billing.useQuery(undefined, { retry: false });
  const portal = trpc.account.portal.useMutation({ onSuccess: (r) => go(r.url), onError: (e) => toast.error(e.message) });
  const contact = <>Pour toute question, écrivez à <a className="p-link" href="mailto:contact@lauraballo.com">contact@lauraballo.com</a>.</>;
  return (
    <>
      <SettingsTitle title="Abonnement" intro="Votre formule, sa prochaine échéance et vos factures. Le paiement est géré par Stripe, en toute sécurité." />
      {q.isLoading && <p className="p-muted text-center py-6 m-0">Chargement…</p>}
      {q.error && <div className="p-soft p-6 text-[15px]">{q.error.message} {contact}</div>}
      {q.data && !q.data.configured && <div className="p-soft p-6 text-[15px] leading-relaxed">Le paiement n’est pas encore relié à Présence : votre abonnement ne s’affiche pas encore ici. {contact}</div>}
      {q.data?.configured && !q.data.subscription && (
        <div className="p-soft p-6 flex flex-col gap-3 text-[15px] leading-relaxed">
          <span>Aucun abonnement en cours n’est relié à votre adresse e-mail. {contact}</span>
          {q.data.customer && <button type="button" className="p-btn-outline p-btn-sm self-start" disabled={portal.isPending} onClick={() => portal.mutate()}><ExternalLink size={15} /> Mes factures</button>}
        </div>
      )}
      {q.data?.configured && q.data.subscription && <Current s={q.data.subscription} onPortal={() => portal.mutate()} opening={portal.isPending} />}
    </>
  );
}

function Current({ s, onPortal, opening }: { s: Sub; onPortal: () => void; opening: boolean }) {
  const utils = trpc.useUtils();
  const [leaving, setLeaving] = useState(false);
  const pause = trpc.account.pause.useMutation({ onSuccess: (_r, v) => { utils.account.billing.invalidate(); toast.success(v.paused ? "Abonnement en pause : la facturation s’arrête" : "Abonnement réactivé"); }, onError: (e) => toast.error(e.message) });
  const state = s.paused ? "En pause" : s.cancelAtPeriodEnd ? `S’arrête le ${s.endsAt ? parisLongDate(new Date(s.endsAt)).toLowerCase() : "à la fin de la période"}` : s.status === "past_due" || s.status === "unpaid" ? "Paiement en attente" : s.status === "trialing" ? "Période d’essai" : "Actif";
  return (
    <>
      <section className="p-card p-5 sm:p-6 flex flex-col gap-4" aria-label="Ma formule">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-gold)" }}>Formule en cours</span>
            <span className="serif text-[28px] leading-tight">{s.name}</span>
            {s.amount !== null && <span className="text-[15px] p-muted">{money(s.amount, s.currency)}{s.interval ? ` ${every(s.interval)}` : ""}</span>}
          </div>
          <span className="p-pill">{state}</span>
        </div>
        <dl className="m-0 grid gap-2 text-[14.5px] pt-3 border-t" style={{ gridTemplateColumns: "auto 1fr", borderColor: "var(--p-line)" }}>
          <dt className="p-muted">Prochaine échéance</dt>
          <dd className="m-0">{s.nextPaymentAt ? parisLongDate(new Date(s.nextPaymentAt)) : s.paused ? "Aucune tant que l’abonnement est en pause" : "Aucune"}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="p-btn-primary p-btn-sm" disabled={opening} onClick={onPortal}><CreditCard size={15} /> Moyen de paiement et factures</button>
          {s.paused
            ? <button type="button" className="p-btn-outline p-btn-sm" disabled={pause.isPending} onClick={() => pause.mutate({ paused: false })}><Play size={15} /> Réactiver mon abonnement</button>
            : !s.cancelAtPeriodEnd && <ConfirmButton label={<><Pause size={15} /> Mettre en pause</>} question="La facturation s’arrête, votre compte et vos données restent. Vous pourrez réactiver à tout moment." confirm="Mettre en pause" disabled={pause.isPending} onConfirm={() => pause.mutate({ paused: true })} />}
        </div>
        <p className="m-0 text-[13px] p-muted flex items-center gap-1.5"><ExternalLink size={13} /> Les factures et le moyen de paiement s’ouvrent dans le portail sécurisé de Stripe.</p>
      </section>
      {!s.cancelAtPeriodEnd && (leaving ? <CancelForm onClose={() => setLeaving(false)} /> : (
        <section className="p-soft p-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[14.5px] p-muted">Vous souhaitez arrêter ? Vous pouvez aussi simplement mettre votre abonnement en pause.</span>
          <button type="button" className="p-btn-ghost p-btn-sm" style={{ color: "var(--p-accent-text)" }} onClick={() => setLeaving(true)}>Résilier mon abonnement</button>
        </section>
      ))}
    </>
  );
}

/** Avant de partir : pourquoi ? La réponse arrive à Laura, puis Stripe confirme la résiliation. */
function CancelForm({ onClose }: { onClose: () => void }) {
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [comment, setComment] = useState("");
  const cancel = trpc.account.cancel.useMutation({ onSuccess: (r) => go(r.url), onError: (e) => toast.error(e.message) });
  const toggle = (r: Reason) => setReasons((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]));
  return (
    <form className="p-card p-5 sm:p-6 flex flex-col gap-3" aria-label="Résilier mon abonnement" style={{ borderColor: "var(--p-accent-line)" }} onSubmit={(e) => { e.preventDefault(); cancel.mutate({ reasons, comment }); }}>
      <span className="serif text-[24px] leading-tight">Avant de partir, pouvez-vous nous dire pourquoi ?</span>
      <span className="text-[14px] p-muted">Votre réponse aide Laura à améliorer le réseau. Plusieurs choix sont possibles.</span>
      <div className="flex flex-col gap-1">
        {REASONS.map(([k, l]) => (
          <label key={k} className="flex items-center gap-3 min-h-[40px] cursor-pointer text-[15px]">
            <input type="checkbox" className="w-[19px] h-[19px] flex-none" style={{ accentColor: "var(--p-accent)" }} checked={reasons.includes(k)} onChange={() => toggle(k)} /> {l}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Un mot pour nous aider à nous améliorer (facultatif)</span><textarea className="p-field" rows={3} maxLength={1500} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="p-btn-primary p-btn-sm" disabled={cancel.isPending || (!reasons.length && !comment.trim())}>{cancel.isPending ? "Ouverture de Stripe…" : "Continuer vers la résiliation"}</button>
        <button type="button" className="p-btn-outline p-btn-sm" onClick={onClose}>Je reste</button>
      </div>
      <span className="text-[12.5px] p-faint">Stripe vous demandera de confirmer. Votre accès reste ouvert jusqu’à la fin de la période déjà payée.</span>
    </form>
  );
}
