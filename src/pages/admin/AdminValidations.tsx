import { useState } from "react";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { VideoEmbed } from "@/components/VideoEmbed";
import { ago, duration, parisHour, parisLongDate } from "@/lib/format";
import { Badge, Chips } from "./shared";

type Item = RouterOutputs["admin"]["validations"][number];
const KIND = { event: "Événement proposé", talk: "Talk", opportunity: "Opportunité", organizer: "Candidature organisateur" } as const;
const ACCEPT = { event: "Publier", talk: "Publier", opportunity: "Publier", organizer: "Accepter" } as const;

/** Une seule file : tout ce qui attend une décision, le plus ancien d'abord. */
export default function AdminValidations() {
  const q = trpc.admin.validations.useQuery();
  const [kind, setKind] = useState<"tous" | Item["kind"]>("tous");
  const items = q.data ?? [];
  const n = (k: Item["kind"]) => items.filter((i) => i.kind === k).length;
  const shown = kind === "tous" ? items : items.filter((i) => i.kind === kind);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-[30px]">Validations</h2>
      <Chips label="Filtrer la file" value={kind} onChange={setKind} options={[["tous", "Tout", items.length], ["event", "Événements", n("event")], ["talk", "Talks", n("talk")], ["opportunity", "Opportunités", n("opportunity")], ["organizer", "Candidatures", n("organizer")]]} />
      {q.isLoading && <p className="p-muted text-center py-10 m-0">Chargement…</p>}
      {shown.map((i) => <Card key={`${i.kind}-${i.id}`} i={i} />)}
      {!q.isLoading && !shown.length && <div className="p-soft p-7 text-center text-[14.5px] p-muted">Rien à valider pour l’instant.</div>}
    </div>
  );
}

function Card({ i }: { i: Item }) {
  const utils = trpc.useUtils();
  const [message, setMessage] = useState("");
  const decide = trpc.admin.decide.useMutation({
    onSuccess: (_r, v) => { utils.admin.invalidate(); utils.events.invalidate(); utils.talks.invalidate(); utils.forum.invalidate(); utils.members.invalidate(); toast.success(v.accept ? "Accepté : l’auteur est prévenu" : "Refusé : l’auteur est prévenu"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <article className="p-card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar m={i.author} size={42} />
        <span className="flex flex-col min-w-0 flex-1"><span className="font-semibold truncate">{i.author.name}</span><span className="text-[12.5px] p-muted">{ago(new Date(i.at))}</span></span>
        <Badge tone="wait">{KIND[i.kind]}</Badge>
      </div>
      {i.kind !== "organizer" && <h3 className="m-0 text-[24px] leading-tight break-words">{i.title}</h3>}
      {i.kind === "event" && i.startsAt && (
        <p className="m-0 text-[14px] flex flex-col gap-0.5">
          <span>{parisLongDate(new Date(i.startsAt))} · {parisHour(new Date(i.startsAt))} · {duration(i.durationMin)}</span>
          <span className="p-muted">{i.visibility === "public" ? "Public" : "Membres connectés"}{i.place ? ` · ${i.place}` : ""}</span>
        </p>
      )}
      {i.facts.length > 0 && <div className="flex flex-wrap gap-1.5">{i.facts.map((x) => <span key={x} className="p-chip h-[28px] text-[12.5px] cursor-default">{x}</span>)}</div>}
      {i.html ? <div className="p-rich text-[14.5px]" dangerouslySetInnerHTML={{ __html: i.html }} /> : i.summary && <p className="m-0 text-[14.5px] leading-relaxed whitespace-pre-line break-words">{i.summary}</p>}
      {i.videoUrl && <VideoEmbed url={i.videoUrl} title={i.title} />}
      {i.href && <Link to={i.href} className="self-start text-[13.5px] flex items-center gap-1.5"><ExternalLink size={13} /> {i.kind === "organizer" ? "Voir le profil" : "Voir la page"}</Link>}
      <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Message à l’auteur (facultatif)</span><textarea className="p-field text-[14.5px]" rows={2} maxLength={800} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Il le lira dans ses notifications." /></label>
      <span className="flex flex-wrap gap-2">
        <button type="button" className="p-btn-primary p-btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ kind: i.kind, id: i.id, accept: true, message })}>{ACCEPT[i.kind]}</button>
        <button type="button" className="p-btn-outline p-btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ kind: i.kind, id: i.id, accept: false, message })}>Refuser</button>
      </span>
    </article>
  );
}
