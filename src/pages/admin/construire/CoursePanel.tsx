import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ChevronDown, PanelLeftClose, Plus } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Brand } from "@/components/Layout";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { AddLesson, AddSection, shownType, TypeTile } from "./Outline";

type Course = RouterOutputs["build"]["course"];
type Section = Course["sections"][number];

const pad = (n: number) => String(n).padStart(2, "0");
const minutes = (s: Section) => s.lessons.reduce((n, l) => n + (l.durationMin ?? 0), 0);

/** Le bandeau du parcours, à gauche de la leçon : on passe d'une leçon à l'autre sans repasser par le plan. */
export function CoursePanel({ c, currentLesson, currentSection, onHide }: { c: Course | undefined; currentLesson?: number; currentSection?: number; onHide?: () => void }) {
  const me = trpc.members.me.useQuery();
  const [closed, setClosed] = useState<Record<number, boolean>>({});
  const [addingSection, setAddingSection] = useState(false);
  const [addingLesson, setAddingLesson] = useState<Section | null>(null);
  const total = c?.sections.flatMap((s) => s.lessons) ?? [];
  const totalMin = total.reduce((n, l) => n + (l.durationMin ?? 0), 0);
  return (
    <div className="flex flex-col flex-1 px-5 pt-7 pb-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/admin/construire" className="no-underline" style={{ color: "var(--p-ink)" }}><Brand compact /></Link>
        {onHide && <button type="button" aria-label="Masquer le parcours" title="Masquer le parcours" className="cr-icon hidden lg:inline-flex" style={{ color: "var(--p-ink-2)" }} onClick={onHide}><PanelLeftClose size={17} /></button>}
      </div>
      <Link to="/admin/construire" className="mt-7 inline-flex items-center gap-1.5 text-[12px] font-medium no-underline" style={{ color: "var(--p-accent)" }}><ArrowLeft size={14} /> Mes formations</Link>
      {!c ? <p className="m-0 mt-6 text-[13px] p-muted">Chargement…</p> : (
        <>
          <p className="m-0 mt-4 text-[10px] font-semibold tracking-[0.16em] p-muted">PARCOURS</p>
          <Link to={`/admin/construire/${c.id}`} className="mt-1.5 text-[18px] leading-[1.3] font-bold no-underline" style={{ color: "var(--p-ink)" }}>{c.title}</Link>
          <p className="m-0 mt-1.5 text-[12px] p-muted">{c.sections.length} section{c.sections.length > 1 ? "s" : ""} · {total.length} leçon{total.length > 1 ? "s" : ""}{totalMin ? ` · ${totalMin} min` : ""}</p>
          <nav aria-label="Sections et leçons" className="mt-5 flex flex-col gap-1.5">
            {c.sections.map((s, i) => {
              const open = !closed[s.id];
              return (
                <div key={s.id} className="border-t pt-3 pb-1.5" style={{ borderColor: "var(--p-line)" }}>
                  <div className="flex items-center gap-2.5 px-0.5 py-1">
                    <Link to={`/admin/construire/${c.id}/section/${s.id}`} aria-current={currentSection === s.id ? "page" : undefined} className="flex items-baseline gap-2.5 flex-1 min-w-0 no-underline" style={{ color: currentSection === s.id ? "var(--p-accent)" : "var(--p-ink)" }}>
                      <span className="text-[12px] font-semibold" style={{ color: "var(--p-accent)" }}>{pad(i + 1)}</span>
                      <span className="flex-1 min-w-0 text-[14px] font-semibold leading-snug">{s.title}</span>
                    </Link>
                    {minutes(s) > 0 && <span className="text-[11px] p-muted whitespace-nowrap">{minutes(s)} min</span>}
                    <button type="button" aria-expanded={open} aria-label={`${open ? "Replier" : "Déplier"} ${s.title}`} className="cr-icon w-6 h-6" style={{ color: "var(--p-ink-2)" }} onClick={() => setClosed({ ...closed, [s.id]: open })}><ChevronDown size={14} style={{ transform: open ? undefined : "rotate(-90deg)" }} /></button>
                  </div>
                  {open && (
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      {s.lessons.map((l) => {
                        const on = l.id === currentLesson;
                        return (
                          <Link key={l.id} to={`/admin/construire/${c.id}/lecon/${l.id}`} aria-current={on ? "page" : undefined} className="flex items-center gap-2.5 rounded-[10px] p-2 no-underline" style={on ? { background: "var(--p-accent-soft)", color: "var(--p-accent)" } : { color: "var(--p-ink)" }}>
                            <TypeTile type={shownType(l)} size={28} />
                            <span className="flex-1 min-w-0"><span className={`block text-[12px] leading-[1.35] ${on ? "font-semibold" : "font-medium"}`}>{l.title}</span><span className="block mt-px text-[10px] p-muted">{[l.durationMin ? `${l.durationMin} min` : "", l.status === "publie" ? "" : l.status === "relecture" ? "En relecture" : "Brouillon"].filter(Boolean).join(" · ")}</span></span>
                          </Link>
                        );
                      })}
                      <button type="button" className="self-start flex items-center gap-1.5 p-2 text-[12px] p-muted" onClick={() => setAddingLesson(s)}><Plus size={13} /> Ajouter une leçon</button>
                    </div>
                  )}
                </div>
              );
            })}
            <button type="button" className="mt-1.5 h-9 flex items-center justify-center gap-2 rounded-[14px] border border-dashed text-[13px] font-medium" style={{ borderColor: "var(--p-line)", color: "var(--p-accent)" }} onClick={() => setAddingSection(true)}><Plus size={14} /> Nouvelle section</button>
          </nav>
          <AddSection c={c} open={addingSection} onClose={() => setAddingSection(false)} />
          <AddLesson section={addingLesson} courseId={c.id} onClose={() => setAddingLesson(null)} />
        </>
      )}
      {me.data && <div className="mt-auto pt-7"><div className="flex items-center gap-3 border-t pt-5" style={{ borderColor: "var(--p-line)" }}><Avatar m={me.data} size={36} /><span className="flex flex-col min-w-0"><span className="text-[14px] font-medium truncate">{me.data.firstName} {me.data.lastName}</span><span className="text-[12px] p-muted">Espace créateur</span></span></div></div>}
    </div>
  );
}

/** Le numéro de section et le rang de la leçon, pour le haut du document, et ses voisines pour le bas. */
export function lessonPlace(c: Course | undefined, lessonId: number) {
  if (!c) return null;
  const flat = c.sections.flatMap((s, si) => s.lessons.map((l, li) => ({ l, s, si, li })));
  const i = flat.findIndex((x) => x.l.id === lessonId);
  if (i < 0) return null;
  const here = flat[i];
  return { section: `SECTION ${pad(here.si + 1)} · ${here.s.title.toUpperCase()}`, position: `Leçon ${here.li + 1} sur ${here.s.lessons.length}`, prev: flat[i - 1]?.l ?? null, next: flat[i + 1]?.l ?? null };
}
