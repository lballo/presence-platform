import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Hourglass, PlayCircle, Plus, Radio, Settings, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminPendingLink } from "@/components/AdminPendingLink";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { AgendaCalendar } from "@/components/events/AgendaCalendar";
import { eventCover } from "@/components/events/cover";
import { EventForm } from "@/components/events/EventForm";
import { duration, parisHour, parisLongDate, plural } from "@/lib/format";

type Ev = RouterOutputs["events"]["program"][number];
// « En visio » comprend les salons live ; « Replays » montre les enregistrements des rendez-vous en ligne passés
const FILTERS = [["all", "Tous"], ["online", "En visio"], ["onsite", "Présentiel"], ["replays", "Replays"]] as const;
const KIND = { salon: "Salon live", online: "En visio", onsite: "Présentiel" } as const;

export default function Evenements() {
  const navigate = useNavigate();
  const program = trpc.events.program.useQuery();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [creating, setCreating] = useState(false);
  const now = new Date();
  const all = program.data ?? [];
  const live = all.find((e) => e.live && !e.cancelled);
  const upcoming = all.filter((e) => (filter === "all" || e.kind === filter || (filter === "online" && e.kind === "salon")) && (new Date(e.startsAt) >= now || e.live));

  return (
    <>
      <PageHeader eyebrow="Le programme" title="Événements Présence" intro="Salons live, ateliers en visio et rencontres en présentiel, puis les replays des rendez-vous en ligne. Les rendez-vous de vos ruches se retrouvent dans votre agenda."
        action={<button type="button" className="p-btn-primary" onClick={() => setCreating(true)}><Plus size={17} /> Créer un événement</button>} />

      <AdminPendingLink kind="event" one="proposition d’événement" many="propositions d’événement" />
      {creating && <EventForm onDone={(r) => { setCreating(false); if (r?.status === "published") navigate(`/e/${r.slug}`); }} />}
      <MyProposals />

      {live && (
        <section className="p-band p-6 sm:p-7 flex flex-wrap items-center gap-5 mb-7">
          <span className="flex items-center gap-2 h-8 px-3 rounded-full text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ background: "var(--p-accent)" }}><span className="w-2 h-2 rounded-full bg-white animate-pulse" /> En direct</span>
          <span className="flex-[1_1_300px] flex flex-col gap-1"><span className="serif text-[30px] leading-tight">{live.title}</span><span className="text-[14px] text-white/75">Avec {live.host.name} · {plural(live.taken, "participant", "participants")}</span></span>
          <Link to={`/e/${live.slug}`} className="p-btn-white no-underline"><Radio size={16} /> Rejoindre le salon</Link>
        </section>
      )}

      <div className="flex flex-wrap gap-2 mb-5">{FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} className={`p-chip h-10 ${filter === k ? "p-chip-on" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}</div>

      {filter === "replays" ? <Replays /> : (
      <section className="flex flex-col gap-4 mb-10" aria-label="À venir">
        <h2 className="m-0 text-[32px]">À venir <span className="text-[14px] font-sans p-faint">{upcoming.length}</span></h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))" }}>{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>
        {!program.isLoading && upcoming.length === 0 && <div className="p-soft p-8 text-center p-muted">Rien de programmé dans cette catégorie.</div>}
      </section>
      )}

      <AgendaCalendar title="Agenda" />
    </>
  );
}

/** Les replays : les rendez-vous en ligne passés, à revoir. Le plus récent d'abord. */
function Replays() {
  const q = trpc.events.replays.useQuery();
  const list = q.data ?? [];
  return (
    <section className="flex flex-col gap-4 mb-10" aria-label="Replays">
      <h2 className="m-0 text-[32px]">Replays <span className="text-[14px] font-sans p-faint">{list.length}</span></h2>
      <p className="m-0 -mt-2 text-[14.5px] p-muted">Les rendez-vous en ligne enregistrés, à revoir quand vous le souhaitez.</p>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))" }}>
        {list.map((e) => (
          <article key={e.id} className="p-card overflow-hidden flex flex-col">
            <Link to={`/e/${e.slug}#replay`} className="flex flex-col flex-1 no-underline" style={{ color: "var(--p-ink)" }}>
              <span className="relative block">
                {e.photoUrl ? <img src={e.photoUrl} alt="" className="w-full h-[150px] object-cover" style={{ objectPosition: e.photoPosition }} /> : <span className="block w-full h-[150px]" style={{ background: eventCover(e) }} />}
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center"><span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(20, 18, 17, .55)", color: "#fff" }}><PlayCircle size={30} strokeWidth={1.5} /></span></span>
              </span>
              <span className="p-4 flex flex-col gap-2 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="p-pill">Replay</span>
                  {e.hiveName && <span className="p-chip h-7 text-[12px] cursor-default p-muted">Ruche {e.hiveName}</span>}
                </span>
                <span className="serif text-[25px] leading-tight">{e.title}</span>
                {e.tagline && <span className="text-[14px] p-muted leading-snug">{e.tagline}</span>}
                <span className="text-[13.5px] p-muted">{parisLongDate(new Date(e.startsAt))} · {duration(e.durationMin)}</span>
                <span className="flex items-center gap-2 mt-auto pt-2"><Avatar m={e.host} size={28} /><span className="text-[13px] p-muted truncate">{e.host.name}</span></span>
              </span>
            </Link>
          </article>
        ))}
      </div>
      {!q.isLoading && list.length === 0 && <div className="p-soft p-8 text-center p-muted">Aucun replay pour l’instant. Après un rendez-vous en ligne, la personne qui l’organise peut y ajouter l’enregistrement.</div>}
    </section>
  );
}

function EventCard({ e }: { e: Ev }) {
  const start = new Date(e.startsAt);
  return (
    <article className="p-card overflow-hidden flex flex-col">
      <Link to={`/e/${e.slug}`} className="flex flex-col flex-1 no-underline" style={{ color: "var(--p-ink)" }}>
        {e.photoUrl ? <img src={e.photoUrl} alt="" className="w-full h-[150px] object-cover" style={{ objectPosition: e.photoPosition }} /> : <span className="block w-full h-[90px]" style={{ background: eventCover(e) }} />}
        <span className="p-4 flex flex-col gap-2 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="p-pill">{e.live ? "● En direct" : e.type === "bienvenue" ? "Bienvenue" : KIND[e.kind]}</span>
            {e.repeatLabel && <span className="p-chip h-7 text-[12px] cursor-default p-muted">{e.repeatLabel}</span>}
            {e.visibility === "public" && <span className="p-chip h-7 text-[12px] cursor-default p-muted">Public</span>}
            {e.cancelled && <span className="p-pill" style={{ background: "var(--p-accent)", color: "#fff" }}>Annulé</span>}
          </span>
          <span className="serif text-[25px] leading-tight">{e.title}</span>
          {e.tagline && <span className="text-[14px] p-muted leading-snug">{e.tagline}</span>}
          <span className="text-[13.5px] p-muted">{parisLongDate(start)} · {parisHour(start)} · {duration(e.durationMin)}{e.city ? ` · ${e.city}` : ""}</span>
          <span className="flex items-center gap-2 mt-auto pt-2"><Avatar m={e.host} size={28} /><span className="text-[13px] p-muted truncate">{e.host.name}</span></span>
        </span>
      </Link>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t text-[13px]" style={{ borderColor: "var(--p-line)" }}>
        <span className={e.registered || e.waitlisted ? "font-medium" : "p-muted"} style={e.registered || e.waitlisted ? { color: "var(--p-accent-text)" } : undefined}>{e.registered ? "✓ Inscrit·e" : e.waitlisted ? "Liste d’attente" : e.seatsLeft === null ? plural(e.taken, "inscrit", "inscrits") : e.seatsLeft > 0 ? plural(e.seatsLeft, "place restante", "places restantes") : "Complet"}</span>
        {e.canManage && <Link to={`/e/${e.slug}/gerer`} className="p-btn-ghost min-h-0 no-underline text-[13px]"><Settings size={14} /> Gérer</Link>}
      </div>
    </article>
  );
}

/** Membre : suivi de ses propositions en attente ou refusées. */
function MyProposals() {
  const utils = trpc.useUtils();
  const mine = trpc.events.myProposals.useQuery();
  const withdraw = trpc.events.withdraw.useMutation({ onSuccess: () => { utils.events.invalidate(); toast("Proposition retirée"); }, onError: (e) => toast.error(e.message) });
  if (!mine.data?.length) return null;
  return (
    <section className="mb-7 flex flex-col gap-2.5" aria-label="Mes propositions">
      <h2 className="m-0 text-[24px]">Mes propositions</h2>
      {mine.data.map((p) => (
        <div key={p.id} className="p-card p-4 flex flex-wrap items-center gap-3">
          <Link to={`/e/${p.slug}`} className="flex-[1_1_240px] min-w-0 flex flex-col no-underline" style={{ color: "var(--p-ink)" }}><span className="font-semibold truncate">{p.title}</span><span className="text-[13px] p-muted">{parisLongDate(new Date(p.startsAt))} · {parisHour(new Date(p.startsAt))} · {p.where}</span></Link>
          {p.status === "pending" ? <span className="flex items-center gap-1.5 text-[13.5px] font-medium" style={{ color: "var(--p-gold)" }}><Hourglass size={15} /> En attente de validation</span> : <span className="flex items-center gap-1.5 text-[13.5px] p-muted"><XCircle size={15} /> Non retenue</span>}
          <button type="button" className="p-btn-ghost text-[13.5px]" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ id: p.id })}>{p.status === "pending" ? "Retirer" : "Effacer"}</button>
          {p.reviewNote && <p className="basis-full m-0 p-3 rounded-xl text-[14px]" style={{ background: "var(--p-surface-2)" }}>Message de l’équipe : {p.reviewNote}</p>}
        </div>
      ))}
    </section>
  );
}

