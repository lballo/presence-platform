import { useEffect, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowDown, ArrowUp, Copy, Eye, FileText, GripVertical, Pencil, Plus, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { LESSON_TYPE_LABEL, LESSON_TYPES, type LessonType } from "../../../../server/lib/courseBlocks";
import { Badge, ConfirmButton, Select } from "../shared";
import { LESSON_STATUS_LABEL, statusTone } from "./labels";

type Course = RouterOutputs["build"]["course"];
type Section = Course["sections"][number];
type Lesson = Section["lessons"][number];
type Drag = { kind: "section"; id: number } | { kind: "lesson"; id: number };
/** Où tomberait ce qu'on déplace : sa place parmi les sections, ou parmi les leçons d'une section. */
type Target = { kind: "section"; index: number } | { kind: "lesson"; sectionId: number; index: number };

const iconBtn = "w-9 h-9 flex items-center justify-center rounded-lg p-muted disabled:opacity-30";
const mouse = window.matchMedia("(pointer: fine)").matches; // au doigt, les flèches suffisent : un appui long ne doit rien saisir
const typeOptions = LESSON_TYPES.map((t): [LessonType, string] => [t, LESSON_TYPE_LABEL[t]]);
const isPublished = (l: { status: string }) => l.status === "publie";

/** Le plan d'une formation : créer et réordonner les sections et leurs leçons, au glisser-déposer ou avec les flèches sur téléphone. */
export function Outline({ c }: { c: Course }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  // Le nouvel ordre se voit tout de suite : l'écriture dans Notion prend quelques secondes
  const [moving, setMoving] = useState<Section[] | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [addingLesson, setAddingLesson] = useState<Section | null>(null);
  const refresh = () => utils.build.invalidate();
  const afterMove = {
    onSuccess: async () => { await refresh(); setMoving(null); toast.success("Nouvel ordre enregistré dans Notion"); },
    onError: async (e: { message: string }) => { toast.error(e.message, { duration: 8000 }); await refresh(); setMoving(null); },
  };
  const moved = trpc.build.reorderSections.useMutation(afterMove);
  const movedLesson = trpc.build.reorderLessons.useMutation(afterMove);
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
  const busy = moved.isPending || movedLesson.isPending || dupSection.isPending || dupLesson.isPending;

  const sections = moving ?? c.sections;

  // La ligne déplacée reste marquée un instant une fois Notion à jour : on voit où elle est arrivée
  useEffect(() => {
    if (!landed || busy) return;
    const t = setTimeout(() => setLanded(null), 1800);
    return () => clearTimeout(t);
  }, [landed, busy]);

  const moveSection = (id: number, to: number) => {
    const rest = sections.filter((s) => s.id !== id);
    rest.splice(to, 0, sections.find((s) => s.id === id)!);
    const next = rest.map((s, i) => ({ ...s, position: i + 1 }));
    setMoving(next);
    setLanded(`s${id}`);
    moved.mutate({ courseId: c.id, sectionIds: next.map((s) => s.id) });
  };

  /** Placer une leçon à un rang d'une section, la sienne ou une autre. */
  const moveLesson = (lessonId: number, dest: Section, to: number) => {
    const lesson = sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId)!;
    const next = sections.map((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== lessonId) }));
    const list = next.find((s) => s.id === dest.id)!.lessons;
    list.splice(to, 0, lesson);
    setMoving(next);
    setLanded(`l${lessonId}`);
    movedLesson.mutate({ sectionId: dest.id, lessonIds: list.map((l) => l.id) });
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

  /** Toute la ligne se saisit et suit le curseur, depuis l'endroit où on l'a prise. */
  const grab = (next: Drag, label: string) => (e: DragEvent<HTMLElement>) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", label); // sans cela, Firefox ne commence pas le glissement
    const box = e.currentTarget.getBoundingClientRect();
    e.dataTransfer.setDragImage(e.currentTarget, e.clientX - box.left, e.clientY - box.top);
    setDrag(next);
  };
  const finish = () => { setDrag(null); setTarget(null); };

  /** D'après le curseur : moitié haute d'une ligne, on arrive avant elle ; moitié basse, après elle. */
  const targetFrom = (e: DragEvent): Target | null => {
    const el = e.target as HTMLElement;
    const card = el.closest<HTMLElement>("[data-section]");
    if (!drag || !card) return null;
    const i = Number(card.dataset.section);
    const after = (box: HTMLElement) => { const r = box.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
    if (drag.kind === "section") return { kind: "section", index: after(card) ? i + 1 : i };
    const s = sections[i];
    if (el.closest("[data-section-head]")) return { kind: "lesson", sectionId: s.id, index: 0 };
    const row = el.closest<HTMLElement>("[data-lesson]");
    if (!row) return { kind: "lesson", sectionId: s.id, index: s.lessons.length };
    const n = Number(row.dataset.lesson);
    return { kind: "lesson", sectionId: s.id, index: after(row) ? n + 1 : n };
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

  const onDragOver = (e: DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const next = targetFrom(e); // dans l'espace entre deux sections, le trait reste où il est
    if (next && JSON.stringify(next) !== JSON.stringify(target)) setTarget(next);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const goal = landing(targetFrom(e) ?? target);
    if (goal && drag) {
      if (goal.section) moveLesson(drag.id, goal.section, goal.to);
      else moveSection(drag.id, goal.to);
    }
    finish();
  };

  const goal = landing(target);
  const goalLabel = !goal ? "" : goal.section ? `Arrivera ici : leçon ${goal.to + 1} de « ${goal.section.title} »` : `Arrivera ici : section ${goal.to + 1}${c.rhythm === "hebdo" ? `, ouverte en semaine ${goal.to + 1}` : ""}`;
  const sectionMark = (index: number) => !!goal && target?.kind === "section" && target.index === index;
  const lessonMark = (sectionId: number, index: number) => !!goal && target?.kind === "lesson" && target.sectionId === sectionId && target.index === index;
  const held = (kind: Drag["kind"], id: number) => (drag?.kind === kind && drag.id === id ? { opacity: 0.4 } : {});

  return (
    <section className="flex flex-col gap-3" aria-label="Sections et leçons">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[14px] p-muted flex-[1_1_260px]">L’ordre des sections fixe la semaine d’ouverture : la section 1 s’ouvre au démarrage, la section 2 une semaine plus tard. Toutes ses leçons s’ouvrent ensemble. Une section apparaît dès qu’une de ses leçons est publiée. {mouse ? "Pour déplacer une section ou une leçon, saisissez sa ligne et glissez-la : un trait rouge montre où elle arrivera. La touche Échap annule." : "Déplacez une section ou une leçon avec ses flèches."}</p>
        <button type="button" className="p-btn-primary p-btn-sm" onClick={() => setAddingSection(true)}><Plus size={15} /> Ajouter une section</button>
      </div>
      {busy && <p className="m-0 text-[13.5px] p-muted" role="status">Écriture dans Notion…</p>}
      {sections.length === 0 && <div className="p-soft p-7 text-center p-muted">Aucune section pour l’instant.</div>}
      <ol className="list-none m-0 p-0 flex flex-col gap-3" onDragOver={onDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTarget(null); }} onDrop={onDrop}>
        {sections.map((s, i) => (
          <li key={s.id} data-section={i} className="relative">
            {sectionMark(i) && <DropMarker label={goalLabel} edge="top" offset={12} />}
            {i === sections.length - 1 && sectionMark(i + 1) && <DropMarker label={goalLabel} edge="bottom" offset={12} />}
            <div className="p-card overflow-hidden" style={{ ...held("section", s.id), ...(goal?.section?.id === s.id ? { outline: "2px solid var(--p-accent)" } : {}) }}>
            <div data-section-head draggable={mouse && !busy} onDragStart={grab({ kind: "section", id: s.id }, s.title)} onDragEnd={finish} className="p-3 flex flex-wrap items-center gap-x-3 gap-y-2 lg:cursor-grab" style={{ background: landed === `s${s.id}` ? "var(--p-accent-soft)" : "var(--p-surface-2)" }}>
              <span aria-hidden="true" title="Glisser pour déplacer" className="hidden lg:flex p-muted"><GripVertical size={18} /></span>
              <span className="w-9 h-9 rounded-full flex items-center justify-center flex-none font-semibold text-[14px]" style={{ background: "var(--p-surface)" }}>{s.position}</span>
              <Link to={`/admin/construire/${c.id}/section/${s.id}`} className="flex-[1_1_220px] min-w-0 flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
                <span className="font-semibold text-[16px] leading-snug break-words">{s.title}</span>
                <span className="text-[12.5px] p-muted flex flex-wrap items-center gap-x-2.5"><span>{s.lessons.length} leçon{s.lessons.length > 1 ? "s" : ""}</span>{s.lessons.length > 0 && <span>{s.lessons.filter(isPublished).length} publiée{s.lessons.filter(isPublished).length > 1 ? "s" : ""}</span>}{s.issues.length > 0 && <span style={{ color: "var(--p-gold)" }}>{s.issues.length} point{s.issues.length > 1 ? "s" : ""} à regarder</span>}</span>
              </Link>
              <Badge tone={s.lessons.some(isPublished) ? "ok" : "calm"}>{s.lessons.some(isPublished) ? "Visible" : "Pas encore visible"}</Badge>
              <span className="flex items-center gap-0.5 flex-none">
                <button type="button" aria-label={`Monter la section ${s.title}`} disabled={i === 0 || busy} className={iconBtn} onClick={() => stepSection(s, -1)}><ArrowUp size={16} /></button>
                <button type="button" aria-label={`Descendre la section ${s.title}`} disabled={i === sections.length - 1 || busy} className={iconBtn} onClick={() => stepSection(s, 1)}><ArrowDown size={16} /></button>
                <button type="button" aria-label={`Dupliquer la section ${s.title}`} title="Dupliquer avec ses leçons" disabled={busy} className={iconBtn} onClick={() => dupSection.mutate({ id: s.id })}><Copy size={16} /></button>
                <Link to={`/admin/construire/${c.id}/section/${s.id}`} aria-label={`Modifier la section ${s.title}`} title="Modifier" className={iconBtn}><Pencil size={16} /></Link>
              </span>
              <ConfirmButton label={<Trash2 size={16} />} className={`${iconBtn} flex-none`} question={`Supprimer « ${s.title} » et ses ${s.lessons.length} leçon(s) ? Elles partent à la corbeille de Notion et disparaissent pour les membres. Leurs réponses restent dans leur journal.`} confirm="Supprimer" disabled={archiveSection.isPending} onConfirm={() => archiveSection.mutate({ id: s.id })} />
            </div>
            <ul className="list-none m-0 p-2 flex flex-col gap-1" aria-label={`Leçons de ${s.title}`}>
              {s.lessons.length === 0 && <li className="relative p-3 text-center text-[14px] p-muted">{lessonMark(s.id, 0) && <DropMarker label={goalLabel} edge="top" offset={8} />}Aucune leçon : cette section reste invisible pour les membres. Déposez une leçon ici ou ajoutez-en une.</li>}
              {s.lessons.map((l, n) => (
                <li key={l.id} data-lesson={n} draggable={mouse && !busy} onDragStart={grab({ kind: "lesson", id: l.id }, l.title)} onDragEnd={finish} className="relative p-2 rounded-lg flex flex-wrap items-center gap-x-2.5 gap-y-1.5 lg:cursor-grab hover:bg-black/5 dark:hover:bg-white/5" style={{ ...held("lesson", l.id), ...(landed === `l${l.id}` ? { background: "var(--p-accent-soft)" } : {}) }}>
                  {lessonMark(s.id, n) && <DropMarker label={goalLabel} edge="top" offset={8} />}
                  {n === s.lessons.length - 1 && lessonMark(s.id, n + 1) && <DropMarker label={goalLabel} edge="bottom" offset={8} />}
                  <span aria-hidden="true" title="Glisser pour déplacer" className="hidden lg:flex p-muted"><GripVertical size={16} /></span>
                  <span className="w-5 text-center text-[13px] font-medium p-muted flex-none">{n + 1}</span>
                  <Link to={`/admin/construire/${c.id}/lecon/${l.id}`} className="flex-[1_1_200px] min-w-0 flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
                    <span className="font-medium leading-snug break-words">{l.title}</span>
                    <span className="text-[12.5px] p-muted flex flex-wrap items-center gap-x-2.5"><span>{LESSON_TYPE_LABEL[l.type]}</span>{l.durationMin ? <span>{l.durationMin} min</span> : null}{l.hasVideo && <span className="flex items-center gap-1"><Video size={12} /> vidéo</span>}{l.hasTest && <span className="flex items-center gap-1"><FileText size={12} /> test</span>}{l.issues.length > 0 && <span style={{ color: "var(--p-gold)" }}>{l.issues.length} point{l.issues.length > 1 ? "s" : ""} à regarder</span>}</span>
                  </Link>
                  <Badge tone={statusTone(l.status)}>{LESSON_STATUS_LABEL[l.status]}</Badge>
                  <button type="button" className="p-btn-outline p-btn-sm flex-none" disabled={setLesson.isPending} onClick={() => setLesson.mutate({ id: l.id, status: l.status === "publie" ? "brouillon" : "publie" })}>{l.status === "publie" ? "Dépublier" : "Publier"}</button>
                  <span className="flex items-center gap-0.5 flex-none">
                    <button type="button" aria-label={`Monter ${l.title}`} disabled={busy || (i === 0 && n === 0)} className={iconBtn} onClick={() => stepLesson(l, s, -1)}><ArrowUp size={16} /></button>
                    <button type="button" aria-label={`Descendre ${l.title}`} disabled={busy || (i === sections.length - 1 && n === s.lessons.length - 1)} className={iconBtn} onClick={() => stepLesson(l, s, 1)}><ArrowDown size={16} /></button>
                    <button type="button" aria-label={`Dupliquer ${l.title}`} title="Dupliquer" disabled={busy} className={iconBtn} onClick={() => dupLesson.mutate({ id: l.id })}><Copy size={16} /></button>
                    <Link to={`/admin/construire/${c.id}/apercu/${l.id}`} aria-label={`Aperçu de ${l.title}`} title="Aperçu comme un membre" className={iconBtn}><Eye size={16} /></Link>
                    <Link to={`/admin/construire/${c.id}/lecon/${l.id}`} aria-label={`Modifier ${l.title}`} title="Modifier" className={iconBtn}><Pencil size={16} /></Link>
                  </span>
                  <ConfirmButton label={<Trash2 size={16} />} className={`${iconBtn} flex-none`} question={`Supprimer « ${l.title} » ? Elle part à la corbeille de Notion et disparaît pour les membres. Leurs réponses restent dans leur journal.`} confirm="Supprimer" disabled={archiveLesson.isPending} onConfirm={() => archiveLesson.mutate({ id: l.id })} />
                </li>
              ))}
              <li className="pt-1"><button type="button" className="p-btn-ghost" onClick={() => setAddingLesson(s)}><Plus size={15} /> Ajouter une leçon</button></li>
            </ul>
            </div>
          </li>
        ))}
      </ol>
      <AddSection c={c} open={addingSection} onClose={() => setAddingSection(false)} onCreated={(id) => navigate(`/admin/construire/${c.id}/section/${id}`)} />
      <AddLesson c={c} section={addingLesson} onClose={() => setAddingLesson(null)} onCreated={(id) => navigate(`/admin/construire/${c.id}/lecon/${id}`)} />
    </section>
  );
}

/** Le trait qui montre où tombera ce qu'on déplace. Il ne prend aucune place : la liste ne bouge pas sous le curseur. */
function DropMarker({ label, edge, offset }: { label: string; edge: "top" | "bottom"; offset: number }) {
  return (
    <div aria-hidden="true" className="absolute left-0 right-0 z-20 h-3 flex items-center pointer-events-none" style={{ [edge]: -offset }}>
      <span className="w-3 h-3 rounded-full flex-none" style={{ background: "var(--p-accent)" }} />
      <span className="flex-1 h-[3px]" style={{ background: "var(--p-accent)" }} />
      <span className="absolute left-6 max-w-[calc(100%-2.5rem)] truncate px-2.5 py-0.5 rounded-full text-[12.5px] font-medium text-white" style={{ background: "var(--p-accent)" }}>{label}</span>
    </div>
  );
}

function AddSection({ c, open, onClose, onCreated }: { c: Course; open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({ title: "", intention: "" });
  const create = trpc.build.createSection.useMutation({
    onSuccess: (r) => { utils.build.invalidate(); onClose(); setF({ title: "", intention: "" }); toast.success("Section créée dans Notion"); onCreated(r.id); },
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

function AddLesson({ section, onClose, onCreated }: { c: Course; section: Section | null; onClose: () => void; onCreated: (id: number) => void }) {
  const utils = trpc.useUtils();
  const open = !!section;
  const templates = trpc.build.templates.useQuery(undefined, { enabled: open });
  const blank = { title: "", intention: "", type: "contenu" as LessonType, source: "structure", templateId: "" };
  const [f, setF] = useState(blank);
  const create = trpc.build.createLesson.useMutation({
    onSuccess: (r) => { utils.build.invalidate(); onClose(); setF(blank); toast.success("Leçon créée dans Notion, en brouillon"); onCreated(r.id); },
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
          <Select label="Type" value={f.type} onChange={(type) => setF({ ...f, type })} options={typeOptions} />
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Intention</span><input className="p-field" value={f.intention} onChange={(e) => setF({ ...f, intention: e.target.value })} /></label>
          {!!templates.data?.length && <Select label="Partir de" value={f.source} onChange={(source) => setF({ ...f, source })} options={[["structure", "La structure de la base"], ["notion", "Un modèle de la base Notion"]]} />}
          {f.source === "notion" && <Select label="Modèle" value={f.templateId} onChange={(templateId) => setF({ ...f, templateId })} options={[["", "Choisir…"], ...(templates.data ?? []).map((t): [string, string] => [t.id, t.name])]} />}
          <span className="flex justify-end gap-2 pt-1"><button type="button" className="p-btn-outline p-btn-sm" onClick={onClose}>Annuler</button><button type="submit" className="p-btn-primary p-btn-sm" disabled={!ready || create.isPending}>{create.isPending ? "Création dans Notion…" : "Créer en brouillon"}</button></span>
        </form>
      </DialogContent>
    </Dialog>
  );
}
