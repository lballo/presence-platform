import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { AgendaCalendar } from "@/components/events/AgendaCalendar";
import { parisHour, parisLongDate } from "@/lib/format";

/** Mon calendrier : mes inscriptions, ma prochaine séance de coaching, et l'agenda du réseau et de mes ruches. */
export default function Calendrier() {
  const agenda = trpc.events.agenda.useQuery();
  const client = !!trpc.members.me.useQuery().data?.coachingClient;
  const coaching = trpc.coaching.mine.useQuery(undefined, { enabled: client }).data;
  const now = Date.now();
  const mine = (agenda.data ?? []).filter((e) => (e.registered || e.waitlisted) && new Date(e.startsAt).getTime() >= now);
  const next = coaching?.next;
  return (
    <>
      <PageHeader eyebrow="Mon profil" title="Mon calendrier" intro="Vos inscriptions et vos rendez-vous, puis l’agenda du réseau et de vos ruches." />
      <section className="flex flex-col gap-2.5 mb-8" aria-label="Mes prochains rendez-vous">
        <h2 className="m-0 text-[28px]">Mes prochains rendez-vous</h2>
        {next && (
          <Link to="/profil/coaching" className="p-card p-4 flex flex-wrap items-center gap-3 no-underline" style={{ color: "var(--p-ink)", borderColor: "var(--p-accent-line)" }}>
            <span className="flex-[1_1_240px] min-w-0 flex flex-col"><span className="font-semibold">Coaching · {next.kind || "Séance"}{next.number ? ` n° ${next.number}` : ""}</span><span className="text-[13px] p-muted">{parisLongDate(new Date(next.startsAt))} · {parisHour(new Date(next.startsAt))} · avec Laura Ballo</span></span>
            <span className="p-pill">Coaching</span>
          </Link>
        )}
        {mine.map((e) => (
          <Link key={e.id} to={`/e/${e.slug}`} className="p-card p-4 flex flex-wrap items-center gap-3 no-underline" style={{ color: "var(--p-ink)" }}>
            <span className="flex-[1_1_240px] min-w-0 flex flex-col"><span className="font-semibold break-words">{e.title}</span><span className="text-[13px] p-muted">{parisLongDate(new Date(e.startsAt))} · {parisHour(new Date(e.startsAt))}{e.where ? ` · ${e.where}` : ""}{e.hiveName ? ` · Ruche ${e.hiveName}` : ""}</span></span>
            <span className="p-pill">{e.waitlisted ? "Liste d’attente" : "Inscrit·e"}</span>
          </Link>
        ))}
        {!agenda.isLoading && !mine.length && !next && <div className="p-soft p-7 text-center p-muted">Aucune inscription à venir. <Link to="/evenements" className="p-link">Voir les événements</Link></div>}
      </section>
      <AgendaCalendar title="Agenda" />
    </>
  );
}
