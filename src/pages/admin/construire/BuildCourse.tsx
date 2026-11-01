import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, ExternalLink, FileText, Pencil, Plus, Video } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/Avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useUpload } from "@/lib/upload";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import type { CourseBlock } from "../../../../server/lib/courseBlocks";
import { Badge, Chips, ConfirmButton, Rows, Select, type Column } from "../shared";
import { ACCESS_LABEL, fullDate } from "../labels";
import { BlockEditor, HashtagPicker } from "./BlockEditor";
import { COURSE_STATUS_LABEL, PUBLIC_LABEL, RHYTHM_LABEL, STATUS_LABEL, notionUrl, statusTone } from "./labels";

type Course = RouterOutputs["build"]["course"];
type Tab = "modules" | "reglages" | "participants" | "stats";

/** Une formation dans Construire : ses modules, ses réglages, ses participants et ses chiffres. */
export default function BuildCourse() {
  const id = Number(useParams().id);
  const q = trpc.build.course.useQuery({ id }, { retry: false });
  const [tab, setTab] = useState<Tab>("modules");
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
        <a href={notionUrl(c.notionPageId)} target="_blank" rel="noopener noreferrer" className="p-btn-outline p-btn-sm no-underline"><ExternalLink size={14} /> Ouvrir dans Notion</a>
      </header>
      {c.status !== "publie" && <p className="m-0 p-3 rounded-xl text-[14px]" style={{ background: "var(--p-accent-soft)" }}>Cette formation n’est pas encore publiée : les membres ne la voient pas, même si ses modules le sont.</p>}
      <Chips value={tab} onChange={setTab} label="Rubriques de la formation" options={[["modules", "Modules", c.modules.length], ["reglages", "Réglages"], ["participants", "Participants", c.participants.length], ["stats", "Statistiques"]]} />
      {tab === "modules" && <Modules c={c} />}
      {tab === "reglages" && <Settings key={revision} c={c} onSaved={() => setRevision((r) => r + 1)} />}
      {tab === "participants" && <Participants c={c} />}
      {tab === "stats" && <Stats c={c} />}
    </div>
  );
}

function Modules({ c }: { c: Course }) {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const move = trpc.build.moveModule.useMutation({ onSuccess: () => utils.build.course.invalidate({ id: c.id }), onError: (e) => toast.error(e.message) });
  return (
    <section className="flex flex-col gap-3" aria-label="Modules">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[14px] p-muted flex-[1_1_260px]">L’ordre fixe la semaine d’ouverture : le module 1 s’ouvre au démarrage, le module 2 une semaine plus tard, et ainsi de suite.</p>
        <button type="button" className="p-btn-primary p-btn-sm" onClick={() => setAdding(true)}><Plus size={15} /> Ajouter un module</button>
      </div>
      {c.modules.length === 0 && <div className="p-soft p-7 text-center p-muted">Aucun module pour l’instant.</div>}
      <ol className="list-none m-0 p-0 flex flex-col gap-2">
        {c.modules.map((m, i) => (
          <li key={m.id} className="p-card p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-none font-semibold text-[14px]" style={{ background: "var(--p-surface-2)" }}>{m.position}</span>
            <Link to={`/admin/construire/${c.id}/module/${m.id}`} className="flex-[1_1_220px] min-w-0 flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
              <span className="font-medium leading-snug break-words">{m.title}</span>
              <span className="text-[12.5px] p-muted flex flex-wrap items-center gap-x-2.5">{m.durationMin ? <span>{m.durationMin} min</span> : null}{m.hasVideo && <span className="flex items-center gap-1"><Video size={12} /> vidéo</span>}{m.hasTest && <span className="flex items-center gap-1"><FileText size={12} /> test</span>}{m.issues.length > 0 && <span style={{ color: "var(--p-gold)" }}>{m.issues.length} point{m.issues.length > 1 ? "s" : ""} à regarder</span>}</span>
            </Link>
            <Badge tone={statusTone(m.status)}>{STATUS_LABEL[m.status]}</Badge>
            <span className="flex items-center gap-0.5 flex-none">
              <button type="button" aria-label={`Monter ${m.title}`} disabled={i === 0 || move.isPending} className="w-9 h-9 flex items-center justify-center rounded-lg p-muted disabled:opacity-30" onClick={() => move.mutate({ id: m.id, direction: "up" })}><ArrowUp size={16} /></button>
              <button type="button" aria-label={`Descendre ${m.title}`} disabled={i === c.modules.length - 1 || move.isPending} className="w-9 h-9 flex items-center justify-center rounded-lg p-muted disabled:opacity-30" onClick={() => move.mutate({ id: m.id, direction: "down" })}><ArrowDown size={16} /></button>
              <Link to={`/admin/construire/${c.id}/apercu/${m.id}`} aria-label={`Aperçu de ${m.title}`} title="Aperçu comme un membre" className="w-9 h-9 flex items-center justify-center rounded-lg p-muted"><Eye size={16} /></Link>
              <Link to={`/admin/construire/${c.id}/module/${m.id}`} aria-label={`Modifier ${m.title}`} title="Modifier" className="w-9 h-9 flex items-center justify-center rounded-lg p-muted"><Pencil size={16} /></Link>
            </span>
          </li>
        ))}
      </ol>
      <AddModule c={c} open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}

function AddModule({ c, open, onClose }: { c: Course; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const templates = trpc.build.templates.useQuery(undefined, { enabled: open });
  const [f, setF] = useState({ title: "", intention: "", source: "structure", copyId: "", templateId: "" });
  const create = trpc.build.createModule.useMutation({
    onSuccess: (r) => { utils.build.invalidate(); onClose(); setF({ title: "", intention: "", source: "structure", copyId: "", templateId: "" }); toast.success("Module créé dans Notion, en brouillon"); navigate(`/admin/construire/${c.id}/module/${r.id}`); },
    onError: (e) => toast.error(e.message),
  });
  const options: [string, string][] = [["structure", "La structure à six sections"], ...(c.modules.length ? [["copie", "La copie d’un module existant"] as [string, string]] : []), ...(templates.data?.length ? [["notion", "Un modèle de la base Notion"] as [string, string]] : [])];
  const ready = f.title.trim() && (f.source !== "copie" || f.copyId) && (f.source !== "notion" || f.templateId);
  const submit = () => create.mutate({ courseId: c.id, title: f.title, intention: f.intention, source: f.source === "copie" ? { kind: "copie", moduleId: Number(f.copyId) } : f.source === "notion" ? { kind: "notion", templateId: f.templateId } : { kind: "structure" } });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[500px]" aria-describedby={undefined}>
        <DialogTitle className="serif text-[28px] font-normal">Ajouter un module</DialogTitle>
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }}>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Titre</span><input className="p-field" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Intention</span><input className="p-field" value={f.intention} onChange={(e) => setF({ ...f, intention: e.target.value })} /></label>
          <Select label="Partir de" value={f.source} onChange={(source) => setF({ ...f, source })} options={options} />
          {f.source === "copie" && <Select label="Module à copier" value={f.copyId} onChange={(copyId) => setF({ ...f, copyId })} options={[["", "Choisir…"], ...c.modules.map((m): [string, string] => [String(m.id), `${m.position}. ${m.title}`])]} />}
          {f.source === "notion" && <Select label="Modèle" value={f.templateId} onChange={(templateId) => setF({ ...f, templateId })} options={[["", "Choisir…"], ...(templates.data ?? []).map((t): [string, string] => [t.id, t.name])]} />}
          <span className="flex justify-end gap-2 pt-1"><button type="button" className="p-btn-outline p-btn-sm" onClick={onClose}>Annuler</button><button type="submit" className="p-btn-primary p-btn-sm" disabled={!ready || create.isPending}>{create.isPending ? "Création dans Notion…" : "Créer en brouillon"}</button></span>
        </form>
      </DialogContent>
    </Dialog>
  );
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
    </div>
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
  const access = trpc.build.setFullAccess.useMutation({ onSuccess: (_r, v) => { utils.build.course.invalidate({ id: c.id }); setPick(""); toast.success(v.on ? "Accès complet donné : tous les modules sont ouverts" : "Accès complet retiré : retour au calendrier, ses réponses sont conservées"); }, onError: (e) => toast.error(e.message) });
  type Row = Course["participants"][number];
  const columns: Column<Row>[] = [
    { key: "name", label: "Membre", cell: (p) => <span className="flex items-center gap-3 min-w-0"><Avatar m={p} size={34} /><span className="font-semibold truncate">{p.name}</span></span> },
    { key: "started", label: "Commencée le", short: "Début", cell: (p) => fullDate(p.startedAt) },
    { key: "done", label: "Modules terminés", short: "Terminés", cell: (p) => `${p.done} sur ${p.total}` },
    { key: "last", label: "Dernière activité", short: "Activité", cell: (p) => fullDate(p.lastActivityAt) },
    { key: "state", label: "État", cell: (p) => (p.finishedAt ? <Badge tone="ok">Terminée</Badge> : p.fullAccess ? <Badge tone="wait">Accès complet</Badge> : <Badge>Au calendrier</Badge>) },
  ];
  const others = (members.data ?? []).filter((m) => m.state !== "supprime" && !c.participants.some((p) => p.memberId === m.id));
  return (
    <section className="flex flex-col gap-3" aria-label="Participants">
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Donner l’accès complet à un autre membre" value={pick} onChange={setPick} options={[["", "Choisir…"], ...others.map((m): [string, string] => [String(m.id), m.name])]} />
        <button type="button" className="p-btn-outline p-btn-sm h-[46px]" disabled={!pick || access.isPending} onClick={() => access.mutate({ courseId: c.id, memberId: Number(pick), on: true })}>Donner l’accès complet</button>
      </div>
      <Rows rows={c.participants} columns={columns} keyOf={(p) => p.memberId} empty="Personne n’a encore commencé cette formation." hrefOf={(p) => `/admin/membres/${p.memberId}`}
        actions={(p) => p.fullAccess
          ? <ConfirmButton label="Retirer l’accès complet" question={`Revenir au calendrier pour ${p.name} ? Ses réponses sont conservées.`} confirm="Retirer" disabled={access.isPending} onConfirm={() => access.mutate({ courseId: c.id, memberId: p.memberId, on: false })} />
          : <button type="button" className="p-btn-outline p-btn-sm" disabled={access.isPending} onClick={() => access.mutate({ courseId: c.id, memberId: p.memberId, on: true })}>Donner l’accès complet</button>} />
    </section>
  );
}

/** Membres par module et modules où l'on décroche. Uniquement des nombres. */
function Stats({ c }: { c: Course }) {
  const s = c.stats;
  const worst = Math.max(0, ...s.modules.map((m) => m.stuck));
  const scale = Math.max(1, s.enrolled);
  return (
    <section className="flex flex-col gap-4" aria-label="Statistiques">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[["Ont commencé", s.enrolled], ["Ont terminé", s.finished], ["En pause depuis 14 jours", s.inactive], ["En accès complet", s.fullAccess]].map(([l, n]) => <div key={l} className="p-card p-4 flex flex-col gap-1"><span className="serif text-[36px] leading-none">{n}</span><span className="text-[13px] p-muted leading-snug">{l}</span></div>)}
      </div>
      {s.modules.length === 0 && <div className="p-soft p-7 text-center p-muted">Aucun module publié pour l’instant.</div>}
      <ol className="list-none m-0 p-0 flex flex-col gap-2">
        {s.modules.map((m) => (
          <li key={m.id} className="p-card p-3.5 flex flex-col gap-2">
            <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{m.position}. {m.title}</span>{m.stuck > 0 && <span className="text-[13px] font-medium" style={{ color: m.stuck === worst ? "var(--p-accent-text)" : "var(--p-gold)" }}>{m.stuck} décroche{m.stuck > 1 ? "nt" : ""} ici</span>}</span>
            <Bar label="Ouvert" n={m.opened} total={scale} color="var(--p-gold-bright)" />
            <Bar label="Terminé" n={m.completed} total={scale} color="var(--p-accent)" />
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
