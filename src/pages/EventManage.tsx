import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Ban, Copy, ExternalLink, Eye, Pencil, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { EventForm } from "@/components/events/EventForm";
import { parisHour, parisLongDate, plural } from "@/lib/format";

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
    onSuccess: (r) => { utils.events.invalidate(); utils.dashboard.invalidate(); setConfirm(false); toast.success(r.notified ? `Événement annulé : ${plural(r.notified, "personne prévenue", "personnes prévenues")}` : "Événement annulé"); },
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
      </header>

      <div className="flex flex-wrap gap-2 mb-6">
        <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setEditing(!editing)}><Pencil size={15} /> {editing ? "Fermer" : "Modifier"}</button>
        <button type="button" className="p-btn-outline p-btn-sm" onClick={copy}><Copy size={15} /> Copier le lien</button>
        <a href={url} target="_blank" rel="noopener" className="p-btn-outline p-btn-sm no-underline"><ExternalLink size={15} /> Ouvrir</a>
        {!e.cancelled && <button type="button" className="p-btn-outline p-btn-sm" style={{ color: "var(--p-accent-text)" }} onClick={() => setConfirm(true)}><Ban size={15} /> Annuler l’événement</button>}
      </div>

      {confirm && (
        <div className="flex flex-wrap items-center gap-2.5 p-4 rounded-2xl mb-6" style={{ background: "var(--p-accent-soft)" }}>
          <span className="flex-[1_1_240px] text-[14.5px]">Annuler cet événement ? {e.registrants.length > 1 ? `Les ${e.registrants.length} personnes inscrites seront prévenues.` : "Les personnes inscrites seront prévenues."}</span>
          <button type="button" className="p-btn-primary p-btn-sm" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: e.id })}>Oui, annuler</button>
          <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setConfirm(false)}>Non</button>
        </div>
      )}

      {editing && <EventForm initial={e} onDone={(r) => { setEditing(false); if (r?.slug && r.slug !== slug) navigate(`/e/${r.slug}/gerer`, { replace: true }); }} />}

      <div className="grid gap-3 mb-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(130px, 100%), 1fr))" }}>
        {([[Eye, "Vues", e.stats.views], [Users, "Inscrits", e.stats.registered], [Users, "Liste d’attente", e.stats.waitlist], [UserCheck, "Présents", e.stats.attended]] as const).map(([Icon, label, n]) => (
          <div key={label} className="p-soft p-4 flex flex-col gap-1"><span className="flex items-center gap-1.5 text-[13px] p-muted"><Icon size={14} /> {label}</span><span className="serif text-[34px] leading-none">{n}</span></div>
        ))}
      </div>

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
