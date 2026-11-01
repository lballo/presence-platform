import { useState } from "react";
import { Link } from "react-router";
import { ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { ago } from "@/lib/format";
import { Badge, Chips, ConfirmButton } from "./shared";
import { dateTime } from "./labels";

type Report = RouterOutputs["admin"]["reports"][number];
const DECISION: Record<string, string> = { masque: "Contenu masqué", retabli: "Contenu rétabli", supprime: "Contenu supprimé", sans_suite: "Classé sans suite", auteur_suspendu: "Auteur suspendu" };

export default function AdminModeration() {
  const [status, setStatus] = useState<"ouvert" | "traite" | "classe">("ouvert");
  const q = trpc.admin.reports.useQuery({ status });
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-[30px]">Modération</h2>
      <Chips label="État des signalements" value={status} onChange={setStatus} options={[["ouvert", "Ouverts"], ["traite", "Traités"], ["classe", "Classés sans suite"]]} />
      {q.isLoading && <p className="p-muted text-center py-10 m-0">Chargement…</p>}
      {q.data?.map((r) => <Card key={r.id} r={r} />)}
      {q.data?.length === 0 && <div className="p-soft p-7 text-center text-[14.5px] p-muted">{status === "ouvert" ? "Aucun signalement ouvert." : "Rien ici pour l’instant."}</div>}
    </div>
  );
}

function Card({ r }: { r: Report }) {
  const utils = trpc.useUtils();
  const resolve = trpc.admin.resolveReport.useMutation({
    onSuccess: () => { utils.admin.invalidate(); utils.forum.invalidate(); toast.success("C’est fait"); },
    onError: (e) => toast.error(e.message),
  });
  const act = (action: "masquer" | "supprimer" | "classer" | "suspendre" | "retablir") => resolve.mutate({ id: r.id, action });
  const busy = resolve.isPending;
  const open = r.status === "ouvert";
  return (
    <article className="p-card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={open ? "alert" : "calm"}>{r.kindLabel}</Badge>
        {!open && <Badge>{DECISION[r.decision] ?? r.decision}</Badge>}
        {r.target.hidden && <Badge tone="wait">Masqué</Badge>}
        {!r.target.exists && r.decision !== "supprime" && <Badge>Contenu supprimé</Badge>}
        {r.author.suspended && <Badge tone="alert">Auteur suspendu</Badge>}
        <span className="text-[12.5px] p-muted ml-auto" title={dateTime(r.at)}>{ago(new Date(r.at))}</span>
      </div>
      <dl className="m-0 flex flex-col gap-1.5 text-[14.5px]">
        <div className="flex flex-wrap gap-x-1.5"><dt className="p-muted">Auteur :</dt><dd className="m-0"><Link to={`/admin/membres/${r.author.id}`}>{r.author.name}</Link></dd></div>
        <div className="flex flex-wrap gap-x-1.5"><dt className="p-muted">Signalé par :</dt><dd className="m-0">{r.reporter.name}</dd></div>
        <div className="flex flex-wrap gap-x-1.5"><dt className="p-muted">Motif :</dt><dd className="m-0 whitespace-pre-line break-words">{r.reason}</dd></div>
      </dl>
      {r.kind === "message" ? <MessageContext id={r.id} /> : (
        <>
          <blockquote className="m-0 p-3 rounded-xl text-[14.5px] whitespace-pre-line break-words" style={{ background: "var(--p-surface-2)" }}>{r.snapshot || "Sans texte"}</blockquote>
          {r.target.href && <Link to={r.target.href} className="self-start text-[13.5px] flex items-center gap-1.5"><ExternalLink size={13} /> Voir sur place</Link>}
        </>
      )}
      <span className="flex flex-wrap gap-2">
        {open && r.target.exists && !r.target.hidden && <button type="button" className="p-btn-primary p-btn-sm" disabled={busy} onClick={() => act("masquer")}>Masquer</button>}
        {r.target.exists && <ConfirmButton label="Supprimer" question="Supprimer définitivement ce contenu ?" disabled={busy} danger onConfirm={() => act("supprimer")} />}
        {open && <button type="button" className="p-btn-outline p-btn-sm" disabled={busy} onClick={() => act("classer")}>Classer sans suite</button>}
        {r.target.hidden && <button type="button" className="p-btn-outline p-btn-sm" disabled={busy} onClick={() => act("retablir")}>Rétablir</button>}
        {!r.author.suspended && <ConfirmButton label="Suspendre l’auteur" question={`Suspendre ${r.author.name} ?`} confirm="Suspendre" disabled={busy} danger onConfirm={() => act("suspendre")} />}
      </span>
    </article>
  );
}

/** Un message privé : le message signalé et les deux avant et après. Rien d'autre n'est demandé au serveur. */
function MessageContext({ id }: { id: number }) {
  const [shown, setShown] = useState(false);
  const q = trpc.admin.reportContext.useQuery({ id }, { enabled: shown, refetchOnWindowFocus: false });
  if (!shown) {
    return (
      <div className="p-3 rounded-xl flex flex-wrap items-center gap-3 text-[14px]" style={{ background: "var(--p-surface-2)" }}>
        <Lock size={15} className="flex-none p-muted" />
        <span className="flex-[1_1_200px] min-w-0 p-muted">Conversation privée : seuls ce message et les deux avant et après sont accessibles. La lecture est inscrite au journal.</span>
        <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setShown(true)}>Lire le message</button>
      </div>
    );
  }
  if (q.isLoading) return <p className="p-muted m-0 text-[14px]">Chargement…</p>;
  return (
    <ol className="list-none m-0 p-3 rounded-xl flex flex-col gap-2" style={{ background: "var(--p-surface-2)" }} aria-label="Message signalé et son contexte">
      {q.data?.messages.length === 0 && <li className="text-[14.5px] whitespace-pre-line break-words">{q.data.snapshot}</li>}
      {q.data?.messages.map((m) => (
        <li key={m.id} className="p-2.5 rounded-lg text-[14.5px]" style={m.reported ? { background: "var(--p-accent-soft)", border: "1px solid var(--p-accent-line)" } : { background: "var(--p-surface)" }}>
          <span className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] p-muted"><b style={{ color: "var(--p-ink)" }}>{m.from}</b><span>{dateTime(m.at)}</span>{m.reported && <span style={{ color: "var(--p-accent-text)" }}>Message signalé</span>}{m.hidden && <span>Masqué</span>}</span>
          <span className={`block whitespace-pre-line break-words ${m.deleted && !m.text ? "italic p-muted" : ""}`}>{m.deleted && !m.text ? "Message supprimé" : m.text}</span>
        </li>
      ))}
    </ol>
  );
}
