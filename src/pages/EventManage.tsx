import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Ban, Copy, ExternalLink, Eye, Pencil, PlayCircle, Upload, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { EventForm } from "@/components/events/EventForm";
import { parisHour, parisLongDate, plural } from "@/lib/format";
import { useUpload } from "@/lib/upload";
import { VideoEmbed } from "@/components/VideoEmbed";
import { ConfirmButton } from "@/pages/admin/shared";

/** Gérer un événement : réservé à celui qui l'a créé et aux administrateurs. */
export default function EventManage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const q = trpc.events.manage.useQuery({ slug }, { retry: false });
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const attendance = trpc.events.setAttendance.useMutation({ onSuccess: () => utils.events.manage.invalidate({ slug }), onError: (e) => toast.error(e.message) });
  const cancel = trpc.events.cancel.useMutation({
    onSuccess: (r, v) => { utils.events.invalidate(); utils.dashboard.invalidate(); setConfirm(false); const what = v.following ? "Série arrêtée" : "Événement annulé"; toast.success(r.notified ? `${what} : ${plural(r.notified, "personne prévenue", "personnes prévenues")}` : what); },
    onError: (e) => toast.error(e.message),
  });
  if (q.isLoading) return <p className="p-muted py-20 text-center">Chargement…</p>;
  if (q.error || !q.data) return <div className="py-20 text-center p-muted">{q.error?.message ?? "Événement introuvable"} <Link to="/evenements" className="p-link">Retour aux événements</Link></div>;
  const e = q.data;
  const start = new Date(e.startsAt);
  const url = `${window.location.origin}/e/${e.slug}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success("Lien copié"); } catch { toast.error("Copie impossible"); } };
  const confirmed = e.registrants.filter((r) => !r.waitlist);
  const waiting = e.registrants.filter((r) => r.waitlist);

  return (
    <>
      <Link to={`/e/${e.slug}`} className="p-btn-outline p-btn-sm no-underline mb-5"><ArrowLeft size={15} /> Page de l’événement</Link>
      <header className="flex flex-col gap-2 mb-5">
        <span className="p-eyebrow">Gérer</span>
        <h1 className="m-0 text-[clamp(32px,5vw,46px)] leading-[1.06]">{e.title}</h1>
        <p className="m-0 text-[15px] p-muted">{parisLongDate(start)} · {parisHour(start)} (heure de Paris){e.hive ? ` · Ruche ${e.hive.name}` : e.visibility === "public" ? " · Public" : " · Membres connectés"}</p>
        {e.cancelled && <span className="p-pill self-start" style={{ background: "var(--p-accent)", color: "#fff" }}>Annulé</span>}
        {e.status === "pending" && <span className="p-chip h-7 text-[12.5px] border-dashed cursor-default p-muted self-start">En attente de validation</span>}
        {e.series && <span className="p-chip h-7 text-[12.5px] cursor-default p-muted self-start">{e.series.stopped ? "Série arrêtée" : e.series.label}</span>}
      </header>

      <div className="flex flex-wrap gap-2 mb-6">
        <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setEditing(!editing)}><Pencil size={15} /> {editing ? "Fermer" : "Modifier"}</button>
        <button type="button" className="p-btn-outline p-btn-sm" onClick={copy}><Copy size={15} /> Copier le lien</button>
        <a href={url} target="_blank" rel="noopener" className="p-btn-outline p-btn-sm no-underline"><ExternalLink size={15} /> Ouvrir</a>
        {!e.cancelled && <button type="button" className="p-btn-outline p-btn-sm" style={{ color: "var(--p-accent-text)" }} onClick={() => setConfirm(true)}><Ban size={15} /> Annuler l’événement</button>}
      </div>

      {confirm && (
        <div className="flex flex-wrap items-center gap-2.5 p-4 rounded-2xl mb-6" style={{ background: "var(--p-accent-soft)" }}>
          <span className="flex-[1_1_240px] text-[14.5px]">Annuler {e.series ? "cette date" : "cet événement"} ? {e.registrants.length > 1 ? `Les ${e.registrants.length} personnes inscrites seront prévenues.` : "Les personnes inscrites seront prévenues."}</span>
          <button type="button" className="p-btn-primary p-btn-sm" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: e.id })}>{e.series ? "Cette date seulement" : "Oui, annuler"}</button>
          {e.series && !e.series.stopped && <button type="button" className="p-btn-primary p-btn-sm" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: e.id, following: true })}>Cette date et toute la suite</button>}
          <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setConfirm(false)}>Non</button>
        </div>
      )}

      {editing && <EventForm initial={e} onDone={(r) => { setEditing(false); if (r?.slug && r.slug !== slug) navigate(`/e/${r.slug}/gerer`, { replace: true }); }} />}

      <div className="grid gap-3 mb-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(130px, 100%), 1fr))" }}>
        {([[Eye, "Vues", e.stats.views], [Users, "Inscrits", e.stats.registered], [Users, "Liste d’attente", e.stats.waitlist], [UserCheck, "Présents", e.stats.attended]] as const).map(([Icon, label, n]) => (
          <div key={label} className="p-soft p-4 flex flex-col gap-1"><span className="flex items-center gap-1.5 text-[13px] p-muted"><Icon size={14} /> {label}</span><span className="serif text-[34px] leading-none">{n}</span></div>
        ))}
      </div>

      {e.kind !== "onsite" && <ReplayCard id={e.id} title={e.title} url={e.replayUrl} />}

      {!!e.series?.dates.length && (
        <section className="flex flex-col gap-2.5 mb-7" aria-label="Les dates de la série">
          <h2 className="m-0 text-[28px]">Les dates à venir</h2>
          <p className="m-0 text-[14px] p-muted">{e.series.stopped ? "Cette série est arrêtée." : "Les dates se créent automatiquement, trois mois à l’avance. Chacune a sa page et ses inscrits."}</p>
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {e.series.dates.map((d) => (
              <li key={d.slug}>
                <Link to={`/e/${d.slug}/gerer`} className="p-card p-3 flex flex-wrap items-center gap-x-3 gap-y-1 no-underline" style={{ color: "var(--p-ink)", ...(d.slug === e.slug ? { borderColor: "var(--p-accent-line)" } : {}) }}>
                  <span className="flex-[1_1_220px] min-w-0 font-medium">{parisLongDate(new Date(d.startsAt))} · {parisHour(new Date(d.startsAt))}</span>
                  <span className="text-[13px] p-muted">{d.cancelled ? "Annulée" : d.slug === e.slug ? `Cette date · ${plural(d.registered, "inscrit", "inscrits")}` : plural(d.registered, "inscrit", "inscrits")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2.5 mb-7" aria-label="Personnes inscrites">
        <h2 className="m-0 text-[28px]">Inscrits <span className="text-[14px] font-sans p-faint">{confirmed.length}{e.maxSeats ? ` / ${e.maxSeats}` : ""}</span></h2>
        {confirmed.map((r) => (
          <label key={r.memberId} className="p-card p-3 flex items-center gap-3 cursor-pointer">
            <Avatar m={r} size={42} />
            <span className="flex-1 min-w-0 flex flex-col"><span className="font-semibold truncate">{r.name}</span><span className="text-[13px] p-muted truncate">{[r.jobTitle, r.city].filter(Boolean).join(" · ")}</span></span>
            <span className="flex items-center gap-2 text-[13.5px] flex-none"><span className="hidden sm:inline p-muted">Présent·e</span><input type="checkbox" aria-label={`Présence de ${r.name}`} className="w-5 h-5" style={{ accentColor: "var(--p-accent)" }} checked={r.attended} disabled={attendance.isPending} onChange={(ev) => attendance.mutate({ eventId: e.id, memberId: r.memberId, attended: ev.target.checked })} /></span>
          </label>
        ))}
        {confirmed.length === 0 && <div className="p-soft p-6 text-center p-muted">Personne pour l’instant.</div>}
      </section>

      {waiting.length > 0 && (
        <section className="flex flex-col gap-2.5" aria-label="Liste d’attente">
          <h2 className="m-0 text-[28px]">Liste d’attente <span className="text-[14px] font-sans p-faint">{waiting.length}</span></h2>
          {waiting.map((r) => <div key={r.memberId} className="p-card p-3 flex items-center gap-3"><Avatar m={r} size={42} /><span className="flex-1 min-w-0 flex flex-col"><span className="font-semibold truncate">{r.name}</span><span className="text-[13px] p-muted truncate">{r.jobTitle}</span></span></div>)}
        </section>
      )}
    </>
  );
}

/**
 * Le replay d'un événement en ligne : un lien (YouTube, Vimeo, Google Drive, Loom) ou une vidéo envoyée sur Présence.
 * Les membres le retrouvent sur la page de l'événement et dans Événements › Replays ; le premier ajout prévient les inscrits.
 */
function ReplayCard({ id, title, url }: { id: number; title: string; url: string | null }) {
  const utils = trpc.useUtils();
  const [link, setLink] = useState("");
  const video = useUpload("eventReplay");
  const save = trpc.events.setReplay.useMutation({
    onSuccess: (r, v) => { utils.events.invalidate(); setLink(""); toast.success(!v.url ? "Replay retiré" : r.notified ? `Replay en ligne : ${plural(r.notified, "personne prévenue", "personnes prévenues")}` : "Replay en ligne"); },
    onError: (err) => toast.error(err.message),
  });
  const send = async (file?: File) => {
    if (!file) return;
    if (file.size > 500 * 1048576) return void toast.error("La vidéo dépasse 500 Mo. Déposez-la plutôt sur YouTube ou Vimeo et collez son lien.");
    try { save.mutate({ id, url: (await video.upload(file)).publicUrl }); } catch (err) { toast.error(err instanceof Error ? err.message : "Envoi impossible"); }
  };
  return (
    <section className="p-card p-5 sm:p-6 flex flex-col gap-3.5 mb-7" aria-labelledby="replay-titre">
      <h2 id="replay-titre" className="m-0 text-[28px] flex items-center gap-2"><PlayCircle size={24} style={{ color: "var(--p-accent)" }} /> Replay</h2>
      <p className="m-0 text-[14.5px] p-muted">{url ? "Les membres le retrouvent sur la page de l’événement et dans Événements › Replays." : "Après l’événement, ajoutez son enregistrement : les membres le retrouvent dans Événements › Replays, et les personnes inscrites sont prévenues."}</p>
      {url && (
        <>
          <VideoEmbed url={url} title={`Replay : ${title}`} />
          <span className="flex flex-wrap gap-2"><ConfirmButton label="Retirer le replay" question="Retirer le replay ? Les membres ne pourront plus le revoir, et une vidéo envoyée sur Présence sera effacée." confirm="Retirer le replay" dismiss="Garder" danger disabled={save.isPending} onConfirm={() => save.mutate({ id, url: null })} /></span>
        </>
      )}
      <form className="flex flex-col gap-2.5" onSubmit={(ev) => { ev.preventDefault(); if (link.trim()) save.mutate({ id, url: link.trim() }); }}>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>{url ? "Remplacer par un autre lien" : "Lien de l’enregistrement"}</span><input className="p-field" type="url" inputMode="url" value={link} onChange={(ev) => setLink(ev.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label>
        <span className="flex flex-wrap items-center gap-2">
          <button type="submit" className="p-btn-primary p-btn-sm" disabled={!link.trim() || save.isPending || video.busy}>{url ? "Remplacer" : "Publier le replay"}</button>
          <span className="text-[13px] p-muted">ou</span>
          <label className={`p-btn-outline p-btn-sm ${video.busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
            <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" className="sr-only" aria-label="Envoyer la vidéo du replay" disabled={video.busy} onChange={(ev) => { void send(ev.target.files?.[0]); ev.target.value = ""; }} />
            <Upload size={15} /> {video.busy ? `Envoi… ${video.progress ?? 0} %` : "Envoyer la vidéo"}
          </label>
        </span>
        <span className="text-[12.5px] p-muted">YouTube en « non répertorié », Vimeo, Google Drive ou Loom ; ou un fichier vidéo de 500 Mo au plus.</span>
      </form>
    </section>
  );
}
