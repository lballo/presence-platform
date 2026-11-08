import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Check, ExternalLink, Lock, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { CreatorShell } from "@/pages/admin/construire/CreatorShell";
import { ConfirmButton } from "@/pages/admin/shared";
import { ago, parisDateYear, parisHour, parisLongDate } from "@/lib/format";
import { CoachingNav } from "./CoachingLayout";

type Fiche = RouterOutputs["coaching"]["engagement"];
type Meeting = Fiche["meetings"][number];

const TABS = [["preparer", "Préparer la séance"], ["seances", "Séances et comptes rendus"], ["objectifs", "Objectifs"], ["notes", "Notes privées"], ["client", "Pour le client"], ["carnet", "Carnet du client"], ["satisfaction", "Satisfaction"]] as const;
type Tab = (typeof TABS)[number][0];
const when = (d: Date | string | null) => (d ? `${parisLongDate(new Date(d))} · ${parisHour(new Date(d))}` : "Date à fixer");
const label = (m: Pick<Meeting, "kind" | "number">) => `${m.kind || "Séance"}${m.number ? ` n° ${m.number}` : ""}`;

/** La fiche d'un accompagnement : séances, comptes rendus, objectifs, notes privées, et ce que le client reçoit. */
export default function CoachingClient() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get("onglet"))?.[0] ?? "preparer") as Tab;
  const q = trpc.coaching.engagement.useQuery({ id: Number(id) }, { enabled: !!Number(id), retry: false });
  const f = q.data;
  return (
    <CreatorShell aside={<CoachingNav />} crumbs={[{ label: "Suivi coaching", to: "/admin/coaching" }, { label: f?.clientName ?? "…" }]} actions={f && <a href={f.notionUrl} target="_blank" rel="noopener" className="cr-btn"><ExternalLink size={15} /> Ouvrir dans Notion</a>}>
      <main className="px-4 lg:px-10 py-8 flex flex-col gap-6 max-w-[1100px] w-full">
        {q.error && <div className="p-soft p-6">{q.error.message} <Link to="/admin/coaching" className="p-link">Retour</Link></div>}
        {f && (
          <>
            <Header f={f} />
            <div role="tablist" aria-label="Fiche de l’accompagnement" className="flex gap-6 overflow-x-auto border-b" style={{ borderColor: "var(--p-line)", scrollbarWidth: "none" }}>
              {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className="cr-tab" onClick={() => setParams(k === "preparer" ? {} : { onglet: k }, { replace: true })}>{l}{k === "preparer" && f.marked.some((x) => !x.discussedAt) ? ` · ${f.marked.filter((x) => !x.discussedAt).length}` : ""}</button>)}
            </div>
            {tab === "preparer" && <Prepare f={f} />}
            {tab === "seances" && <Meetings f={f} />}
            {tab === "objectifs" && <Goals f={f} />}
            {tab === "notes" && <Notes f={f} />}
            {tab === "client" && <ForClient f={f} />}
            {tab === "carnet" && <Notebook f={f} />}
            {tab === "satisfaction" && <Satisfaction f={f} />}
          </>
        )}
      </main>
    </CreatorShell>
  );
}

function Header({ f }: { f: Fiche }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="m-0 text-[28px]">{f.clientName}</h1>
          <span className="text-[14px] p-muted">{f.title}{f.startsOn ? ` · depuis le ${parisDateYear(new Date(`${f.startsOn}T12:00:00`))}` : ""}</span>
        </div>
        <span className="p-pill">{f.status || "Sans statut"}</span>
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
        <Fact title="Séances" value={`${f.done}${f.planned ? ` sur ${f.planned}` : ""}${f.remaining !== null ? ` · ${f.remaining} restante${f.remaining > 1 ? "s" : ""}` : ""}`} />
        <Fact title="Prochaine séance" value={f.next ? when(f.next.startsAt) : "Aucune planifiée"} />
        <Fact title="Fin d’accès au réseau" value={f.accessEndsAt ? `${parisDateYear(new Date(f.accessEndsAt))}${f.offer?.presenceAccess ? (f.accessAppliedAt ? " · reportée sur sa fiche" : "") : " · offre sans « Accès Présence inclus »"}` : "Pas de date de fin connue"} />
        <Fact title="Invitation de mi-parcours" value={f.midpointEmailAt ? `Envoyée ${ago(new Date(f.midpointEmailAt))}` : "Pas encore envoyée"} />
      </div>
      {f.member ? <span className="text-[13px] p-muted">Compte Présence : <Link to={`/membres/${f.member.id}`} className="p-link">{f.member.name}</Link></span> : <span className="text-[13px]" style={{ color: "var(--p-accent-text)" }}>Aucun compte Présence à l’adresse du CRM{f.clientEmail ? ` (${f.clientEmail})` : ""} : invitez ce client, ou corrigez l’adresse dans Notion.</span>}
    </section>
  );
}

function Fact({ title, value }: { title: string; value: string }) {
  return <div className="p-soft p-3.5 flex flex-col gap-0.5"><span className="text-[11.5px] font-semibold uppercase tracking-[0.16em] p-muted">{title}</span><span className="text-[14px]">{value}</span></div>;
}

/** Préparer la séance : le dernier compte rendu, les objectifs et les réponses marquées, sur un seul écran. */
function Prepare({ f }: { f: Fiche }) {
  const utils = trpc.useUtils();
  const last = [...f.meetings].reverse().find((m) => m.keyPoints || m.actions);
  const set = trpc.coaching.setDiscussed.useMutation({ onSuccess: (_r, v) => { utils.coaching.invalidate(); toast.success(v.discussed ? "Marquée comme abordée" : "De nouveau à aborder"); }, onError: (e) => toast.error(e.message) });
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
      <section className="p-card p-5 flex flex-col gap-3" aria-label="Dernier compte rendu">
        <h2 className="m-0 text-[20px]">Dernier compte rendu</h2>
        {last ? (
          <>
            <span className="text-[13px] p-muted">{label(last)} · {when(last.startsAt)}{last.shared ? " · partagé avec le client" : " · non partagé"}</span>
            {last.keyPoints && <Block title="Points clés travaillés" text={last.keyPoints} />}
            {last.actions && <Block title="Actions pour le client" text={last.actions} />}
          </>
        ) : <p className="m-0 text-[14px] p-muted">Aucun compte rendu pour l’instant.</p>}
      </section>
      <section className="p-card p-5 flex flex-col gap-3" aria-label="Objectifs">
        <h2 className="m-0 text-[20px]">Objectifs</h2>
        {f.goals.map((g) => <span key={g.id} className={`text-[14.5px] flex items-start gap-2 ${g.done ? "p-muted line-through" : ""}`}><Check size={15} className="flex-none mt-0.5" style={{ opacity: g.done ? 1 : 0.25 }} /> {g.text}</span>)}
        {!f.goals.length && <p className="m-0 text-[14px] p-muted">Aucun objectif posé.</p>}
        {f.notes[0] && <><h3 className="m-0 mt-2 text-[15px] flex items-center gap-1.5"><Lock size={13} /> Dernière note privée</h3><p className="m-0 text-[14px] whitespace-pre-line">{f.notes[0].text}</p></>}
      </section>
      <section className="p-card p-5 flex flex-col gap-3" style={{ gridColumn: "1 / -1" }} aria-label="Réponses marquées">
        <h2 className="m-0 text-[20px]">Réponses marquées « À travailler en coaching »</h2>
        {f.marked.map((r) => (
          <article key={r.id} className="p-soft p-4 flex flex-col gap-1.5" style={r.discussedAt ? { opacity: 0.7 } : undefined}>
            <span className="text-[12.5px] p-muted">{[r.courseTitle, r.sectionTitle, r.lessonTitle].filter(Boolean).join(" › ")}{r.markedAt ? ` · marquée ${ago(new Date(r.markedAt))}` : ""}</span>
            {r.question && <span className="text-[14px] font-medium">{r.question}</span>}
            <p className="m-0 text-[14.5px] leading-relaxed whitespace-pre-line">{r.answer ?? "Réponse illisible."}</p>
            <button type="button" className="p-btn-ghost self-start text-[13px]" disabled={set.isPending} onClick={() => set.mutate({ id: r.id, discussed: !r.discussedAt })}>{r.discussedAt ? <><Undo2 size={13} /> De nouveau à aborder</> : <><Check size={13} /> Abordée en séance</>}</button>
          </article>
        ))}
        {!f.marked.length && <p className="m-0 text-[14px] p-muted">Aucune réponse marquée par le client.</p>}
        {f.journal[0] && <><h3 className="m-0 mt-2 text-[15px]">Dernière page de son carnet</h3><p className="m-0 text-[14px] whitespace-pre-line">{f.journal[0].text}</p></>}
      </section>
    </div>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return <div className="flex flex-col gap-1"><span className="text-[11.5px] font-semibold uppercase tracking-[0.16em] p-muted">{title}</span><p className="m-0 text-[14.5px] leading-relaxed whitespace-pre-line">{text}</p></div>;
}

/** Une séance par carte ; son compte rendu s'écrit ici et part dans Notion. */
function Meetings({ f }: { f: Fiche }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Séances">
      <p className="m-0 text-[13.5px] p-muted">Les séances viennent de la base Sessions. Le compte rendu s’écrit ici et part dans la page Notion de la séance ; partagé, il devient visible du client dans Mon parcours.</p>
      {[...f.meetings].reverse().map((m) => <MeetingCard key={m.id} m={m} />)}
      {!f.meetings.length && <div className="p-soft p-7 text-center p-muted">Aucune séance reliée à cette inscription dans Notion.</div>}
    </section>
  );
}

function MeetingCard({ m }: { m: Meeting }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [r, setR] = useState({ keyPoints: m.keyPoints, actions: m.actions, shared: m.shared });
  useEffect(() => { setR({ keyPoints: m.keyPoints, actions: m.actions, shared: m.shared }); }, [m.keyPoints, m.actions, m.shared]);
  const save = trpc.coaching.saveReport.useMutation({ onSuccess: (_x, v) => { utils.coaching.invalidate(); toast.success(v.shared ? "Compte rendu enregistré dans Notion et partagé avec le client" : "Compte rendu enregistré dans Notion"); }, onError: (e) => toast.error(e.message, { duration: 9000 }) });
  const changed = r.keyPoints !== m.keyPoints || r.actions !== m.actions || r.shared !== m.shared;
  return (
    <article className="p-card p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-[1_1_240px] min-w-0 flex flex-col"><span className="font-semibold">{label(m)}</span><span className="text-[13px] p-muted">{when(m.startsAt)}</span></span>
        <span className="p-pill">{m.state}</span>
        {(m.keyPoints || m.actions) && <span className="text-[12.5px] p-muted">{m.shared ? "Partagé" : "Non partagé"}</span>}
        <button type="button" className="cr-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Fermer" : m.keyPoints || m.actions ? "Compte rendu" : "Écrire le compte rendu"}</button>
      </div>
      {open && (
        <form className="flex flex-col gap-3 pt-3 border-t" style={{ borderColor: "var(--p-line)" }} onSubmit={(e) => { e.preventDefault(); save.mutate({ meetingId: m.id, ...r }); }}>
          <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Points clés travaillés</span><textarea className="p-field" rows={4} maxLength={8000} value={r.keyPoints} onChange={(e) => setR({ ...r, keyPoints: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Actions pour le client</span><textarea className="p-field" rows={3} maxLength={8000} value={r.actions} onChange={(e) => setR({ ...r, actions: e.target.value })} /></label>
          <label className="flex items-center gap-2.5 text-[14px] cursor-pointer"><input type="checkbox" className="w-[18px] h-[18px]" style={{ accentColor: "var(--p-accent)" }} checked={r.shared} onChange={(e) => setR({ ...r, shared: e.target.checked })} /> Partager avec le client (« Compte rendu validé » dans Notion)</label>
          <span className="flex flex-wrap items-center gap-2">
            <button type="submit" className="cr-btn cr-btn-primary" disabled={!changed || save.isPending}>{save.isPending ? "Envoi vers Notion…" : "Enregistrer dans Notion"}</button>
            <a href={m.notionUrl} target="_blank" rel="noopener" className="p-btn-ghost text-[13px]"><ExternalLink size={13} /> La séance dans Notion</a>
          </span>
        </form>
      )}
    </article>
  );
}

function Goals({ f }: { f: Fiche }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.coaching.engagement.invalidate();
  const [draft, setDraft] = useState("");
  const add = trpc.coaching.addGoal.useMutation({ onSuccess: () => { refresh(); setDraft(""); }, onError: (e) => toast.error(e.message) });
  const update = trpc.coaching.updateGoal.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = trpc.coaching.removeGoal.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  return (
    <section className="p-card p-5 flex flex-col gap-3 max-w-[760px]" aria-label="Objectifs">
      <p className="m-0 text-[13.5px] p-muted">Visibles du client dans Mon parcours › Mon accompagnement.</p>
      {f.goals.map((g) => (
        <div key={g.id} className="flex items-center gap-3">
          <input type="checkbox" className="w-[18px] h-[18px] flex-none" style={{ accentColor: "var(--p-accent)" }} aria-label={`Atteint : ${g.text}`} checked={g.done} onChange={(e) => update.mutate({ id: g.id, done: e.target.checked })} />
          <span className={`flex-1 text-[15px] ${g.done ? "p-muted line-through" : ""}`}>{g.text}</span>
          <ConfirmButton label={<Trash2 size={14} />} className="cr-icon" question="Retirer cet objectif ?" confirm="Retirer" danger onConfirm={() => remove.mutate({ id: g.id })} />
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add.mutate({ engagementId: f.id, text: draft }); }}>
        <input className="p-field" value={draft} maxLength={600} onChange={(e) => setDraft(e.target.value)} placeholder="Nouvel objectif" aria-label="Nouvel objectif" />
        <button type="submit" className="cr-btn cr-btn-primary" disabled={!draft.trim() || add.isPending}><Plus size={15} /> Ajouter</button>
      </form>
    </section>
  );
}

function Notes({ f }: { f: Fiche }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.coaching.engagement.invalidate();
  const [draft, setDraft] = useState("");
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const add = trpc.coaching.addNote.useMutation({ onSuccess: () => { refresh(); setDraft(""); toast.success("Note privée enregistrée"); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.coaching.removeNote.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  return (
    <section className="flex flex-col gap-3 max-w-[760px]" aria-label="Notes privées">
      <p className="m-0 text-[13.5px] p-muted flex items-center gap-1.5"><Lock size={13} /> Chiffrées, jamais visibles du client.</p>
      <form className="p-card p-4 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add.mutate({ engagementId: f.id, meetingId, text: draft }); }}>
        <textarea className="p-field" rows={4} maxLength={8000} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Nouvelle note privée" placeholder="Ce que j’observe, ce que je garde pour moi…" />
        <span className="flex flex-wrap items-center gap-2">
          <select className="p-field w-auto" value={meetingId ?? ""} onChange={(e) => setMeetingId(e.target.value ? Number(e.target.value) : null)} aria-label="Séance concernée"><option value="">Toute l’accompagnement</option>{f.meetings.map((m) => <option key={m.id} value={m.id}>{label(m)}{m.startsAt ? ` · ${parisLongDate(new Date(m.startsAt))}` : ""}</option>)}</select>
          <button type="submit" className="cr-btn cr-btn-primary" disabled={!draft.trim() || add.isPending}>Enregistrer la note</button>
        </span>
      </form>
      {f.notes.map((n) => {
        const m = f.meetings.find((x) => x.id === n.meetingId);
        return (
          <article key={n.id} className="p-soft p-4 flex flex-col gap-1.5">
            <span className="text-[12.5px] p-muted">{ago(new Date(n.createdAt))}{m ? ` · ${label(m)}` : ""}</span>
            <p className="m-0 text-[14.5px] leading-relaxed whitespace-pre-line">{n.text}</p>
            <ConfirmButton label={<><Trash2 size={13} /> Effacer</>} className="p-btn-ghost self-start text-[13px]" question="Effacer cette note privée ?" confirm="Effacer" danger onConfirm={() => remove.mutate({ id: n.id })} />
          </article>
        );
      })}
    </section>
  );
}

function ForClient({ f }: { f: Fiche }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ inspiration: f.inspiration, exercise: f.exercise });
  const save = trpc.coaching.setForClient.useMutation({ onSuccess: () => { utils.coaching.invalidate(); toast.success("Visible du client dans Mon accompagnement"); }, onError: (e) => toast.error(e.message) });
  const changed = v.inspiration !== f.inspiration || v.exercise !== f.exercise;
  return (
    <form className="p-card p-5 flex flex-col gap-4 max-w-[760px]" aria-label="Pour le client" onSubmit={(e) => { e.preventDefault(); save.mutate({ engagementId: f.id, ...v }); }}>
      <p className="m-0 text-[13.5px] p-muted">Ce que le client retrouve dans Mon parcours › Mon accompagnement. Laissez vide pour ne rien afficher.</p>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Un exercice ou un défi à réaliser</span><textarea className="p-field" rows={4} maxLength={8000} value={v.exercise} onChange={(e) => setV({ ...v, exercise: e.target.value })} /></label>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Une inspiration (citation, phrase, lecture)</span><textarea className="p-field" rows={3} maxLength={8000} value={v.inspiration} onChange={(e) => setV({ ...v, inspiration: e.target.value })} /></label>
      <button type="submit" className="cr-btn cr-btn-primary self-start" disabled={!changed || save.isPending}>Enregistrer</button>
    </form>
  );
}

function Notebook({ f }: { f: Fiche }) {
  return (
    <section className="flex flex-col gap-3 max-w-[760px]" aria-label="Carnet du client">
      <p className="m-0 text-[13.5px] p-muted">Le carnet d’introspection que le client tient entre les séances, et partage avec vous.</p>
      {f.journal.map((j) => <article key={j.id} className="p-soft p-4 flex flex-col gap-1.5"><span className="text-[12.5px] p-muted">{ago(new Date(j.createdAt))}</span><p className="m-0 text-[14.5px] leading-relaxed whitespace-pre-line">{j.text}</p></article>)}
      {!f.journal.length && <div className="p-soft p-7 text-center p-muted">Le client n’a encore rien écrit dans son carnet.</div>}
    </section>
  );
}

const NOTES = [["satisfaction", "Satisfaction générale"], ["besoin", "Réponse au besoin initial"], ["professionnalisme", "Professionnalisme"], ["disponibilite", "Disponibilité"]] as const;

/** Le questionnaire de satisfaction : le lien personnel à envoyer, et les réponses reçues dans Notion. */
function Satisfaction({ f }: { f: Fiche }) {
  const q = trpc.coaching.satisfaction.useQuery({ id: f.id }, { retry: false });
  const s = q.data;
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); toast.success("Lien copié"); } catch { toast.error("Copie impossible : sélectionnez le lien."); } };
  return (
    <section className="flex flex-col gap-4 max-w-[760px]" aria-label="Satisfaction">
      <div className="p-card p-5 flex flex-col gap-3">
        <p className="m-0 text-[13.5px] p-muted">Le lien personnel du questionnaire, à envoyer à la fin de l’accompagnement (mail de J+7). Le client répond sans se connecter ; sa réponse arrive dans Notion, reliée à cette inscription. Quand l’inscription passe à « Terminé », le lien apparaît aussi dans son espace Coaching.</p>
        {q.isLoading && <span className="p-muted text-[14px]">Chargement…</span>}
        {s && (s.url
          ? <div className="flex flex-wrap items-center gap-2"><input className="p-field flex-[1_1_320px]" readOnly value={s.url} onFocus={(e) => e.target.select()} aria-label="Lien du questionnaire" /><button type="button" className="cr-btn cr-btn-primary" onClick={() => copy(s.url!)}>Copier le lien</button></div>
          : <span className="text-[14px]" style={{ color: "var(--p-accent-text)" }}>La clé PRIVATE_DATA_KEY manque sur le serveur : le lien ne peut pas être signé.</span>)}
      </div>
      {s?.error && <div className="p-soft p-4 text-[14px]" style={{ color: "var(--p-accent-text)" }}>{s.error}</div>}
      {s?.responses.map((r) => (
        <article key={r.id} className="p-card p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] p-muted">{r.at ? `Reçue ${ago(new Date(r.at))}` : "Réponse"}</span>
            <span className="flex items-center gap-2">{r.status && <span className="p-pill">{r.status}</span>}<a href={r.notionUrl} target="_blank" rel="noopener" className="p-link text-[13px] flex items-center gap-1"><ExternalLink size={13} /> Notion</a></span>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))" }}>
            {NOTES.map(([k, l]) => <Fact key={k} title={l} value={r[k] !== null ? `${r[k]} / 5` : "—"} />)}
          </div>
          {r.remarques && <p className="m-0 text-[14.5px] leading-relaxed whitespace-pre-line">{r.remarques}</p>}
        </article>
      ))}
      {s && !s.error && !s.responses.length && <div className="p-soft p-7 text-center p-muted">Pas encore de réponse pour cet accompagnement.</div>}
    </section>
  );
}
