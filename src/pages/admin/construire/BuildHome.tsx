import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Eye, Leaf, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useUpload } from "@/lib/upload";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Select } from "../shared";
import { dateTime } from "../labels";
import { HashtagPicker } from "./BlockEditor";
import { CreatorShell } from "./CreatorShell";
import { useFreshNotion } from "./useFreshNotion";
import { COURSE_STATUS_LABEL, PUBLIC_LABEL, RHYTHM_LABEL } from "./labels";

type Flow = RouterOutputs["build"]["workflows"][number];

type Filter = "tous" | "publies" | "brouillons";

/** Mes formations : tout ce que vous transmettez, au même endroit. */
export default function BuildHome() {
  const list = trpc.build.courses.useQuery();
  const status = trpc.build.status.useQuery();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("tous");
  const [search, setSearch] = useState("");
  useFreshNotion(status.data);
  const all = list.data ?? [];
  const isOn = (c: { status: string }) => c.status === "publie";
  const tabs: [Filter, string, number][] = [["tous", "Toutes", all.length], ["publies", "Publiées", all.filter(isOn).length], ["brouillons", "Brouillons", all.filter((c) => !isOn(c)).length]];
  const folded = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const shown = all.filter((c) => (filter === "tous" || (filter === "publies") === isOn(c)) && folded(`${c.title} ${c.tagline}`).includes(folded(search.trim())));
  const canCreate = !!status.data?.notionReady;
  return (
    <CreatorShell crumbs={[{ label: "Mes formations" }]} actions={<button type="button" className="cr-btn cr-btn-primary" disabled={!canCreate} onClick={() => setCreating(true)}><Plus size={16} /> Nouvelle formation</button>}>
      <main className="w-full max-w-[1350px] mx-auto px-4 lg:px-10 pt-8 pb-14">
        <div className="mb-7"><p className="m-0 mb-2 text-[12px] font-medium" style={{ color: "var(--p-accent)" }}>VOTRE ESPACE DE TRANSMISSION</p><h1 className="m-0 text-[30px] leading-9">Vos formations.</h1><p className="m-0 mt-2 text-[14px] p-muted">Tous vos savoirs au même endroit, prêts à être transmis.</p></div>
        <NotionBar />
        <div className="mt-6 flex flex-wrap items-center gap-3 border-b" style={{ borderColor: "var(--p-line)" }}>
          <div role="tablist" aria-label="Filtrer les formations" className="flex-[1_1_320px] flex gap-7">
            {tabs.map(([id, label, n]) => <button key={id} type="button" role="tab" aria-selected={filter === id} className="cr-tab" onClick={() => setFilter(id)}>{label} · {n}</button>)}
          </div>
          <label className="mb-2.5 flex-[0_1_260px] flex items-center gap-2 rounded-md border px-3 py-2 bg-[var(--p-surface)] p-muted" style={{ borderColor: "var(--p-line)" }}>
            <Search size={14} className="flex-none" />
            <input type="search" aria-label="Rechercher une formation" placeholder="Rechercher une formation" className="w-full border-0 outline-none bg-transparent text-[13px]" style={{ color: "var(--p-ink)" }} value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        <section aria-label="Formations" className="mt-7 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))" }}>
          {shown.map((c) => (
            <article key={c.id} className="overflow-hidden rounded-2xl border bg-[var(--p-surface)] flex flex-col" style={{ borderColor: "var(--p-line)" }}>
              <Link to={`/admin/createur/${c.id}`} aria-label={`Ouvrir ${c.title}`} className="relative block h-[150px] no-underline" style={{ background: "var(--p-surface-2)" }}>
                {c.coverUrl ? <img src={c.coverUrl} alt="" className="w-full h-full object-cover" /> : <span aria-hidden="true" className="w-full h-full flex items-center justify-center text-[52px]">{c.emoji || "🌱"}</span>}
                <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-[var(--p-surface)] px-2.5 py-1 text-[11px]" style={{ color: isOn(c) ? "var(--p-ok)" : "var(--p-ink-2)" }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />{COURSE_STATUS_LABEL[c.status]}</span>
              </Link>
              <div className="px-5 pt-[18px] pb-4 flex flex-col gap-2 flex-1">
                <span className="flex items-center gap-1.5 text-[11px] font-medium p-muted"><Leaf size={12} style={{ color: "var(--p-accent)" }} />{PUBLIC_LABEL[c.public]} · {RHYTHM_LABEL[c.rhythm]}</span>
                <h2 className="m-0 text-[17px] leading-[1.35]">{c.title}</h2>
                {c.tagline && <p className="m-0 text-[13px] leading-relaxed p-muted">{c.tagline}</p>}
                <p className="m-0 mt-1 text-[11px] p-muted">{c.sectionCount} section{c.sectionCount > 1 ? "s" : ""} · {c.lessonCount} leçon{c.lessonCount > 1 ? "s" : ""}{c.totalMin ? ` · ${c.totalMin} min` : ""} · {c.publishedCount} publiée{c.publishedCount > 1 ? "s" : ""} · {c.participants} participant{c.participants > 1 ? "s" : ""}{c.issueCount ? ` · ${c.issueCount} point${c.issueCount > 1 ? "s" : ""} à regarder` : ""}</p>
                <div className="mt-auto pt-3 flex items-center gap-1 border-t" style={{ borderColor: "var(--p-surface-2)" }}>
                  <Link to={`/admin/createur/${c.id}`} className="flex-1 flex items-center gap-1.5 text-[13px] font-medium no-underline" style={{ color: "var(--p-accent)" }}>Ouvrir l’éditeur <ArrowRight size={14} /></Link>
                  {c.firstLessonId && <Link to={`/admin/createur/${c.id}/apercu/${c.firstLessonId}`} aria-label={`Aperçu de ${c.title}`} title="Aperçu comme un membre" className="cr-icon w-8 h-8"><Eye size={16} /></Link>}
                </div>
              </div>
            </article>
          ))}
          {shown.length === 0 && all.length > 0 && <div className="rounded-2xl border bg-[var(--p-surface)] px-6 py-8 flex flex-col gap-1.5 justify-center" style={{ borderColor: "var(--p-line)" }}><p className="m-0 text-[15px] font-semibold">{search ? "Aucune formation ne correspond" : filter === "publies" ? "Aucune formation publiée pour l’instant" : "Aucun brouillon pour l’instant"}</p><p className="m-0 text-[13px] leading-relaxed p-muted">{filter === "publies" ? "Publiez une formation depuis son éditeur pour la rendre visible à vos membres." : "Tout est publié, ou votre recherche est trop précise."}</p></div>}
          <button type="button" disabled={!canCreate} className="min-h-[340px] rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2.5 p-6 disabled:opacity-60" style={{ borderColor: "var(--p-line-2)" }} onClick={() => setCreating(true)}>
            <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "var(--p-surface-2)", color: "var(--p-accent)" }}><Plus size={20} /></span>
            <span className="text-[14px] font-semibold">Créer une nouvelle formation</span>
            <span className="text-[12px] leading-relaxed p-muted max-w-[220px] text-center">{canCreate ? "Commencez par un titre, vous construirez le parcours ensuite." : "Possible quand la clé Notion sera configurée."}</span>
          </button>
        </section>
      </main>
      <CreateCourse open={creating} onClose={() => setCreating(false)} />
    </CreatorShell>
  );
}

/** Les relances : une page à part, le plan des formations reste au calme. */
export function BuildWorkflows() {
  return (
    <CreatorShell crumbs={[{ label: "Relances" }]}>
      <main className="w-full max-w-[1350px] mx-auto px-4 lg:px-10 pt-8 pb-14 flex flex-col gap-6">
        <div><p className="m-0 mb-2 text-[12px] font-medium" style={{ color: "var(--p-accent)" }}>VOTRE ESPACE DE TRANSMISSION</p><h1 className="m-0 text-[30px] leading-9">Vos relances.</h1><p className="m-0 mt-2 text-[14px] p-muted">Ce que vos membres reçoivent quand une section s’ouvre, ou quand ils s’éloignent.</p></div>
        <Workflows />
      </main>
    </CreatorShell>
  );
}

export function NotionBar() {
  const utils = trpc.useUtils();
  const status = trpc.build.status.useQuery();
  const sync = trpc.build.syncNow.useMutation({
    onSuccess: (r) => { utils.build.invalidate(); if (r.ok) toast.success(r.changed ? `Synchronisé : ${r.changed} page${r.changed > 1 ? "s" : ""} mise${r.changed > 1 ? "s" : ""} à jour` : "Synchronisé : rien de neuf dans Notion"); else toast.error(r.detail); },
    onError: (e) => toast.error(e.message),
  });
  const s = status.data;
  if (!s) return null;
  const last = s.lastSync;
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-[var(--p-surface)] px-4 py-2.5" aria-label="Liaison avec Notion" style={{ borderColor: "var(--p-line)" }}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="flex-[1_1_260px] min-w-0 text-[12.5px] p-muted">
          <span className="font-medium" style={{ color: "var(--p-ink)" }}>Notion fait foi pour les contenus.</span>{" "}
          {!s.notionReady ? <span style={{ color: "var(--p-accent)" }}>La clé Notion (NOTION_TOKEN) n’est pas encore configurée : rien ne peut être lu ni enregistré pour l’instant.</span> : last ? `Dernière synchronisation : ${dateTime(last.startedAt)}${last.status === "erreur" ? " · échec" : ""}.` : "Pas encore synchronisé."}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          <button type="button" className="cr-btn h-8 px-3 text-[13px]" disabled={!s.notionReady || sync.isPending} onClick={() => sync.mutate({ full: false })}><RefreshCw size={13} className={sync.isPending ? "animate-spin" : ""} /> {sync.isPending ? "Synchronisation…" : "Synchroniser"}</button>
          <button type="button" className="h-8 px-2 text-[12.5px] p-muted hover:underline disabled:opacity-50" disabled={!s.notionReady || sync.isPending} onClick={() => sync.mutate({ full: true })}>Tout relire</button>
        </span>
      </div>
      {last?.status === "erreur" && <span className="text-[12.5px]" style={{ color: "var(--p-accent)" }}>{last.detail}</span>}
      {last?.status === "ok" && last.detail && <span className="text-[12.5px] p-muted">{last.detail}</span>}
      {!s.privateBoxReady && <p className="m-0 text-[12.5px]" style={{ color: "var(--p-accent)" }}>La clé de chiffrement (PRIVATE_DATA_KEY) manque : les membres ne peuvent pas encore écrire dans leur journal.</p>}
      {!s.aiReady && <p className="m-0 text-[12.5px] p-muted">Sans clé Gemini, le coach répond par un message de secours.</p>}
      {!s.emailReady && <p className="m-0 text-[12.5px] p-muted">L’envoi d’e-mails n’est pas encore configuré (RESEND_API_KEY) : les relances restent des notifications dans l’application.</p>}
    </section>
  );
}

function CreateCourse({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const tags = trpc.hashtags.list.useQuery();
  const empty = { title: "", tagline: "", description: "", coverUrl: "", public: "attribution" as "tous" | "attribution", rhythm: "hebdo" as "hebdo" | "complet", hashtagIds: [] as number[] };
  const [f, setF] = useState(empty);
  const cover = useUpload("courseImage");
  const create = trpc.build.createCourse.useMutation({
    onSuccess: (r) => { utils.build.invalidate(); setF(empty); onClose(); toast.success("Formation créée dans Notion, en brouillon"); navigate(`/admin/createur/${r.id}`); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogTitle className="serif text-[28px] font-normal">Créer une formation</DialogTitle>
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); create.mutate(f); }}>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Titre</span><input className="p-field" value={f.title} autoFocus onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Accroche</span><input className="p-field" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Description</span><textarea className="p-field" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Public" value={f.public} onChange={(v) => setF({ ...f, public: v })} options={Object.entries(PUBLIC_LABEL) as ["tous" | "attribution", string][]} />
            <Select label="Rythme" value={f.rhythm} onChange={(v) => setF({ ...f, rhythm: v })} options={Object.entries(RHYTHM_LABEL) as ["hebdo" | "complet", string][]} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {f.coverUrl && <img src={f.coverUrl} alt="" className="h-16 w-28 object-cover rounded-lg" />}
            <label className="p-btn-outline p-btn-sm cursor-pointer"><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choisir la couverture" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { const r = await cover.upload(file); setF((x) => ({ ...x, coverUrl: r.publicUrl ?? "" })); } catch (err) { toast.error(err instanceof Error ? err.message : "Envoi impossible"); } }} />{cover.busy ? `Envoi… ${cover.progress ?? 0} %` : f.coverUrl ? "Changer la couverture" : "Ajouter une couverture"}</label>
          </div>
          <div className="flex flex-col gap-1.5"><span className="text-[13px] p-muted">Hashtags</span><HashtagPicker all={tags.data ?? []} value={f.hashtagIds} onChange={(hashtagIds) => setF({ ...f, hashtagIds })} /></div>
          <span className="flex justify-end gap-2 pt-1"><button type="button" className="p-btn-outline p-btn-sm" onClick={onClose}>Annuler</button><button type="submit" className="p-btn-primary p-btn-sm" disabled={!f.title.trim() || create.isPending}>{create.isPending ? "Création dans Notion…" : "Créer en brouillon"}</button></span>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Workflows() {
  const utils = trpc.useUtils();
  const flows = trpc.build.workflows.useQuery();
  const status = trpc.build.status.useQuery();
  const run = trpc.build.runWorkflows.useMutation({
    onSuccess: (r) => { utils.build.workflows.invalidate(); const n = Object.values(r).reduce((a, b) => a + b, 0); toast.success(n ? `${n} relance${n > 1 ? "s" : ""} envoyée${n > 1 ? "s" : ""}` : "Aucune relance à envoyer pour l’instant"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section className="flex flex-col gap-3" aria-label="Relances automatiques">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col min-w-0 flex-[1_1_300px]"><h2 className="m-0 text-[20px]">Relances automatiques</h2><span className="text-[14px] p-muted">Une notification dans l’application, et un e-mail si vous l’activez. Pour relancer vous-même, passez par les participants d’une formation. Variables : {"{{prenom}}"}, {"{{section}}"}, {"{{lecon}}"}, {"{{formation}}"}.</span></div>
        <button type="button" className="p-btn-outline p-btn-sm" disabled={run.isPending} onClick={() => run.mutate()}>Lancer maintenant</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{flows.data?.map((w) => <FlowCard key={`${w.key}${+new Date(w.updatedAt)}`} w={w} emailReady={!!status.data?.emailReady} />)}</div>
    </section>
  );
}

function FlowCard({ w, emailReady }: { w: Flow; emailReady: boolean }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({ title: w.title, body: w.body, emailSubject: w.emailSubject, emailBody: w.emailBody });
  const save = trpc.build.updateWorkflow.useMutation({ onSuccess: () => { utils.build.workflows.invalidate(); toast.success("Relance enregistrée"); }, onError: (e) => toast.error(e.message) });
  const essai = trpc.build.sendTestEmail.useMutation({ onSuccess: (r) => toast.success(`E-mail d’essai envoyé à ${r.to}`), onError: (e) => toast.error(e.message) });
  const dirty = f.title !== w.title || f.body !== w.body || f.emailSubject !== w.emailSubject || f.emailBody !== w.emailBody;
  const saveWith = (p: { active?: boolean; emailEnabled?: boolean }) => save.mutate({ key: w.key, active: w.active, emailEnabled: w.emailEnabled, ...f, ...p });
  return (
    <article className="p-card p-4 flex flex-col gap-3">
      <span className="flex flex-col gap-0.5 min-w-0"><span className="font-semibold">{w.name}</span><span className="text-[13px] p-muted leading-snug">{w.description}</span></span>
      <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
        <label className="flex items-center justify-between gap-3 text-[14px] font-medium cursor-pointer">Notification dans l’application<input type="checkbox" checked={w.active} disabled={save.isPending} className="w-[18px] h-[18px] flex-none" style={{ accentColor: "var(--p-accent)" }} onChange={(e) => saveWith({ active: e.target.checked })} /></label>
        <input className="p-field h-10 py-0 text-[14px]" value={f.title} aria-label="Titre de la notification" onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input className="p-field h-10 py-0 text-[14px]" value={f.body} aria-label="Texte de la notification" onChange={(e) => setF({ ...f, body: e.target.value })} />
      </fieldset>
      <fieldset className="m-0 p-0 pt-3 border-0 border-t flex flex-col gap-2" style={{ borderColor: "var(--p-line)" }}>
        <label className="flex items-center justify-between gap-3 text-[14px] font-medium cursor-pointer">Envoyer aussi par e-mail, automatiquement<input type="checkbox" checked={w.emailEnabled} disabled={save.isPending || !w.active} className="w-[18px] h-[18px] flex-none" style={{ accentColor: "var(--p-accent)" }} onChange={(e) => saveWith({ emailEnabled: e.target.checked })} /></label>
        {w.emailEnabled && !emailReady && <span className="text-[13px]" style={{ color: "var(--p-accent-text)" }}>Activé, mais rien ne partira tant que la clé d’envoi n’est pas configurée.</span>}
        <input className="p-field h-10 py-0 text-[14px]" value={f.emailSubject} aria-label="Objet de l’e-mail" placeholder="Objet" onChange={(e) => setF({ ...f, emailSubject: e.target.value })} />
        <textarea className="p-field text-[14px] leading-relaxed" rows={6} value={f.emailBody} aria-label="Texte de l’e-mail" onChange={(e) => setF({ ...f, emailBody: e.target.value })} />
        <span className="text-[12.5px] p-muted leading-snug">Le lien vers la formation et le lien de désinscription sont ajoutés tout seuls. Activer l’e-mail n’envoie rien à ceux qui ont déjà reçu la notification.</span>
      </fieldset>
      <span className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] p-muted">
        <span>{w.sent} relance{w.sent > 1 ? "s" : ""}{w.lastSent ? ` · dernière le ${dateTime(w.lastSent)}` : ""}</span>
        <span className="flex flex-wrap gap-2">
          <button type="button" className="p-btn-outline p-btn-sm" disabled={essai.isPending || dirty || !emailReady} title={dirty ? "Enregistrez d’abord" : undefined} onClick={() => essai.mutate({ key: w.key })}>M’envoyer un essai</button>
          {dirty && <button type="button" className="p-btn-primary p-btn-sm" disabled={save.isPending} onClick={() => saveWith({})}>Enregistrer</button>}
        </span>
      </span>
    </article>
  );
}
