import { useEffect, useRef } from "react";
import { Link, Navigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { LessonReader } from "@/components/course/LessonReader";

export default function LessonPage() {
  const { courseId, lessonId } = useParams();
  const id = Number(lessonId);
  const utils = trpc.useUtils();
  const q = trpc.courses.lesson.useQuery({ id }, { retry: false });
  const opened = trpc.courses.markOpened.useMutation({ onSuccess: () => { utils.courses.weekSection.invalidate(); utils.courses.course.invalidate(); } });
  const marked = useRef(0);
  const readable = !!q.data;
  useEffect(() => {
    // Leçon ouverte : inscrite une fois, à la première lecture
    if (readable && marked.current !== id) { marked.current = id; opened.mutate({ id }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readable, id]);
  const back = <Link to={`/parcours/${courseId}${q.data ? `#section-${q.data.section.id}` : ""}`} className="p-btn-ghost no-underline self-start"><ArrowLeft size={15} /> La formation</Link>;
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (!q.data) return <div className="max-w-[760px] mx-auto flex flex-col gap-4">{back}<p className="p-soft p-6 m-0 text-center">{q.error?.message ?? "Cette leçon n’est pas accessible."}</p></div>;
  return <div className="flex flex-col gap-5"><div className="max-w-[760px] w-full mx-auto">{back}</div><LessonReader key={q.data.id} m={q.data} /></div>;
}

/** Une ancienne adresse de module (notification, e-mail déjà envoyé) mène à la leçon qui l'a reprise, sinon à la formation. */
export function LegacyModuleRedirect() {
  const { courseId, moduleId } = useParams();
  const q = trpc.courses.legacyLesson.useQuery({ moduleId: Number(moduleId) }, { retry: false });
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  return <Navigate to={q.data?.lessonId ? `/parcours/${courseId}/lecon/${q.data.lessonId}` : `/parcours/${courseId}`} replace />;
}
