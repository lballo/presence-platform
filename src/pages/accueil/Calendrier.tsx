import { useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { AddToCalendar, feedOptions } from "@/components/events/AddToCalendar";
import { trpc } from "@/providers/trpc";
import { parisHour, parisIso } from "@/lib/format";

const DOW = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
type Kind = "reseau" | "ruche" | "coaching";
type Item = { key: string; at: Date; kind: Kind; label: string; title: string; place: string; status: string; href: string; mine: boolean };
const DOT: Record<Kind, string> = { reseau: "var(--p-accent)", ruche: "var(--p-ink-3)", coaching: "var(--p-ink-warm)" };

/** Mon calendrier, d'après la piste E : le mois en petit, avec un point par rendez-vous, et mes rendez-vous à côté. */
export default function Calendrier() {
  const agenda = trpc.events.agenda.useQuery();
  const me = trpc.members.me.useQuery().data;
  const coaching = trpc.coaching.mine.useQuery(undefined, { enabled: !!me?.coachingClient }).data;
  const links = trpc.account.agendaLinks.useQuery(undefined, { staleTime: Infinity }).data;
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [day, setDay] = useState<string | null>(null);

  const items: Item[] = [
    ...(agenda.data ?? []).map((e) => ({
      key: `e${e.id}`, at: new Date(e.startsAt), kind: (e.scope === "ruche" ? "ruche" : "reseau") as Kind,
      label: e.type === "bienvenue" ? "Réunion de bienvenue" : e.scope === "ruche" ? "Ruche" : "Événement", title: e.title,
      place: [e.where, e.hiveName && `Ruche ${e.hiveName}`].filter(Boolean).join(" · "),
      status: e.waitlisted ? "Liste d’attente" : e.registered ? "Inscrit·e" : "", href: `/e/${e.slug}`, mine: e.registered || e.waitlisted,
    })),
    ...(coaching?.meetings ?? []).filter((m) => m.startsAt && ["Planifié", "Terminé"].includes(m.state)).map((m) => ({
      key: `c${m.id}`, at: new Date(m.startsAt!), kind: "coaching" as Kind, label: "Mon coaching", title: `${m.kind || "Séance"}${m.number ? ` n° ${m.number}` : ""}`,
      place: "Avec Laura Ballo", status: m.state === "Terminé" ? "Réalisée" : "Confirmée", href: "/profil/coaching", mine: true,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const inMonth = (d: Date) => d.getFullYear() === ym.y && d.getMonth() === ym.m;
  const mine = items.filter((i) => i.mine && i.at >= now);
  const shown = day ? items.filter((i) => parisIso(i.at) === day) : mine;
  const monthCount = mine.filter((i) => inMonth(i.at)).length;
  const move = (n: number) => { setDay(null); setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 })); };

  // Lundi en premier, comme les calendriers français
  const first = new Date(ym.y, ym.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const todayIso = parisIso(now);

  return (
    <section className="p-panel" aria-label="Mon calendrier">
      <div className="p-panel-head">
        <h2 className="p-panel-title">Mon calendrier</h2>
        <span className="flex items-center gap-2"><span className="text-[13px] p-muted">Les rendez-vous auxquels vous participez.</span>{links && <AddToCalendar options={feedOptions(links)} title="Exporter mon calendrier" note="Les rendez-vous auxquels vous participez et ceux que vous organisez, mis à jour d’eux-mêmes. Ce lien est personnel : ne le partagez pas." />}</span>
      </div>
      <div className="flex flex-wrap gap-8 items-start">
        <div className="flex-[1_1_320px] min-w-0" aria-label="Le mois">
          <div className="flex items-center justify-between mb-4">
            <p className="m-0 font-['Newsreader'] text-[22px]" style={{ color: "var(--p-ink)" }}>{MONTHS[ym.m]} {ym.y}</p>
            <span className="flex gap-1">
              <button type="button" aria-label="Mois précédent" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--p-hover)]" onClick={() => move(-1)}><ChevronLeft size={16} /></button>
              <button type="button" aria-label="Mois suivant" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--p-hover)]" onClick={() => move(1)}><ChevronRight size={16} /></button>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-y-2 text-center">
            {["L", "M", "M", "J", "V", "S", "D"].map((w, i) => <span key={i} className="text-[10px] p-muted pb-2">{w}</span>)}
            {cells.map((n, i) => {
              if (!n) return <span key={`v${i}`} />;
              const iso = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
              const kinds = [...new Set(items.filter((it) => parisIso(it.at) === iso).map((it) => it.kind))];
              const selected = day === iso;
              const today = iso === todayIso;
              return (
                <button key={iso} type="button" aria-pressed={selected} aria-label={`${n} ${MONTHS[ym.m].toLowerCase()}${kinds.length ? `, ${kinds.length > 1 ? "plusieurs rendez-vous" : "un rendez-vous"}` : ""}`} onClick={() => setDay(selected ? null : iso)}
                  className="mx-auto w-10 h-10 rounded-[12px] flex flex-col items-center justify-center font-['Newsreader'] text-[17px] leading-none"
                  style={selected ? { background: "var(--p-chip-on-bg)", color: "var(--p-chip-on-ink)" } : today ? { border: "1.5px solid var(--p-accent)", color: "var(--p-ink)" } : { color: "var(--p-ink)" }}>
                  {n}
                  <span className="flex gap-[3px] h-[5px] mt-1">{kinds.map((k) => <span key={k} className="w-[5px] h-[5px] rounded-full" style={{ background: selected ? "var(--p-chip-on-ink)" : DOT[k] }} />)}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-5 mb-0 flex flex-wrap gap-4 text-[11.5px] p-muted">
            {([["reseau", "Réseau"], ["ruche", "Mes ruches"], ["coaching", "Coaching"]] as const).filter(([k]) => k !== "coaching" || me?.coachingClient).map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className="w-[7px] h-[7px] rounded-full" style={{ background: DOT[k] }} /> {l}</span>)}
          </p>
        </div>
        <div className="flex-[1_1_340px] min-w-0 flex flex-col gap-2.5" aria-label="Mes rendez-vous">
          <p className="m-0 font-['Newsreader'] text-[22px]" style={{ color: "var(--p-ink)" }}>
            {day ? `Le ${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1].toLowerCase()}` : "Mes rendez-vous"} <span className="font-sans text-[12px] p-muted">{day ? `· ${shown.length} rendez-vous` : `· ${monthCount} ce mois-ci`}</span>
          </p>
          {shown.map((r) => (
            <Link key={r.key} to={r.href} className="flex items-center gap-4 rounded-[18px] px-4 py-3.5 no-underline" style={{ background: r.mine ? "var(--p-surface-2)" : "var(--p-surface)", border: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
              <span className="w-10 flex-none flex flex-col items-center leading-none"><span className="text-[10px] uppercase tracking-[0.18em] p-muted">{DOW[r.at.getDay()]}</span><span className="font-['Newsreader'] text-[26px] mt-1">{r.at.getDate()}</span></span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="p-kicker">{r.label}</span>
                <span className="font-['Newsreader'] text-[17px] leading-snug">{r.title}</span>
                <span className="text-[12px] p-muted flex items-center gap-1"><MapPin size={11} className="flex-none" /> {parisHour(r.at)}{r.place ? ` · ${r.place}` : ""}</span>
              </span>
              {r.status && <span className="text-[11.5px] flex-none" style={{ color: "var(--p-accent-text)" }}>{r.status}</span>}
            </Link>
          ))}
          {!agenda.isLoading && shown.length === 0 && <div className="p-soft p-6 text-center text-[14px] p-muted">{day ? "Rien ce jour-là." : "Aucun rendez-vous à venir."}</div>}
          <Link to="/evenements" className="mt-1 text-[13px] font-medium no-underline inline-flex items-center gap-1.5" style={{ color: "var(--p-accent-text)" }}><MapPin size={13} /> Découvrir les événements{me?.city ? ` autour de ${me.city}` : ""} →</Link>
        </div>
      </div>
    </section>
  );
}
