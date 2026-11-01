import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, ExternalLink, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/Avatar";
import { useUpload } from "@/lib/upload";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import type { CourseBlock } from "../../../../server/lib/courseBlocks";
import { Badge, Chips, ConfirmButton, Rows, Select, type Column } from "../shared";
import { ACCESS_LABEL, fullDate } from "../labels";
import { BlockEditor, HashtagPicker } from "./BlockEditor";
import { useFreshNotion } from "./useFreshNotion";
import { Outline } from "./Outline";
import { COURSE_STATUS_LABEL, PUBLIC_LABEL, RHYTHM_LABEL, notionUrl, statusTone } from "./labels";

type Course = RouterOutputs["build"]["course"];
type Tab = "sections" | "reglages" | "participants" | "stats";

/** Une formation dans Construire : ses sections et leçons, ses réglages, ses participants et ses chiffres. */
export default function BuildCourse() {
  const id = Number(useParams().id);
  const q = trpc.build.course.useQuery({ id }, { retry: false });
  const status = trpc.build.status.useQuery();
  const [tab, setTab] = useState<Tab>("sections");
  useFreshNotion(status.data);
  const [revision, setRevision] = useState(0);
  const back = <Link to="/admin/construire" className="p-btn-outline p-btn-sm no-underline self-start"><ArrowLeft size={15} /> Toutes les formations</Link>;
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (!q.data) return <div className="flex flex-col gap-4">{back}<p className="p-muted m-0">{q.error?.message ?? "Formation introuvable"}</p></div>;
  const c = q.data;
  return (
    <div className="flex flex-col gap-5">
      {back}
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-1.5">
          <h2 className="m-0 text-[32px] leading-tight break-words">{c.emoji ? `${c.emoji} ` : ""}{c.title}</h2>
          <span className="flex flex-wrap items-center gap-1.5"><Badge tone={statusTone(c.status)}>{COURSE_STATUS_LABEL[c.status]}</Badge><Badge>{PUBLIC_LABEL[c.public]}</Badge><Badge>{RHYTHM_LABEL[c.rhythm]}</Badge></span>
        </div>
        <span className="flex flex-wrap items-center gap-2"><CourseActions c={c} /><a href={notionUrl(c.notionPageId)} target="_blank" rel="noopener noreferrer" className="p-btn-outline p-btn-sm no-underline"><ExternalLink size={14} /> Ouvrir dans Notion</a></span>
      </header>
      {c.status !== "publie" && <p className="m-0 p-3 rounded-xl text-[14px]" style={{ background: "var(--p-accent-soft)" }}>Cette formation n’est pas encore publiée : les membres ne la voient pas, même si ses sections et ses leçons le sont.</p>}
      <Chips value={tab} onChange={setTab} label="Rubriques de la formation" options={[["sections", "Sections", c.sections.length], ["reglages", "Réglages"], ["participants", "Participants", c.participants.length], ["stats", "Statistiques"]]} />
      {tab === "sections" && <Outline c={c} />}
      {tab === "reglages" && <Settings key={`${revision}-${c.status}`} c={c} onSaved={() => setRevision((r) => r + 1)} />}
      {tab === "participants" && <Participants c={c} />}
      {tab === "stats" && <Stats c={c} />}
    </div>
  );
}

/** Publier ou dépublier en un clic : le statut change d'abord dans Notion. */
function CourseActions({ c }: { c: Course }) {
  const utils = trpc.useUtils();
  const set = trpc.build.setCourseStatus.useMutation({ onSuccess: (_r, v) => { utils.build.invalidate(); toast.success(v.status === "publie" ? "Formation publiée dans Notion et ici" : "Formation dépubliée dans Notion et ici"); }, onError: (e) => toast.error(e.message) });
  if (c.status === "publie") return <ConfirmButton label="Dépublier" question="Les membres ne verront plus cette formation. Leurs réponses restent dans leur journal." confirm="Dépublier" disabled={set.isPending} onConfirm={() => set.mutate({ id: c.id, status: "brouillon" })} />;
  return <ConfirmButton label="Publier la formation" className="p-btn-primary p-btn-sm" question="Les membres verront cette formation, avec ses sections et leçons publiées." confirm="Publier" disabled={set.isPending} onConfirm={() => set.mutate({ id: c.id, status: "publie" })} />;
}

function Settings({ c, onSaved }: { c: Course; onSaved: () => void }) {
  const utils = trpc.useUtils();
  const tags = trpc.hashtags.list.useQuery();
  const cover = useUpload("courseImage");
  const [f, setF] = useState({ title: c.title, tagline: c.tagline, coverUrl: c.coverUrl, public: c.public, rhythm: c.rhythm, status: c.status, position: c.position, hashtagIds: c.hashtagIds, description: c.description as CourseBlock[] });
  // Après l'écriture, on repart de la page relue : les blocs ont reçu leur identifiant Notion
  const save = trpc.build.updateCourse.useMutation({ onSuccess: async () => { await utils.build.invalidate(); onSaved(); toast.success("Enregistré dans Notion"); }, onError: (e) => toast.error(e.message) });
  return (
    <div className="flex flex-col gap-5">
      {c.issues.length > 0 && <ul className="m-0 p-3.5 pl-7 rounded-xl text-[14px] list-disc" style={{ background: "rgba(176, 134, 60, .1)" }}>{c.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
      <section className="p-card p-4 sm:p-5 flex flex-col gap-3.5" aria-label="Réglages">
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Titre</span><input className="p-field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Accroche</span><input className="p-field" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Statut" value={f.status} onChange={(status) => setF({ ...f, status })} options={Object.entries(COURSE_STATUS_LABEL) as [Course["status"], string][]} />
          <Select label="Public" value={f.public} onChange={(v) => setF({ ...f, public: v })} options={Object.entries(PUBLIC_LABEL) as [Course["public"], string][]} />
          <Select label="Rythme" value={f.rhythm} onChange={(rhythm) => setF({ ...f, rhythm })} options={Object.entries(RHYTHM_LABEL) as [Course["rhythm"], string][]} />
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Ordre d’affichage</span><input type="number" className="p-field" value={f.position} onChange={(e) => setF({ ...f, position: Number(e.target.value) })} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {f.coverUrl && <img src={f.coverUrl} alt="" className="h-20 w-36 object-cover rounded-lg" />}
          <label className="p-btn-outline p-btn-sm cursor-pointer"><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choisir la couverture" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { const r = await cover.upload(file); setF((x) => ({ ...x, coverUrl: r.publicUrl ?? "" })); } catch (err) { toast.error(err instanceof Error ? err.message : "Envoi impossible"); } }} />{cover.busy ? `Envoi… ${cover.progress ?? 0} %` : f.coverUrl ? "Changer la couverture" : "Ajouter une couverture"}</label>
          {f.coverUrl && <button type="button" className="p-btn-ghost" onClick={() => setF({ ...f, coverUrl: "" })}>Retirer</button>}
        </div>
        <div className="flex flex-col gap-1.5"><span className="text-[13px] p-muted">Hashtags</span><HashtagPicker all={tags.data ?? []} value={f.hashtagIds} onChange={(hashtagIds) => setF({ ...f, hashtagIds })} /></div>
        <div className="flex flex-col gap-1.5"><span className="text-[13px] p-muted">Présentation de la formation</span><BlockEditor label="Présentation" blocks={f.description} onChange={(description) => setF({ ...f, description })} /></div>
        <button type="button" className="p-btn-primary p-btn-sm self-start" disabled={!f.title.trim() || save.isPending} onClick={() => save.mutate({ id: c.id, ...f, description: f.description as never })}>{save.isPending ? "Écriture dans Notion…" : "Enregistrer"}</button>
      </section>
      {c.public === "attribution" && <Assignments c={c} />}
      <DeleteCourse c={c} />
    </div>
  );
}

function DeleteCourse({ c }: { c: Course }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const remove = trpc.build.archiveCourse.useMutation({ onSuccess: () => { utils.build.invalidate(); toast.success("Formation supprimée, à la corbeille de Notion"); navigate("/admin/construire"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  if (!open) return <button type="button" className="p-btn-ghost self-start" onClick={() => setOpen(true)}><Trash2 size={14} /> Supprimer cette formation</button>;
  return (
    <form className="p-3.5 rounded-xl flex flex-col gap-2.5 text-[14.5px]" style={{ background: "var(--p-accent-soft)" }} onSubmit={(e) => { e.preventDefault(); if (typed === "SUPPRIMER") remove.mutate({ id: c.id }); }}>
      <label className="flex flex-col gap-1.5"><span>La formation, ses {c.sections.length} sections et leurs leçons partent à la corbeille de Notion et disparaissent pour {c.participants.length} participant{c.participants.length > 1 ? "s" : ""}. Leurs réponses restent dans leur journal. Écrivez SUPPRIMER pour confirmer.</span><input className="p-field" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} /></label>
      <span className="flex flex-wrap gap-2"><button type="submit" className="p-btn-primary p-btn-sm" disabled={typed !== "SUPPRIMER" || remove.isPending}>Supprimer la formation</button><button type="button" className="p-btn-outline p-btn-sm" onClick={() => { setOpen(false); setTyped(""); }}>Annuler</button></span>
    </form>
  );
}

/** À qui cette formation est ouverte : un membre, un type d'accès ou une étiquette. */
function Assignments({ c }: { c: Course }) {
  const utils = trpc.useUtils();
  const members = trpc.admin.members.useQuery();
  const tags = trpc.build.tags.useQuery();
  const [kind, setKind] = useState<"member" | "access" | "tag">("member");
  const [member, setMember] = useState("");
  const [access, setAccess] = useState<keyof typeof ACCESS_LABEL>("individuel");
  const [tag, setTag] = useState("");
  const [newTag, setNewTag] = useState("");
  const refresh = () => { utils.build.course.invalidate({ id: c.id }); utils.build.tags.invalidate(); };
  const assign = trpc.build.assign.useMutation({ onSuccess: () => { refresh(); toast.success("Formation attribuée"); setMember(""); setTag(""); }, onError: (e) => toast.error(e.message) });
  const unassign = trpc.build.unassign.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const createTag = trpc.build.createTag.useMutation({ onSuccess: (t) => { refresh(); setTag(String(t.id)); setNewTag(""); }, onError: (e) => toast.error(e.message) });
  const people = useMemo(() => (members.data ?? []).filter((m) => m.state !== "supprime"), [members.data]);
  return (
    <section className="p-card p-4 sm:p-5 flex flex-col gap-3" aria-label="Attribution">
      <h3 className="m-0 text-[22px]">Attribuée à</h3>
      {c.assignments.length === 0 && <p className="m-0 text-[14px] p-muted">Personne pour l’instant : seuls les membres à qui vous donnez l’accès complet la voient.</p>}
      <div className="flex flex-wrap gap-1.5">
        {c.assignments.map((a) => <span key={a.id} className="p-chip h-9 cursor-default">{a.accessType ? `Accès ${ACCESS_LABEL[a.accessType].toLowerCase()}` : a.tagId ? `Étiquette ${a.label}` : a.label}<button type="button" aria-label={`Retirer ${a.label || a.accessType}`} className="ml-1 p-muted" onClick={() => unassign.mutate({ id: a.id })}>×</button></span>)}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Attribuer à" value={kind} onChange={setKind} options={[["member", "Un membre"], ["access", "Un type d’accès"], ["tag", "Une étiquette"]]} />
        {kind === "member" && <Select label="Membre" value={member} onChange={setMember} options={[["", "Choisir…"], ...people.map((m): [string, string] => [String(m.id), m.name])]} />}
        {kind === "access" && <Select label="Type d’accès" value={access} onChange={setAccess} options={Object.entries(ACCESS_LABEL) as [keyof typeof ACCESS_LABEL, string][]} />}
        {kind === "tag" && <Select label="Étiquette" value={tag} onChange={setTag} options={[["", "Choisir…"], ...(tags.data ?? []).map((t): [string, string] => [String(t.id), `${t.name} (${t.members})`])]} />}
        <button type="button" className="p-btn-primary p-btn-sm h-[46px]" disabled={assign.isPending || (kind === "member" && !member) || (kind === "tag" && !tag)} onClick={() => assign.mutate({ courseId: c.id, ...(kind === "member" ? { memberId: Number(member) } : kind === "access" ? { accessType: access } : { tagId: Number(tag) }) })}>Attribuer</button>
      </div>
      {kind === "tag" && <form className="flex flex-wrap gap-2 items-center" onSubmit={(e) => { e.preventDefault(); if (newTag.trim()) createTag.mutate({ name: newTag.trim() }); }}><input className="p-field h-10 py-0 flex-[1_1_200px] text-[14px]" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nouvelle étiquette, par exemple Promotion 2027" aria-label="Nouvelle étiquette" /><button type="submit" className="p-btn-outline p-btn-sm" disabled={!newTag.trim()}>Créer</button></form>}
    </section>
  );
}

function Participants({ c }: { c: Course }) {
  const utils = trpc.useUtils();
  const members = trpc.admin.members.useQuery();
  const [pick, setPick] = useState("");
  const access = trpc.build.setFullAccess.useMutation({ onSuccess: (_r, v) => { utils.build.course.invalidate({ id: c.id }); setPick(""); toast.success(v.on ? "Accès complet donné : toutes les sections sont ouvertes" : "Accès complet retiré : retour au calendrier, ses réponses sont conservées"); }, onError: (e) => toast.error(e.message) });
  const status = trpc.build.status.useQuery();
  const remind = trpc.build.sendReminders.useMutation({
    onSuccess: (r) => {
      utils.build.course.invalidate({ id: c.id });
      const skipped = r.results.filter((x) => x.status !== "envoye");
      if (r.sent) toast.success(`${r.sent} relance${r.sent > 1 ? "s" : ""} envoyée${r.sent > 1 ? "s" : ""} par e-mail`);
      for (const x of skipped.slice(0, 5)) toast.info(`${x.name} : ${x.reasonLabel}`, { duration: 7000 });
    },
    onError: (e) => toast.error(e.message),
  });
  const emailReady = !!status.data?.emailReady;
  const inactive = c.participants.filter((p) => p.inactive && p.reminder && !p.unsubscribed);
  type Row = Course["participants"][number];
  const columns: Column<Row>[] = [
    { key: "name", label: "Membre", cell: (p) => <span className="flex items-center gap-3 min-w-0"><Avatar m={p} size={34} /><span className="flex flex-col min-w-0"><span className="font-semibold truncate">{p.name}</span><span className="text-[12.5px] p-muted">Commencée le {fullDate(p.startedAt)}</span></span></span> },
    { key: "done", label: "Leçons terminées", short: "Terminées", cell: (p) => `${p.done} sur ${p.total}` },
    { key: "last", label: "Dernière activité", short: "Activité", cell: (p) => <span className="flex flex-col"><span>{fullDate(p.lastActivityAt)}</span>{p.lastReminderAt && <span className="text-[12.5px] p-muted">Relance le {fullDate(p.lastReminderAt)}</span>}</span> },
    { key: "state", label: "État", cell: (p) => <span className="flex flex-wrap justify-end md:justify-start gap-1">{p.finishedAt ? <Badge tone="ok">Terminée</Badge> : p.fullAccess ? <Badge tone="wait">Accès complet</Badge> : <Badge>Au calendrier</Badge>}{p.inactive && <Badge tone="alert">Inactif depuis 14 jours</Badge>}{p.unsubscribed && <Badge>Désinscrit·e des e-mails</Badge>}</span> },
  ];
  const others = (members.data ?? []).filter((m) => m.state !== "supprime" && !c.participants.some((p) => p.memberId === m.id));
  return (
    <section className="flex flex-col gap-3" aria-label="Participants">
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Donner l’accès complet à un autre membre" value={pick} onChange={setPick} options={[["", "Choisir…"], ...others.map((m): [string, string] => [String(m.id), m.name])]} />
        <button type="button" className="p-btn-outline p-btn-sm h-[46px]" disabled={!pick || access.isPending} onClick={() => access.mutate({ courseId: c.id, memberId: Number(pick), on: true })}>Donner l’accès complet</button>
      </div>
      {!emailReady && <p className="m-0 text-[13.5px] p-muted">L’envoi d’e-mails n’est pas encore configuré : les boutons de relance s’activeront avec la clé d’envoi.</p>}
      {emailReady && inactive.length > 0 && <div className="flex flex-wrap items-center gap-2"><ConfirmButton label={<><Mail size={14} /> Relancer par e-mail {inactive.length > 1 ? `les ${inactive.length} personnes inactives` : "la personne inactive"}</>} question={`Envoyer maintenant un e-mail à ${inactive.length} personne${inactive.length > 1 ? "s" : ""} sans activité depuis 14 jours ?`} confirm="Envoyer" disabled={remind.isPending} onConfirm={() => remind.mutate({ courseId: c.id, memberIds: inactive.map((p) => p.memberId) })} /></div>}
      <Rows rows={c.participants} columns={columns} keyOf={(p) => p.memberId} empty="Personne n’a encore commencé cette formation." hrefOf={(p) => `/admin/membres/${p.memberId}`}
        actions={(p) => (
          <>
            {emailReady && p.reminder && !p.unsubscribed && <ConfirmButton label={<><Mail size={14} /> Relancer</>} question={`Envoyer maintenant à ${p.name} : ${p.reminder === "nouvelle_section" ? "« Nouvelle section disponible »" : "« Votre formation vous attend »"} ?`} confirm="Envoyer" disabled={remind.isPending} onConfirm={() => remind.mutate({ courseId: c.id, memberIds: [p.memberId] })} />}
            {p.fullAccess
              ? <ConfirmButton label="Retirer l’accès complet" question={`Revenir au calendrier pour ${p.name} ? Ses réponses sont conservées.`} confirm="Retirer" disabled={access.isPending} onConfirm={() => access.mutate({ courseId: c.id, memberId: p.memberId, on: false })} />
              : <button type="button" className="p-btn-outline p-btn-sm" disabled={access.isPending} onClick={() => access.mutate({ courseId: c.id, memberId: p.memberId, on: true })}>Donner l’accès complet</button>}
          </>
        )} />
    </section>
  );
}

/** Membres par section et par leçon, et leçons où l'on décroche. Uniquement des nombres. */
function Stats({ c }: { c: Course }) {
  const s = c.stats;
  const worst = Math.max(0, ...s.sections.flatMap((x) => x.lessons.map((l) => l.stuck)));
  const scale = Math.max(1, s.enrolled);
  return (
    <section className="flex flex-col gap-4" aria-label="Statistiques">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[["Ont commencé", s.enrolled], ["Ont terminé", s.finished], ["En pause depuis 14 jours", s.inactive], ["En accès complet", s.fullAccess]].map(([l, n]) => <div key={l} className="p-card p-4 flex flex-col gap-1"><span className="serif text-[36px] leading-none">{n}</span><span className="text-[13px] p-muted leading-snug">{l}</span></div>)}
      </div>
      {s.sections.length === 0 && <div className="p-soft p-7 text-center p-muted">Aucune section publiée pour l’instant.</div>}
      <ol className="list-none m-0 p-0 flex flex-col gap-3">
        {s.sections.map((x) => (
          <li key={x.id} className="p-card p-3.5 flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{x.position}. {x.title}</span>{x.stuck > 0 && <span className="text-[13px] font-medium" style={{ color: "var(--p-gold)" }}>{x.stuck} décroche{x.stuck > 1 ? "nt" : ""} ici</span>}</span>
              <Bar label="Ouverte" n={x.opened} total={scale} color="var(--p-gold-bright)" />
              <Bar label="Terminée" n={x.completed} total={scale} color="var(--p-accent)" />
            </div>
            <ul className="list-none m-0 p-0 pl-3 flex flex-col gap-2.5 border-l" style={{ borderColor: "var(--p-line)" }} aria-label={`Leçons de ${x.title}`}>
              {x.lessons.map((l) => (
                <li key={l.id} className="flex flex-col gap-1.5">
                  <span className="flex flex-wrap items-center justify-between gap-2 text-[14.5px]"><span>{l.title}</span>{l.stuck > 0 && <span className="text-[13px] font-medium" style={{ color: l.stuck === worst ? "var(--p-accent-text)" : "var(--p-gold)" }}>{l.stuck} décroche{l.stuck > 1 ? "nt" : ""} ici</span>}</span>
                  <Bar label="Ouverte" n={l.opened} total={scale} color="var(--p-gold-bright)" />
                  <Bar label="Terminée" n={l.completed} total={scale} color="var(--p-accent)" />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Bar({ label, n, total, color }: { label: string; n: number; total: number; color: string }) {
  return (
    <span className="flex items-center gap-2 text-[13px]">
      <span className="w-[62px] flex-none p-muted">{label}</span>
      <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--p-track)" }}><span className="block h-full rounded-full" style={{ width: `${Math.round((n / total) * 100)}%`, background: color }} /></span>
      <span className="w-8 flex-none text-right tabular-nums">{n}</span>
    </span>
  );
}
