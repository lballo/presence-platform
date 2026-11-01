import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { ModuleReader } from "@/components/course/ModuleReader";

export default function ModulePage() {
  const { courseId, moduleId } = useParams();
  const id = Number(moduleId);
  const utils = trpc.useUtils();
  const q = trpc.courses.module.useQuery({ id }, { retry: false });
  const opened = trpc.courses.markOpened.useMutation({ onSuccess: () => utils.courses.weekModule.invalidate() });
  const marked = useRef(0);
  const readable = !!q.data;
  useEffect(() => {
    // Module ouvert : inscrit une fois, à la première lecture
    if (readable && marked.current !== id) { marked.current = id; opened.mutate({ id }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readable, id]);
  const back = <Link to={`/parcours/${courseId}`} className="p-btn-ghost no-underline self-start"><ArrowLeft size={15} /> La formation</Link>;
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (!q.data) return <div className="max-w-[760px] mx-auto flex flex-col gap-4">{back}<p className="p-soft p-6 m-0 text-center">{q.error?.message ?? "Ce module n’est pas accessible."}</p></div>;
  return <div className="flex flex-col gap-5"><div className="max-w-[760px] w-full mx-auto">{back}</div><ModuleReader key={q.data.id} m={q.data} /></div>;
}
