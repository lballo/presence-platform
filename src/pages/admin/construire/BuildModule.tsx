import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Eye, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { SECTIONS, type Sections } from "../../../../server/lib/courseBlocks";
import { ConfirmButton, Select } from "../shared";
import { BlockEditor, HashtagPicker } from "./BlockEditor";
import { STATUS_LABEL, notionUrl } from "./labels";

type Mod = RouterOutputs["build"]["module"];

/** Modifier un module : chaque enregistrement écrit dans Notion, puis relit la page. */
export default function BuildModule() {
  const { id, moduleId } = useParams();
  // Une saisie en cours ne doit jamais être écrasée : la fiche ne se recharge qu'après un enregistrement.
  const q = trpc.build.module.useQuery({ id: Number(moduleId) }, { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const [revision, setRevision] = useState(0);
  const back = <Link to={`/admin/construire/${id}`} className="p-btn-outline p-btn-sm no-underline self-start"><ArrowLeft size={15} /> La formation</Link>;
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (!q.data) return <div className="flex flex-col gap-4">{back}<p className="p-muted m-0">{q.error?.message ?? "Module introuvable"}</p></div>;
  return <div className="flex flex-col gap-5">{back}<Editor key={`${q.data.id}-${revision}`} m={q.data} onSaved={() => setRevision((r) => r + 1)} /></div>;
}

function Editor({ m, onSaved }: { m: Mod; onSaved: () => void }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const tags = trpc.hashtags.list.useQuery();
  const initial = { title: m.title, position: m.position, status: m.status, intention: m.intention, durationMin: m.durationMin, videoUrl: m.videoUrl, testUrl: m.testUrl, coachBrief: m.coachBrief, hashtagIds: m.hashtagIds };
  const [f, setF] = useState(initial);
  const [sections, setSections] = useState<Sections>(m.sections);
  const [dirty, setDirty] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setDirty(true); };
  const save = trpc.build.saveModule.useMutation({
    // Relecture : les blocs reçoivent leur identifiant Notion, un second enregistrement ne les recrée pas
    onSuccess: async () => { setDirty(false); await utils.build.invalidate(); onSaved(); toast.success("Enregistré dans Notion"); },
    onError: (e) => { if (e.data?.code === "CONFLICT") setConflict(true); else toast.error(e.message, { duration: 8000 }); },
  });
  const [conflict, setConflict] = useState(false);
  const sync = trpc.build.syncNow.useMutation({ onSuccess: async () => { setConflict(false); setDirty(false); await utils.build.invalidate(); onSaved(); toast.success("Repris depuis Notion"); }, onError: (e) => toast.error(e.message) });
  const archive = trpc.build.archiveModule.useMutation({ onSuccess: () => { utils.build.invalidate(); toast.success("Module supprimé, à la corbeille de Notion"); navigate(`/admin/construire/${m.courseId}`); }, onError: (e) => toast.error(e.message) });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const submit = () => save.mutate({ id: m.id, ...f, sections: sections as never });
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-1"><span className="p-eyebrow">{m.courseTitle}</span><h2 className="m-0 text-[30px] leading-tight break-words">{f.title || "Sans titre"}</h2></div>
        <span className="flex flex-wrap gap-2">
          <Link to={`/admin/construire/${m.courseId}/apercu/${m.id}`} className="p-btn-outline p-btn-sm no-underline"><Eye size={14} /> Aperçu comme un membre</Link>
          <a href={notionUrl(m.notionPageId)} target="_blank" rel="noopener noreferrer" className="p-btn-outline p-btn-sm no-underline"><ExternalLink size={14} /> Ouvrir dans Notion</a>
        </span>
      </header>
      {m.issues.length > 0 && (
        <details className="p-3.5 rounded-xl text-[14px]" style={{ background: "rgba(176, 134, 60, .1)" }}>
          <summary className="cursor-pointer font-medium">{m.issues.length} point{m.issues.length > 1 ? "s" : ""} à regarder</summary>
          <ul className="m-0 mt-2 pl-5 list-disc flex flex-col gap-1">{m.issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </details>
      )}
      {conflict && (
        <div role="alert" className="p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-[14.5px]" style={{ background: "var(--p-accent-soft)" }}>
          <span className="flex-[1_1_280px]">Cette page a changé dans Notion pendant que vous la modifiiez. Rien n’a été écrasé. Reprendre la version de Notion efface vos modifications non enregistrées ici.</span>
          <button type="button" className="p-btn-primary p-btn-sm" disabled={sync.isPending} onClick={() => sync.mutate({ full: false })}>Reprendre la version de Notion</button>
        </div>
      )}
      <section className="p-card p-4 sm:p-5 flex flex-col gap-3.5" aria-label="Fiche du module">
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Titre</span><input className="p-field" value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Statut" value={f.status} onChange={(status) => set({ status })} options={Object.entries(STATUS_LABEL) as [Mod["status"], string][]} />
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Ordre (semaine d’ouverture)</span><input type="number" min={0} className="p-field" value={f.position} onChange={(e) => set({ position: Number(e.target.value) })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Durée estimée (min)</span><input type="number" min={0} className="p-field" value={f.durationMin ?? ""} onChange={(e) => set({ durationMin: e.target.value === "" ? null : Number(e.target.value) })} /></label>
        </div>
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Intention</span><textarea className="p-field" rows={2} value={f.intention} onChange={(e) => set({ intention: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Vidéo principale (lien)</span><input className="p-field" value={f.videoUrl} placeholder="https://…" onChange={(e) => set({ videoUrl: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Test intégré (adresse de la page)</span><input className="p-field" value={f.testUrl} placeholder="https://…" onChange={(e) => set({ testUrl: e.target.value })} /></label>
        </div>
        <div className="flex flex-col gap-1.5"><span className="text-[13px] p-muted">Hashtags de la communauté</span><HashtagPicker all={tags.data ?? []} value={f.hashtagIds} onChange={(hashtagIds) => set({ hashtagIds })} /></div>
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Ce que le coach IA retient <span className="p-faint">· ce qu’il doit observer, ce qui compte pour la suite. Jamais montré aux membres.</span></span><textarea className="p-field" rows={3} value={f.coachBrief} onChange={(e) => set({ coachBrief: e.target.value })} /></label>
      </section>
      {SECTIONS.filter((s) => s.key !== "intention").map((s) => (
        <section key={s.key} className="p-card p-4 sm:p-5 flex flex-col gap-3" aria-label={s.title}>
          <h3 className="m-0 text-[24px]">{s.title}</h3>
          {s.key === "exercice" && <p className="m-0 text-[13.5px] p-muted">Chaque question reçoit un champ de réponse, rangé dans le journal privé du membre.</p>}
          {s.key === "defi" && <p className="m-0 text-[13.5px] p-muted">Les membres voient ce texte et le bouton « J’ai relevé ce défi ».</p>}
          <BlockEditor label={s.title} questions={s.key === "exercice"} blocks={sections[s.key]} onChange={(b) => { setSections((x) => ({ ...x, [s.key]: b })); setDirty(true); }} />
        </section>
      ))}
      <div className="flex justify-end">
        <ConfirmButton label="Supprimer ce module" question="Mettre ce module à la corbeille de Notion ? Il disparaît pour les membres, leurs réponses restent dans leur journal." confirm="Supprimer" danger disabled={archive.isPending} onConfirm={() => archive.mutate({ id: m.id })} />
      </div>
      <div className="sticky bottom-[72px] lg:bottom-3 z-20 p-card p-2.5 pl-4 mr-[66px] lg:mr-[78px] flex items-center justify-between gap-3 shadow-lg">
        <span className="text-[13.5px] p-muted min-w-0 leading-snug">{dirty ? "Modifications non enregistrées." : "Tout est enregistré dans Notion."}</span>
        <button type="button" className="p-btn-primary p-btn-sm flex-none" disabled={!f.title.trim() || save.isPending} onClick={submit}>{save.isPending ? "Écriture…" : "Enregistrer"}</button>
      </div>
    </>
  );
}
