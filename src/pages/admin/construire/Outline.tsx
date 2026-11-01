import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal, flushSync } from "react-dom";
import { Link, useNavigate } from "react-router";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleCheck, Copy, Eye, FileText, Flag, GripVertical, PenLine, Pencil, Plus, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { LESSON_TYPE_LABEL, type LessonType } from "../../../../server/lib/courseBlocks";
import { ConfirmButton, Select } from "../shared";
import { useLeaveWarning } from "./EditorParts";
import { LESSON_STATUS_LABEL } from "./labels";

type Course = RouterOutputs["build"]["course"];
type Section = Course["sections"][number];
type Lesson = Section["lessons"][number];
type Drag = { kind: "section"; id: number } | { kind: "lesson"; id: number };
/** Où tomberait ce qu'on déplace : sa place parmi les sections, ou parmi les leçons d'une section. */
type Target = { kind: "section"; index: number } | { kind: "lesson"; sectionId: number; index: number };

const iconBtn = "cr-icon";
const TYPE_TILE: Record<LessonType, { icon: typeof Video; fg: string }> = { contenu: { icon: FileText, fg: "#6C6059" }, video: { icon: Video, fg: "#A83932" }, exercice: { icon: PenLine, fg: "#AA564C" }, test: { icon: CircleCheck, fg: "#3D3128" }, defi: { icon: Flag, fg: "#AD261E" } };

/** Le champ Type n'est plus à choisir dans Construire : une leçon de contenu avec une vidéo ou un test se montre comme telle. */
export const shownType = (l: { type: LessonType; hasVideo: boolean; hasTest: boolean }): LessonType => (l.type !== "contenu" ? l.type : l.hasVideo ? "video" : l.hasTest ? "test" : "contenu");

/** Le format d'une leçon, d'un coup d'œil. */
export function TypeTile({ type, size = 32 }: { type: LessonType; size?: number }) {
  const { icon: Icon, fg } = TYPE_TILE[type];
  return <span aria-hidden="true" className="flex-none rounded-md flex items-center justify-center" style={{ width: size, height: size, background: "#F3ECE8", color: fg }}><Icon size={size >= 32 ? 16 : 14} /></span>;
}
const mouse = window.matchMedia("(pointer: fine)").matches; // au doigt, les flèches suffisent
const isPublished = (l: { status: string }) => l.status === "publie";

/** Le plan d'une formation : créer et réordonner les sections et leurs leçons, au glisser-déposer ou avec les flèches sur téléphone. */
export function Outline({ c }: { c: Course }) {
  const utils = trpc.useUtils();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  // Le nouvel ordre se voit tout de suite : l'écriture dans Notion suit, sans bloquer le déplacement suivant
  const [moving, setMoving] = useState<Section[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [landed, setLanded] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [addingLesson, setAddingLesson] = useState<Section | null>(null);
  // Tout est déplié par défaut : on glisse une leçon d'une section à l'autre sans rien ouvrir. Replier ne sert qu'à y voir plus clair.
  const [closed, setClosed] = useState<Record<number, boolean>>({});
  const refresh = () => utils.build.invalidate();
  const moved = trpc.build.reorderSections.useMutation();
  const movedLesson = trpc.build.reorderLessons.useMutation();
  const dupSection = trpc.build.duplicateSection.useMutation({ onSuccess: () => { refresh(); toast.success("Section et leçons copiées dans Notion, leçons en brouillon"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  const dupLesson = trpc.build.duplicateLesson.useMutation({ onSuccess: () => { refresh(); toast.success("Leçon copiée dans Notion, en brouillon"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  // Une section apparaît dès qu'une de ses leçons est publiée : le message le dit quand cela change
  const setLesson = trpc.build.setLessonStatus.useMutation({
    onSuccess: (_r, v) => {
      refresh();
      const section = c.sections.find((s) => s.lessons.some((l) => l.id === v.id));
      const alone = section && !section.lessons.some((l) => l.id !== v.id && isPublished(l));
      if (v.status === "publie") toast.success(alone ? `Leçon publiée : la section « ${section.title} » apparaît pour les membres.` : "Leçon publiée dans Notion et ici");
      else toast.success(alone ? `Leçon dépubliée : la section « ${section.title} » n’apparaît plus pour les membres.` : "Leçon dépubliée dans Notion et ici");
    },
    onError: (e) => toast.error(e.message, { duration: 8000 }),
  });
  const archiveSection = trpc.build.archiveSection.useMutation({ onSuccess: () => { refresh(); toast.success("Section et leçons à la corbeille de Notion"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  const archiveLesson = trpc.build.archiveLesson.useMutation({ onSuccess: () => { refresh(); toast.success("Leçon à la corbeille de Notion"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  const busy = dupSection.isPending || dupLesson.isPending;

  const sections = moving ?? c.sections;
  useLeaveWarning(writing);

  // La ligne déplacée reste marquée un instant une fois Notion à jour : on voit où elle est arrivée
  useEffect(() => {
    if (!landed || writing) return;
    const t = setTimeout(() => setLanded(null), 1800);
    return () => clearTimeout(t);
  }, [landed, writing]);

  /** Les écritures partent une à une, dans l'ordre des gestes. Si l'une échoue, on repart de ce que Notion a vraiment reçu. */
  const queue = useRef({ chain: Promise.resolve(), waiting: 0, failed: false });
  const enqueue = (write: () => Promise<unknown>) => {
    const q = queue.current;
    q.waiting++;
    setWriting(true);
    q.chain = q.chain.then(async () => {
      if (!q.failed) {
        try { await write(); } catch (e) { q.failed = true; toast.error(e instanceof Error ? e.message : "L’écriture dans Notion a échoué.", { duration: 8000 }); }
      }
      if (--q.waiting > 0) return;
      const failed = q.failed;
      q.failed = false;
      await refresh();
      if (q.waiting > 0) return; // un autre geste est arrivé pendant la relecture
      setMoving(null);
      setWriting(false);
      if (!failed) toast.success("Nouvel ordre enregistré dans Notion");
    });
  };

  const moveSection = (id: number, to: number) => {
    const rest = sections.filter((s) => s.id !== id);
    rest.splice(to, 0, sections.find((s) => s.id === id)!);
    const next = rest.map((s, i) => ({ ...s, position: i + 1 }));
    setMoving(next);
    setLanded(`s${id}`);
    enqueue(() => moved.mutateAsync({ courseId: c.id, sectionIds: next.map((s) => s.id) }));
  };

  /** Placer une leçon à un rang d'une section, la sienne ou une autre. */
  const moveLesson = (lessonId: number, dest: Section, to: number) => {
    const lesson = sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId)!;
    const next = sections.map((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== lessonId) }));
    const list = next.find((s) => s.id === dest.id)!.lessons;
    list.splice(to, 0, lesson);
    setMoving(next);
    setLanded(`l${lessonId}`);
    const lessonIds = list.map((l) => l.id);
    enqueue(() => movedLesson.mutateAsync({ sectionId: dest.id, lessonIds }));
  };

  /** Les flèches suivent le même chemin : au bout d'une section, la leçon passe dans la section voisine. */
  const stepLesson = (l: Lesson, s: Section, direction: -1 | 1) => {
    const i = s.lessons.findIndex((x) => x.id === l.id);
    if (s.lessons[i + direction]) return moveLesson(l.id, s, i + direction);
    const other = sections[sections.findIndex((x) => x.id === s.id) + direction];
    if (other) moveLesson(l.id, other, direction === 1 ? 0 : other.lessons.length);
  };

  const stepSection = (s: Section, direction: -1 | 1) => {
    const i = sections.findIndex((x) => x.id === s.id);
    if (sections[i + direction]) moveSection(s.id, i + direction);
  };

  const pointer = useRef({ x: 0, y: 0 });
  const grabbed = useRef({ width: 0, title: "" });
  const ghost = useRef<HTMLDivElement>(null);
  const targetNow = useRef<Target | null>(null);

  /** Clic tenu, léger déplacement : la ligne part. Un simple clic reste un clic. Les boutons de la ligne gardent leur rôle. */
  const press = (next: Drag, title: string) => (e: ReactPointerEvent<HTMLElement>) => {
    if (busy || e.button !== 0 || e.pointerType !== "mouse") return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, [role='dialog']")) return;
    const width = e.currentTarget.getBoundingClientRect().width;
    const { clientX: x0, clientY: y0 } = e;
    const stop = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", stop); };
    const onMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      stop();
      pointer.current = { x: ev.clientX, y: ev.clientY };
      grabbed.current = { width, title };
      flushSync(() => setDrag(next)); // le glissement écoute dès maintenant : un geste vif ne doit perdre ni un mouvement, ni le relâchement
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
  };

  /** Seule la hauteur du curseur compte : moitié haute d'une ligne, on arrive avant elle ; moitié basse, après elle. */
  const targetAt = (y: number): Target | null => {
    const middle = (el: Element) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const cards = [...document.querySelectorAll("[data-section]")];
    if (!drag || !cards.length) return null;
    if (drag.kind === "section") return { kind: "section", index: cards.filter((card) => y > middle(card)).length };
    const i = cards.findIndex((card) => y <= card.getBoundingClientRect().bottom + 6);
    const card = cards[i === -1 ? cards.length - 1 : i];
    const s = sections[i === -1 ? cards.length - 1 : i];
    const head = card.querySelector("[data-section-head]");
    if (head && y < head.getBoundingClientRect().bottom) return { kind: "lesson", sectionId: s.id, index: 0 };
    return { kind: "lesson", sectionId: s.id, index: [...card.querySelectorAll("[data-lesson]")].filter((row) => y > middle(row)).length };
  };

  /** Le rang final, une fois retiré ce qu'on déplace. Rien si la ligne ne bouge pas. */
  const landing = (t: Target | null): { to: number; section?: Section } | null => {
    if (!t || !drag || t.kind !== drag.kind) return null;
    if (t.kind === "section") {
      const from = sections.findIndex((s) => s.id === drag.id);
      const to = t.index > from ? t.index - 1 : t.index;
      return to === from ? null : { to };
    }
    const section = sections.find((s) => s.id === t.sectionId);
    if (!section) return null;
    const from = section.lessons.findIndex((l) => l.id === drag.id);
    const to = from >= 0 && t.index > from ? t.index - 1 : t.index;
    return to === from ? null : { to, section };
  };

  // Pendant le glissement : la ligne suit le curseur sans repeindre la page, et la page défile près des bords de l'écran
  useEffect(() => {
    if (!drag) return;
    const locate = () => {
      const { x, y } = pointer.current;
      if (ghost.current) ghost.current.style.transform = `translate3d(${x - 20}px, ${y - 20}px, 0)`;
      const next = targetAt(y);
      if (JSON.stringify(next) !== JSON.stringify(targetNow.current)) { targetNow.current = next; setTarget(next); }
    };
    const onMove = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; locate(); };
    const stop = () => { targetNow.current = null; setDrag(null); setTarget(null); };
    const onUp = (e: PointerEvent) => {
      onMove(e); // la ligne tombe là où on la lâche
      const goal = landing(targetNow.current);
      if (goal?.section) moveLesson(drag.id, goal.section, goal.to);
      else if (goal) moveSection(drag.id, goal.to);
      stop();
      // Le clic qui suit le relâchement ne doit pas ouvrir la fiche survolée
      const swallow = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
    let frame = 0;
    const scroll = () => {
      const y = pointer.current.y;
      const zone = 90;
      const speed = y < zone ? (y - zone) / 5 : y > window.innerHeight - zone ? (y - window.innerHeight + zone) / 5 : 0;
      if (speed) { window.scrollBy(0, speed); locate(); }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    document.documentElement.classList.add("p-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", onKey);
    locate();
    return () => {
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove("p-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, sections]);

  const goal = landing(target);
  const sectionMark = (index: number) => !!goal && target?.kind === "section" && target.index === index;
  const lessonMark = (sectionId: number, index: number) => !!goal && target?.kind === "lesson" && target.sectionId === sectionId && target.index === index;
  const held = (kind: Drag["kind"], id: number) => (drag?.kind === kind && drag.id === id ? { opacity: 0.4 } : {});

  const totalLessons = sections.reduce((n, x) => n + x.lessons.length, 0);
  return (
    <section className="flex flex-col" aria-label="Sections et leçons">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><h3 className="m-0 text-[16px]">Votre parcours pédagogique</h3><p className="m-0 mt-1 text-[12px] p-muted">{sections.length} section{sections.length > 1 ? "s" : ""} · {totalLessons} leçon{totalLessons > 1 ? "s" : ""}{(busy || writing) ? " · écriture dans Notion…" : ""}</p></div>
        <button type="button" className="cr-btn h-8 px-3" onClick={() => setAddingSection(true)}><Plus size={16} /> Ajouter une section</button>
      </div>
      {sections.length === 0 && <div className="rounded-2xl p-7 text-center p-muted" style={{ background: "#F3ECE8" }}>Aucune section pour l’instant.</div>}
      {/* Un lien ne doit pas lancer le glissement du navigateur à la place du nôtre */}
      <ol className="list-none m-0 p-0 flex flex-col gap-4" onDragStart={(e) => e.preventDefault()}>
        {sections.map((s, i) => {
          const open = !closed[s.id];
          const shown = s.lessons.some(isPublished);
          const total = s.lessons.reduce((n, l) => n + (l.durationMin ?? 0), 0);
          return (
          <li key={s.id} data-section={i} className="relative">
            {sectionMark(i) && <DropMarker edge="top" offset={14} />}
            {i === sections.length - 1 && sectionMark(i + 1) && <DropMarker edge="bottom" offset={14} />}
            <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "var(--p-line)", ...held("section", s.id), ...(goal?.section?.id === s.id ? { outline: "2px solid var(--p-accent)" } : {}) }}>
            <div data-section-head onPointerDown={press({ kind: "section", id: s.id }, s.title)} className="p-3 sm:p-4 flex flex-wrap items-center gap-x-2 gap-y-2 lg:cursor-grab lg:select-none" style={{ background: landed === `s${s.id}` ? "#E0D3BD" : "#F3ECE8", borderBottom: open ? "1px solid var(--p-line)" : undefined }}>
              <span aria-hidden="true" title="Glisser pour déplacer" className="hidden lg:flex w-7 justify-center p-muted"><GripVertical size={16} /></span>
              <span className="w-[30px] h-[30px] rounded-[5px] flex items-center justify-center flex-none font-semibold text-[11px]" style={{ background: "#E8DDD6" }}>{String(s.position).padStart(2, "0")}</span>
              <Link to={`/admin/construire/${c.id}/section/${s.id}`} className="flex-[1_1_180px] min-w-0 flex flex-col no-underline px-1" style={{ color: "var(--p-ink)" }}>
                <span className="font-semibold text-[14px] leading-snug break-words">{s.title}</span>
                <span className="text-[11px] p-muted flex flex-wrap items-center gap-x-2"><span>{s.lessons.length} leçon{s.lessons.length > 1 ? "s" : ""}{total ? ` · ${total} min` : ""}</span>{s.lessons.length > 0 && <span>{s.lessons.filter(isPublished).length} publiée{s.lessons.filter(isPublished).length > 1 ? "s" : ""}</span>}{s.issues.length > 0 && <span style={{ color: "#AA564C" }}>{s.issues.length} point{s.issues.length > 1 ? "s" : ""} à regarder</span>}</span>
              </Link>
              <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap" title="Une section apparaît dès qu’une de ses leçons est publiée" style={{ color: shown ? "#2b7a4b" : "var(--p-ink-2)" }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: shown ? "#2b7a4b" : "var(--p-ink-2)" }} />{shown ? "Visible" : "Pas encore visible"}</span>
              <span className="flex items-center flex-none">
                <button type="button" aria-label={`Monter la section ${s.title}`} disabled={i === 0 || busy} className={iconBtn} onClick={() => stepSection(s, -1)}><ArrowUp size={16} /></button>
                <button type="button" aria-label={`Descendre la section ${s.title}`} disabled={i === sections.length - 1 || busy} className={iconBtn} onClick={() => stepSection(s, 1)}><ArrowDown size={16} /></button>
                <button type="button" aria-label={`Dupliquer la section ${s.title}`} title="Dupliquer avec ses leçons" disabled={busy || writing} className={iconBtn} onClick={() => dupSection.mutate({ id: s.id })}><Copy size={16} /></button>
                <Link to={`/admin/construire/${c.id}/section/${s.id}`} aria-label={`Modifier la section ${s.title}`} title="Modifier" className={iconBtn}><Pencil size={16} /></Link>
                <ConfirmButton label={<Trash2 size={16} />} className={iconBtn} question={`Supprimer « ${s.title} » et ses ${s.lessons.length} leçon(s) ? Elles partent à la corbeille de Notion et disparaissent pour les membres. Leurs réponses restent dans leur journal.`} confirm="Supprimer" disabled={archiveSection.isPending} onConfirm={() => archiveSection.mutate({ id: s.id })} />
                <button type="button" aria-expanded={open} aria-label={`${open ? "Replier" : "Déplier"} la section ${s.title}`} className={iconBtn} onClick={() => setClosed({ ...closed, [s.id]: open })}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
              </span>
            </div>
            {open && <ul className="list-none m-0 p-0 flex flex-col" aria-label={`Leçons de ${s.title}`}>
              {s.lessons.length === 0 && <li className="relative p-4 text-center text-[13px] p-muted">{lessonMark(s.id, 0) && <DropMarker edge="top" offset={6} />}Aucune leçon : cette section reste invisible pour les membres. Déposez une leçon ici ou ajoutez-en une.</li>}
              {s.lessons.map((l, n) => (
                <li key={l.id} data-lesson={n} onPointerDown={press({ kind: "lesson", id: l.id }, l.title)} className={`relative px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 lg:cursor-grab lg:select-none ${drag ? "" : "hover:bg-[#FBF8F6]"}`} style={{ ...(n > 0 ? { borderTop: "1px solid var(--p-line)" } : {}), ...held("lesson", l.id), ...(landed === `l${l.id}` ? { background: "#F3ECE8" } : {}) }}>
                  {lessonMark(s.id, n) && <DropMarker edge="top" offset={6} />}
                  {n === s.lessons.length - 1 && lessonMark(s.id, n + 1) && <DropMarker edge="bottom" offset={6} />}
                  <span aria-hidden="true" title="Glisser pour déplacer" className="hidden lg:flex w-7 justify-center p-muted"><GripVertical size={16} /></span>
                  <TypeTile type={shownType(l)} />
                  <Link to={`/admin/construire/${c.id}/lecon/${l.id}`} className="flex-[1_1_180px] min-w-0 flex flex-col gap-0.5 px-1 no-underline" style={{ color: "var(--p-ink)" }}>
                    <span className="font-medium text-[13px] leading-snug break-words">{l.title}</span>
                    <span className="text-[11px] p-muted flex flex-wrap items-center gap-x-1.5"><span>{LESSON_TYPE_LABEL[shownType(l)]}</span>{l.durationMin ? <span>· {l.durationMin} min</span> : null}{l.hasVideo && shownType(l) !== "video" && <span className="flex items-center gap-1">· <Video size={11} /> vidéo</span>}{l.hasTest && shownType(l) !== "test" && <span className="flex items-center gap-1">· <CircleCheck size={11} /> test</span>}{l.issues.length > 0 && <span style={{ color: "#AA564C" }}>· {l.issues.length} point{l.issues.length > 1 ? "s" : ""} à regarder</span>}</span>
                  </Link>
                  <button type="button" className="flex-none flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap" aria-label={`${l.status === "publie" ? "Dépublier" : "Publier"} ${l.title}`} title={l.status === "publie" ? "Cliquer pour dépublier" : "Cliquer pour publier"} disabled={setLesson.isPending} style={l.status === "publie" ? { background: "rgba(46, 125, 80, .12)", color: "#2b7a4b" } : { background: "#F3ECE8", color: "var(--p-ink-2)" }} onClick={() => setLesson.mutate({ id: l.id, status: l.status === "publie" ? "brouillon" : "publie" })}><span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />{LESSON_STATUS_LABEL[l.status]}</button>
                  <span className="flex items-center flex-none">
                    <button type="button" aria-label={`Monter ${l.title}`} disabled={busy || (i === 0 && n === 0)} className={iconBtn} onClick={() => stepLesson(l, s, -1)}><ArrowUp size={16} /></button>
                    <button type="button" aria-label={`Descendre ${l.title}`} disabled={busy || (i === sections.length - 1 && n === s.lessons.length - 1)} className={iconBtn} onClick={() => stepLesson(l, s, 1)}><ArrowDown size={16} /></button>
                    <button type="button" aria-label={`Dupliquer ${l.title}`} title="Dupliquer" disabled={busy || writing} className={iconBtn} onClick={() => dupLesson.mutate({ id: l.id })}><Copy size={16} /></button>
                    <Link to={`/admin/construire/${c.id}/apercu/${l.id}`} aria-label={`Aperçu de ${l.title}`} title="Aperçu comme un membre" className={iconBtn}><Eye size={16} /></Link>
                    <Link to={`/admin/construire/${c.id}/lecon/${l.id}`} aria-label={`Modifier ${l.title}`} title="Modifier" className={iconBtn}><Pencil size={16} /></Link>
                    <ConfirmButton label={<Trash2 size={16} />} className={iconBtn} question={`Supprimer « ${l.title} » ? Elle part à la corbeille de Notion et disparaît pour les membres. Leurs réponses restent dans leur journal.`} confirm="Supprimer" disabled={archiveLesson.isPending} onConfirm={() => archiveLesson.mutate({ id: l.id })} />
                  </span>
                </li>
              ))}
              <li><button type="button" className="m-2 h-9 px-4 flex items-center gap-2 rounded-[14px] text-[12px] font-medium" style={{ color: "var(--p-accent)" }} onClick={() => setAddingLesson(s)}><Plus size={16} /> Ajouter une leçon</button></li>
            </ul>}
            </div>
          </li>
          );
        })}
      </ol>
      <button type="button" className="mt-4 w-full h-12 flex items-center justify-center gap-2 rounded-[14px] border border-dashed text-[14px] font-medium p-muted" style={{ borderColor: "var(--p-line)" }} onClick={() => setAddingSection(true)}><Plus size={16} /> Nouvelle section</button>
      <p className="m-0 mt-4 text-[12px] p-muted leading-relaxed">L’ordre des sections fixe la semaine d’ouverture : la section 1 s’ouvre au démarrage, la section 2 une semaine plus tard. Une section apparaît dès qu’une de ses leçons est publiée. {mouse ? "Pour déplacer une section ou une leçon, gardez le clic sur sa ligne et glissez : un trait rouge montre où elle arrivera. La touche Échap annule." : "Déplacez une section ou une leçon avec ses flèches."}</p>
      {drag && createPortal(
        <div ref={ghost} aria-hidden="true" className="p-card fixed left-0 top-0 z-[60] flex items-center gap-2 px-3 py-2.5 font-medium pointer-events-none" style={{ width: Math.min(grabbed.current.width, 480), boxShadow: "0 12px 32px rgba(0, 0, 0, .18)", transform: `translate3d(${pointer.current.x - 20}px, ${pointer.current.y - 20}px, 0)` }}>
          <GripVertical size={16} className="flex-none p-muted" /><span className="truncate">{grabbed.current.title}</span>
        </div>,
        document.body,
      )}
      <AddSection c={c} open={addingSection} onClose={() => setAddingSection(false)} />
      <AddLesson courseId={c.id} section={addingLesson} onClose={() => setAddingLesson(null)} />
    </section>
  );
}

/** Le trait qui montre où tombera ce qu'on déplace. Il ne prend aucune place : la liste ne bouge pas sous le curseur. */
function DropMarker({ edge, offset }: { edge: "top" | "bottom"; offset: number }) {
  return (
    <div aria-hidden="true" className="absolute left-0 right-0 z-20 h-3 flex items-center pointer-events-none" style={{ [edge]: -offset }}>
      <span className="w-3 h-3 rounded-full flex-none" style={{ background: "var(--p-accent)" }} />
      <span className="flex-1 h-[3px]" style={{ background: "var(--p-accent)" }} />
    </div>
  );
}

export function AddSection({ c, open, onClose }: { c: Pick<Course, "id">; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [f, setF] = useState({ title: "", intention: "" });
  const create = trpc.build.createSection.useMutation({
    onSuccess: (r) => { utils.build.invalidate(); onClose(); setF({ title: "", intention: "" }); toast.success("Section créée dans Notion"); navigate(`/admin/construire/${c.id}/section/${r.id}`); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[500px]" aria-describedby={undefined}>
        <DialogTitle className="serif text-[28px] font-normal">Ajouter une section</DialogTitle>
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) create.mutate({ courseId: c.id, ...f }); }}>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Titre</span><input className="p-field" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Intention</span><input className="p-field" value={f.intention} onChange={(e) => setF({ ...f, intention: e.target.value })} /></label>
          <span className="flex justify-end gap-2 pt-1"><button type="button" className="p-btn-outline p-btn-sm" onClick={onClose}>Annuler</button><button type="submit" className="p-btn-primary p-btn-sm" disabled={!f.title.trim() || create.isPending}>{create.isPending ? "Création dans Notion…" : "Créer la section"}</button></span>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddLesson({ courseId, section, onClose }: { courseId: number; section: Section | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const open = !!section;
  const templates = trpc.build.templates.useQuery(undefined, { enabled: open });
  const blank = { title: "", intention: "", type: "contenu" as LessonType, source: "structure", templateId: "" };
  const [f, setF] = useState(blank);
  const create = trpc.build.createLesson.useMutation({
    onSuccess: (r) => { utils.build.invalidate(); onClose(); setF(blank); toast.success("Leçon créée dans Notion, en brouillon"); navigate(`/admin/construire/${courseId}/lecon/${r.id}`); },
    onError: (e) => toast.error(e.message),
  });
  const ready = f.title.trim() && (f.source !== "notion" || f.templateId);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[500px]" aria-describedby={undefined}>
        <DialogTitle className="serif text-[28px] font-normal">Ajouter une leçon</DialogTitle>
        <p className="m-0 text-[14px] p-muted">Dans la section « {section?.title} »</p>
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (ready && section) create.mutate({ sectionId: section.id, title: f.title, intention: f.intention, type: f.type, source: f.source === "notion" ? { kind: "notion", templateId: f.templateId } : { kind: "structure" } }); }}>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Titre</span><input className="p-field" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Intention</span><input className="p-field" value={f.intention} onChange={(e) => setF({ ...f, intention: e.target.value })} /></label>
          {!!templates.data?.length && <Select label="Partir de" value={f.source} onChange={(source) => setF({ ...f, source })} options={[["structure", "La structure de la base"], ["notion", "Un modèle de la base Notion"]]} />}
          {f.source === "notion" && <Select label="Modèle" value={f.templateId} onChange={(templateId) => setF({ ...f, templateId })} options={[["", "Choisir…"], ...(templates.data ?? []).map((t): [string, string] => [t.id, t.name])]} />}
          <span className="flex justify-end gap-2 pt-1"><button type="button" className="p-btn-outline p-btn-sm" onClick={onClose}>Annuler</button><button type="submit" className="p-btn-primary p-btn-sm" disabled={!ready || create.isPending}>{create.isPending ? "Création dans Notion…" : "Créer en brouillon"}</button></span>
        </form>
      </DialogContent>
    </Dialog>
  );
}
