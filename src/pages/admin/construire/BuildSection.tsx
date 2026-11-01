import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import type { CourseBlock } from "../../../../server/lib/courseBlocks";
import { ConfirmButton, Select } from "../shared";
import { BlockEditor, HashtagPicker } from "./BlockEditor";
import { IssueList, NotionConflict, SaveBar, useLeaveWarning } from "./EditorParts";
import { STATUS_LABEL, notionUrl } from "./labels";

type Section = RouterOutputs["build"]["section"];

/** Modifier une section : son intention, ses objectifs et son défi. Ses leçons se gèrent depuis le plan de la formation. */
export default function BuildSection() {
  const { id, sectionId } = useParams();
  // Une saisie en cours ne doit jamais être écrasée : la fiche ne se recharge qu'après un enregistrement.
  const q = trpc.build.section.useQuery({ id: Number(sectionId) }, { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const [revision, setRevision] = useState(0);
  const back = <Link to={`/admin/construire/${id}`} className="p-btn-outline p-btn-sm no-underline self-start"><ArrowLeft size={15} /> La formation</Link>;
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (!q.data) return <div className="flex flex-col gap-4">{back}<p className="p-muted m-0">{q.error?.message ?? "Section introuvable"}</p></div>;
  return <div className="flex flex-col gap-5">{back}<Editor key={`${q.data.id}-${revision}`} s={q.data} onSaved={() => setRevision((r) => r + 1)} /></div>;
}

function Editor({ s, onSaved }: { s: Section; onSaved: () => void }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const tags = trpc.hashtags.list.useQuery();
  const [f, setF] = useState({ title: s.title, position: s.position, status: s.status, intention: s.intention, hashtagIds: s.hashtagIds });
  const [objectifs, setObjectifs] = useState<CourseBlock[]>(s.rubrics.objectifs);
  const [defi, setDefi] = useState<CourseBlock[]>(s.rubrics.defi);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setDirty(true); };
  const save = trpc.build.saveSection.useMutation({
    onSuccess: async () => { setDirty(false); await utils.build.invalidate(); onSaved(); toast.success("Enregistré dans Notion"); },
    onError: (e) => { if (e.data?.code === "CONFLICT") setConflict(true); else toast.error(e.message, { duration: 8000 }); },
  });
  const archive = trpc.build.archiveSection.useMutation({ onSuccess: () => { utils.build.invalidate(); toast.success("Section et leçons à la corbeille de Notion"); navigate(`/admin/construire/${s.courseId}`); }, onError: (e) => toast.error(e.message) });
  const duplicate = trpc.build.duplicateSection.useMutation({ onSuccess: (r) => { utils.build.invalidate(); toast.success("Section et leçons copiées dans Notion, en brouillon"); navigate(`/admin/construire/${s.courseId}/section/${r.id}`); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  useLeaveWarning(dirty);
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-1"><span className="p-eyebrow">{s.courseTitle}</span><h2 className="m-0 text-[30px] leading-tight break-words">{f.title || "Sans titre"}</h2></div>
        <a href={notionUrl(s.notionPageId)} target="_blank" rel="noopener noreferrer" className="p-btn-outline p-btn-sm no-underline"><ExternalLink size={14} /> Ouvrir dans Notion</a>
      </header>
      <IssueList issues={s.issues} />
      {conflict && <NotionConflict onResolved={() => { setConflict(false); setDirty(false); onSaved(); }} />}
      <section className="p-card p-4 sm:p-5 flex flex-col gap-3.5" aria-label="Fiche de la section">
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Titre</span><input className="p-field" value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Statut" value={f.status} onChange={(status) => set({ status })} options={Object.entries(STATUS_LABEL) as [Section["status"], string][]} />
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Ordre (semaine d’ouverture)</span><input type="number" min={0} className="p-field" value={f.position} onChange={(e) => set({ position: Number(e.target.value) })} /></label>
        </div>
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Intention</span><textarea className="p-field" rows={2} value={f.intention} onChange={(e) => set({ intention: e.target.value })} /></label>
        <div className="flex flex-col gap-1.5"><span className="text-[13px] p-muted">Hashtags de la communauté</span><HashtagPicker all={tags.data ?? []} value={f.hashtagIds} onChange={(hashtagIds) => set({ hashtagIds })} /></div>
      </section>
      <section className="p-card p-4 sm:p-5 flex flex-col gap-3" aria-label="Objectifs">
        <h3 className="m-0 text-[24px]">Objectifs</h3>
        <BlockEditor label="Objectifs" blocks={objectifs} onChange={(b) => { setObjectifs(b); setDirty(true); }} />
      </section>
      <section className="p-card p-4 sm:p-5 flex flex-col gap-3" aria-label="Défi dans le réseau">
        <h3 className="m-0 text-[24px]">Défi dans le réseau</h3>
        <p className="m-0 text-[13.5px] p-muted">Facultatif. Les membres voient ce texte et le bouton « J’ai relevé ce défi » ; il ne compte pas pour terminer la section. La rubrique se crée dans Notion au premier enregistrement.</p>
        <BlockEditor label="Défi dans le réseau" blocks={defi} onChange={(b) => { setDefi(b); setDirty(true); }} />
      </section>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="p-btn-outline p-btn-sm" disabled={duplicate.isPending} onClick={() => duplicate.mutate({ id: s.id })}>{duplicate.isPending ? "Copie dans Notion…" : "Dupliquer avec ses leçons"}</button>
        <ConfirmButton label="Supprimer cette section" question="Mettre cette section et ses leçons à la corbeille de Notion ? Elles disparaissent pour les membres, leurs réponses restent dans leur journal." confirm="Supprimer" danger disabled={archive.isPending} onConfirm={() => archive.mutate({ id: s.id })} />
      </div>
      <SaveBar dirty={dirty} disabled={!f.title.trim()} saving={save.isPending} onSave={() => save.mutate({ id: s.id, ...f, rubrics: { intention: s.rubrics.intention, objectifs, defi } as never })} />
    </>
  );
}
