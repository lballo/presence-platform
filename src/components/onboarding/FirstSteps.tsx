import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { ComposerHost } from "@/components/forum/PostList";
import type { ComposerTarget } from "@/components/forum/Composer";
import { CoachMascot } from "@/components/CoachMascot";
import { parisHour, parisLongDate, plural } from "@/lib/format";
import { FIRST_STEPS_CARD as T } from "@/content/accueil";

type Data = RouterOutputs["honey"]["firstSteps"];
type Step = Data["steps"][number];

/** Carte « Mes premiers pas » : ce qui est fait, le miel gagné, et un clic vers chaque action restante. Disparaît quand tout est fait. */
export function FirstSteps() {
  const q = trpc.honey.firstSteps.useQuery();
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const d = q.data;
  if (!d) return null;
  if (d.allDone) return null;
  const left = d.steps.filter((s) => !s.done).length;
  return (
    <section className="p-card p-5 sm:p-6 flex flex-col gap-4 mb-6" aria-label={T.title} style={{ borderColor: "var(--p-accent-line)" }}>
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="flex-none"><CoachMascot size={48} /></span>
        <div className="flex-1 min-w-0 flex flex-col">
          <h2 className="m-0 text-[26px] sm:text-[28px] leading-tight">{T.title}</h2>
          <span className="hidden sm:block text-[14px] p-muted">{T.intro} {plural(left, "pas restant", "pas restants")}.</span>
        </div>
        <span className="flex flex-col items-end leading-none flex-none"><span className="serif text-[32px] font-semibold" style={{ color: "var(--p-accent-text)" }}>{d.total}</span><span className="text-[12px] p-muted mt-1">miels</span></span>
      </div>
      <span className="sm:hidden text-[14px] p-muted -mt-2">{T.intro} {plural(left, "pas restant", "pas restants")}.</span>
      <ul className="list-none m-0 p-0 flex flex-col">
        {d.steps.map((s) => <Row key={s.action} s={s} d={d} onPresent={() => setComposer({ mode: "new", spaceSlug: "presentations", prefill: d.prefill, tips: true })} />)}
      </ul>
      <ComposerHost target={composer} onClose={() => setComposer(null)} />
    </section>
  );
}

function Row({ s, d, onPresent }: { s: Step; d: Data; onPresent: () => void }) {
  const text = T.steps[s.action] as { label: string; sub?: string; cta?: string; none?: string };
  const miel = s.bonus ? `+${s.amount}${s.done ? "" : ` à ${s.bonus}`}` : `+${s.amount}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 border-t first:border-t-0" style={{ borderColor: "var(--p-line)" }}>
      <span className="w-6 h-6 rounded-full flex items-center justify-center flex-none" style={s.done ? { background: "var(--p-accent)", color: "#fff" } : { border: "1.5px solid var(--p-line-2)" }} role="img" aria-label={s.done ? "Fait" : "À faire"}>{s.done && <Check size={14} strokeWidth={3} />}</span>
      <span className="flex-[1_1_180px] min-w-0 flex flex-col">
        <span className={`text-[15px] leading-snug ${s.done ? "p-muted" : "font-medium"}`}>{text.label}</span>
        {!s.done && text.sub && <span className="text-[12.5px] p-muted">{text.sub}</span>}
      </span>
      <span className="text-[12.5px] font-semibold flex-none" style={{ color: s.done ? "var(--p-ink-3)" : "var(--p-gold)" }}>{miel}</span>
      {!s.done && <Action s={s} d={d} onPresent={onPresent} text={text} />}
    </li>
  );
}

function Action({ s, d, onPresent, text }: { s: Step; d: Data; onPresent: () => void; text: { cta?: string; none?: string } }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const inTour = trpc.members.me.useQuery().data?.tour.status === "pending";
  const restart = trpc.onboarding.tourRestart.useMutation({ onSuccess: () => { utils.members.me.invalidate(); window.scrollTo(0, 0); }, onError: (e) => toast.error(e.message) });
  const register = trpc.events.register.useMutation({
    onSuccess: (r) => { utils.events.invalidate(); utils.honey.invalidate(); toast.success(r.waitlist ? "Vous êtes sur liste d’attente" : "C’est noté, à très vite"); },
    onError: (e) => toast.error(e.message),
  });
  const btn = "p-btn-outline p-btn-sm no-underline flex-none";
  switch (s.action) {
    case "tuto": return inTour ? null : <button type="button" className={btn} disabled={restart.isPending} onClick={() => restart.mutate()}>{text.cta}</button>;
    case "profil": return <button type="button" className={btn} onClick={() => navigate("/?profil=1")}>{text.cta}</button>;
    case "presentation": return <button type="button" className={btn} onClick={onPresent}>{text.cta}</button>;
    case "premier_message": return <Link to="/membres" className={btn}>{text.cta}</Link>;
    case "premier_evenement": return <Link to="/evenements" className={btn}>{text.cta}</Link>;
    case "bienvenue_presence": return d.myWelcome ? <Link to={`/e/${d.myWelcome.slug}`} className={btn}>{parisLongDate(new Date(d.myWelcome.startsAt))}</Link> : null;
    case "bienvenue_inscription":
      if (d.myWelcome?.waitlist) return <Link to={`/e/${d.myWelcome.slug}`} className={btn}>Liste d’attente</Link>;
      if (!d.welcomeDates.length) return <span className="basis-full pl-9 text-[12.5px] p-muted">{text.none}</span>;
      return (
        <span className="basis-full pl-9 flex flex-wrap gap-1.5">
          {d.welcomeDates.slice(0, 3).map((e, i) => <button key={e.id} type="button" className={i === 0 ? "p-btn-primary p-btn-sm" : "p-btn-outline p-btn-sm"} disabled={register.isPending} onClick={() => register.mutate({ eventId: e.id })}>{parisLongDate(new Date(e.startsAt))} · {parisHour(new Date(e.startsAt))}</button>)}
        </span>
      );
    default: return null;
  }
}
