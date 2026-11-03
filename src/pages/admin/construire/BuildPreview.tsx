import { Link, useParams } from "react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { LessonReader } from "@/components/course/LessonReader";
import { trpc } from "@/providers/trpc";
import { Badge } from "../shared";
import { CreatorShell } from "./CreatorShell";
import { LESSON_STATUS_LABEL, statusTone } from "./labels";

/** Aperçu comme un membre : quel que soit le statut, sans rien enregistrer. */
export default function BuildPreview() {
  const { id, lessonId } = useParams();
  const q = trpc.build.preview.useQuery({ id: Number(lessonId) }, { retry: false });
  const crumbs = [{ label: "Mes formations", to: "/admin/createur" }, { label: "Formation", to: `/admin/createur/${id}` }, { label: "Aperçu" }];
  const back = <Link to={`/admin/createur/${id}`} className="p-btn-outline p-btn-sm no-underline"><ArrowLeft size={15} /> La formation</Link>;
  if (!q.data) return <CreatorShell crumbs={crumbs}><p className="p-muted text-center py-16 m-0">{q.isLoading ? "Chargement…" : (q.error?.message ?? "Leçon introuvable")}</p></CreatorShell>;
  return (
    <CreatorShell crumbs={crumbs}>
    <main className="w-full max-w-[1000px] mx-auto px-4 lg:px-10 pt-7 pb-14 flex flex-col gap-5">
      <div className="p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-[14px]" style={{ background: "var(--p-accent-soft)" }}>
        <span className="flex flex-wrap items-center gap-2"><b>Aperçu comme un membre.</b> Rien n’est enregistré. <Badge tone={statusTone(q.data.status)}>{LESSON_STATUS_LABEL[q.data.status]}</Badge></span>
        <span className="flex flex-wrap gap-2">{back}<Link to={`/admin/createur/${id}/lecon/${lessonId}`} className="p-btn-outline p-btn-sm no-underline"><Pencil size={14} /> Modifier</Link></span>
      </div>
      <LessonReader key={q.data.id} m={q.data} />
    </main>
    </CreatorShell>
  );
}
