import { Link } from "react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Badge, ConfirmButton, Rows, Select, type Column } from "./shared";

type Hive = RouterOutputs["admin"]["hives"][number];

function Access({ h }: { h: Hive }) {
  const utils = trpc.useUtils();
  const set = trpc.hives.setAccess.useMutation({ onSuccess: (r) => { utils.admin.invalidate(); utils.hives.invalidate(); toast.success(r.accepted ? `Confidentialité modifiée, ${r.accepted} demande(s) acceptée(s)` : "Confidentialité modifiée"); }, onError: (e) => toast.error(e.message) });
  return <span className="inline-block text-left [&_span]:sr-only"><Select label={`Confidentialité de ${h.name}`} value={h.access} onChange={(access) => set.mutate({ id: h.id, access })} options={[["libre", "Ouverte"], ["validation", "Sur validation"]]} /></span>;
}

const columns: Column<Hive>[] = [
  { key: "name", label: "Ruche", cell: (h) => <span className="flex flex-col min-w-0"><span className="font-semibold break-words">{h.name}</span><span className="text-[12.5px] p-muted">{h.type === "projet" ? "Projet" : "Communauté"}{h.founder ? ` · ${h.founder}` : ""}</span></span> },
  { key: "access", label: "Confidentialité", cell: (h) => <Access h={h} /> },
  { key: "members", label: "Membres", cell: (h) => <span className="inline-flex items-center gap-1.5">{h.memberCount}{h.pendingCount > 0 && <Badge tone="wait">{h.pendingCount} en attente</Badge>}</span> },
  { key: "content", label: "Contenu", cell: (h) => `${h.postCount} message${h.postCount > 1 ? "s" : ""} · ${h.eventCount} événement${h.eventCount > 1 ? "s" : ""}` },
];

export default function AdminHives() {
  const utils = trpc.useUtils();
  const q = trpc.admin.hives.useQuery();
  const remove = trpc.hives.remove.useMutation({ onSuccess: (r) => { utils.admin.invalidate(); utils.hives.invalidate(); toast.success(`Ruche « ${r.name} » supprimée`); }, onError: (e) => toast.error(e.message) });
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-[30px]">Ruches</h2>
      {q.isLoading ? <p className="p-muted text-center py-10 m-0">Chargement…</p> : (
        <Rows rows={q.data ?? []} columns={columns} keyOf={(h) => h.id} empty="Aucune ruche pour l’instant." actions={(h) => (
          <>
            <Link to={`/ruches/${h.id}`} className="p-btn-outline p-btn-sm no-underline">Ouvrir</Link>
            <ConfirmButton label={<><Trash2 size={14} /> Supprimer</>} question={`Supprimer « ${h.name} », ses messages, ses ressources et ses événements ?`} confirm="Supprimer" danger disabled={remove.isPending} onConfirm={() => remove.mutate({ id: h.id })} />
          </>
        )} />
      )}
    </div>
  );
}
