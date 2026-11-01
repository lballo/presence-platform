import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Rows, type Column } from "./shared";
import { dateTime } from "./labels";

type Entry = RouterOutputs["admin"]["log"]["rows"][number];
const PAGE = 50;

const columns: Column<Entry>[] = [
  { key: "action", label: "Quoi", cell: (e) => <span className="font-semibold">{e.action}</span> },
  { key: "who", label: "Qui", cell: (e) => e.actorName },
  { key: "when", label: "Quand", cell: (e) => <span className="whitespace-nowrap">{dateTime(e.createdAt)}</span> },
  { key: "target", label: "Sur quoi", cell: (e) => <span className="break-words">{e.targetLabel || `${e.targetType}${e.targetId ? ` n° ${e.targetId}` : ""}`}</span> },
  { key: "detail", label: "Détail", phoneHide: false, cell: (e) => <span className="text-[13.5px] p-muted break-words">{e.detail || "—"}</span> },
];

/** Chaque action d'administration : qui, quoi, quand, sur quoi. */
export default function AdminLog() {
  const [limit, setLimit] = useState(PAGE);
  const q = trpc.admin.log.useQuery({ limit }, { placeholderData: keepPreviousData });
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-[30px]">Journal</h2>
      {q.isLoading ? <p className="p-muted text-center py-10 m-0">Chargement…</p> : <Rows rows={q.data?.rows ?? []} columns={columns} keyOf={(e) => e.id} empty="Aucune action d’administration pour l’instant." />}
      {q.data?.hasMore && <button type="button" className="p-btn-outline p-btn-sm self-center" onClick={() => setLimit(limit + PAGE)}>Afficher plus</button>}
    </div>
  );
}
