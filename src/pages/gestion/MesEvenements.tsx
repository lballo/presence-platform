import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, Settings } from "lucide-react";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { EventForm } from "@/components/events/EventForm";
import { parisHour, parisLongDate, plural } from "@/lib/format";

type Ev = RouterOutputs["events"]["hosting"][number];
const KIND = { salon: "Salon live", online: "En visio", onsite: "Présentiel" } as const;

const state = (e: Ev) => (e.cancelled ? "Annulé" : e.status === "pending" ? "En attente de validation" : e.status === "rejected" ? "Non retenu" : e.live ? "● En direct" : e.past ? "Passé" : "À venir");

/** Gestion, côté organisateur : les événements que j'organise, et l'accès à leur page « Gérer ». */
export default function MesEvenements() {
  const navigate = useNavigate();
  const me = trpc.members.me.useQuery();
  const allowed = !!me.data?.permissions.publishEventsDirectly;
  const q = trpc.events.hosting.useQuery(undefined, { enabled: allowed });
  const [creating, setCreating] = useState(false);
  if (!me.data) return <p className="p-muted py-20 text-center">Chargement…</p>;
  if (!allowed) return <div className="py-20 text-center p-muted">Cette page est réservée aux organisateurs.</div>;
  const list = q.data ?? [];
  const upcoming = list.filter((e) => !e.past || e.live).reverse();
  const past = list.filter((e) => e.past && !e.live);
  return (
    <>
      <PageHeader eyebrow="Gestion" title="Mes événements" intro="Les événements que vous organisez : inscrits, présences, modifications et annulation se règlent depuis « Gérer »."
        action={<button type="button" className="p-btn-primary" onClick={() => setCreating(true)}><Plus size={17} /> Créer un événement</button>} />
      {creating && <EventForm onDone={(r) => { setCreating(false); if (r?.status === "published") navigate(`/e/${r.slug}`); }} />}
      <Group title="À venir" list={upcoming} empty="Aucun événement à venir." loading={q.isLoading} />
      {past.length > 0 && <Group title="Passés" list={past} />}
    </>
  );
}

function Group({ title, list, empty, loading }: { title: string; list: Ev[]; empty?: string; loading?: boolean }) {
  return (
    <section className="flex flex-col gap-2.5 mb-9" aria-label={title}>
      <h2 className="m-0 text-[28px]">{title} <span className="text-[14px] font-sans p-faint">{list.length}</span></h2>
      {list.map((e) => (
        <div key={e.id} className="p-card p-4 flex flex-wrap items-center gap-3">
          <Link to={`/e/${e.slug}`} className="flex-[1_1_260px] min-w-0 flex flex-col gap-0.5 no-underline" style={{ color: "var(--p-ink)" }}>
            <span className="font-semibold break-words">{e.title}</span>
            <span className="text-[13px] p-muted">{parisLongDate(new Date(e.startsAt))} · {parisHour(new Date(e.startsAt))} · {KIND[e.kind]}{e.hive ? ` · Ruche ${e.hive}` : ""}</span>
          </Link>
          <span className="p-pill" style={e.live ? { background: "#E0352B", color: "#fff" } : undefined}>{state(e)}</span>
          <span className="text-[13.5px] p-muted">{plural(e.registered, "inscrit", "inscrits")}{e.waitlist ? ` + ${e.waitlist} en attente` : ""}</span>
          {e.status === "published" && <Link to={`/e/${e.slug}/gerer`} className="p-btn-outline p-btn-sm no-underline"><Settings size={14} /> Gérer</Link>}
        </div>
      ))}
      {!loading && list.length === 0 && empty && <div className="p-soft p-8 text-center p-muted">{empty}</div>}
    </section>
  );
}
