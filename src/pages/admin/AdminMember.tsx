import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Copy, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { parisIso, parisToDate } from "@/lib/format";
import { InviteForm } from "./AdminMembers";
import { Badge, ConfirmButton, Select } from "./shared";
import { ACCESS_LABEL, ROLE_LABEL, STATE_LABEL, fullDate, stateTone } from "./labels";

type Fiche = RouterOutputs["admin"]["member"];

export default function AdminMember() {
  const id = Number(useParams().id);
  const me = trpc.members.me.useQuery();
  const q = trpc.admin.member.useQuery({ id }, { retry: false });
  const back = <Link to="/admin/membres" className="p-btn-outline p-btn-sm no-underline self-start"><ArrowLeft size={15} /> Tous les membres</Link>;
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (!q.data) return <div className="flex flex-col gap-4">{back}<p className="p-muted m-0">{q.error?.message ?? "Membre introuvable"}</p></div>;
  const m = q.data;
  const deleted = m.state === "supprime";
  const isMe = me.data?.id === m.id;
  return (
    <div className="flex flex-col gap-5">
      {back}
      <header className="flex flex-wrap items-center gap-4">
        <Avatar m={m} size={64} />
        <div className="flex-[1_1_220px] min-w-0 flex flex-col gap-1">
          <h2 className="m-0 text-[32px] leading-tight break-words">{m.name}</h2>
          <span className="text-[14px] p-muted break-all">{m.email ?? "Aucune adresse e-mail"}</span>
          <span className="flex flex-wrap items-center gap-1.5 mt-0.5"><Badge tone={stateTone(m.state)}>{STATE_LABEL[m.state]}</Badge>{isMe && <Badge>Vous</Badge>}</span>
        </div>
        {!deleted && <Link to={`/membres/${m.id}`} className="p-btn-outline p-btn-sm no-underline"><ExternalLink size={14} /> Voir le profil</Link>}
      </header>

      <dl className="p-card p-4 sm:p-5 m-0 grid gap-x-6 gap-y-2.5 grid-cols-1 sm:grid-cols-2 text-[14.5px]">
        <Fact label="Fiche créée le" value={fullDate(m.createdAt)} />
        <Fact label="Invitation" value={m.invitedAt ? `Envoyée le ${fullDate(m.invitedAt)}` : "Pas encore envoyée"} />
        <Fact label="Mot de passe choisi" value={m.joinedAt ? `Le ${fullDate(m.joinedAt)}` : "Pas encore"} />
        <Fact label="Parcours d’accueil" value={m.onboardingDone ? "Fait" : "Pas encore"} />
        <Fact label="Réunion de bienvenue" value={m.welcomeAttended ? "Présent·e" : m.welcomeRegistered ? "Inscrit·e" : "Pas inscrit·e"} />
        <Fact label="Miel" value={`${m.honey} miels`} />
        <Fact label="Publications" value={String(m.posts)} />
      </dl>

      {!deleted && <AccessForm m={m} isMe={isMe} />}
      {!deleted && <Invitation m={m} />}
      {!deleted && !isMe && <AccountActions m={m} />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-3 min-w-0"><dt className="p-muted flex-none">{label}</dt><dd className="m-0 text-right min-w-0">{value}</dd></div>;
}

/** Rôle, type d'accès, date de fin d'accès. */
function AccessForm({ m, isMe }: { m: Fiche; isMe: boolean }) {
  const utils = trpc.useUtils();
  const initialEnds = m.accessEndsAt ? parisIso(new Date(m.accessEndsAt)) : "";
  const [f, setF] = useState({ role: m.role, accessType: m.accessType, ends: initialEnds });
  const save = trpc.admin.updateMember.useMutation({ onSuccess: () => { utils.admin.invalidate(); utils.members.invalidate(); toast.success("Fiche enregistrée"); }, onError: (e) => toast.error(e.message) });
  const dirty = f.role !== m.role || f.accessType !== m.accessType || f.ends !== initialEnds;
  return (
    <section className="p-card p-4 sm:p-5 flex flex-col gap-3.5" aria-label="Rôle et accès">
      <h3 className="m-0 text-[22px]">Rôle et accès</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {isMe ? <div className="flex flex-col gap-1 text-[13px] p-muted"><span>Rôle</span><span className="p-field flex items-center" style={{ color: "var(--p-ink)" }}>{ROLE_LABEL[m.role]}</span></div> : <Select label="Rôle" value={f.role} onChange={(role) => setF({ ...f, role })} options={Object.entries(ROLE_LABEL) as [Fiche["role"], string][]} />}
        <Select label="Type d’accès" value={f.accessType} onChange={(accessType) => setF({ ...f, accessType })} options={Object.entries(ACCESS_LABEL) as [Fiche["accessType"], string][]} />
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Date de fin d’accès</span><input className="p-field" type="date" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></label>
      </div>
      <span className="flex flex-wrap items-center gap-2">
        <button type="button" className="p-btn-primary p-btn-sm" disabled={!dirty || save.isPending} onClick={() => save.mutate({ id: m.id, role: f.role, accessType: f.accessType, accessEndsAt: f.ends ? parisToDate(f.ends, "23:59") : null })}>Enregistrer</button>
        {f.ends && <button type="button" className="p-btn-ghost" onClick={() => setF({ ...f, ends: "" })}>Sans date de fin</button>}
      </span>
    </section>
  );
}

function Invitation({ m }: { m: Fiche }) {
  const utils = trpc.useUtils();
  const [url, setUrl] = useState("");
  const resend = trpc.admin.resendInvitation.useMutation({ onSuccess: (r) => { utils.admin.invalidate(); setUrl(r.url); toast.success("Invitation renvoyée"); }, onError: (e) => toast.error(e.message) });
  if (m.joinedAt) return null;
  if (!m.email) return <section className="flex flex-col gap-2.5" aria-label="Invitation"><h3 className="m-0 text-[22px]">Inviter cette personne</h3><InviteForm fiche={m} /></section>;
  return (
    <section className="p-card p-4 sm:p-5 flex flex-col gap-2.5" aria-label="Invitation">
      <h3 className="m-0 text-[22px]">Invitation</h3>
      <p className="m-0 text-[14.5px] p-muted">{m.invitationExpiresAt ? `Lien valable jusqu’au ${fullDate(m.invitationExpiresAt)}.` : "Aucun lien en cours."} Un nouvel envoi remplace le lien précédent.</p>
      <span className="flex flex-wrap gap-2">
        <button type="button" className="p-btn-primary p-btn-sm" disabled={resend.isPending} onClick={() => resend.mutate({ id: m.id })}><Send size={14} /> Renvoyer l’invitation</button>
        {url && <button type="button" className="p-btn-outline p-btn-sm" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Lien copié"); }}><Copy size={14} /> Copier le lien</button>}
      </span>
    </section>
  );
}

/** Suspendre, réactiver, supprimer. */
function AccountActions({ m }: { m: Fiche }) {
  const utils = trpc.useUtils();
  const refresh = () => { utils.admin.invalidate(); utils.members.invalidate(); };
  const suspend = trpc.admin.setSuspended.useMutation({ onSuccess: (_r, v) => { refresh(); toast.success(v.suspended ? "Compte suspendu" : "Compte réactivé"); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.admin.deleteMember.useMutation({ onSuccess: () => { refresh(); setStep(0); toast.success("Membre supprimé, ses publications restent en ligne"); }, onError: (e) => toast.error(e.message) });
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const blocked = m.state === "suspendu" || m.state === "termine";
  return (
    <section className="p-card p-4 sm:p-5 flex flex-col gap-3" aria-label="Compte">
      <h3 className="m-0 text-[22px]">Compte</h3>
      <span className="flex flex-wrap gap-2">
        {blocked ? <button type="button" className="p-btn-primary p-btn-sm" disabled={suspend.isPending} onClick={() => suspend.mutate({ id: m.id, suspended: false })}>Réactiver le compte</button>
          : <ConfirmButton label="Suspendre le compte" question={`Suspendre ${m.firstName} ? La personne ne pourra plus se connecter tant que le compte n’est pas réactivé.`} confirm="Suspendre" disabled={suspend.isPending} onConfirm={() => suspend.mutate({ id: m.id, suspended: true })} />}
        {step === 0 && <button type="button" className="p-btn-outline p-btn-sm" style={{ color: "var(--p-accent-text)" }} onClick={() => setStep(1)}>Supprimer ce membre</button>}
      </span>
      {step === 1 && (
        <div className="p-3.5 rounded-xl flex flex-col gap-2.5 text-[14.5px]" style={{ background: "var(--p-accent-soft)" }}>
          <p className="m-0"><b>Première confirmation.</b> Le compte sera désactivé et le profil anonymisé : nom, photo, bio et adresse e-mail disparaissent. Ses publications et ses messages restent, sous le nom « Membre supprimé ». Cette action ne s’annule pas.</p>
          <span className="flex flex-wrap gap-2">
            <button type="button" className="p-btn-primary p-btn-sm" onClick={() => setStep(2)}>Continuer</button>
            <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setStep(0)}>Annuler</button>
          </span>
        </div>
      )}
      {step === 2 && (
        <form className="p-3.5 rounded-xl flex flex-col gap-2.5 text-[14.5px]" style={{ background: "var(--p-accent-soft)" }} onSubmit={(e) => { e.preventDefault(); if (typed === "SUPPRIMER") remove.mutate({ id: m.id, confirm: typed }); }}>
          <label className="flex flex-col gap-1.5"><span><b>Dernière confirmation.</b> Écrivez SUPPRIMER pour supprimer {m.name}.</span><input className="p-field" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} /></label>
          <span className="flex flex-wrap gap-2">
            <button type="submit" className="p-btn-primary p-btn-sm" disabled={typed !== "SUPPRIMER" || remove.isPending}>Supprimer définitivement</button>
            <button type="button" className="p-btn-outline p-btn-sm" onClick={() => { setStep(0); setTyped(""); }}>Annuler</button>
          </span>
        </form>
      )}
    </section>
  );
}
