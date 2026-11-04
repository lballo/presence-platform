import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { parisHour, parisLongDate } from "@/lib/format";
import { Badge, Chips, ConfirmButton, Rows, type Column } from "./shared";
import AdminTalks from "./AdminTalks";

type Ev = RouterOutputs["admin"]["events"][number];
const when = (e: Ev) => `${parisLongDate(new Date(e.startsAt))} · ${parisHour(new Date(e.startsAt))}`;

const stateOf = (e: Ev) => (e.cancelled ? <Badge tone="alert">Annulé</Badge> : e.status === "pending" ? <Badge tone="wait">À valider</Badge> : e.status === "rejected" ? <Badge>Refusé</Badge> : e.past ? <Badge>Passé</Badge> : <Badge tone="ok">À venir</Badge>);

const columns: Column<Ev>[] = [
  { key: "title", label: "Événement", cell: (e) => <span className="flex flex-col min-w-0"><span className="font-semibold break-words">{e.title}</span><span className="text-[12.5px] p-muted">{when(e)}</span><span className="text-[12.5px] p-muted">{e.hive ? <Link to={`/ruches/${e.hive.id}`}>{e.hive.name}</Link> : e.type === "bienvenue" ? "Réseau · réunion de bienvenue" : "Réseau"}</span></span> },
  { key: "visibility", label: "Visibilité", cell: (e) => (e.hive ? "Ruche" : e.visibility === "public" ? "Public" : "Membres") },
  { key: "state", label: "État", cell: stateOf },
  { key: "views", label: "Vues", align: "right", cell: (e) => e.stats.views },
  { key: "registered", label: "Inscrits", align: "right", cell: (e) => <>{e.stats.registered}{e.stats.waitlist > 0 && <span className="p-muted"> + {e.stats.waitlist}</span>}</> },
  { key: "attended", label: "Présents", align: "right", cell: (e) => e.stats.attended },
];

/** Événements de l'administration, en deux sous-pages : les événements et les talk shows. */
export default function AdminEvents({ section = "evenements" }: { section?: "evenements" | "talks" }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[30px]">Événements</h2>
        {section === "evenements" && <Link to="/evenements" className="p-btn-primary p-btn-sm no-underline"><Plus size={15} /> Créer un événement</Link>}
      </div>
      <nav aria-label="Rubriques des événements" className="flex flex-wrap gap-1.5">
        {([["/admin/evenements", "Événements"], ["/admin/evenements/talk-shows", "Talk shows"]] as const).map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => `p-chip no-underline ${isActive ? "p-chip-on" : ""}`}>{label}</NavLink>
        ))}
      </nav>
      {section === "talks" ? <AdminTalks /> : <EventsList />}
    </div>
  );
}

function EventsList() {
  const utils = trpc.useUtils();
  const q = trpc.admin.events.useQuery();
  const [filter, setFilter] = useState<"avenir" | "bienvenue" | "passes" | "annules" | "tous">("avenir");
  const refresh = () => { utils.admin.invalidate(); utils.events.invalidate(); };
  const setPublic = trpc.admin.setEventPublic.useMutation({ onSuccess: (_r, v) => { refresh(); toast.success(v.public ? "L’événement est désormais public" : "L’événement est réservé aux membres"); }, onError: (e) => toast.error(e.message) });
  const cancel = trpc.events.cancel.useMutation({ onSuccess: (r) => { refresh(); toast.success(r.notified ? `Événement annulé, ${r.notified} personne(s) prévenue(s)` : "Événement annulé"); }, onError: (e) => toast.error(e.message) });
  const rows = useMemo(() => {
    const list = q.data ?? [];
    if (filter === "avenir") return list.filter((e) => !e.past && !e.cancelled).reverse();
    if (filter === "bienvenue") return list.filter((e) => e.type === "bienvenue" && !e.cancelled).reverse();
    if (filter === "passes") return list.filter((e) => e.past && !e.cancelled);
    if (filter === "annules") return list.filter((e) => e.cancelled);
    return list;
  }, [q.data, filter]);
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[14.5px] p-muted">La création se fait dans la page Événements. Pour une réunion de bienvenue régulière, activez « Réunion de bienvenue » et choisissez une répétition dans le formulaire.</p>
      <Chips label="Filtrer les événements" value={filter} onChange={setFilter} options={[["avenir", "À venir"], ["bienvenue", "Réunions de bienvenue"], ["passes", "Passés"], ["annules", "Annulés"], ["tous", "Tous"]]} />
      {q.isLoading ? <p className="p-muted text-center py-10 m-0">Chargement…</p> : (
        <Rows rows={rows} columns={columns} keyOf={(e) => e.id} empty="Aucun événement dans cette liste." actions={(e) => (
          <>
            <Link to={`/e/${e.slug}/gerer`} className="p-btn-outline p-btn-sm no-underline">Gérer</Link>
            {!e.hive && !e.cancelled && e.status === "published" && <button type="button" className="p-btn-outline p-btn-sm" disabled={setPublic.isPending} onClick={() => setPublic.mutate({ id: e.id, public: e.visibility !== "public" })}>{e.visibility === "public" ? "Réserver aux membres" : "Passer en public"}</button>}
            {!e.cancelled && e.status === "published" && !e.past && <ConfirmButton label="Annuler" question={`Annuler « ${e.title} » ? Les personnes inscrites seront prévenues.`} confirm="Annuler l’événement" danger disabled={cancel.isPending} onConfirm={() => cancel.mutate({ id: e.id })} />}
          </>
        )} />
      )}
    </div>
  );
}
