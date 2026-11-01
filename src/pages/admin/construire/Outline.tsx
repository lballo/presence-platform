import { useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowDown, ArrowUp, Copy, Eye, FileText, GripVertical, Pencil, Plus, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { LESSON_TYPE_LABEL, LESSON_TYPES, type LessonType } from "../../../../server/lib/courseBlocks";
import { Badge, ConfirmButton, Select } from "../shared";
import { LESSON_STATUS_LABEL, STATUS_LABEL, statusTone } from "./labels";

type Course = RouterOutputs["build"]["course"];
type Section = Course["sections"][number];
type Lesson = Section["lessons"][number];
type Drag = { kind: "section"; id: number } | { kind: "lesson"; id: number };

const iconBtn = "w-9 h-9 flex items-center justify-center rounded-lg p-muted disabled:opacity-30";
const typeOptions = LESSON_TYPES.map((t): [LessonType, string] => [t, LESSON_TYPE_LABEL[t]]);

/** Le plan d'une formation : créer et réordonner les sections et leurs leçons, au glisser-déposer ou avec les flèches sur téléphone. */
export function Outline({ c }: { c: Course }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [addingLesson, setAddingLesson] = useState<Section | null>(null);
  const refresh = () => utils.build.invalidate();
  const moved = trpc.build.reorderSections.useMutation({ onSuccess: refresh, onError: (e) => { refresh(); toast.error(e.message, { duration: 8000 }); } });
  const movedLesson = trpc.build.reorderLessons.useMutation({ onSuccess: refresh, onError: (e) => { refresh(); toast.error(e.message, { duration: 8000 }); } });
  const dupSection = trpc.build.duplicateSection.useMutation({ onSuccess: () => { refresh(); toast.success("Section et leçons copiées dans Notion, en brouillon"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  const dupLesson = trpc.build.duplicateLesson.useMutation({ onSuccess: () => { refresh(); toast.success("Leçon copiée dans Notion, en brouillon"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  const setSection = trpc.build.setSectionStatus.useMutation({ onSuccess: (_r, v) => { refresh(); toast.success(v.status === "publie" ? "Section publiée dans Notion et ici" : "Section dépubliée dans Notion et ici"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  const setLesson = trpc.build.setLessonStatus.useMutation({ onSuccess: (_r, v) => { refresh(); toast.success(v.status === "publie" ? "Leçon publiée dans Notion et ici" : "Leçon dépubliée dans Notion et ici"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  const archiveSection = trpc.build.archiveSection.useMutation({ onSuccess: () => { refresh(); toast.success("Section et leçons à la corbeille de Notion"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  const archiveLesson = trpc.build.archiveLesson.useMutation({ onSuccess: () => { refresh(); toast.success("Leçon à la corbeille de Notion"); }, onError: (e) => toast.error(e.message, { duration: 8000 }) });
  const busy = moved.isPending || movedLesson.isPending || dupSection.isPending || dupLesson.isPending;

  const sectionIds = c.sections.map((s) => s.id);
  const reorderSections = (ids: number[]) => moved.mutate({ courseId: c.id, sectionIds: ids });

  /** Placer une leçon dans une section, avant une autre leçon ou à la fin. */
  const placeLesson = (lessonId: number, target: Section, beforeId: number | null) => {
    const origin = target.lessons.map((l) => l.id);
    const ids = origin.filter((id) => id !== lessonId);
    // Dans la même section, la place visée est celle de la leçon survolée : vers le bas, on passe après elle
    const at = beforeId === null ? ids.length : Math.max(0, origin.includes(lessonId) ? origin.indexOf(beforeId) : ids.indexOf(beforeId));
    ids.splice(at, 0, lessonId);
    if (ids.join() === origin.join()) return;
    movedLesson.mutate({ sectionId: target.id, lessonIds: ids });
  };

  /** Les flèches suivent le même chemin : au bout d'une section, la leçon passe dans la section voisine. */
  const stepLesson = (l: Lesson, s: Section, direction: -1 | 1) => {
    const i = s.lessons.findIndex((x) => x.id === l.id);
    const neighbour = s.lessons[i + direction];
    if (neighbour) {
      const ids = s.lessons.map((x) => x.id);
      [ids[i], ids[i + direction]] = [ids[i + direction], ids[i]];
      movedLesson.mutate({ sectionId: s.id, lessonIds: ids });
      return;
    }
    const other = c.sections[c.sections.findIndex((x) => x.id === s.id) + direction];
    if (other) placeLesson(l.id, other, direction === 1 ? (other.lessons[0]?.id ?? null) : null);
  };

  const stepSection = (s: Section, direction: -1 | 1) => {
    const i = sectionIds.indexOf(s.id);
    if (!sectionIds[i + direction]) return;
    const ids = [...sectionIds];
    [ids[i], ids[i + direction]] = [ids[i + direction], ids[i]];
    reorderSections(ids);
  };

  /** La poignée seule est saisie, mais c'est toute la ligne qui suit le curseur. */
  const grab = (next: Drag, label: string) => (e: DragEvent<HTMLElement>) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", label); // sans cela, Firefox ne commence pas le glissement
    const row = e.currentTarget.parentElement;
    if (row) e.dataTransfer.setDragImage(row, 24, 24);
    setDrag(next);
  };
  const overSection = (key: string) => (e: DragEvent) => { if (!drag) return; e.preventDefault(); setOver(key); };
  // Une section survole une leçon : c'est la section entière qui reçoit le dépôt
  const overLesson = (key: string, sectionKey: string) => (e: DragEvent) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); setOver(drag.kind === "lesson" ? key : sectionKey); };
  const finish = () => { setDrag(null); setOver(null); };
  const dropOnSection = (s: Section) => (e: DragEvent) => {
    e.preventDefault();
    if (drag?.kind === "lesson") placeLesson(drag.id, s, null);
    if (drag?.kind === "section" && drag.id !== s.id) {
      const ids = sectionIds.filter((id) => id !== drag.id);
      ids.splice(sectionIds.indexOf(s.id), 0, drag.id); // la section prend la place de celle qu'elle survole
      reorderSections(ids);
    }
    finish();
  };
  const dropOnLesson = (s: Section, l: Lesson) => (e: DragEvent) => {
    if (drag?.kind !== "lesson") return; // une section déposée ici : la section entière s'en occupe
    e.preventDefault();
    e.stopPropagation();
    if (drag.id !== l.id) placeLesson(drag.id, s, l.id);
    finish();
  };
  const dropLine = (s: Section, n: number) => {
    const from = drag?.kind === "lesson" ? s.lessons.findIndex((x) => x.id === drag.id) : -1;
    return from >= 0 && from < n ? "inset 0 -2px 0 var(--p-accent)" : "inset 0 2px 0 var(--p-accent)";
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Sections et leçons">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[14px] p-muted flex-[1_1_260px]">L’ordre des sections fixe la semaine d’ouverture : la section 1 s’ouvre au démarrage, la section 2 une semaine plus tard. Toutes ses leçons s’ouvrent ensemble. Glissez une section ou une leçon pour la déplacer.</p>
        <button type="button" className="p-btn-primary p-btn-sm" onClick={() => setAddingSection(true)}><Plus size={15} /> Ajouter une section</button>
      </div>
      {busy && <p className="m-0 text-[13.5px] p-muted" role="status">Écriture dans Notion…</p>}
      {c.sections.length === 0 && <div className="p-soft p-7 text-center p-muted">Aucune section pour l’instant.</div>}
      <ol className="list-none m-0 p-0 flex flex-col gap-3">
        {c.sections.map((s, i) => (
          <li key={s.id} className="p-card overflow-hidden" style={over === `s${s.id}` ? { outline: "2px solid var(--p-accent-line)" } : undefined} onDragOver={overSection(`s${s.id}`)} onDrop={dropOnSection(s)}>
            <div className="p-3 flex flex-wrap items-center gap-x-3 gap-y-2" style={{ background: "var(--p-surface-2)" }}>
              <span draggable={!busy} aria-hidden="true" title="Glisser pour déplacer" className="hidden lg:flex cursor-grab p-faint" onDragStart={grab({ kind: "section", id: s.id }, s.title)} onDragEnd={finish}><GripVertical size={18} /></span>
              <span className="w-9 h-9 rounded-full flex items-center justify-center flex-none font-semibold text-[14px]" style={{ background: "var(--p-surface)" }}>{s.position}</span>
              <Link to={`/admin/construire/${c.id}/section/${s.id}`} className="flex-[1_1_220px] min-w-0 flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
                <span className="font-semibold text-[16px] leading-snug break-words">{s.title}</span>
                <span className="text-[12.5px] p-muted flex flex-wrap items-center gap-x-2.5"><span>{s.lessons.length} leçon{s.lessons.length > 1 ? "s" : ""}</span>{s.issues.length > 0 && <span style={{ color: "var(--p-gold)" }}>{s.issues.length} point{s.issues.length > 1 ? "s" : ""} à regarder</span>}</span>
              </Link>
              <Badge tone={statusTone(s.status)}>{STATUS_LABEL[s.status]}</Badge>
              <button type="button" className="p-btn-outline p-btn-sm flex-none" disabled={setSection.isPending} onClick={() => setSection.mutate({ id: s.id, status: s.status === "publie" ? "brouillon" : "publie" })}>{s.status === "publie" ? "Dépublier" : "Publier"}</button>
              <span className="flex items-center gap-0.5 flex-none">
                <button type="button" aria-label={`Monter la section ${s.title}`} disabled={i === 0 || busy} className={iconBtn} onClick={() => stepSection(s, -1)}><ArrowUp size={16} /></button>
                <button type="button" aria-label={`Descendre la section ${s.title}`} disabled={i === c.sections.length - 1 || busy} className={iconBtn} onClick={() => stepSection(s, 1)}><ArrowDown size={16} /></button>
                <button type="button" aria-label={`Dupliquer la section ${s.title}`} title="Dupliquer avec ses leçons" disabled={busy} className={iconBtn} onClick={() => dupSection.mutate({ id: s.id })}><Copy size={16} /></button>
                <Link to={`/admin/construire/${c.id}/section/${s.id}`} aria-label={`Modifier la section ${s.title}`} title="Modifier" className={iconBtn}><Pencil size={16} /></Link>
              </span>
              <ConfirmButton label={<Trash2 size={16} />} className={`${iconBtn} flex-none`} question={`Supprimer « ${s.title} » et ses ${s.lessons.length} leçon(s) ? Elles partent à la corbeille de Notion et disparaissent pour les membres. Leurs réponses restent dans leur journal.`} confirm="Supprimer" disabled={archiveSection.isPending} onConfirm={() => archiveSection.mutate({ id: s.id })} />
            </div>
            <ul className="list-none m-0 p-2 flex flex-col gap-1" aria-label={`Leçons de ${s.title}`}>
              {s.lessons.length === 0 && <li className="p-3 text-center text-[14px] p-muted">Aucune leçon : cette section reste invisible pour les membres. Déposez une leçon ici ou ajoutez-en une.</li>}
              {s.lessons.map((l, n) => (
                <li key={l.id} className="p-2 rounded-lg flex flex-wrap items-center gap-x-2.5 gap-y-1.5" style={over === `l${l.id}` ? { boxShadow: dropLine(s, n) } : undefined} onDragOver={overLesson(`l${l.id}`, `s${s.id}`)} onDrop={dropOnLesson(s, l)}>
                  <span draggable={!busy} aria-hidden="true" title="Glisser pour déplacer" className="hidden lg:flex cursor-grab p-faint" onDragStart={grab({ kind: "lesson", id: l.id }, l.title)} onDragEnd={finish}><GripVertical size={16} /></span>
                  <Link to={`/admin/construire/${c.id}/lecon/${l.id}`} className="flex-[1_1_200px] min-w-0 flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
                    <span className="font-medium leading-snug break-words">{l.title}</span>
                    <span className="text-[12.5px] p-muted flex flex-wrap items-center gap-x-2.5"><span>{LESSON_TYPE_LABEL[l.type]}</span>{l.durationMin ? <span>{l.durationMin} min</span> : null}{l.hasVideo && <span className="flex items-center gap-1"><Video size={12} /> vidéo</span>}{l.hasTest && <span className="flex items-center gap-1"><FileText size={12} /> test</span>}{l.issues.length > 0 && <span style={{ color: "var(--p-gold)" }}>{l.issues.length} point{l.issues.length > 1 ? "s" : ""} à regarder</span>}{l.status === "publie" && s.status !== "publie" && <span style={{ color: "var(--p-gold)" }}>invisible tant que la section n’est pas publiée</span>}</span>
                  </Link>
                  <Badge tone={statusTone(l.status)}>{LESSON_STATUS_LABEL[l.status]}</Badge>
                  <button type="button" className="p-btn-outline p-btn-sm flex-none" disabled={setLesson.isPending} onClick={() => setLesson.mutate({ id: l.id, status: l.status === "publie" ? "brouillon" : "publie" })}>{l.status === "publie" ? "Dépublier" : "Publier"}</button>
                  <span className="flex items-center gap-0.5 flex-none">
                    <button type="button" aria-label={`Monter ${l.title}`} disabled={busy || (i === 0 && n === 0)} className={iconBtn} onClick={() => stepLesson(l, s, -1)}><ArrowUp size={16} /></button>
                    <button type="button" aria-label={`Descendre ${l.title}`} disabled={busy || (i === c.sections.length - 1 && n === s.lessons.length - 1)} className={iconBtn} onClick={() => stepLesson(l, s, 1)}><ArrowDown size={16} /></button>
                    <button type="button" aria-label={`Dupliquer ${l.title}`} title="Dupliquer" disabled={busy} className={iconBtn} onClick={() => dupLesson.mutate({ id: l.id })}><Copy size={16} /></button>
                    <Link to={`/admin/construire/${c.id}/apercu/${l.id}`} aria-label={`Aperçu de ${l.title}`} title="Aperçu comme un membre" className={iconBtn}><Eye size={16} /></Link>
                    <Link to={`/admin/construire/${c.id}/lecon/${l.id}`} aria-label={`Modifier ${l.title}`} title="Modifier" className={iconBtn}><Pencil size={16} /></Link>
                  </span>
                  <ConfirmButton label={<Trash2 size={16} />} className={`${iconBtn} flex-none`} question={`Supprimer « ${l.title} » ? Elle part à la corbeille de Notion et disparaît pour les membres. Leurs réponses restent dans leur journal.`} confirm="Supprimer" disabled={archiveLesson.isPending} onConfirm={() => archiveLesson.mutate({ id: l.id })} />
                </li>
              ))}
              <li className="pt-1"><button type="button" className="p-btn-ghost" onClick={() => setAddingLesson(s)}><Plus size={15} /> Ajouter une leçon</button></li>
            </ul>
          </li>
        ))}
      </ol>
      <AddSection c={c} open={addingSection} onClose={() => setAddingSection(false)} onCreated={(id) => navigate(`/admin/construire/${c.id}/section/${id}`)} />
      <AddLesson c={c} section={addingLesson} onClose={() => setAddingLesson(null)} onCreated={(id) => navigate(`/admin/construire/${c.id}/lecon/${id}`)} />
    </section>
  );
}

function AddSection({ c, open, onClose, onCreated }: { c: Course; open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({ title: "", intention: "" });
  const create = trpc.build.createSection.useMutation({
    onSuccess: (r) => { utils.build.invalidate(); onClose(); setF({ title: "", intention: "" }); toast.success("Section créée dans Notion, en brouillon"); onCreated(r.id); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[500px]" aria-describedby={undefined}>
        <DialogTitle className="serif text-[28px] font-normal">Ajouter une section</DialogTitle>
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) create.mutate({ courseId: c.id, ...f }); }}>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Titre</span><input className="p-field" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Intention</span><input className="p-field" value={f.intention} onChange={(e) => setF({ ...f, intention: e.target.value })} /></label>
          <span className="flex justify-end gap-2 pt-1"><button type="button" className="p-btn-outline p-btn-sm" onClick={onClose}>Annuler</button><button type="submit" className="p-btn-primary p-btn-sm" disabled={!f.title.trim() || create.isPending}>{create.isPending ? "Création dans Notion…" : "Créer en brouillon"}</button></span>
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
