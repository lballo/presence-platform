import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleCheck, CircleHelp, Copy, Eye, ExternalLink, Flag, PanelLeftOpen, Target, Trash2, Type, Video } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { LESSON_RUBRICS, type CourseBlock, type LessonType } from "../../../../server/lib/courseBlocks";
import { ConfirmButton } from "../shared";
import { BlockEditor, DocProvider, DocToolbar, focusBlock, HashtagPicker, makeText, PageAdd, remapIds, sendableBlocks, type PageItem } from "./BlockEditor";
import { CoursePanel, lessonPlace } from "./CoursePanel";
import { CreatorShell } from "./CreatorShell";
import { IssueList, NotionConflict, SaveStatus, useDocSaver, useLeaveGuard, useLeaveWarning } from "./EditorParts";
import { LESSON_STATUS_LABEL, notionUrl } from "./labels";

type Lesson = RouterOutputs["build"]["lesson"];
type RubricKey = (typeof LESSON_RUBRICS)[number]["key"];
type LessonRubrics = Record<RubricKey, CourseBlock[]>;
type PageBlock = "video" | "test" | "intention" | "contenu" | "exercice" | "defi" | "plusLoin";

/**
 * Une rubrique vidée puis enregistrée reste vide à la réouverture : elle ne revient pas.
 * Un lien vide ne se distingue pas d'un lien jamais rempli : ce choix-là est gardé dans ce navigateur.
 */
const removedKey = (id: number) => `construire:lecon:${id}:retires`;
const readRemoved = (id: number): string[] => { try { return JSON.parse(localStorage.getItem(removedKey(id)) ?? "[]") as string[]; } catch { return []; } };
const writeRemoved = (id: number, list: string[]) => { try { localStorage.setItem(removedKey(id), JSON.stringify(list)); } catch { /* le choix ne durera que le temps de la page */ } };

/** Une zone de saisie qui grandit avec son texte, sans barre de défilement. */
export function AutoGrow({ value, onChange, className, placeholder, label, onEnter, field }: { value: string; onChange: (v: string) => void; className: string; placeholder?: string; label: string; onEnter?: () => void; field?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }, [value]);
  return <textarea ref={ref} rows={1} data-page-field={field} aria-label={label} className={className} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }} />;
}

/** Une ligne de propriété du document : l'étiquette, puis un champ sans cadre. */
export function PropRow({ icon, label, children, onRemove }: { icon: ReactNode; label: string; children: ReactNode; onRemove?: () => void }) {
  return (
    <div className="cr-removable flex flex-wrap items-start gap-x-3 min-h-[34px] px-2">
      <span className="flex-[0_0_150px] flex items-center gap-2 h-[33px] text-[14px] p-muted">{icon}{label}</span>
      <div className="flex-[1_1_200px] min-w-0">{children}</div>
      {onRemove && <RemoveBlock label={label} onRemove={onRemove} />}
    </div>
  );
}

/** Retirer un bloc de la page. S'il contient déjà quelque chose, on le demande d'abord. */
export function RemoveBlock({ label, filled, onRemove }: { label: string; filled?: boolean; onRemove: () => void }) {
  const name = `Supprimer le bloc « ${label} »`;
  if (filled) return <ConfirmButton label={<><Trash2 size={15} /><span className="sr-only">{name}</span></>} className="cr-icon cr-remove" question={`Supprimer « ${label} » et son contenu ? Il part aussi de Notion.`} confirm="Supprimer" onConfirm={onRemove} />;
  return <button type="button" aria-label={name} title={name} className="cr-icon cr-remove" onClick={onRemove}><Trash2 size={15} /></button>;
}

/** Du texte vraiment écrit, et pas seulement l'invite « À écrire ». */
export const hasWritten = (list: CourseBlock[]) => list.some((b) => b.type !== "unknown" && !("draft" in b && b.draft));
export const hasBlocks = (list: CourseBlock[]) => list.some((b) => b.type !== "unknown");

const focusFirstBlock = () => (document.querySelector("[data-doc-root] .ProseMirror") as HTMLElement | null)?.focus();

/** Modifier une leçon, comme un document : chaque enregistrement écrit dans Notion. */
export default function BuildLesson() {
  const { id, lessonId } = useParams();
  // Une saisie en cours ne doit jamais être écrasée : la fiche ne se recharge que si on le demande.
  // Rien n'est gardé en mémoire : une fiche rouverte sur une ancienne copie remettrait son ancien statut à l'enregistrement.
  const q = trpc.build.lesson.useQuery({ id: Number(lessonId) }, { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, gcTime: 0 });
  const course = trpc.build.course.useQuery({ id: Number(id) }, { retry: false, refetchOnWindowFocus: false });
  const [revision, setRevision] = useState(0);
  const crumbs = [{ label: "Mes formations", to: "/admin/construire" }, { label: course.data?.title ?? "Formation", to: `/admin/construire/${id}` }];
  if (!q.data) return <CreatorShell wide aside={<CoursePanel c={course.data} currentLesson={Number(lessonId)} />} crumbs={crumbs}><p className="p-muted text-center py-16 m-0">{q.isLoading ? "Chargement…" : (q.error?.message ?? "Leçon introuvable")}</p></CreatorShell>;
  return <Editor key={`${q.data.id}-${revision}`} l={q.data} course={course.data} crumbs={crumbs} reload={() => setRevision((r) => r + 1)} refetch={() => q.refetch()} />;
}

function Editor({ l, course, crumbs, reload, refetch }: { l: Lesson; course: RouterOutputs["build"]["course"] | undefined; crumbs: { label: string; to?: string }[]; reload: () => void; refetch: () => Promise<unknown> }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const tags = trpc.hashtags.list.useQuery();
  const [f, setF] = useState({ title: l.title, position: l.position, type: l.type as LessonType, status: l.status, intention: l.intention, durationMin: l.durationMin, videoUrl: l.videoUrl, testUrl: l.testUrl, hashtagIds: l.hashtagIds });
  const [rubrics, setRubrics] = useState<LessonRubrics>(l.rubrics);
  const [issues, setIssues] = useState(l.issues);
  const [conflict, setConflict] = useState(false);
  const [panel, setPanel] = useState(true);
  // « Pour aller plus loin » n'est pas là par défaut : il s'ajoute avec le « + » du bas de page
  const [shown, setShown] = useState<Set<PageBlock>>(() => {
    const removed = readRemoved(l.id);
    const out = new Set<PageBlock>();
    if (l.videoUrl || !removed.includes("video")) out.add("video");
    if (l.testUrl || !removed.includes("test")) out.add("test");
    if (l.intention) out.add("intention");
    for (const key of ["contenu", "exercice", "defi"] as const) if (hasBlocks(l.rubrics[key])) out.add(key);
    if (hasWritten(l.rubrics.plusLoin)) out.add("plusLoin");
    return out;
  });
  const reveal = (id: PageBlock) => setShown((s) => new Set(s).add(id));
  const conceal = (id: PageBlock) => setShown((s) => { const next = new Set(s); next.delete(id); return next; });
  const live = useRef({ f, rubrics });
  live.current = { f, rubrics };
  const save = trpc.build.saveLesson.useMutation();

  const write = async () => {
    const { f: form, rubrics: current } = live.current;
    const sent = Object.fromEntries(LESSON_RUBRICS.map((r) => [r.key, sendableBlocks(current[r.key])])) as LessonRubrics;
    try {
      await save.mutateAsync({ id: l.id, ...form, rubrics: sent as never });
    } catch (e) {
      if ((e as { data?: { code?: string } }).data?.code === "CONFLICT") setConflict(true);
      else toast.error(e instanceof Error ? e.message : "Enregistrement impossible", { duration: 8000 });
      throw e;
    }
    // Les blocs reçoivent leur identifiant Notion, sans toucher au texte en cours de saisie
    const fresh = await utils.build.lesson.fetch({ id: l.id }, { staleTime: 0 });
    const next = { ...live.current.rubrics };
    for (const r of LESSON_RUBRICS) {
      if (r.key === "intention") { next.intention = fresh.rubrics.intention; continue; }
      const mapped = remapIds(next[r.key], sent[r.key], fresh.rubrics[r.key]);
      if (!mapped) { await utils.build.invalidate(); return reload(); }
      next[r.key] = mapped;
    }
    // Tout de suite : l'enregistrement suivant peut partir avant le prochain affichage, et doit connaître ces identifiants
    live.current = { ...live.current, rubrics: next };
    setRubrics(next);
    setIssues(fresh.issues);
    utils.build.course.invalidate({ id: l.courseId });
    utils.build.courses.invalidate();
  };
  const auto = f.status !== "publie";
  const saver = useDocSaver({ auto, ready: !!f.title.trim() && !conflict, write });
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); saver.touch(); };
  const setBlocks = (key: RubricKey, b: CourseBlock[]) => { setRubrics((x) => ({ ...x, [key]: b })); saver.touch(); };
  const removeLink = (id: "video" | "test") => {
    set(id === "video" ? { videoUrl: "" } : { testUrl: "" });
    conceal(id);
    writeRemoved(l.id, [...new Set([...readRemoved(l.id), id])]);
  };
  const addLink = (id: "video" | "test") => {
    flushSync(() => reveal(id));
    writeRemoved(l.id, readRemoved(l.id).filter((x) => x !== id));
    (document.querySelector(`[data-page-field="${id}"]`) as HTMLElement | null)?.focus();
  };
  // Un bloc Notion que l'application ne sait pas afficher reste dans Notion, quoi qu'il arrive
  const removeRubric = (key: Exclude<RubricKey, "intention">) => { setBlocks(key, live.current.rubrics[key].filter((b) => b.type === "unknown")); conceal(key); };
  const addRubric = (key: Exclude<RubricKey, "intention">, kind: "paragraph" | "bullet") => {
    const list = live.current.rubrics[key];
    const first = list.find((b) => b.type !== "unknown") ?? makeText(kind);
    flushSync(() => { reveal(key); if (!list.includes(first)) setBlocks(key, [...list, first]); });
    focusBlock(first);
  };
  const insertInContent = (b: CourseBlock) => {
    flushSync(() => { reveal("contenu"); setBlocks("contenu", [...live.current.rubrics.contenu, b]); });
    focusBlock(b);
  };
  const offered: (PageItem & { block: PageBlock })[] = [
    { block: "video", id: "b-video", label: "Vidéo principale", desc: "Un lien vers la vidéo", icon: <Video size={14} />, add: () => addLink("video") },
    { block: "test", id: "b-test", label: "Test intégré", desc: "Un lien vers le test", icon: <CircleCheck size={14} />, add: () => addLink("test") },
    { block: "intention", id: "b-intention", label: "Intention", desc: "Ce que la leçon permet", icon: <Target size={14} />, add: () => { flushSync(() => reveal("intention")); (document.querySelector('[data-page-field="intention"]') as HTMLElement | null)?.focus(); } },
    { block: "contenu", id: "b-contenu", label: "Contenu", desc: "Texte, titres, couleurs, liens", icon: <Type size={14} />, add: () => addRubric("contenu", "paragraph") },
    { block: "exercice", id: "b-exercice", label: "Questions clés", desc: "Réponses dans le journal privé", icon: <CircleHelp size={14} />, add: () => addRubric("exercice", "bullet") },
    { block: "defi", id: "b-defi", label: "Défi dans le réseau", desc: "Avec le bouton « J’ai relevé ce défi »", icon: <Flag size={14} />, add: () => addRubric("defi", "paragraph") },
    { block: "plusLoin", id: "b-plus-loin", label: "Pour aller plus loin", desc: "Lectures, liens, pistes", icon: <ArrowUpRight size={14} />, add: () => addRubric("plusLoin", "bullet") },
  ];
  const setStatus = (status: Lesson["status"]) => { live.current = { ...live.current, f: { ...live.current.f, status } }; setF((x) => ({ ...x, status })); saver.touchAndSave(); };

  const archive = trpc.build.archiveLesson.useMutation({ onSuccess: () => { utils.build.invalidate(); toast.success("Leçon supprimée, à la corbeille de Notion"); navigate(`/admin/construire/${l.courseId}`); }, onError: (e) => toast.error(e.message) });
  const duplicate = trpc.build.duplicateLesson.useMutation({ onSuccess: (r) => { utils.build.invalidate(); toast.success("Leçon copiée dans Notion, en brouillon"); navigate(`/admin/construire/${l.courseId}/lecon/${r.id}`); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  useLeaveWarning(saver.state !== "saved");
  const leave = useLeaveGuard({ pending: saver.pending, auto, save: saver.saveNow });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saver.saveNow(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saver.saveNow]);

  const place = lessonPlace(course, l.id);
  const prev = place?.prev;
  const next = place?.next;
  return (
    <CreatorShell wide={panel} aside={panel ? <CoursePanel c={course} currentLesson={l.id} onHide={() => setPanel(false)} /> : <div className="flex flex-col items-center pt-7 w-[60px]"><button type="button" aria-label="Afficher le parcours" title="Afficher le parcours" className="cr-icon w-9 h-9" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent)" }} onClick={() => setPanel(true)}><PanelLeftOpen size={17} /></button></div>} crumbs={[...crumbs, { label: f.title || "Sans titre" }]} actions={
      <>
        <SaveStatus state={saver.state} auto={auto} />
        <Link to={`/admin/construire/${l.courseId}/apercu/${l.id}`} className="cr-btn"><Eye size={16} /> Aperçu</Link>
        <button type="button" className="cr-btn cr-btn-primary" disabled={!f.title.trim() || saver.state === "saving" || conflict} title="Ctrl ou Cmd + S" onClick={() => void saver.saveNow()}><Check size={16} /> Enregistrer</button>
      </>
    }>
      {leave}
      <main className="w-full max-w-[1250px] mx-auto px-3 sm:px-6 lg:px-10 pt-7 pb-14 flex flex-wrap gap-7 items-start">
        <DocProvider className="flex-[999_1_560px] min-w-0">
          <article className="cr-doc p-card px-4 py-6 sm:px-8 sm:py-9 lg:pl-[88px] lg:pr-16 lg:pt-12 lg:pb-11 flex flex-col">
            {conflict && <div className="mb-5"><NotionConflict onResolved={() => { setConflict(false); void refetch().then(reload); }} /></div>}
            <div className="flex flex-wrap justify-between gap-4 mb-5 px-2">
              <p className="m-0 text-[11px] tracking-[0.22em]" style={{ color: "var(--p-accent)" }}>{place?.section ?? l.sectionTitle.toUpperCase()}</p>
              {place && <p className="m-0 text-[12px] p-muted">{place.position}</p>}
            </div>
            <div className="px-2 mb-3"><AutoGrow label="Titre de la leçon" className="cr-doc-title" placeholder="Titre de la leçon" value={f.title} onChange={(title) => set({ title })} onEnter={focusFirstBlock} /></div>
            <div className="flex flex-col mb-4">
              {shown.has("video") && <PropRow icon={<Video size={15} strokeWidth={1.6} />} label="Vidéo principale" onRemove={() => removeLink("video")}><input type="url" data-page-field="video" aria-label="Vidéo principale" className="cr-prop" placeholder="Coller un lien…" value={f.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} /></PropRow>}
              {shown.has("test") && <PropRow icon={<CircleCheck size={15} strokeWidth={1.6} />} label="Test intégré" onRemove={() => removeLink("test")}><input type="url" data-page-field="test" aria-label="Test intégré" className="cr-prop" placeholder="Coller un lien…" value={f.testUrl} onChange={(e) => set({ testUrl: e.target.value })} /></PropRow>}
              {shown.has("intention") && <PropRow icon={<Target size={15} strokeWidth={1.6} />} label="Intention" onRemove={() => { set({ intention: "" }); conceal("intention"); }}><AutoGrow field="intention" label="Intention" className="cr-prop" placeholder="Ce que la leçon permet…" value={f.intention} onChange={(intention) => set({ intention })} /></PropRow>}
            </div>
            <DocToolbar />
            {shown.has("contenu") && (
              <section className="cr-removable flex flex-col" aria-label="Bloc Contenu">
                <div className="flex flex-wrap items-center justify-between min-h-[28px] px-2"><span className="cr-remove text-[10px] font-medium tracking-[0.12em] p-muted">CONTENU</span><RemoveBlock label="Contenu" filled={hasWritten(rubrics.contenu)} onRemove={() => removeRubric("contenu")} /></div>
                <BlockEditor label="Contenu" emptyHeight blocks={rubrics.contenu} onChange={(b) => setBlocks("contenu", b)} />
              </section>
            )}

            {shown.has("exercice") && (
              <section className="cr-removable flex flex-col mt-7" aria-labelledby="questions-cles">
                <div className="px-2 flex flex-wrap items-start justify-between gap-x-3"><h2 id="questions-cles" className="cr-doc-h flex-1">Questions clés</h2><RemoveBlock label="Questions clés" filled={hasWritten(rubrics.exercice)} onRemove={() => removeRubric("exercice")} /><p className="m-0 mt-0.5 mb-2 basis-full text-[12px] p-muted">Chaque question reçoit un champ de réponse, rangé dans le journal privé du membre.</p></div>
                <BlockEditor label="Exercice" marker="?" addKind="bullet" addLabel="Ajouter une question" placeholder="Une question…" blocks={rubrics.exercice} onChange={(b) => setBlocks("exercice", b)} />
              </section>
            )}

            {shown.has("defi") && (
              <section className="cr-removable flex gap-3.5 items-start rounded-[14px] p-4 mt-7" style={{ background: "#F3ECE8" }} aria-label="Défi dans le réseau">
                <span className="w-[30px] h-[30px] flex-none rounded-lg flex items-center justify-center" style={{ background: "#fff", color: "#AA564C" }}><Flag size={15} /></span>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 px-2"><span className="text-[11px] tracking-[0.22em]" style={{ color: "#AA564C" }}>DÉFI DANS LE RÉSEAU</span><RemoveBlock label="Défi dans le réseau" filled={hasWritten(rubrics.defi)} onRemove={() => removeRubric("defi")} /></div>
                  <BlockEditor label="Défi dans le réseau" variant="defi" addLabel="Ajouter au défi" placeholder="Le défi à relever dans le réseau…" blocks={rubrics.defi} onChange={(b) => setBlocks("defi", b)} />
                  <span className="text-[11px] px-2 p-muted">Les membres verront aussi le bouton « J’ai relevé ce défi ».</span>
                </div>
              </section>
            )}

            {shown.has("plusLoin") && (
              <section className="cr-removable flex flex-col mt-7" aria-labelledby="plus-loin">
                <div className="px-2 flex flex-wrap items-start justify-between gap-x-3"><h2 id="plus-loin" className="cr-doc-h flex-1">Pour aller plus loin</h2><RemoveBlock label="Pour aller plus loin" filled={hasWritten(rubrics.plusLoin)} onRemove={() => removeRubric("plusLoin")} /><p className="m-0 mt-0.5 mb-2 basis-full text-[12px] p-muted">Des pistes complémentaires pour prolonger la leçon.</p></div>
                <BlockEditor label="Pour aller plus loin" marker="→" addKind="bullet" addLabel="Ajouter une piste" placeholder="Une ressource ou une piste…" blocks={rubrics.plusLoin} onChange={(b) => setBlocks("plusLoin", b)} />
              </section>
            )}

            <PageAdd items={offered.filter((o) => !shown.has(o.block))} onInsert={insertInContent} />

            <nav aria-label="Leçons voisines" className="mt-9 pt-4 border-t flex flex-wrap justify-between gap-4 text-[13px]" style={{ borderColor: "var(--p-line)" }}>
              {prev ? <Link to={`/admin/construire/${l.courseId}/lecon/${prev.id}`} className="flex items-center gap-2 no-underline p-muted"><ArrowLeft size={14} /> {prev.title}</Link> : <span className="flex items-center gap-2 p-muted opacity-50"><ArrowLeft size={14} /> Début du parcours</span>}
              {next ? <Link to={`/admin/construire/${l.courseId}/lecon/${next.id}`} className="flex items-center gap-2 no-underline font-medium text-right" style={{ color: "var(--p-accent)" }}>{next.title} <ArrowRight size={14} /></Link> : <span className="flex items-center gap-2 p-muted opacity-50">Fin du parcours <ArrowRight size={14} /></span>}
            </nav>
          </article>
        </DocProvider>

        <aside aria-label="Réglages de la leçon" className="flex-[1_1_200px] lg:max-w-[235px] lg:border-l lg:pl-6 pt-1 w-full" style={{ borderColor: "var(--p-line)" }}>
          <h3 className="m-0 text-[14px]">Réglages de la leçon</h3>
          <div className="mt-4 flex flex-col gap-[18px]">
            <IssueList issues={issues} />
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium">Statut du contenu</span>
              <div role="radiogroup" aria-label="Statut du contenu" className="flex flex-wrap gap-1 rounded-[10px] border p-[3px] bg-white" style={{ borderColor: "var(--p-line)" }}>
                {(Object.entries(LESSON_STATUS_LABEL) as [Lesson["status"], string][]).map(([s, label]) => <button key={s} type="button" role="radio" aria-checked={f.status === s} disabled={saver.state === "saving"} className="flex-[1_1_auto] rounded-[7px] px-2 py-[7px] text-[11.5px] font-medium whitespace-nowrap" style={f.status === s ? { background: s === "publie" ? "rgba(46, 125, 80, .12)" : "#F3ECE8", color: s === "publie" ? "#2b7a4b" : "var(--p-accent)" } : { color: "var(--p-ink-2)" }} onClick={() => { if (f.status !== s) setStatus(s); }}>{label}</button>)}
              </div>
              <span className="text-[11px] p-muted leading-snug">{f.status === "publie" ? "Visible par les membres. Vos modifications leur arrivent quand vous cliquez sur Enregistrer." : "Invisible des membres. Tout s’enregistre au fil de votre écriture."}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2 text-[12px] font-medium">Durée (min)<input type="number" min={0} className="border rounded-md px-3 py-2.5 text-[14px] font-normal bg-white w-full" style={{ borderColor: "var(--p-line)" }} value={f.durationMin ?? ""} onChange={(e) => set({ durationMin: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              <label className="flex flex-col gap-2 text-[12px] font-medium">Ordre<input type="number" min={0} className="border rounded-md px-3 py-2.5 text-[14px] font-normal bg-white w-full" style={{ borderColor: "var(--p-line)" }} value={f.position} onChange={(e) => set({ position: Number(e.target.value) })} /></label>
            </div>
            <div className="flex flex-col gap-2"><span className="text-[12px] font-medium">Hashtags</span><HashtagPicker all={tags.data ?? []} value={f.hashtagIds} onChange={(hashtagIds) => set({ hashtagIds })} /></div>
            <div className="flex flex-col items-start gap-1.5 text-[12px]">
              <a href={notionUrl(l.notionPageId)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 no-underline py-1 p-muted"><ExternalLink size={14} /> Ouvrir dans Notion</a>
              <button type="button" className="flex items-center gap-1.5 py-1 p-muted" disabled={duplicate.isPending} onClick={() => duplicate.mutate({ id: l.id })}><Copy size={14} /> {duplicate.isPending ? "Copie dans Notion…" : "Dupliquer la leçon"}</button>
              <ConfirmButton label={<span className="flex items-center gap-1.5"><Trash2 size={14} /> Supprimer la leçon</span>} className="py-1 p-muted" question="Mettre cette leçon à la corbeille de Notion ? Elle disparaît pour les membres, leurs réponses restent dans leur journal." confirm="Supprimer" danger disabled={archive.isPending} onConfirm={() => archive.mutate({ id: l.id })} />
            </div>
          </div>
        </aside>
      </main>
    </CreatorShell>
  );
}
