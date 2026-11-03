import { Link } from "react-router";
import { ArrowRight, Check } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { FirstSteps } from "@/components/onboarding/FirstSteps";
import { WeekSection } from "@/components/course/WeekSection";
import { FIRST_STEPS_CARD } from "@/content/accueil";
import { ago } from "@/lib/format";

const HONEY_LABEL: Record<string, string> = { ...Object.fromEntries(Object.entries(FIRST_STEPS_CARD.steps).map(([k, v]) => [k, v.label])), presentation_video: "Me présenter en vidéo" };

/** Ma progression : la section de la semaine, mon miel, mes formations et mes premiers pas. */
export default function Progression() {
  const courses = trpc.courses.list.useQuery();
  const honey = trpc.honey.history.useQuery();
  const started = (courses.data ?? []).filter((c) => c.startedAt && c.next);
  return (
    <section className="p-panel" aria-label="Ma progression">
      <div className="p-panel-head"><h2 className="p-panel-title">Ma progression</h2><span className="text-[13px] p-muted">Vos formations, vos premiers pas et votre miel.</span></div>
      <div className="flex flex-wrap gap-6 items-start">
        <div className="flex-[1_1_380px] min-w-0 flex flex-col gap-3">
          <WeekSection />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Mon miel" n={honey.data?.total ?? 0} />
            <Stat label="Formations en cours" n={started.length} />
          </div>
        </div>
        <div className="flex-[1_1_380px] min-w-0"><FirstSteps /></div>
      </div>

      <div className="flex flex-wrap gap-6 items-start mt-6">
        <div className="flex-[2_1_420px] min-w-0 flex flex-col gap-3" aria-label="Mes formations">
          <h3 className="m-0 font-['Newsreader'] font-normal text-[24px]" style={{ color: "var(--p-ink)" }}>Mes formations</h3>
          {courses.data?.length === 0 && <div className="p-soft p-7 text-center p-muted">Votre première formation arrive bientôt.</div>}
          {courses.data?.map((c) => {
            const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
            return (
              <Link key={c.id} to={`/parcours/${c.id}`} className="rounded-[20px] border p-5 flex flex-col gap-2.5 no-underline" style={{ borderColor: "var(--p-line)", color: "var(--p-ink)" }}>
                <span className="flex items-center justify-between gap-3"><span className="font-['Newsreader'] text-[21px] leading-tight">{c.title}</span><ArrowRight size={16} className="p-faint flex-none" /></span>
                {c.startedAt ? (
                  <>
                    <span className="flex items-center justify-between text-[13px] p-muted"><span>{c.done} leçon{c.done > 1 ? "s" : ""} sur {c.total}</span><span>{pct} %</span></span>
                    <span className="h-[3px] rounded-full overflow-hidden" style={{ background: "var(--p-track)" }} role="img" aria-label={`Progression : ${pct} %`}><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--p-accent)" }} /></span>
                    {!c.next && c.total > 0 && <span className="flex items-center gap-1.5 text-[13.5px] font-medium"><Check size={14} style={{ color: "var(--p-accent-text)" }} /> Formation terminée</span>}
                  </>
                ) : <span className="text-[13.5px] p-muted">Pas encore commencée.</span>}
              </Link>
            );
          })}
        </div>
        <div className="flex-[1_1_280px] min-w-0 flex flex-col gap-3" aria-label="Mon miel">
          <h3 className="m-0 font-['Newsreader'] font-normal text-[24px]" style={{ color: "var(--p-ink)" }}>Mon miel</h3>
          <ul className="list-none m-0 p-0 rounded-[20px] border flex flex-col" style={{ borderColor: "var(--p-line)" }}>
            {honey.data?.items.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--p-line)" }}>
                <span className="flex-1 min-w-0 flex flex-col"><span className="text-[14px]">{HONEY_LABEL[h.action] ?? h.action}</span><span className="text-[12px] p-faint">{ago(new Date(h.at))}</span></span>
                <span className="font-['Newsreader'] italic text-[15px]" style={{ color: "var(--p-accent-text)" }}>+{h.amount}</span>
              </li>
            ))}
            {honey.data?.items.length === 0 && <li className="p-5 text-center text-[14px] p-muted">Votre premier miel vous attend dans « Mes premiers pas ».</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return <div className="rounded-[20px] border px-4 py-4 flex flex-col gap-1" style={{ borderColor: "var(--p-line)" }}><span className="text-[11px] p-muted">{label}</span><span className="font-['Newsreader'] text-[30px] leading-none" style={{ color: "var(--p-ink)" }}>{n}</span></div>;
}
