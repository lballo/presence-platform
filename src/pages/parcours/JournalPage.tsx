import { useState } from "react";
import { Link } from "react-router";
import { CalendarCheck, Check, Lock, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Layout";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { parisLongDate } from "@/lib/format";

type Journal = RouterOutputs["courses"]["journal"];
type Entry = Journal["entries"][number];
type SectionGroup = { key: string; title: string; position: number; entries: Entry[] };
type CourseGroup = { title: string; sections: SectionGroup[] };

const folded = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Les réponses, regroupées par formation puis par section. Une entrée sans section (leçon retirée, ou plus tard une entrée libre) se range à la fin. */
function groupEntries(entries: Entry[]): CourseGroup[] {
  const courses = new Map<string, Map<string, SectionGroup>>();
  for (const e of entries) {
    const title = e.courseTitle || "Autres réponses";
    const key = e.sectionId ? String(e.sectionId) : "autres";
    if (!courses.has(title)) courses.set(title, new Map());
    const sections = courses.get(title)!;
    if (!sections.has(key)) sections.set(key, { key, title: e.sectionTitle || "Leçons retirées", position: e.sectionPosition ?? Number.MAX_SAFE_INTEGER, entries: [] });
    sections.get(key)!.entries.push(e);
  }
  return [...courses].map(([title, sections]) => ({ title, sections: [...sections.values()].sort((a, b) => a.position - b.position) }));
}

/** Mon journal personnel : mes réponses aux exercices et aux questions des leçons. */
export default function JournalPage() {
  const q = trpc.courses.journal.useQuery();
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState("");
  const [coachingOnly, setCoachingOnly] = useState(false);
  const d = q.data;
  const courses = [...new Set((d?.entries ?? []).map((e) => e.courseTitle))].filter(Boolean);
  const words = folded(search).split(/\s+/).filter(Boolean);
  const entries = (d?.entries ?? []).filter((e) => {
    if (course && e.courseTitle !== course) return false;
    if (coachingOnly && !e.sharedAt) return false;
    const haystack = folded([e.question, e.answer, e.lessonTitle, e.sectionTitle, e.courseTitle].join(" "));
    return words.every((w) => haystack.includes(w));
  });
  const groups = groupEntries(entries);
  const marked = (d?.entries ?? []).filter((e) => e.sharedAt).length;
  return (
    <>
      <PageHeader eyebrow="Mon parcours" title="Mon journal personnel" intro="Ce que vous écrivez dans vos leçons se range ici. C’est à vous." />
      <p className="m-0 mb-6 flex items-start gap-2 text-[14px] p-muted max-w-[760px]"><Lock size={15} className="flex-none mt-0.5" /><span>Personne d’autre ne lit ce journal, ni les autres membres, ni Laura, sauf les réponses que vous marquez « À travailler en coaching avec Laura ». Si vous l’avez accepté, vos réponses nourrissent aussi <Link to="/parametres/confidentialite/memoire" className="p-link">la mémoire du coach IA</Link>.</span></p>
      {q.isLoading && <p className="p-muted text-center py-10 m-0">Chargement…</p>}
      {d && d.entries.length === 0 && <div className="p-soft p-9 text-center p-muted">Votre journal est encore vide. Vos réponses aux exercices viendront s’y ranger.</div>}
      {d && d.entries.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          <label className="relative block max-w-[520px]">
            <span className="sr-only">Rechercher dans mon journal</span>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 p-faint" aria-hidden="true" />
            <input type="search" className="p-field pl-10 w-full" placeholder="Rechercher un mot, une question, une leçon…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer mon journal">
            {courses.length > 1 && <button type="button" aria-pressed={!course} className={`p-chip ${!course ? "p-chip-on" : ""}`} onClick={() => setCourse("")}>Toutes les formations</button>}
            {courses.length > 1 && courses.map((c) => <button key={c} type="button" aria-pressed={course === c} className={`p-chip ${course === c ? "p-chip-on" : ""}`} onClick={() => setCourse(c)}>{c}</button>)}
            <button type="button" aria-pressed={coachingOnly} className={`p-chip ${coachingOnly ? "p-chip-on" : ""}`} onClick={() => setCoachingOnly((v) => !v)}>À travailler en coaching ({marked})</button>
          </div>
        </div>
      )}
      {d && d.entries.length > 0 && entries.length === 0 && <div className="p-soft p-8 text-center p-muted">Aucune réponse ne correspond à votre recherche.</div>}
      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <section key={g.title} className="flex flex-col gap-5" aria-label={g.title}>
            <h2 className="m-0 text-[clamp(25px,3vw,30px)] leading-tight">{g.title}</h2>
            {g.sections.map((s) => (
              <div key={s.key} className="flex flex-col gap-3">
                <h3 className="m-0 p-eyebrow">{s.title}</h3>
                {s.entries.map((e) => <EntryCard key={e.id} e={e} coaching={d!.coaching} />)}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

function EntryCard({ e, coaching }: { e: Entry; coaching: Journal["coaching"] }) {
  const utils = trpc.useUtils();
  const share = trpc.courses.shareAnswer.useMutation({
    onSuccess: async (_r, v) => { await utils.courses.journal.invalidate(); toast.success(v.shared ? "Laura retrouvera cette réponse dans la préparation de votre coaching" : "Option retirée : cette réponse redevient privée"); },
    onError: (x) => toast.error(x.message),
  });
  // La case suit le geste tout de suite, sans attendre la réponse du serveur
  const marked = share.isPending ? share.variables.shared : !!e.sharedAt;
  return (
    <article className="p-card p-4 sm:p-5 flex flex-col gap-2">
      <span className="text-[12.5px] p-muted">{e.lessonTitle}{e.lessonId ? "" : " · leçon retirée"} · {parisLongDate(new Date(e.updatedAt))}</span>
      <span className="font-medium leading-snug">{e.kind === "reflexion" ? "Mes réflexions" : e.question}</span>
      {e.answer === null ? <p className="m-0 text-[14px] p-muted">Cette réponse ne peut plus être lue.</p> : <p className="m-0 text-[15px] leading-relaxed whitespace-pre-line">{e.answer}</p>}
      <div className="flex flex-col gap-1.5 pt-2 mt-1 border-t" style={{ borderColor: "var(--p-line)" }}>
        <label className="flex items-center gap-2.5 text-[14px] font-medium cursor-pointer min-h-[32px]">
          <input type="checkbox" checked={marked} disabled={share.isPending} className="w-[18px] h-[18px] flex-none" style={{ accentColor: "var(--p-accent)" }} onChange={(x) => share.mutate({ id: e.id, shared: x.target.checked })} />
          À travailler en coaching avec Laura
        </label>
        {marked && (
          <p className="m-0 text-[13px] p-muted leading-snug">
            {e.discussedAt && e.sharedAt ? <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--p-accent-text)" }}><Check size={13} /> Abordée en séance le {parisLongDate(new Date(e.discussedAt)).toLowerCase()}</span> : `Laura peut lire cette réponse${coaching.active ? " pour préparer votre prochaine séance" : ""}. Vous pouvez retirer cette option à tout moment.`}
          </p>
        )}
        {marked && !coaching.active && (
          <p className="m-0 text-[13px] leading-snug flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="p-muted">Vous n’avez pas d’accompagnement individuel en cours.</span>
            {coaching.discoveryUrl ? <a href={coaching.discoveryUrl} target="_blank" rel="noopener noreferrer" className="p-link font-medium flex items-center gap-1"><CalendarCheck size={13} /> Réserver un appel découverte</a> : <span className="p-muted">Écrivez à Laura pour en parler.</span>}
          </p>
        )}
      </div>
    </article>
  );
}
