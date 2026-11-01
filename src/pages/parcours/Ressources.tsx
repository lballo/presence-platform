import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight, Check, Clock } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { BlockList } from "@/components/course/Blocks";
import { ConsentDialog } from "@/components/course/ConsentDialog";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { parisLongDate } from "@/lib/format";

type Theme = RouterOutputs["resources"]["catalog"]["themes"][number];

/** Mes ressources : une rubrique par thème publié, avec ses tests. Plus tard, d'autres ressources viendront ici. */
export default function Ressources() {
  const q = trpc.resources.catalog.useQuery();
  const [params, setParams] = useSearchParams();
  const [asking, setAsking] = useState(false);
  const todoOnly = params.get("filtre") === "a-faire";
  const d = q.data;
  const todoCount = new Set(d?.themes.flatMap((t) => t.tests).filter((t) => !t.lastPassedAt).map((t) => t.id)).size;
  const shown = (d?.themes ?? []).map((t) => ({ ...t, tests: todoOnly ? t.tests.filter((x) => !x.lastPassedAt) : t.tests })).filter((t) => !todoOnly || t.tests.length > 0);
  return (
    <>
      <PageHeader eyebrow="Mon parcours" title="Mes ressources" intro="Des tests pour mieux vous connaître. Vos résultats restent privés : vous choisissez ce que vous montrez, thème par thème, depuis votre profil." />
      <ConsentDialog open={asking} onDone={() => setAsking(false)} />
      {q.isLoading && <p className="p-muted text-center py-10 m-0">Chargement…</p>}
      {d && d.themes.length === 0 && <div className="p-soft p-10 text-center p-muted">Vos premiers tests arrivent bientôt.</div>}
      {d?.consentNeeded && d.themes.length > 0 && (
        <div className="p-soft p-4 mb-5 flex flex-wrap items-center justify-between gap-3 text-[14.5px]">
          <span className="flex-[1_1_260px]">Le coach peut garder le fil de vos résultats et vous proposer une synthèse, si vous le souhaitez.</span>
          <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setAsking(true)}>Choisir</button>
        </div>
      )}
      {d && d.themes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6" role="group" aria-label="Filtrer les tests">
          <button type="button" aria-pressed={!todoOnly} className={`p-chip ${!todoOnly ? "p-chip-on" : ""}`} onClick={() => setParams({})}>Tous les tests</button>
          <button type="button" aria-pressed={todoOnly} className={`p-chip ${todoOnly ? "p-chip-on" : ""}`} onClick={() => setParams({ filtre: "a-faire" })}>À passer ({todoCount})</button>
        </div>
      )}
      {todoOnly && d && shown.length === 0 && d.themes.length > 0 && <div className="p-soft p-9 text-center p-muted">Vous avez passé tous les tests disponibles.</div>}
      <div className="flex flex-col gap-10">
        {shown.map((t) => <ThemeSection key={t.id} theme={t} />)}
      </div>
    </>
  );
}

function ThemeSection({ theme }: { theme: Theme }) {
  return (
    <section id={`theme-${theme.id}`} aria-labelledby={`theme-titre-${theme.id}`} className="flex flex-col gap-3.5 scroll-mt-20">
      <h2 id={`theme-titre-${theme.id}`} className="m-0 text-[clamp(26px,3vw,32px)] leading-tight">{theme.emoji && <span aria-hidden="true">{theme.emoji} </span>}{theme.title}</h2>
      {theme.intro.length > 0 && <div className="text-[15.5px] leading-relaxed max-w-[760px]"><BlockList blocks={theme.intro} /></div>}
      {theme.tests.length === 0 && <p className="m-0 text-[14.5px] p-muted">Les tests de ce thème arrivent bientôt.</p>}
      <ul className="list-none m-0 p-0 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))" }}>
        {theme.tests.map((x) => {
          const done = !!x.lastPassedAt;
          return (
            <li key={x.id} className="flex">
              <Link to={`/parcours/ressources/test/${x.id}`} className="p-card p-4 flex items-start gap-3 no-underline flex-1 min-w-0" style={{ color: "var(--p-ink)" }}>
                <span aria-hidden="true" className="w-7 h-7 rounded-full flex items-center justify-center flex-none mt-0.5" style={done ? { background: "var(--p-accent)", color: "#fff" } : { border: "1.5px solid var(--p-line-2)" }}>{done && <Check size={15} />}</span>
                <span className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <span className="font-medium text-[16.5px] leading-snug">{x.title}</span>
                  {x.description && <span className="text-[14px] p-muted leading-relaxed">{x.description}</span>}
                  <span className="text-[13px] p-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                    {x.durationMin !== null && <span className="flex items-center gap-1"><Clock size={13} /> {x.durationMin} min</span>}
                    {done ? <span>Passé le {parisLongDate(new Date(x.lastPassedAt!)).toLowerCase()}</span> : <span className="font-medium" style={{ color: "var(--p-accent-text)" }}>À passer</span>}
                  </span>
                </span>
                <ArrowRight size={16} className="flex-none mt-1 p-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
