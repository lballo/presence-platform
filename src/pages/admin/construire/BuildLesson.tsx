import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Eye, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { LESSON_RUBRICS, LESSON_TYPE_LABEL, LESSON_TYPES, type CourseBlock, type LessonType } from "../../../../server/lib/courseBlocks";
import { ConfirmButton, Select } from "../shared";
import { BlockEditor, HashtagPicker } from "./BlockEditor";
import { IssueList, NotionConflict, SaveBar, useLeaveWarning } from "./EditorParts";
import { LESSON_STATUS_LABEL, notionUrl } from "./labels";

type Lesson = RouterOutputs["build"]["lesson"];
type LessonRubrics = Record<(typeof LESSON_RUBRICS)[number]["key"], CourseBlock[]>;

/** Modifier une leçon : chaque enregistrement écrit dans Notion, puis relit la page. */
export default function BuildLesson() {
  const { id, lessonId } = useParams();
  // Une saisie en cours ne doit jamais être écrasée : la fiche ne se recharge qu'après un enregistrement.
  // Rien n'est gardé en mémoire : une fiche rouverte sur une ancienne copie remettrait son ancien statut à l'enregistrement.
  const q = trpc.build.lesson.useQuery({ id: Number(lessonId) }, { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, gcTime: 0 });
  const [revision, setRevision] = useState(0);
  const back = <Link to={`/admin/construire/${id}`} className="p-btn-outline p-btn-sm no-underline self-start"><ArrowLeft size={15} /> La formation</Link>;
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (!q.data) return <div className="flex flex-col gap-4">{back}<p className="p-muted m-0">{q.error?.message ?? "Leçon introuvable"}</p></div>;
  return <div className="flex flex-col gap-5">{back}<Editor key={`${q.data.id}-${revision}`} l={q.data} onSaved={() => setRevision((r) => r + 1)} /></div>;
}

function Editor({ l, onSaved }: { l: Lesson; onSaved: () => void }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const tags = trpc.hashtags.list.useQuery();
  const [f, setF] = useState({ title: l.title, position: l.position, type: l.type as LessonType, status: l.status, intention: l.intention, durationMin: l.durationMin, videoUrl: l.videoUrl, testUrl: l.testUrl, hashtagIds: l.hashtagIds });
  const [rubrics, setRubrics] = useState<LessonRubrics>(l.rubrics);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setDirty(true); };
  const save = trpc.build.saveLesson.useMutation({
    // Relecture : les blocs reçoivent leur identifiant Notion, un second enregistrement ne les recrée pas
    onSuccess: async () => { setDirty(false); await utils.build.invalidate(); onSaved(); toast.success("Enregistré dans Notion"); },
    onError: (e) => { if (e.data?.code === "CONFLICT") setConflict(true); else toast.error(e.message, { duration: 8000 }); },
  });
  const archive = trpc.build.archiveLesson.useMutation({ onSuccess: () => { utils.build.invalidate(); toast.success("Leçon supprimée, à la corbeille de Notion"); navigate(`/admin/construire/${l.courseId}`); }, onError: (e) => toast.error(e.message) });
  const duplicate = trpc.build.duplicateLesson.useMutation({ onSuccess: (r) => { utils.build.invalidate(); toast.success("Leçon copiée dans Notion, en brouillon"); navigate(`/admin/construire/${l.courseId}/lecon/${r.id}`); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  useLeaveWarning(dirty);
  useEffect(() => { setConflict(false); }, [l.id]);
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-1"><span className="p-eyebrow">{l.courseTitle} · {l.sectionTitle}</span><h2 className="m-0 text-[30px] leading-tight break-words">{f.title || "Sans titre"}</h2></div>
        <span className="flex flex-wrap gap-2">
          <Link to={`/admin/construire/${l.courseId}/apercu/${l.id}`} className="p-btn-outline p-btn-sm no-underline"><Eye size={14} /> Aperçu comme un membre</Link>
          <a href={notionUrl(l.notionPageId)} target="_blank" rel="noopener noreferrer" className="p-btn-outline p-btn-sm no-underline"><ExternalLink size={14} /> Ouvrir dans Notion</a>
        </span>
      </header>
      <IssueList issues={l.issues} />
      {conflict && <NotionConflict onResolved={() => { setConflict(false); setDirty(false); onSaved(); }} />}
      <section className="p-card p-4 sm:p-5 flex flex-col gap-3.5" aria-label="Fiche de la leçon">
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Titre</span><input className="p-field" value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Type" value={f.type} onChange={(type) => set({ type })} options={LESSON_TYPES.map((t): [LessonType, string] => [t, LESSON_TYPE_LABEL[t]])} />
          <Select label="Statut" value={f.status} onChange={(status) => set({ status })} options={Object.entries(LESSON_STATUS_LABEL) as [Lesson["status"], string][]} />
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Ordre dans la section</span><input type="number" min={0} className="p-field" value={f.position} onChange={(e) => set({ position: Number(e.target.value) })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Durée estimée (min)</span><input type="number" min={0} className="p-field" value={f.durationMin ?? ""} onChange={(e) => set({ durationMin: e.target.value === "" ? null : Number(e.target.value) })} /></label>
        </div>
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Intention</span><textarea className="p-field" rows={2} value={f.intention} onChange={(e) => set({ intention: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Vidéo principale (lien)</span><input className="p-field" value={f.videoUrl} placeholder="https://…" onChange={(e) => set({ videoUrl: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Test intégré (adresse de la page)</span><input className="p-field" value={f.testUrl} placeholder="https://…" onChange={(e) => set({ testUrl: e.target.value })} /></label>
        </div>
        <div className="flex flex-col gap-1.5"><span className="text-[13px] p-muted">Hashtags de la communauté</span><HashtagPicker all={tags.data ?? []} value={f.hashtagIds} onChange={(hashtagIds) => set({ hashtagIds })} /></div>
      </section>
      {LESSON_RUBRICS.filter((r) => r.key !== "intention").map((r) => (
        <section key={r.key} className="p-card p-4 sm:p-5 flex flex-col gap-3" aria-label={r.title}>
          <h3 className="m-0 text-[24px]">{r.title}</h3>
          {r.key === "exercice" && <p className="m-0 text-[13.5px] p-muted">Chaque question reçoit un champ de réponse, rangé dans le journal privé du membre.</p>}
          {r.key === "defi" && <p className="m-0 text-[13.5px] p-muted">Les membres voient ce texte et le bouton « J’ai relevé ce défi ».</p>}
          <BlockEditor label={r.title} large={r.key === "contenu"} questions={r.key === "exercice"} blocks={rubrics[r.key]} onChange={(b) => { setRubrics((x) => ({ ...x, [r.key]: b })); setDirty(true); }} />
        </section>
      ))}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="p-btn-outline p-btn-sm" disabled={duplicate.isPending} onClick={() => duplicate.mutate({ id: l.id })}>{duplicate.isPending ? "Copie dans Notion…" : "Dupliquer cette leçon"}</button>
        <ConfirmButton label="Supprimer cette leçon" question="Mettre cette leçon à la corbeille de Notion ? Elle disparaît pour les membres, leurs réponses restent dans leur journal." confirm="Supprimer" danger disabled={archive.isPending} onConfirm={() => archive.mutate({ id: l.id })} />
      </div>
      <SaveBar dirty={dirty} disabled={!f.title.trim()} saving={save.isPending} onSave={() => save.mutate({ id: l.id, ...f, rubrics: rubrics as never })} />
    </>
  );
}
