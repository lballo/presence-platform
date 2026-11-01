import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Check, ChevronDown, Clock, Lock, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { BlockList } from "@/components/course/Blocks";
import { ConsentDialog } from "@/components/course/ConsentDialog";
import { ChallengeForm, Rubric } from "@/components/course/LessonReader";
import { parisLongDate } from "@/lib/format";
import { LESSON_TYPE_LABEL } from "../../../server/lib/courseBlocks";

type Course = RouterOutputs["courses"]["course"];
type Section = Course["sections"][number];

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Une formation : sa présentation et ses sections, y compris celles à venir, avec leur date. */
export default function CoursePage() {
  const id = Number(useParams().courseId);
  const navigate = useNavigate();
  const { hash } = useLocation();
  const utils = trpc.useUtils();
  const q = trpc.courses.course.useQuery({ id }, { retry: false });
  const [consent, setConsent] = useState<{ thenGo?: number } | null>(null);
  const start = trpc.courses.start.useMutation({
    onSuccess: async () => {
      await utils.courses.invalidate();
      const first = q.data?.sections[0]?.lessons[0]?.id;
      if (q.data?.consentNeeded) setConsent({ thenGo: first });
      else if (first) navigate(`/parcours/${id}/lecon/${first}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const back = <Link to="/parcours" className="p-btn-ghost no-underline self-start"><ArrowLeft size={15} /> Mes formations</Link>;
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (!q.data) return <div className="flex flex-col gap-4">{back}<p className="p-muted m-0">{q.error?.message ?? "Cette formation n’est pas accessible."}</p></div>;
  const c = q.data;
  const started = !!c.startedAt;
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
  // Dépliée d'office : la section demandée par l'adresse, sinon celle en cours
  const asked = Number(hash.match(/^#section-(\d+)$/)?.[1]);
  const current = c.sections.find((s) => s.id === asked) ?? [...c.sections].find((s) => s.open && !s.done) ?? c.sections[0];
  return (
    <div className="max-w-[860px] mx-auto flex flex-col gap-7">
      {back}
      <header className="p-card overflow-hidden flex flex-wrap">
        <div className="flex-[1_1_280px] min-h-[200px] flex items-center justify-center" style={{ background: "var(--p-band)" }}>
          {c.coverUrl ? <img src={c.coverUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-[64px]" aria-hidden="true">{c.emoji || "🌱"}</span>}
        </div>
        <div className="flex-[2_1_360px] min-w-0 p-6 sm:p-7 flex flex-col gap-3">
          <h1 className="m-0 text-[clamp(32px,4.4vw,44px)] leading-[1.08]">{c.title}</h1>
          {c.tagline && <p className="m-0 text-[16px] p-muted leading-relaxed">{c.tagline}</p>}
          {started ? (
            <div className="flex flex-col gap-2">
              <span className="text-[14px] p-muted">Commencée le {parisLongDate(new Date(c.startedAt!)).toLowerCase()} · {c.done} {plural(c.done, "leçon terminée", "leçons terminées")} sur {c.total}{c.fullAccess ? " · toutes les sections vous sont ouvertes" : ""}</span>
              <span className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--p-track)" }} role="img" aria-label={`Progression : ${pct} %`}><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--p-accent)" }} /></span>
            </div>
          ) : <span className="text-[14px] p-muted">{c.rhythm === "complet" ? "Toutes les sections s’ouvrent dès le départ." : "La première section s’ouvre le jour où vous commencez, puis une nouvelle chaque semaine."}</span>}
          {!started && <button type="button" className="p-btn-primary self-start mt-1" disabled={start.isPending || !c.total} onClick={() => start.mutate({ id })}><PlayCircle size={18} /> Commencer la formation</button>}
        </div>
      </header>

      {started && c.consentNeeded && (
        <div className="p-soft p-4 flex flex-wrap items-center justify-between gap-3 text-[14.5px]">
          <span className="flex-[1_1_260px]">Le coach peut garder le fil de votre chemin, si vous le souhaitez.</span>
          <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setConsent({})}>Choisir</button>
        </div>
      )}
      <ConsentDialog open={!!consent} onDone={() => { const go = consent?.thenGo; setConsent(null); if (go) navigate(`/parcours/${id}/lecon/${go}`); }} />

      {c.description.length > 0 && <BlockList blocks={c.description} />}

      <section className="flex flex-col gap-2.5" aria-label="Les sections">
        <h2 className="m-0 text-[30px]">Les sections</h2>
        {c.sections.length === 0 && <p className="m-0 p-muted">Les sections arrivent bientôt.</p>}
        <ol className="list-none m-0 p-0 flex flex-col gap-2.5">
          {c.sections.map((s) => <SectionRow key={s.id} c={c} s={s} started={started} initiallyOpen={s.id === current?.id} focus={s.id === asked} />)}
        </ol>
      </section>
    </div>
  );
}

function SectionRow({ c, s, started, initiallyOpen, focus }: { c: Course; s: Section; started: boolean; initiallyOpen: boolean; focus: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const domId = `section-${s.id}`;
  useEffect(() => {
    if (!focus) return;
    setOpen(true);
    document.getElementById(domId)?.scrollIntoView({ block: "start" });
  }, [focus, domId]);
  const dateLine = !s.open && (s.opensAt ? `S’ouvre ${parisLongDate(new Date(s.opensAt)).toLowerCase()}` : `Semaine ${s.position}`);
  return (
    <li id={domId} className={`${s.open ? "p-card" : "p-soft"} overflow-hidden scroll-mt-20`}>
      <button type="button" aria-expanded={open} className="w-full p-3.5 flex items-center gap-3.5 text-left" style={{ color: "var(--p-ink)" }} onClick={() => setOpen(!open)}>
        <span className="w-9 h-9 rounded-full flex items-center justify-center flex-none text-[14px] font-semibold" style={s.done ? { background: "var(--p-accent)", color: "#fff" } : s.open ? { background: "var(--p-accent-soft)", color: "var(--p-accent-text)" } : { background: "var(--p-surface-2)", color: "var(--p-ink-3)" }}>{s.done ? <Check size={16} strokeWidth={3} /> : s.open ? s.position : <Lock size={14} />}</span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="font-medium leading-snug text-[16.5px]">{s.title}</span>
          {s.intention && <span className="text-[13.5px] p-muted leading-snug">{s.intention}</span>}
          <span className="text-[12.5px] p-faint flex flex-wrap items-center gap-x-2.5">
            <span>{started ? `${s.doneCount} sur ${s.total} ${plural(s.total, "leçon", "leçons")}` : `${s.total} ${plural(s.total, "leçon", "leçons")}`}</span>
            {dateLine && <span>{dateLine}</span>}
          </span>
        </span>
        <ChevronDown size={18} className="flex-none transition-transform p-muted" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <div className="px-3.5 pb-4 flex flex-col gap-4">
          {s.objectifs.length > 0 && <div className="flex flex-col gap-1.5 pt-1"><span className="p-eyebrow">Objectifs</span><BlockList blocks={s.objectifs} /></div>}
          <ul className="list-none m-0 p-0 flex flex-col gap-1" aria-label={`Leçons de ${s.title}`}>
            {s.lessons.map((l) => {
              const body = (
                <>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center flex-none" style={l.done ? { background: "var(--p-accent)", color: "#fff" } : { border: "1.5px solid var(--p-line-2)", color: "var(--p-ink-3)" }} aria-label={l.done ? "Terminée" : undefined}>{l.done ? <Check size={13} strokeWidth={3} /> : !s.open ? <Lock size={11} /> : null}</span>
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="leading-snug">{l.title}</span>
                    <span className="text-[12.5px] p-faint flex flex-wrap items-center gap-x-2.5"><span>{LESSON_TYPE_LABEL[l.type]}</span>{l.durationMin ? <span className="flex items-center gap-1"><Clock size={12} /> {l.durationMin} min</span> : null}</span>
                  </span>
                </>
              );
              return <li key={l.id}>{s.open && started ? <Link to={`/parcours/${c.id}/lecon/${l.id}`} className="flex items-center gap-3 p-2 rounded-lg no-underline hover:bg-black/5 dark:hover:bg-white/5" style={{ color: "var(--p-ink)" }}>{body}</Link> : <div className="flex items-center gap-3 p-2" aria-disabled="true">{body}</div>}</li>;
            })}
          </ul>
          {started && s.open && s.defi.length > 0 && <SectionChallenge c={c} s={s} />}
        </div>
      )}
    </li>
  );
}

/** Le défi de la section : facultatif, il ne compte pas pour la terminer. */
function SectionChallenge({ c, s }: { c: Course; s: Section }) {
  const utils = trpc.useUtils();
  const save = trpc.courses.saveSectionChallenge.useMutation({
    onSuccess: (_r, v) => { utils.courses.course.invalidate({ id: c.id }); utils.courses.journal.invalidate(); utils.coachMemory.invalidate(); if (v.done) toast.success("Bravo, c’est noté dans votre journal"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Rubric title="Défi dans le réseau">
      <BlockList blocks={s.defi} />
      <ChallengeForm doneAt={s.challengeDoneAt} savedNote={s.challengeNote} pending={save.isPending} onSave={(done, note) => save.mutate({ sectionId: s.id, done, note })} />
    </Rubric>
  );
}
