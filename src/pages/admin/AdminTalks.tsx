import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { parisLongDate } from "@/lib/format";
import { Badge, Chips, ConfirmButton, Rows, SelectionBar, type Column } from "./shared";

type Talk = RouterOutputs["admin"]["talks"][number];
type Filter = "published" | "pending" | "rejected" | "tous";

const stateOf = (t: Talk) => (t.status === "published" ? <Badge tone="ok">Publié</Badge> : t.status === "pending" ? <Badge tone="wait">À valider</Badge> : <Badge>Refusé</Badge>);
const day = (d: string | Date) => parisLongDate(new Date(d)).replace(/^./, (c) => c.toLowerCase());
const dateOf = (t: Talk) => (t.status === "published" ? `Publié le ${day(t.publishedAt)}` : `Proposé le ${day(t.submittedAt)}`);

const columns: Column<Talk>[] = [
  { key: "title", label: "Talk show", cell: (t) => <span className="flex flex-col min-w-0"><span className="font-semibold break-words">{t.title}</span><span className="text-[12.5px] p-muted">{t.speaker ? <Link to={`/membres/${t.speaker.id}`}>{t.speaker.name}</Link> : "Auteur inconnu"}</span><span className="text-[12.5px] p-muted">{dateOf(t)}</span></span> },
  { key: "state", label: "État", cell: stateOf },
  { key: "duration", label: "Durée", align: "right", phoneHide: true, cell: (t) => `${t.durationMin} min` },
  { key: "views", label: "Vues", align: "right", cell: (t) => t.views },
];

/**
 * Talk shows, sous-page d'Événements dans l'administration : la liste complète, et de quoi en supprimer un,
 * plusieurs (cochés) ou toute la liste d'un coup.
 */
export default function AdminTalks() {
  const utils = trpc.useUtils();
  const q = trpc.admin.talks.useQuery();
  const [filter, setFilter] = useState<Filter>("published");
  const [picked, setPicked] = useState<Set<string | number>>(new Set());
  const remove = trpc.admin.deleteTalks.useMutation({
    onSuccess: (r) => {
      setPicked(new Set());
      utils.admin.invalidate(); utils.talks.invalidate(); utils.dashboard.invalidate();
      const what = r.deleted > 1 ? `${r.deleted} talk shows supprimés` : "Talk show supprimé";
      toast.success(r.videosRemoved ? `${what}, ${r.videosRemoved > 1 ? `leurs ${r.videosRemoved} vidéos sont effacées` : r.deleted > 1 ? "1 vidéo est effacée" : "sa vidéo est effacée"}` : what);
    },
    onError: (e) => toast.error(e.message),
  });
  const list = q.data ?? [];
  const n = (s: Talk["status"]) => list.filter((t) => t.status === s).length;
  const rows = useMemo(() => (filter === "tous" ? list : list.filter((t) => t.status === filter)), [list, filter]);
  const chosen = rows.filter((t) => picked.has(t.id));
  const withVideo = chosen.filter((t) => t.videoStored).length;
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[14.5px] p-muted">Supprimer un talk show le retire du Talk Show et du profil de son auteur ; la vidéo envoyée sur Présence est effacée. C’est définitif. Cochez-en plusieurs pour les supprimer d’un coup. Les propositions en attente se valident dans <Link to="/admin/validations">Validations</Link>.</p>
      <Chips label="Filtrer les talk shows" value={filter} onChange={(f) => { setFilter(f); setPicked(new Set()); }} options={[["published", "Publiés", n("published")], ["pending", "En attente", n("pending")], ["rejected", "Refusés", n("rejected")], ["tous", "Tous"]]} />
      <SelectionBar count={chosen.length} total={rows.length} noun={["talk show", "talk shows"]} busy={remove.isPending}
        onClear={() => setPicked(new Set())} onSelectAll={() => setPicked(new Set(rows.map((t) => t.id)))}
        question={chosen.length === 1
          ? `Supprimer « ${chosen[0].title} » ? Il disparaîtra du Talk Show${withVideo ? " et sa vidéo sera effacée" : ""}. C’est définitif.`
          : `Supprimer ces ${chosen.length} talk shows ? Ils disparaîtront du Talk Show${withVideo ? ` et ${withVideo > 1 ? `leurs ${withVideo} vidéos seront effacées` : "1 vidéo sera effacée"}` : ""}. C’est définitif.`}
        confirm={chosen.length === 1 ? "Supprimer le talk show" : `Supprimer les ${chosen.length} talk shows`}
        onConfirm={() => remove.mutate({ ids: chosen.map((t) => t.id) })} />
      {q.isLoading ? <p className="p-muted text-center py-10 m-0">Chargement…</p> : (
        <Rows rows={rows} columns={columns} keyOf={(t) => t.id} empty="Aucun talk show dans cette liste." select={{ selected: picked, onChange: setPicked, labelOf: (t) => t.title }} actions={(t) => (
          <>
            {t.videoUrl && <a href={t.videoUrl} target="_blank" rel="noopener" className="p-btn-outline p-btn-sm no-underline">Voir la vidéo</a>}
            <ConfirmButton label="Supprimer" question={`Supprimer « ${t.title} »${t.speaker ? ` de ${t.speaker.name}` : ""} ? Il disparaîtra du Talk Show${t.videoStored ? " et sa vidéo sera effacée" : ""}. C’est définitif.`} confirm="Supprimer le talk show" dismiss="Garder" danger disabled={remove.isPending} onConfirm={() => remove.mutate({ ids: [t.id] })} />
          </>
        )} />
      )}
    </div>
  );
}
