import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Check, Clock, Lock, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { BlockList } from "@/components/course/Blocks";
import { ConsentDialog } from "@/components/course/ConsentDialog";
import { parisLongDate } from "@/lib/format";

/** Une formation : sa présentation et ses modules, y compris ceux à venir, avec leur date. */
export default function CoursePage() {
  const id = Number(useParams().courseId);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const q = trpc.courses.course.useQuery({ id }, { retry: false });
  const [consent, setConsent] = useState<{ thenGo?: number } | null>(null);
  const start = trpc.courses.start.useMutation({
    onSuccess: async () => {
      await utils.courses.invalidate();
      const first = q.data?.modules[0]?.id;
      if (q.data?.consentNeeded) setConsent({ thenGo: first });
      else if (first) navigate(`/parcours/${id}/module/${first}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const back = <Link to="/parcours" className="p-btn-ghost no-underline self-start"><ArrowLeft size={15} /> Mes formations</Link>;
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (!q.data) return <div className="flex flex-col gap-4">{back}<p className="p-muted m-0">{q.error?.message ?? "Cette formation n’est pas accessible."}</p></div>;
  const c = q.data;
  const started = !!c.startedAt;
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
          {started
            ? <span className="text-[14px] p-muted">Commencée le {parisLongDate(new Date(c.startedAt!)).toLowerCase()} · {c.done} module{c.done > 1 ? "s" : ""} terminé{c.done > 1 ? "s" : ""} sur {c.total}{c.fullAccess ? " · tous les modules vous sont ouverts" : ""}</span>
            : <span className="text-[14px] p-muted">{c.rhythm === "complet" ? "Tous les modules s’ouvrent dès le départ." : "Le premier module s’ouvre le jour où vous commencez, puis un nouveau chaque semaine."}</span>}
          {!started && <button type="button" className="p-btn-primary self-start mt-1" disabled={start.isPending || !c.total} onClick={() => start.mutate({ id })}><PlayCircle size={18} /> Commencer la formation</button>}
        </div>
      </header>

      {started && c.consentNeeded && (
        <div className="p-soft p-4 flex flex-wrap items-center justify-between gap-3 text-[14.5px]">
          <span className="flex-[1_1_260px]">Le coach peut garder le fil de votre chemin, si vous le souhaitez.</span>
          <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setConsent({})}>Choisir</button>
        </div>
      )}
      <ConsentDialog open={!!consent} onDone={() => { const go = consent?.thenGo; setConsent(null); if (go) navigate(`/parcours/${id}/module/${go}`); }} />

      {c.description.length > 0 && <BlockList blocks={c.description} />}

      <section className="flex flex-col gap-2.5" aria-label="Les modules">
        <h2 className="m-0 text-[30px]">Les modules</h2>
        {c.modules.length === 0 && <p className="m-0 p-muted">Les modules arrivent bientôt.</p>}
        <ol className="list-none m-0 p-0 flex flex-col gap-2.5">
          {c.modules.map((m) => {
            const body = (
              <>
                <span className="w-9 h-9 rounded-full flex items-center justify-center flex-none text-[14px] font-semibold" style={m.done ? { background: "var(--p-accent)", color: "#fff" } : m.open ? { background: "var(--p-accent-soft)", color: "var(--p-accent-text)" } : { background: "var(--p-surface-2)", color: "var(--p-ink-3)" }}>{m.done ? <Check size={16} strokeWidth={3} /> : m.open ? m.position : <Lock size={14} />}</span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="font-medium leading-snug">{m.title}</span>
                  {m.intention && <span className="text-[13.5px] p-muted leading-snug">{m.intention}</span>}
                  <span className="text-[12.5px] p-faint flex flex-wrap items-center gap-x-2.5">
                    {!m.open && (m.opensAt ? <span>S’ouvre {parisLongDate(new Date(m.opensAt)).toLowerCase()}</span> : <span>Semaine {m.position}</span>)}
                    {m.durationMin ? <span className="flex items-center gap-1"><Clock size={12} /> {m.durationMin} min</span> : null}
                  </span>
                </span>
              </>
            );
            return <li key={m.id}>{m.open ? <Link to={`/parcours/${id}/module/${m.id}`} className="p-card p-3.5 flex items-center gap-3.5 no-underline" style={{ color: "var(--p-ink)" }}>{body}</Link> : <div className="p-soft p-3.5 flex items-center gap-3.5" aria-disabled="true">{body}</div>}</li>;
          })}
        </ol>
      </section>
    </div>
  );
}
