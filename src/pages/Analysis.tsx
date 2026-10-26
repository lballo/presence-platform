/**
 * Rapport d'analyse vidéo — repris de PresenceAI (Analysis.tsx), adapté au thème Présence.
 */
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Mic, Eye, FileText, Heart, ChevronDown, ChevronUp, CheckCircle, Sparkles, Printer } from "lucide-react";
import { trpc } from "@/providers/trpc";
import ScoreRing from "@/components/ScoreRing";

const CAT = {
  voice: { label: "Voix & ton", icon: Mic, desc: "Débit, articulation, modulation" },
  bodyLanguage: { label: "Langage corporel", icon: Eye, desc: "Posture, gestuelle, regard" },
  structure: { label: "Structure", icon: FileText, desc: "Introduction, transitions, conclusion" },
  impact: { label: "Impact", icon: Heart, desc: "Engagement, conviction, mémorabilité" },
};
const PRIO: Record<string, string> = { high: "Prioritaire", medium: "Important", low: "Conseil" };
const scoreColor = (s: number) => (s >= 80 ? "#4A8C6F" : s >= 65 ? "var(--p-gold)" : s >= 50 ? "#C9944A" : "var(--p-accent-text)");
const scoreLabel = (s: number) => (s >= 80 ? "Excellent" : s >= 65 ? "Bien" : s >= 50 ? "Correct" : "À travailler");

export default function Analysis() {
  const { id } = useParams();
  const { data: s, isLoading } = trpc.speech.getById.useQuery({ id: Number(id) }, { enabled: !!id });
  const [open, setOpen] = useState<Set<number>>(new Set([0]));

  if (isLoading) return <p className="p-muted py-20 text-center">Chargement de l’analyse…</p>;
  if (!s || s.status !== "completed") return <p className="p-muted py-20 text-center">Analyse introuvable. <Link to="/presence-ia" className="p-link">Retour</Link></p>;

  return (
    <>
      <Link to="/presence-ia" className="p-btn-ghost text-[13px] mb-4 no-underline"><ArrowLeft size={14} /> Mes analyses</Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div><h1 className="text-[clamp(32px,4vw,44px)] m-0">{s.title}</h1><span className="text-[14px] p-muted">{new Date(s.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span></div>
        <button type="button" className="p-btn-outline p-btn-sm" onClick={() => window.print()}><Printer size={15} /> Imprimer</button>
      </div>

      <section className="p-card p-6 sm:p-8 grid gap-8 items-center mb-8" style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}>
        <div className="flex flex-col items-center sm:pr-8 sm:border-r" style={{ borderColor: "var(--p-line)" }}>
          <ScoreRing score={s.overallScore ?? 0} size="lg" />
          <span className="font-semibold mt-2">Score global</span>
          <span className="text-[13.5px] font-medium px-3 py-0.5 rounded-full mt-1" style={{ color: scoreColor(s.overallScore ?? 0), background: "var(--p-surface-2)" }}>{scoreLabel(s.overallScore ?? 0)}</span>
        </div>
        <div>
          <span className="flex items-center gap-2 font-semibold mb-2"><Sparkles size={16} style={{ color: "var(--p-gold)" }} /> Résumé de l’analyse</span>
          <p className="m-0 text-[15.5px] leading-relaxed">{s.summary}</p>
          {s.keyInsight && <div className="mt-4 p-4 rounded-r-xl border-l-[3px]" style={{ borderColor: "var(--p-gold)", background: "var(--p-pill)" }}><span className="text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-gold)" }}>Point clé</span><p className="m-0 mt-1 text-[14px] leading-relaxed">{s.keyInsight}</p></div>}
        </div>
      </section>

      <h2 className="text-[30px] mb-4">Scores par dimension</h2>
      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        {s.scores.map((sc) => {
          const c = CAT[sc.category as keyof typeof CAT]; const Icon = c.icon; const color = scoreColor(sc.score);
          return (
            <article key={sc.category} className="p-card p-5">
              <div className="flex justify-between items-start mb-3">
                <div><span className="flex items-center gap-2 font-semibold"><Icon size={16} style={{ color: "var(--p-gold)" }} /> {c.label}</span><span className="text-[12.5px] p-muted ml-6">{c.desc}</span></div>
                <span className="serif text-[34px] leading-none" style={{ color }}>{sc.score}<span className="text-[12px] p-muted font-sans">/100</span></span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "var(--p-track)" }}><div className="h-full rounded-full" style={{ width: `${sc.score}%`, background: color }} /></div>
              <p className="m-0 text-[14px] p-muted leading-relaxed">{sc.insight}</p>
            </article>
          );
        })}
      </div>

      <h2 className="text-[30px] mb-4">Conseils personnalisés</h2>
      <div className="flex flex-col gap-3">
        {s.advice.map((a, i) => {
          const isOpen = open.has(i);
          return (
            <article key={a.id} className="p-card overflow-hidden border-l-[3px]" style={{ borderLeftColor: a.priority === "high" ? "var(--p-accent)" : a.priority === "medium" ? "var(--p-gold)" : "var(--p-line-2)" }}>
              <button type="button" className="w-full flex items-start justify-between gap-4 p-5 text-left" onClick={() => setOpen((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                <span><span className="p-pill mb-2">{PRIO[a.priority]}</span><h4 className="m-0 text-[16px] font-semibold font-sans">{a.title}</h4></span>
                {isOpen ? <ChevronUp size={18} className="p-muted flex-none" /> : <ChevronDown size={18} className="p-muted flex-none" />}
              </button>
              {isOpen && (
                <div className="px-5 pb-5 border-t pt-4" style={{ borderColor: "var(--p-line)" }}>
                  <p className="m-0 text-[14.5px] leading-relaxed mb-3">{a.description}</p>
                  {a.actionStep && <div className="p-soft p-4 flex gap-3 text-[14px] italic p-muted"><CheckCircle size={16} className="flex-none mt-0.5" style={{ color: "#4A8C6F" }} /> {a.actionStep}</div>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
