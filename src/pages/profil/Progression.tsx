import { Link } from "react-router";
import { ArrowRight, Check } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { FirstSteps } from "@/components/onboarding/FirstSteps";
import { FIRST_STEPS_CARD } from "@/content/accueil";
import { ago } from "@/lib/format";

const HONEY_LABEL: Record<string, string> = { ...Object.fromEntries(Object.entries(FIRST_STEPS_CARD.steps).map(([k, v]) => [k, v.label])), presentation_video: "Me présenter en vidéo" };

/** Ma progression : mes formations et le miel récolté. */
export default function Progression() {
  const courses = trpc.courses.list.useQuery();
  const honey = trpc.honey.history.useQuery();
  return (
    <>
      <PageHeader eyebrow="Mon profil" title="Ma progression" intro="Où vous en êtes dans vos formations, et le miel récolté en chemin." />
      <div className="flex flex-wrap gap-6 items-start">
        <section className="flex-[2_1_440px] min-w-0 flex flex-col gap-3" aria-label="Mes formations">
          <h2 className="m-0 text-[28px]">Mes formations</h2>
          {courses.data?.length === 0 && <div className="p-soft p-7 text-center p-muted">Votre première formation arrive bientôt.</div>}
          {courses.data?.map((c) => {
            const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
            return (
              <Link key={c.id} to={`/parcours/${c.id}`} className="p-card p-5 flex flex-col gap-2.5 no-underline" style={{ color: "var(--p-ink)" }}>
                <span className="flex items-center justify-between gap-3"><span className="serif text-[22px] leading-tight">{c.title}</span><ArrowRight size={16} className="p-faint flex-none" /></span>
                {c.startedAt ? (
                  <>
                    <span className="flex items-center justify-between text-[13px] p-muted"><span>{c.done} leçon{c.done > 1 ? "s" : ""} sur {c.total}</span><span>{pct} %</span></span>
                    <span className="h-2 rounded-full overflow-hidden" style={{ background: "var(--p-track)" }} role="img" aria-label={`Progression : ${pct} %`}><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--p-accent)" }} /></span>
                    {!c.next && c.total > 0 && <span className="flex items-center gap-1.5 text-[13.5px] font-medium"><Check size={14} style={{ color: "var(--p-accent-text)" }} /> Formation terminée</span>}
                  </>
                ) : <span className="text-[13.5px] p-muted">Pas encore commencée.</span>}
              </Link>
            );
          })}
        </section>
        <section className="flex-[1_1_300px] min-w-0 flex flex-col gap-3" aria-label="Mon miel">
          <h2 className="m-0 text-[28px]">Mon miel</h2>
          <div className="p-card p-5 flex flex-col gap-1">
            <span className="serif text-[52px] leading-none" style={{ color: "var(--p-accent-text)" }}>{honey.data?.total ?? 0}</span>
            <span className="text-[14px] p-muted">miels récoltés, notre précieux nectar</span>
          </div>
          <ul className="list-none m-0 p-0 p-card flex flex-col">
            {honey.data?.items.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--p-line)" }}>
                <span className="flex-1 min-w-0 flex flex-col"><span className="text-[14.5px]">{HONEY_LABEL[h.action] ?? h.action}</span><span className="text-[12px] p-faint">{ago(new Date(h.at))}</span></span>
                <span className="font-semibold text-[14px]" style={{ color: "var(--p-gold)" }}>+{h.amount}</span>
              </li>
            ))}
            {honey.data?.items.length === 0 && <li className="p-5 text-center text-[14px] p-muted">Votre premier miel vous attend dans « Mes premiers pas ».</li>}
          </ul>
        </section>
      </div>
      <div className="mt-8"><FirstSteps /></div>
    </>
  );
}
