import { Link } from "react-router";
import { ArrowRight, Check, Compass, Lock } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { parisLongDate } from "@/lib/format";

type Card = RouterOutputs["courses"]["list"][number];

/** Mes formations, côte à côte : couverture, titre, progression, prochaine leçon. */
export default function Parcours() {
  const list = trpc.courses.list.useQuery();
  return (
    <>
      <PageHeader eyebrow="Mon parcours" title="Mes formations" intro="Une section s’ouvre chaque semaine. Avancez à votre rythme : tout ce que vous écrivez reste dans votre journal privé." />
      {list.isLoading && <p className="p-muted text-center py-10 m-0">Chargement…</p>}
      {list.data?.length === 0 && <div className="p-soft p-10 text-center p-muted flex flex-col items-center gap-3"><Compass size={28} /><span>Votre première formation arrive bientôt.</span></div>}
      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))" }}>
        {list.data?.map((c) => <CourseCard key={c.id} c={c} />)}
      </div>
    </>
  );
}

function CourseCard({ c }: { c: Card }) {
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
  return (
    <Link to={`/parcours/${c.id}`} className="p-card overflow-hidden flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
      <div className="aspect-[16/9] flex items-center justify-center" style={{ background: "var(--p-band)" }}>
        {c.coverUrl ? <img src={c.coverUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-[52px]" aria-hidden="true">{c.emoji || "🌱"}</span>}
      </div>
      <div className="p-5 flex flex-col gap-3 flex-1">
        <h2 className="m-0 text-[26px] leading-[1.12]">{c.title}</h2>
        {c.tagline && <p className="m-0 text-[14.5px] p-muted leading-relaxed">{c.tagline}</p>}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          {c.startedAt ? (
            <>
              <span className="flex items-center justify-between text-[13px] p-muted"><span>{c.done} leçon{c.done > 1 ? "s" : ""} sur {c.total}</span><span>{pct} %</span></span>
              <span className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--p-track)" }} role="img" aria-label={`Progression : ${pct} %`}><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--p-accent)" }} /></span>
              <Next c={c} />
            </>
          ) : !c.total ? <span className="text-[14px] p-muted">Les sections arrivent bientôt.</span> : <span className="flex items-center justify-between text-[14.5px] font-medium" style={{ color: "var(--p-accent-text)" }}>{c.sectionCount} section{c.sectionCount > 1 ? "s" : ""} · {c.total} leçon{c.total > 1 ? "s" : ""} · Commencer <ArrowRight size={16} /></span>}
        </div>
      </div>
    </Link>
  );
}

function Next({ c }: { c: Card }) {
  if (!c.total) return <span className="text-[14px] p-muted">Les sections arrivent bientôt.</span>;
  if (!c.next) return <span className="flex items-center gap-2 text-[14px] font-medium"><Check size={15} style={{ color: "var(--p-accent-text)" }} /> Formation terminée</span>;
  if (c.next.open) return <span className="text-[14px]"><span className="p-muted">Prochaine leçon : </span><span className="font-medium">{c.next.title}</span></span>;
  return <span className="text-[14px] flex items-start gap-1.5"><Lock size={14} className="flex-none mt-1 p-faint" /><span><span className="p-muted">Prochaine leçon, {c.next.opensAt ? parisLongDate(new Date(c.next.opensAt)).toLowerCase() : "bientôt"} : </span><span className="font-medium">{c.next.title}</span></span></span>;
}
