import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Check, Copy, ExternalLink, Flag, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import type { CourseBlock } from "../../../../server/lib/courseBlocks";
import { ConfirmButton } from "../shared";
import { BlockEditor, DocProvider, DocToolbar, HashtagPicker, remapIds, sendableBlocks } from "./BlockEditor";
import { AutoGrow, PropRow } from "./BuildLesson";
import { CoursePanel } from "./CoursePanel";
import { CreatorShell } from "./CreatorShell";
import { IssueList, NotionConflict, SaveStatus, useDocSaver, useLeaveGuard, useLeaveWarning } from "./EditorParts";
import { notionUrl } from "./labels";

type Section = RouterOutputs["build"]["section"];

/** Modifier une section : son intention, ses objectifs et son défi. Ses leçons se gèrent depuis le plan de la formation. */
export default function BuildSection() {
  const { id, sectionId } = useParams();
  // Une saisie en cours ne doit jamais être écrasée. Rien n'est gardé en mémoire : une fiche rouverte repart de la dernière copie.
  const q = trpc.build.section.useQuery({ id: Number(sectionId) }, { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, gcTime: 0 });
  const course = trpc.build.course.useQuery({ id: Number(id) }, { retry: false, refetchOnWindowFocus: false });
  const [revision, setRevision] = useState(0);
  const crumbs = [{ label: "Mes formations", to: "/admin/construire" }, { label: course.data?.title ?? "Formation", to: `/admin/construire/${id}` }];
  if (!q.data) return <CreatorShell wide aside={<CoursePanel c={course.data} currentSection={Number(sectionId)} />} crumbs={crumbs}><p className="p-muted text-center py-16 m-0">{q.isLoading ? "Chargement…" : (q.error?.message ?? "Section introuvable")}</p></CreatorShell>;
  return <Editor key={`${q.data.id}-${revision}`} s={q.data} course={course.data} crumbs={crumbs} reload={() => setRevision((r) => r + 1)} refetch={() => q.refetch()} />;
}

function Editor({ s, course, crumbs, reload, refetch }: { s: Section; course: RouterOutputs["build"]["course"] | undefined; crumbs: { label: string; to?: string }[]; reload: () => void; refetch: () => Promise<unknown> }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const tags = trpc.hashtags.list.useQuery();
  const [f, setF] = useState({ title: s.title, position: s.position, intention: s.intention, hashtagIds: s.hashtagIds });
  const [objectifs, setObjectifs] = useState<CourseBlock[]>(s.rubrics.objectifs);
  const [defi, setDefi] = useState<CourseBlock[]>(s.rubrics.defi);
  const [intention, setIntention] = useState<CourseBlock[]>(s.rubrics.intention);
  const [issues, setIssues] = useState(s.issues);
  const [conflict, setConflict] = useState(false);
  const live = useRef({ f, objectifs, defi, intention });
  live.current = { f, objectifs, defi, intention };
  const save = trpc.build.saveSection.useMutation();
  const write = async () => {
    const now = live.current;
    const sentObjectifs = sendableBlocks(now.objectifs);
    const sentDefi = sendableBlocks(now.defi);
    try {
      await save.mutateAsync({ id: s.id, ...now.f, rubrics: { intention: now.intention, objectifs: sentObjectifs, defi: sentDefi } as never });
    } catch (e) {
      if ((e as { data?: { code?: string } }).data?.code === "CONFLICT") setConflict(true);
      else toast.error(e instanceof Error ? e.message : "Enregistrement impossible", { duration: 8000 });
      throw e;
    }
    const fresh = await utils.build.section.fetch({ id: s.id }, { staleTime: 0 });
    const a = remapIds(live.current.objectifs, sentObjectifs, fresh.rubrics.objectifs);
    const b = remapIds(live.current.defi, sentDefi, fresh.rubrics.defi);
    if (!a || !b) { await utils.build.invalidate(); return reload(); }
    // Tout de suite : l'enregistrement suivant peut partir avant le prochain affichage, et doit connaître ces identifiants
    live.current = { ...live.current, objectifs: a, defi: b, intention: fresh.rubrics.intention };
    setObjectifs(a); setDefi(b); setIntention(fresh.rubrics.intention); setIssues(fresh.issues);
    utils.build.course.invalidate({ id: s.courseId });
  };
  // Une section n'a pas de statut : ce qui s'y écrit se voit dès qu'une de ses leçons est publiée, l'enregistrement reste volontaire dans ce cas
  const visible = !!course?.sections.find((x) => x.id === s.id)?.lessons.some((l) => l.status === "publie");
  const auto = !visible;
  const saver = useDocSaver({ auto, ready: !!f.title.trim() && !conflict, write });
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); saver.touch(); };
  const archive = trpc.build.archiveSection.useMutation({ onSuccess: () => { utils.build.invalidate(); toast.success("Section et leçons à la corbeille de Notion"); navigate(`/admin/construire/${s.courseId}`); }, onError: (e) => toast.error(e.message) });
  const duplicate = trpc.build.duplicateSection.useMutation({ onSuccess: (r) => { utils.build.invalidate(); toast.success("Section et leçons copiées dans Notion, leçons en brouillon"); navigate(`/admin/construire/${s.courseId}/section/${r.id}`); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  useLeaveWarning(saver.state !== "saved");
  const leave = useLeaveGuard({ pending: saver.pending, auto, save: saver.saveNow });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saver.saveNow(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saver.saveNow]);
  const index = course?.sections.findIndex((x) => x.id === s.id) ?? -1;
  return (
    <CreatorShell wide aside={<CoursePanel c={course} currentSection={s.id} />} crumbs={[...crumbs, { label: f.title || "Sans titre" }]} actions={
      <>
        <SaveStatus state={saver.state} auto={auto} />
        <button type="button" className="cr-btn cr-btn-primary" disabled={!f.title.trim() || saver.state === "saving" || conflict} title="Ctrl ou Cmd + S" onClick={() => void saver.saveNow()}><Check size={16} /> Enregistrer</button>
      </>
    }>
      {leave}
      <main className="w-full max-w-[1250px] mx-auto px-3 sm:px-6 lg:px-10 pt-7 pb-14 flex flex-wrap gap-7 items-start">
        <DocProvider className="flex-[999_1_560px] min-w-0">
          <article className="cr-doc p-card px-4 py-6 sm:px-8 sm:py-9 lg:pl-[88px] lg:pr-16 lg:pt-12 lg:pb-11 flex flex-col">
            {conflict && <div className="mb-5"><NotionConflict onResolved={() => { setConflict(false); void refetch().then(reload); }} /></div>}
            <p className="m-0 mb-5 px-2 text-[11px] tracking-[0.22em]" style={{ color: "var(--p-accent)" }}>SECTION {String(index + 1).padStart(2, "0")}</p>
            <div className="px-2 mb-3"><AutoGrow label="Titre de la section" className="cr-doc-title" placeholder="Titre de la section" value={f.title} onChange={(title) => set({ title })} /></div>
            <div className="flex flex-col mb-5">
              <PropRow icon={<Target size={15} strokeWidth={1.6} />} label="Intention"><AutoGrow label="Intention" className="cr-prop" placeholder="Ce que cette section permet…" value={f.intention} onChange={(v) => set({ intention: v })} /></PropRow>
            </div>
            <DocToolbar />
            <section className="flex flex-col" aria-labelledby="objectifs">
              <h2 id="objectifs" className="cr-doc-h px-2 mb-2">Objectifs</h2>
              <BlockEditor label="Objectifs" addKind="bullet" addLabel="Ajouter un objectif" placeholder="Un objectif…" blocks={objectifs} onChange={(b) => { setObjectifs(b); saver.touch(); }} />
            </section>
            <section className="flex gap-3.5 items-start rounded-[14px] p-4 mt-7" style={{ background: "#F3ECE8" }} aria-label="Défi dans le réseau">
              <span className="w-[30px] h-[30px] flex-none rounded-lg flex items-center justify-center" style={{ background: "#fff", color: "#AA564C" }}><Flag size={15} /></span>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[11px] tracking-[0.22em] px-2" style={{ color: "#AA564C" }}>DÉFI DANS LE RÉSEAU</span>
                <BlockEditor label="Défi dans le réseau" variant="defi" addLabel="Ajouter au défi" placeholder="Le défi à relever dans le réseau…" blocks={defi} onChange={(b) => { setDefi(b); saver.touch(); }} />
                <span className="text-[11px] px-2 p-muted">Facultatif. Les membres voient ce texte et le bouton « J’ai relevé ce défi » ; il ne compte pas pour terminer la section.</span>
              </div>
            </section>
          </article>
        </DocProvider>
        <aside aria-label="Réglages de la section" className="flex-[1_1_200px] lg:max-w-[235px] lg:border-l lg:pl-6 pt-1 w-full" style={{ borderColor: "var(--p-line)" }}>
          <h3 className="m-0 text-[14px]">Réglages de la section</h3>
          <div className="mt-4 flex flex-col gap-[18px]">
            <IssueList issues={issues} />
            <p className="m-0 text-[12px] p-muted leading-snug">{visible ? "Visible par les membres : une de ses leçons est publiée. Vos modifications leur arrivent quand vous cliquez sur Enregistrer." : "Invisible des membres tant qu’aucune de ses leçons n’est publiée. Tout s’enregistre au fil de votre écriture."}</p>
            <label className="flex flex-col gap-2 text-[12px] font-medium">Ordre (semaine d’ouverture)<input type="number" min={0} className="border rounded-md px-3 py-2.5 text-[14px] font-normal bg-white w-full" style={{ borderColor: "var(--p-line)" }} value={f.position} onChange={(e) => set({ position: Number(e.target.value) })} /></label>
            <div className="flex flex-col gap-2"><span className="text-[12px] font-medium">Hashtags</span><HashtagPicker all={tags.data ?? []} value={f.hashtagIds} onChange={(hashtagIds) => set({ hashtagIds })} /></div>
            <div className="flex flex-col items-start gap-1.5 text-[12px]">
              <a href={notionUrl(s.notionPageId)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 no-underline py-1 p-muted"><ExternalLink size={14} /> Ouvrir dans Notion</a>
              <button type="button" className="flex items-center gap-1.5 py-1 p-muted" disabled={duplicate.isPending} onClick={() => duplicate.mutate({ id: s.id })}><Copy size={14} /> {duplicate.isPending ? "Copie dans Notion…" : "Dupliquer avec ses leçons"}</button>
              <ConfirmButton label={<span className="flex items-center gap-1.5"><Trash2 size={14} /> Supprimer la section</span>} className="py-1 p-muted" question="Mettre cette section et ses leçons à la corbeille de Notion ? Elles disparaissent pour les membres, leurs réponses restent dans leur journal." confirm="Supprimer" danger disabled={archive.isPending} onConfirm={() => archive.mutate({ id: s.id })} />
            </div>
          </div>
        </aside>
      </main>
    </CreatorShell>
  );
}
