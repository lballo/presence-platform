import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { useIsMobile } from "@/hooks/use-mobile";
import { monthTitle, parisDayMonth, parisHour, parisIso, parisLongDate } from "@/lib/format";

type Item = RouterOutputs["events"]["agenda"][number];
const WEEK = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
// Une couleur par type d'événement
const TYPES = {
  reseau: { label: "Réseau", bg: "var(--p-accent-soft)", ink: "var(--p-accent-text)", dot: "var(--p-accent)" },
  ruche: { label: "Mes ruches", bg: "var(--p-pill)", ink: "var(--p-gold)", dot: "var(--p-gold)" },
} as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** Agenda : un calendrier mensuel sobre. Sur téléphone, les prochains événements d'abord, avec bascule vers le mois. */
export function AgendaCalendar({ title = "Mon agenda" }: { title?: string }) {
  const agenda = trpc.events.agenda.useQuery();
  const mobile = useIsMobile();
  const todayIso = parisIso(new Date());
  const [ym, setYm] = useState(() => ({ y: Number(todayIso.slice(0, 4)), m: Number(todayIso.slice(5, 7)) - 1 }));
  const [mine, setMine] = useState(false);
  const [view, setView] = useState<"liste" | "mois">("liste");
  const [day, setDay] = useState<string | null>(null);
  const items = useMemo(() => (agenda.data ?? []).filter((e) => !mine || e.registered || e.waitlisted), [agenda.data, mine]);

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const e of items) {
      const start = new Date(e.startsAt);
      for (let i = 0; i < (e.days ?? 1); i++) {
        const k = parisIso(new Date(start.getTime() + i * 86400000));
        map.set(k, [...(map.get(k) ?? []), e]);
      }
    }
    return map;
  }, [items]);
  const upcoming = items.filter((e) => parisIso(new Date(e.startsAt)) >= todayIso).slice(0, 20);

  const offset = (new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, i) => {
    const d = new Date(Date.UTC(ym.y, ym.m, 1 - offset + i));
    return { key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, day: d.getUTCDate(), inMonth: d.getUTCMonth() === ym.m };
  });
  const move = (delta: number) => { setDay(null); setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; }); };
  const showList = mobile && view === "liste";
  const picked = day ? byDay.get(day) ?? [] : [];

  return (
    <section className="p-card overflow-hidden" aria-label={title}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 p-4 sm:px-6 sm:py-5">
        <div className="flex flex-col flex-1 min-w-[150px]">
          <span className="text-[12px] font-medium uppercase tracking-[0.2em]" style={{ color: "var(--p-gold)" }}>{title}</span>
          {!showList && <h2 className="m-0 text-[28px] leading-tight">{monthTitle(ym.y, ym.m)}</h2>}
          {showList && <h2 className="m-0 text-[28px] leading-tight">Prochains événements</h2>}
        </div>
        <button type="button" aria-pressed={mine} className={`p-chip h-9 ${mine ? "p-chip-on" : ""}`} onClick={() => setMine(!mine)}>Mes inscriptions</button>
        {mobile && <button type="button" className="p-chip h-9" onClick={() => setView(showList ? "mois" : "liste")}>{showList ? "Voir le mois" : "Voir la liste"}</button>}
        {!showList && (
          <span className="flex gap-1.5">
            <button type="button" aria-label="Mois précédent" className="w-10 h-10 rounded-xl border flex items-center justify-center" style={{ borderColor: "var(--p-line-2)" }} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
            <button type="button" aria-label="Mois suivant" className="w-10 h-10 rounded-xl border flex items-center justify-center" style={{ borderColor: "var(--p-line-2)" }} onClick={() => move(1)}><ChevronRight size={18} /></button>
          </span>
        )}
      </div>

      {showList ? (
        <ul className="list-none m-0 p-0 border-t" style={{ borderColor: "var(--p-line)" }}>
          {upcoming.map((e) => <Row key={`${e.id}`} e={e} />)}
          {upcoming.length === 0 && <li className="p-6 text-center text-[14.5px] p-muted">{mine ? "Vous n’êtes inscrit·e à aucun événement à venir." : "Rien de prévu pour l’instant."}</li>}
        </ul>
      ) : (
        <>
          <div className="grid grid-cols-7 border-t" style={{ borderColor: "var(--p-line)" }}>
            {WEEK.map((w) => <span key={w} className="py-2 text-center text-[13px] p-muted border-b border-r last:border-r-0" style={{ borderColor: "var(--p-line)" }}>{w}</span>)}
            {cells.map((c, i) => {
              const evs = byDay.get(c.key) ?? [];
              const isToday = c.key === todayIso;
              const past = c.key < todayIso;
              const lastCol = i % 7 === 6;
              const box = { borderColor: "var(--p-line)", background: past || !c.inMonth ? "var(--p-surface-2)" : "var(--p-surface)" };
              const number = <span className="w-7 h-7 rounded-full flex items-center justify-center text-[13px]" style={isToday ? { background: "#DC2626", color: "#fff", fontWeight: 600 } : { color: c.inMonth ? "var(--p-ink-2)" : "var(--p-ink-3)" }}>{c.day}</span>;
              if (mobile) {
                return (
                  <button key={c.key} type="button" aria-label={`${c.day}${evs.length ? `, ${evs.length} événement${evs.length > 1 ? "s" : ""}` : ""}`} aria-pressed={day === c.key} disabled={!evs.length} className={`min-h-[62px] p-1 flex flex-col items-center gap-1 border-b ${lastCol ? "" : "border-r"}`} style={{ ...box, outline: day === c.key ? "2px solid var(--p-accent)" : undefined, outlineOffset: -2 }} onClick={() => setDay(day === c.key ? null : c.key)}>
                    {number}
                    <span className="flex gap-0.5">{evs.slice(0, 3).map((e) => <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: TYPES[e.scope].dot }} />)}</span>
                  </button>
                );
              }
              return (
                <div key={c.key} className={`min-h-[104px] p-1.5 flex flex-col gap-1 border-b ${lastCol ? "" : "border-r"}`} style={box}>
                  {number}
                  {evs.slice(0, 3).map((e) => (
                    <Link key={e.id} to={`/e/${e.slug}`} title={`${parisHour(new Date(e.startsAt))} · ${e.title}`} className="block text-[12px] leading-tight px-1.5 py-1 rounded-md truncate no-underline hover:brightness-95" style={{ background: TYPES[e.scope].bg, color: TYPES[e.scope].ink, fontWeight: e.registered ? 600 : 400 }}>{e.registered ? "✓ " : ""}{e.title}</Link>
                  ))}
                  {evs.length > 3 && <span className="text-[11.5px] p-faint pl-1">+{evs.length - 3}</span>}
                </div>
              );
            })}
          </div>
          {mobile && picked.length > 0 && <ul className="list-none m-0 p-0">{picked.map((e) => <Row key={e.id} e={e} />)}</ul>}
          <div className="flex flex-wrap gap-4 px-4 sm:px-6 py-3 text-[12.5px] p-muted">
            {(Object.keys(TYPES) as (keyof typeof TYPES)[]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPES[k].dot }} /> {TYPES[k].label}</span>)}
          </div>
        </>
      )}
    </section>
  );
}

function Row({ e }: { e: Item }) {
  const start = new Date(e.startsAt);
  const { day, month } = parisDayMonth(start);
  return (
    <li className="border-b last:border-b-0" style={{ borderColor: "var(--p-line)" }}>
      <Link to={`/e/${e.slug}`} className="flex items-center gap-3 p-3.5 no-underline" style={{ color: "var(--p-ink)" }}>
        <span className="w-12 flex-none flex flex-col items-center py-1.5 rounded-xl leading-none" style={{ background: TYPES[e.scope].bg, color: TYPES[e.scope].ink }}><span className="serif text-[24px] font-semibold">{day}</span><span className="text-[11px] mt-0.5">{month}</span></span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold leading-snug">{e.title}</span>
          <span className="text-[12.5px] p-muted">{parisLongDate(start)} · {parisHour(start)}{e.hiveName ? ` · ${e.hiveName}` : ` · ${e.where}`}</span>
        </span>
        {(e.registered || e.waitlisted) && <span className="text-[12px] font-medium flex-none" style={{ color: "var(--p-accent-text)" }}>{e.registered ? "✓ Inscrit·e" : "En attente"}</span>}
      </Link>
    </li>
  );
}
