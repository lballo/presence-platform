import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Heart, X, RotateCcw, Pencil } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { plural } from "@/lib/format";

export default function Matching() {
  const utils = trpc.useUtils();
  const goals = trpc.matching.goals.useQuery();
  const [goal, setGoal] = useState<string | null>(null);
  useEffect(() => { if (goals.data && (goal === null || !goals.data.some((g) => g.code === goal))) setGoal(goals.data[0]?.code ?? ""); }, [goals.data, goal]);

  const deck = trpc.matching.deck.useQuery({ goal: goal ?? "" }, { enabled: !!goal });
  const matches = trpc.matching.matches.useQuery();
  const swipe = trpc.matching.swipe.useMutation({ onSuccess: (r) => { if (r.matched) setMatch(cur ?? null); utils.matching.deck.invalidate(); utils.matching.matches.invalidate(); } });
  const undo = trpc.matching.undo.useMutation({ onSuccess: () => { utils.matching.deck.invalidate(); utils.matching.matches.invalidate(); } });
  const [history, setHistory] = useState<number[]>([]);
  const [match, setMatch] = useState<NonNullable<typeof deck.data>[number] | null>(null);
  const [dx, setDx] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);

  const cur = deck.data?.[0];
  const next = deck.data?.[1];
  const isAmour = goal === "amour";
  const decide = (liked: boolean) => { if (!cur || !goal) return; setHistory((h) => [...h, cur.id]); swipe.mutate({ toId: cur.id, goal, liked }); setDx(0); };

  return (
    <>
      <PageHeader eyebrow="Rencontres du cercle" title="Affinités & Rencontres" intro="Glissez vers la droite pour proposer un échange, vers la gauche pour passer. Quand l’envie est réciproque, c’est un match." />
      <div className="flex flex-wrap gap-10 items-start">
        <section className="flex-[3_1_400px] min-w-0 flex flex-col items-center gap-5">
          <div className="flex items-center justify-between w-full max-w-[400px] text-[13.5px] p-muted">
            <span>{cur ? plural(deck.data!.length, "profil à découvrir", "profils à découvrir") : "Plus de profil"}</span>
            {goal && <span className="p-pill">{goals.data?.find((g) => g.code === goal)?.label}</span>}
          </div>
          <div className="relative w-full max-w-[400px] h-[560px]">
            {next && <div className="absolute inset-0 rounded-3xl overflow-hidden scale-95 translate-y-3 opacity-80" style={{ background: "var(--p-surface-2)" }}>{next.photoUrl && <img src={next.photoUrl} alt="" className="w-full h-full object-cover" />}</div>}
            {cur ? (
              <div
                className="absolute inset-0 rounded-3xl overflow-hidden select-none cursor-grab touch-none shadow-xl"
                style={{ background: "#141211", transform: `translateX(${dx}px) rotate(${dx / 18}deg)`, transition: startX === null ? "transform .25s" : "none" }}
                onPointerDown={(e) => { setStartX(e.clientX); e.currentTarget.setPointerCapture(e.pointerId); }}
                onPointerMove={(e) => { if (startX !== null) setDx(e.clientX - startX); }}
                onPointerUp={() => { if (dx > 110) decide(true); else if (dx < -110) decide(false); else setDx(0); setStartX(null); }}
              >
                {cur.photoUrl ? <img src={cur.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none" /> : <span className="absolute inset-0 flex items-start justify-center pt-[22%] serif text-[150px] italic" style={{ color: "var(--p-gold-bright)", background: "linear-gradient(160deg,#46403C,#141211)" }}>{cur.initials}</span>}
                <span className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(14,13,12,0) 38%, rgba(14,13,12,0.6) 62%, rgba(14,13,12,0.94) 100%)" }} />
                <span className="absolute top-4 left-4 h-8 px-3.5 rounded-full bg-white text-[13px] font-medium flex items-center gap-2" style={{ color: "#141211" }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--p-accent)" }} />Affinité {cur.affinity}</span>
                <span className="absolute top-[74px] left-5 px-3 py-1 border-[3px] border-white rounded-lg text-white text-[22px] font-semibold tracking-widest -rotate-12" style={{ opacity: Math.min(1, -dx / 110) }}>PASSER</span>
                <span className="absolute top-[74px] right-5 px-3 py-1 border-[3px] rounded-lg bg-white/90 text-[22px] font-semibold tracking-widest rotate-12" style={{ opacity: Math.min(1, dx / 110), borderColor: "var(--p-accent)", color: "var(--p-accent)" }}>{isAmour ? "OUI" : "ÉCHANGER"}</span>
                <div className="absolute left-0 right-0 bottom-0 p-6 flex flex-col gap-2.5 text-white">
                  <span className="self-start p-pill text-white" style={{ background: "var(--p-accent)" }}>{cur.reason}</span>
                  <span className="serif text-[38px] leading-none">{cur.name}</span>
                  <span className="text-[14.5px] text-white/85">{cur.role} · {cur.city}</span>
                  <div className="flex flex-wrap gap-1.5">{cur.common.map((c) => <span key={c} className="h-7 px-3 rounded-full text-[12.5px] bg-white/15 border border-white/30 flex items-center">{c}</span>)}</div>
                  <span className="text-[14px] text-white/90 leading-relaxed">{cur.blurb}</span>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 rounded-3xl border border-dashed flex flex-col items-center justify-center gap-3 p-8 text-center" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface-2)" }}>
                <span className="p-eyebrow">{goal ? "À lundi" : "Pour l’instant"}</span>
                <span className="serif text-[32px] leading-tight">{!goal ? "Votre profil ne dit pas encore ce que vous cherchez." : "Vous avez découvert tous les profils de cette intention."}</span>
                <span className="text-[14.5px] p-muted">{!goal ? "Indiquez ce que vous cherchez dans votre profil." : "Essayez une autre de vos intentions, ou revenez lundi."}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button type="button" aria-label="Revenir" className="w-12 h-12 rounded-full border flex items-center justify-center p-muted" style={{ borderColor: "var(--p-line)", background: "var(--p-surface)" }} disabled={!history.length || !goal} onClick={() => { const id = history[history.length - 1]; setHistory((h) => h.slice(0, -1)); undo.mutate({ toId: id, goal: goal! }); }}><RotateCcw size={18} /></button>
            <button type="button" aria-label="Passer" className="w-16 h-16 rounded-full border flex items-center justify-center shadow" style={{ borderColor: "var(--p-line)", background: "var(--p-surface)" }} disabled={!cur} onClick={() => decide(false)}><X size={24} /></button>
            <button type="button" aria-label="Proposer un échange" className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow" style={{ background: "var(--p-accent)" }} disabled={!cur} onClick={() => decide(true)}><Heart size={26} fill="currentColor" /></button>
          </div>
        </section>

        <aside className="flex-[2_1_300px] min-w-0 flex flex-col gap-7">
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between"><h2 className="m-0 text-[30px]">Vos matchs</h2><span className="text-[13.5px] p-muted">{plural(matches.data?.length ?? 0, "échange possible", "échanges possibles")}</span></div>
            {matches.data?.length === 0 && <p className="m-0 text-[14px] p-muted">Pas encore de match. Quand l’envie est réciproque, la personne apparaît ici.</p>}
            {matches.data?.map((m) => (
              <div key={`${m.id}-${m.goal}`} className="p-card p-3 flex items-center gap-3">
                <Avatar m={m} size={52} />
                <span className="flex flex-col flex-1 min-w-0"><span className="font-medium">{m.name}</span><span className="text-[13px] p-muted">{m.goalLabel} · {m.city}</span></span>
                <button type="button" className="p-btn-primary p-btn-sm">Écrire</button>
              </div>
            ))}
          </section>
          <section className="p-card p-5 flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3"><h2 className="m-0 text-[24px] leading-tight">Mon profil est paramétré sur</h2><Link to="/" className="p-btn-ghost text-[13.5px] no-underline"><Pencil size={14} /> Modifier</Link></div>
            {goals.data?.length === 0 && <p className="m-0 text-[14px] p-muted">Vous n’avez encore rien indiqué. Dites ce que vous cherchez ou proposez dans « Modifier mon profil ».</p>}
            <div className="flex flex-wrap gap-2">
              {goals.data?.map((g) => <button key={g.code} type="button" className={`p-chip min-h-9 ${g.code === goal ? "p-chip-on" : ""} ${g.code === "amour" && g.code !== goal ? "border-dashed" : ""}`} onClick={() => { setGoal(g.code); setHistory([]); }}>{g.label}</button>)}
            </div>
            <span className="text-[12.5px] p-faint leading-relaxed">{isAmour ? "Espace Rencontre, visible de vous seule." : "Ces choix se règlent depuis « Modifier mon profil », sur le tableau de bord."}</span>
          </section>
          <section className="p-soft p-5 flex flex-col gap-3 text-[14.5px] leading-relaxed">
            <span className="p-eyebrow">Comment ça marche</span>
            <p className="m-0">Selon ce que votre profil cherche ou propose, nous vous présentons les membres complémentaires, classés selon vos affinités de parcours.</p>
            <p className="m-0">Personne ne sait que vous l’avez passé. Seul un intérêt réciproque est révélé.</p>
            <p className="m-0">Un match ouvre un premier échange de 30 minutes, en visio ou autour d’un café.</p>
          </section>
        </aside>
      </div>

      {match && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(14,13,12,0.9)" }} onClick={() => setMatch(null)}>
          <div className="max-w-[460px] flex flex-col items-center gap-5 text-center text-white" onClick={(e) => e.stopPropagation()}>
            <span className="text-[12.5px] font-medium uppercase tracking-[0.32em]" style={{ color: "var(--p-gold-bright)" }}>Intérêt réciproque</span>
            <span className="serif italic text-[64px] leading-none">C’est un match</span>
            <Avatar m={match} size={130} className="border-4 border-[#141211]" />
            <p className="m-0 text-[16.5px] text-white/85 leading-relaxed">{match.name.split(" ")[0]} a, {match.name.endsWith("e") ? "elle" : "lui"} aussi, envie {isAmour ? "de faire connaissance. Proposez-lui un premier café, sans pression." : "d’échanger avec vous. Proposez-lui un premier rendez-vous de 30 minutes."}</p>
            <button type="button" className="p-btn-primary w-full max-w-[320px]" onClick={() => setMatch(null)}>Proposer un café virtuel</button>
            <button type="button" className="p-btn border border-white/35 text-white w-full max-w-[320px]" onClick={() => setMatch(null)}>Continuer à découvrir</button>
          </div>
        </div>
      )}
    </>
  );
}
