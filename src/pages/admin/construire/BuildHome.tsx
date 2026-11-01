import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useUpload } from "@/lib/upload";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Badge, Select } from "../shared";
import { dateTime } from "../labels";
import { HashtagPicker } from "./BlockEditor";
import { useFreshNotion } from "./useFreshNotion";
import { COURSE_STATUS_LABEL, PUBLIC_LABEL, RHYTHM_LABEL, statusTone } from "./labels";

type Flow = RouterOutputs["build"]["workflows"][number];

/** Construire : les formations, la liaison avec Notion et les relances. */
export default function BuildHome() {
  const list = trpc.build.courses.useQuery();
  const status = trpc.build.status.useQuery();
  const [creating, setCreating] = useState(false);
  useFreshNotion(status.data);
  return (
    <div className="flex flex-col gap-6">
      <NotionBar />
      <section className="flex flex-col gap-3" aria-label="Formations">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[28px]">Formations</h2>
          <button type="button" className="p-btn-primary p-btn-sm" disabled={!status.data?.notionReady} onClick={() => setCreating(true)}><Plus size={15} /> Créer une formation</button>
        </div>
        {list.data?.length === 0 && <div className="p-soft p-8 text-center p-muted">Aucune formation pour l’instant. {status.data?.notionReady ? "Synchronisez pour reprendre celles de Notion." : "Elles apparaîtront quand la clé Notion sera configurée."}</div>}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))" }}>
          {list.data?.map((c) => (
            <Link key={c.id} to={`/admin/construire/${c.id}`} className="p-card overflow-hidden flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
              <div className="aspect-[16/7] flex items-center justify-center" style={{ background: "var(--p-band)" }}>{c.coverUrl ? <img src={c.coverUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-[42px]" aria-hidden="true">{c.emoji || "🌱"}</span>}</div>
              <div className="p-4 flex flex-col gap-2 flex-1">
                <span className="flex flex-wrap items-center gap-1.5"><Badge tone={statusTone(c.status)}>{COURSE_STATUS_LABEL[c.status]}</Badge><Badge>{PUBLIC_LABEL[c.public]}</Badge></span>
                <span className="serif text-[23px] leading-tight">{c.title}</span>
                <span className="mt-auto text-[13.5px] p-muted">{c.publishedCount} module{c.publishedCount > 1 ? "s" : ""} publié{c.publishedCount > 1 ? "s" : ""} sur {c.moduleCount} · {c.participants} participant{c.participants > 1 ? "s" : ""}{c.issueCount ? ` · ${c.issueCount} point${c.issueCount > 1 ? "s" : ""} à regarder` : ""}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <Workflows />
      <CreateCourse open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function NotionBar() {
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
    <section className="p-card p-4 sm:p-5 flex flex-col gap-3" aria-label="Liaison avec Notion">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-[1_1_280px] min-w-0 flex flex-col gap-1">
          <span className="font-semibold">Notion fait foi pour les contenus</span>
          {!s.notionReady
            ? <span className="text-[14px]" style={{ color: "var(--p-accent-text)" }}>La clé Notion (NOTION_TOKEN) n’est pas encore configurée : rien ne peut être lu ni enregistré pour l’instant.</span>
            : <span className="text-[14px] p-muted">{last ? `Dernière synchronisation : ${dateTime(last.startedAt)}${last.status === "erreur" ? " · échec" : ""}` : "Pas encore synchronisé."}</span>}
          {last?.status === "erreur" && <span className="text-[13.5px]" style={{ color: "var(--p-accent-text)" }}>{last.detail}</span>}
          {last?.status === "ok" && last.detail && <span className="text-[13.5px] p-muted">{last.detail}</span>}
        </div>
        <span className="flex flex-wrap gap-2">
          <button type="button" className="p-btn-primary p-btn-sm" disabled={!s.notionReady || sync.isPending} onClick={() => sync.mutate({ full: false })}><RefreshCw size={14} className={sync.isPending ? "animate-spin" : ""} /> {sync.isPending ? "Synchronisation…" : "Synchroniser maintenant"}</button>
          <button type="button" className="p-btn-outline p-btn-sm" disabled={!s.notionReady || sync.isPending} onClick={() => sync.mutate({ full: true })}>Tout relire</button>
        </span>
      </div>
      {!s.privateBoxReady && <p className="m-0 text-[13.5px]" style={{ color: "var(--p-accent-text)" }}>La clé de chiffrement (PRIVATE_DATA_KEY) manque : les membres ne peuvent pas encore écrire dans leur journal.</p>}
      {!s.aiReady && <p className="m-0 text-[13.5px] p-muted">Sans clé Gemini, le coach retient seulement ce que les membres ont écrit, tel quel.</p>}
      {!s.emailReady && <p className="m-0 text-[13.5px] p-muted">L’envoi d’e-mails n’est pas encore configuré (RESEND_API_KEY) : les relances restent des notifications dans l’application.</p>}
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
    onSuccess: (r) => { utils.build.invalidate(); setF(empty); onClose(); toast.success("Formation créée dans Notion, en brouillon"); navigate(`/admin/construire/${r.id}`); },
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
        <div className="flex flex-col min-w-0 flex-[1_1_300px]"><h2 className="m-0 text-[28px]">Relances automatiques</h2><span className="text-[14px] p-muted">Une notification dans l’application, et un e-mail si vous l’activez. Pour relancer vous-même, passez par les participants d’une formation. Variables : {"{{prenom}}"}, {"{{module}}"}, {"{{formation}}"}.</span></div>
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
        <span className="text-[12.5px] p-muted leading-snug">Le lien vers le module et le lien de désinscription sont ajoutés tout seuls. Activer l’e-mail n’envoie rien à ceux qui ont déjà reçu la notification.</span>
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
