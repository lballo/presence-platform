import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, Radio, Video, MapPin, Clock, Users, Plus, Pencil, Trash2, Hourglass, XCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Avatar, Faces } from "@/components/Avatar";
import { longDate, hour, addMin, duration, monthTitle, plural, iso } from "@/lib/format";
import { AccessInfo, AccessFields, accessReady } from "@/components/EventAccess";

type Ev = RouterOutputs["events"]["program"][number];
const FILTERS = [["all", "Tous"], ["salon", "Salons live"], ["online", "En ligne"], ["onsite", "Présentiel"]] as const;
const KIND = { salon: "Salon live", online: "En ligne", onsite: "Présentiel" } as const;
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

export default function Evenements() {
  const utils = trpc.useUtils();
  const program = trpc.events.program.useQuery();
  const toggle = trpc.events.toggleRegistration.useMutation({ onSuccess: (r) => { utils.events.program.invalidate(); utils.dashboard.invalidate(); utils.hives.invalidate(); if (r.waitlist) toast("Vous êtes sur liste d’attente"); }, onError: (e) => toast.error(e.message) });
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selId, setSelId] = useState<number | null>(null);
  const [proposing, setProposing] = useState(false);
  const [editing, setEditing] = useState<Ev | null>(null);
  const me = trpc.members.me.useQuery();

  const all = program.data ?? [];
  const now = new Date();
  const list = all.filter((e) => filter === "all" || e.kind === filter);
  const live = all.find((e) => e.live);
  const upcoming = list.filter((e) => new Date(e.startsAt) >= now || e.live);
  const sel = all.find((e) => e.id === selId) ?? upcoming[0] ?? null;

  const grid = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [month]);
  const byDay = (d: Date) => list.filter((e) => { const s = new Date(e.startsAt); const span = e.days ?? 1; for (let i = 0; i < span; i++) { const x = new Date(s); x.setDate(s.getDate() + i); if (iso(x) === iso(d)) return true; } return false; });
  const inMonth = list.filter((e) => { const s = new Date(e.startsAt); return s.getMonth() === month.getMonth() && s.getFullYear() === month.getFullYear(); });

  return (
    <>
      <PageHeader eyebrow="Le programme" title="Événements Présence" intro="Salons live, ateliers en ligne et rencontres en présentiel organisés par Présence. Cliquez sur une date pour en voir le détail et vous inscrire. Les rendez-vous de vos ruches se trouvent dans chaque ruche et dans votre agenda."
        action={<button type="button" className={proposing ? "p-btn-outline" : "p-btn-primary"} onClick={() => { setEditing(null); setProposing(!proposing); }}><Plus size={17} /> {proposing ? "Fermer" : me.data?.isOrganizer ? "Créer un événement" : "Proposer un événement"}</button>} />

      {me.data?.isAdmin && <PendingEvents />}
      {(proposing || editing) && <EventForm key={editing?.id ?? "new"} initial={editing} onDone={() => { setProposing(false); setEditing(null); }} />}
      <MyProposals />

      {live && (
        <section className="p-band p-6 sm:p-7 flex flex-wrap items-center gap-5 mb-7">
          <span className="flex items-center gap-2 h-8 px-3 rounded-full text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ background: "var(--p-accent)" }}><span className="w-2 h-2 rounded-full bg-white animate-pulse" /> En direct</span>
          <span className="flex-[1_1_300px] flex flex-col gap-1"><span className="serif text-[30px] leading-tight">{live.title}</span><span className="text-[14px] text-white/75">Avec {live.host.name} · {plural(live.taken, "participant", "participants")}{live.maxSeats ? ` · ${live.maxSeats} places` : ""}</span></span>
          <button type="button" className="p-btn-white" onClick={() => setSelId(live.id)}><Radio size={16} /> Rejoindre le salon</button>
        </section>
      )}

      <div className="flex flex-wrap gap-2 mb-6">{FILTERS.map(([k, l]) => <button key={k} type="button" className={`p-chip h-10 ${filter === k ? "p-chip-on" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}</div>

      <div className="flex flex-wrap gap-6 items-start mb-10">
        <section className="flex-[3_1_520px] min-w-0 p-card p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button type="button" aria-label="Mois précédent" className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: "var(--p-line)" }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
            <h2 className="m-0 text-[30px] capitalize">{monthTitle(month.getFullYear(), month.getMonth())}</h2>
            <button type="button" aria-label="Mois suivant" className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: "var(--p-line)" }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-semibold uppercase tracking-wider p-faint">{DAYS.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
              if (!d) return <span key={i} />;
              const evs = byDay(d);
              const today = iso(d) === iso(now);
              return (
                <div key={i} className="min-h-[76px] rounded-xl p-1.5 flex flex-col gap-1 border" style={{ borderColor: today ? "var(--p-accent)" : "var(--p-line)", background: evs.length ? "var(--p-surface)" : "transparent" }}>
                  <span className={`text-[12.5px] ${today ? "font-bold" : "p-muted"}`} style={today ? { color: "var(--p-accent-text)" } : undefined}>{d.getDate()}</span>
                  {evs.slice(0, 2).map((e) => (
                    <button key={e.id} type="button" onClick={() => setSelId(e.id)} className="text-left text-[11px] leading-tight px-1.5 py-1 rounded-md truncate" style={sel?.id === e.id ? { background: "var(--p-ink)", color: "var(--p-surface)" } : e.kind === "salon" ? { background: "var(--p-accent)", color: "#fff" } : e.kind === "onsite" ? { background: "var(--p-pill)", color: "var(--p-accent-text)" } : { background: "var(--p-surface-2)", color: "var(--p-ink)" }} title={e.title}>{e.registered ? "✓ " : ""}{e.title}</button>
                  ))}
                  {evs.length > 2 && <span className="text-[10.5px] p-faint">+{evs.length - 2}</span>}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-[12.5px] p-muted pt-2 border-t" style={{ borderColor: "var(--p-line)" }}>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: "var(--p-accent)" }} /> Salon live</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-line-2)" }} /> En ligne</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: "var(--p-pill)" }} /> Présentiel</span>
            <span className="ml-auto">{plural(inMonth.length, "événement ce mois", "événements ce mois")}</span>
          </div>
        </section>

        <aside className="flex-[2_1_340px] min-w-0">
          {sel ? <Detail e={sel} onToggle={() => toggle.mutate({ eventId: sel.id })} pending={toggle.isPending} onEdit={() => { setProposing(false); setEditing(sel); window.scrollTo({ top: 0, behavior: "smooth" }); }} onDeleted={() => setSelId(null)} /> : <div className="p-soft p-8 text-center p-muted">Sélectionnez un événement dans le calendrier.</div>}
        </aside>
      </div>

      {filter === "onsite" && (
        <section className="p-soft p-6 mb-10 flex flex-wrap items-center gap-5">
          <MapPin size={28} style={{ color: "var(--p-accent-text)" }} />
          <div className="flex-1 flex flex-col gap-1"><span className="serif text-[24px]">Où se retrouver</span><span className="text-[14px] p-muted">{[...new Set(upcoming.map((e) => e.city).filter(Boolean))].join(" · ") || "Aucune rencontre en présentiel programmée."}</span></div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="m-0 text-[32px]">À venir <span className="text-[14px] font-sans p-faint">{upcoming.length}</span></h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))" }}>
          {upcoming.map((e) => (
            <button key={e.id} type="button" onClick={() => { setSelId(e.id); setMonth(new Date(new Date(e.startsAt).getFullYear(), new Date(e.startsAt).getMonth(), 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="p-card p-5 text-left flex flex-col gap-2.5" style={{ borderColor: sel?.id === e.id ? "var(--p-accent)" : undefined }}>
              <span className="flex items-center justify-between gap-2"><span className="p-pill">{e.live ? "● En direct" : KIND[e.kind]}</span>{e.hiveName && <span className="text-[12px] p-faint truncate">Ruche {e.hiveName}</span>}</span>
              <span className="serif text-[24px] leading-tight">{e.title}</span>
              <span className="text-[13.5px] p-muted">{longDate(new Date(e.startsAt))} · {hour(new Date(e.startsAt))}{e.days && e.days > 1 ? ` · ${e.days} jours` : ""}</span>
              <span className="flex items-center gap-2.5 mt-1"><Avatar m={e.host} size={30} /><span className="text-[13px] p-muted">Avec {e.host.name}</span></span>
              <span className="flex items-center justify-between gap-2 pt-2.5 border-t text-[12.5px]" style={{ borderColor: "var(--p-line)" }}><span className="flex items-center gap-2"><Faces list={e.faces} /><span className="p-muted">{plural(e.taken, "inscrit", "inscrits")}{e.maxSeats ? ` / ${e.maxSeats}` : ""}</span></span>{(e.registered || e.waitlisted) && <span className="font-medium" style={{ color: "var(--p-accent-text)" }}>{e.registered ? "✓ Inscrite" : "Liste d’attente"}</span>}</span>
            </button>
          ))}
        </div>
        {upcoming.length === 0 && <div className="p-soft p-8 text-center p-muted">Rien de programmé dans cette catégorie.</div>}
      </section>
    </>
  );
}

function Detail({ e, onToggle, pending, onEdit, onDeleted }: { e: Ev; onToggle: () => void; pending: boolean; onEdit: () => void; onDeleted: () => void }) {
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = useState(false);
  const remove = trpc.events.remove.useMutation({ onSuccess: (r) => { utils.events.invalidate(); utils.dashboard.invalidate(); utils.hives.invalidate(); toast.success(`« ${r.title} » a été supprimé`); setConfirming(false); onDeleted(); }, onError: (err) => toast.error(err.message) });
  const s = new Date(e.startsAt);
  const full = !!e.maxSeats && e.taken >= e.maxSeats;
  const past = s < new Date() && !e.live;
  return (
    <section className="p-card overflow-hidden">
      <div className="p-6 text-white flex flex-col gap-2" style={{ background: e.kind === "salon" ? "linear-gradient(135deg,#A92B2A,#4A211C)" : "linear-gradient(135deg,#141211,#46403C)" }}>
        <span className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.26em] text-white/80">{e.kind === "salon" ? <Radio size={14} /> : e.kind === "online" ? <Video size={14} /> : <MapPin size={14} />} {e.live ? "En direct maintenant" : KIND[e.kind]}{e.hiveName ? ` · Ruche ${e.hiveName}` : ""}</span>
        <h2 className="m-0 text-[32px] leading-tight text-white">{e.title}</h2>
      </div>
      <div className="p-6 flex flex-col gap-4">
        <dl className="m-0 grid gap-x-3 gap-y-2 text-[14.5px]" style={{ gridTemplateColumns: "20px 1fr" }}>
          <dt className="p-muted pt-0.5"><Clock size={15} /></dt><dd className="m-0">{longDate(s)}{e.days && e.days > 1 ? ` → ${e.days} jours` : ""} · {hour(s)} – {hour(addMin(s, e.durationMin))} <span className="p-faint">({duration(e.durationMin)})</span></dd>
          <dt className="p-muted pt-0.5"><MapPin size={15} /></dt><dd className="m-0">{e.where || (e.kind === "onsite" ? e.city : "En ligne")}{e.lang ? ` · ${e.lang}` : ""}</dd>
          <dt className="p-muted pt-0.5"><Users size={15} /></dt><dd className="m-0">{plural(e.taken, "inscrit", "inscrits")}{e.maxSeats ? ` sur ${e.maxSeats} places` : ""}{full ? " · complet" : ""}</dd>
        </dl>
        <AccessInfo e={e} />
        {e.description && <p className="m-0 text-[15.5px] leading-relaxed">{e.description}</p>}
        <div className="p-soft p-4 flex gap-3.5">
          <Avatar m={e.host} size={56} />
          <span className="flex flex-col gap-1 min-w-0"><span className="text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--p-gold)" }}>{e.withLine || "Intervenant"}</span><span className="text-[16px] font-semibold">{e.host.name}{e.isMine ? " (vous)" : ""}</span><span className="text-[13px] p-muted">{e.host.role}</span>{e.host.bio && <span className="text-[13.5px] leading-relaxed mt-1">{e.host.bio}</span>}</span>
        </div>
        {e.faces.length > 0 && <span className="flex items-center gap-2 text-[13px] p-muted"><Faces list={e.faces} /> {e.faces.map((f) => f.name.split(" ")[0]).join(", ")}{e.taken > e.faces.length ? ` et ${e.taken - e.faces.length} autres` : ""} y participent</span>}
        {past ? <span className="p-chip h-11 justify-center cursor-default p-muted">Événement passé</span>
          : e.isMine ? <span className="p-chip h-11 justify-center cursor-default">Vous animez cet événement</span>
          : <button type="button" className={e.registered || e.waitlisted ? "p-btn-outline" : "p-btn-primary"} disabled={pending} onClick={onToggle}>{e.registered ? "✓ Inscrite · se désinscrire" : e.waitlisted ? "Sur liste d’attente · retirer" : full ? "Rejoindre la liste d’attente" : e.live ? "Rejoindre maintenant" : "Je m’inscris"}</button>}
        {e.hiveId && <Link to={`/ruches/${e.hiveId}`} className="p-btn-ghost self-start no-underline">Voir la ruche →</Link>}
        {e.canEdit && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t" style={{ borderColor: "var(--p-line)" }}>
            {!confirming ? (
              <>
                <button type="button" className="p-btn-outline p-btn-sm" onClick={onEdit}><Pencil size={14} /> Modifier</button>
                <button type="button" className="p-btn-ghost text-[13.5px]" style={{ color: "var(--p-accent-text)" }} onClick={() => setConfirming(true)}><Trash2 size={14} /> Supprimer</button>
              </>
            ) : (
              <>
                <span className="text-[13.5px] flex-[1_1_100%]">Supprimer cet événement ? {e.taken > 1 ? `Les ${e.taken} inscriptions seront annulées.` : ""}</span>
                <button type="button" className="p-btn-primary p-btn-sm" disabled={remove.isPending} onClick={() => remove.mutate({ id: e.id })}>Oui, supprimer</button>
                <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setConfirming(false)}>Annuler</button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const KINDS = [["salon", "Salon live"], ["online", "En ligne"], ["onsite", "Présentiel"]] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** Création (ou modification) d’un événement du cercle. Membre simple : soumis à validation. */
function EventForm({ initial, onDone }: { initial: Ev | null; onDone: () => void }) {
  const utils = trpc.useUtils();
  const me = trpc.members.me.useQuery();
  const isOrganizer = !!me.data?.isOrganizer;
  const refresh = () => { utils.events.invalidate(); utils.hives.invalidate(); utils.dashboard.invalidate(); };
  const create = trpc.events.create.useMutation({ onSuccess: (r) => { refresh(); toast.success(r.status === "published" ? "Événement publié dans le programme" : "Proposition envoyée à l’équipe Présence pour validation"); onDone(); }, onError: (e) => toast.error(e.message) });
  const update = trpc.events.update.useMutation({ onSuccess: () => { refresh(); toast.success("Événement mis à jour"); onDone(); }, onError: (e) => toast.error(e.message) });
  const d0 = initial ? new Date(initial.startsAt) : null;
  const [f, setF] = useState({
    kind: (initial?.kind ?? "salon") as "salon" | "online" | "onsite",
    title: initial?.title ?? "", description: initial?.description ?? "",
    date: d0 ? `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}` : "",
    time: d0 ? `${pad(d0.getHours())}:${pad(d0.getMinutes())}` : "20:00",
    durationMin: initial?.durationMin ?? 45, maxSeats: initial?.maxSeats ?? 10,
    city: initial?.city ?? "", address: initial?.address ?? "", meetingUrl: initial?.meetingUrl ?? "",
  });
  const pending = create.isPending || update.isPending;
  const submit = () => {
    const data = { kind: f.kind, title: f.title, description: f.description, startsAt: new Date(`${f.date}T${f.time || "20:00"}:00`), durationMin: f.durationMin, maxSeats: f.maxSeats || undefined, city: f.kind === "onsite" ? f.city : undefined, address: f.kind === "onsite" ? f.address : "", meetingUrl: f.kind === "onsite" ? "" : f.meetingUrl };
    if (initial) update.mutate({ ...data, id: initial.id }); else create.mutate(data);
  };
  return (
    <section className="p-card p-6 flex flex-col gap-4 mb-7" style={{ borderColor: "var(--p-accent-line)" }}>
      <div>
        <h2 className="m-0 text-[30px]">{initial ? "Modifier l’événement" : isOrganizer ? "Créer un événement" : "Proposer un événement"}</h2>
        <p className="m-0 text-[14.5px] p-muted">{initial ? "Les personnes inscrites verront les nouvelles informations." : isOrganizer ? "Il sera publié directement dans le programme du cercle." : "Votre proposition sera relue par l’équipe Présence avant d’apparaître dans le programme."} L’adresse et le lien de la visio ne sont communiqués qu’aux personnes inscrites.</p>
      </div>
      <div className="flex flex-wrap gap-2">{KINDS.map(([k, l]) => <button key={k} type="button" className={`p-chip h-9 ${f.kind === k ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, kind: k, durationMin: k === "salon" ? 45 : f.durationMin === 45 ? 90 : f.durationMin })}>{l}</button>)}</div>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Titre</span><input className="p-field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={f.kind === "onsite" ? "Ex. Dîner du cercle à Lyon" : "Ex. Dire non sans se justifier"} /></label>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Description</span><textarea className="p-field" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="De quoi parlera-t-on, et pour qui ?" /></label>
      <div className="flex flex-wrap gap-3">
        <label className="flex-[1_1_160px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Date</span><input type="date" className="p-field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="flex-[1_1_120px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Heure</span><input type="time" className="p-field" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
        <label className="flex-[1_1_120px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Durée (min)</span><input type="number" min={15} step={15} className="p-field" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></label>
        <label className="flex-[1_1_120px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Places</span><input type="number" min={2} className="p-field" value={f.maxSeats} onChange={(e) => setF({ ...f, maxSeats: Number(e.target.value) })} /></label>
      </div>
      <AccessFields kind={f.kind} city={f.city} address={f.address} meetingUrl={f.meetingUrl} onChange={(p) => setF({ ...f, ...p })} />
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className="p-btn-primary" disabled={!f.title.trim() || !f.date || !accessReady(f.kind, f.address, f.meetingUrl) || pending} onClick={submit}>{initial ? "Enregistrer" : isOrganizer ? "Publier l’événement" : "Envoyer ma proposition"}</button>
        <button type="button" className="p-btn-outline" onClick={onDone}>Annuler</button>
      </div>
    </section>
  );
}

/** Membre : suivi de ses propositions en attente ou refusées. */
function MyProposals() {
  const utils = trpc.useUtils();
  const mine = trpc.events.myProposals.useQuery();
  const remove = trpc.events.remove.useMutation({ onSuccess: () => { utils.events.invalidate(); toast("Proposition retirée"); } });
  if (!mine.data?.length) return null;
  return (
    <section className="mb-7 flex flex-col gap-2.5">
      <h2 className="m-0 text-[24px]">Mes propositions</h2>
      {mine.data.map((p) => (
        <div key={p.id} className="p-card p-4 flex flex-wrap items-center gap-3">
          <span className="flex-[1_1_240px] min-w-0 flex flex-col"><span className="font-semibold truncate">{p.title}</span><span className="text-[13px] p-muted">{longDate(new Date(p.startsAt))} · {hour(new Date(p.startsAt))} · {p.where}</span></span>
          {p.status === "pending" ? <span className="flex items-center gap-1.5 text-[13.5px] font-medium" style={{ color: "var(--p-gold)" }}><Hourglass size={15} /> En attente de validation</span> : <span className="flex items-center gap-1.5 text-[13.5px] p-muted"><XCircle size={15} /> Non retenue</span>}
          <button type="button" className="p-btn-ghost text-[13.5px]" onClick={() => remove.mutate({ id: p.id })}>{p.status === "pending" ? "Retirer" : "Effacer"}</button>
        </div>
      ))}
    </section>
  );
}

/** Administratrice : propositions des membres à valider. */
function PendingEvents() {
  const utils = trpc.useUtils();
  const pending = trpc.events.pending.useQuery();
  const decide = trpc.events.decide.useMutation({ onSuccess: (_r, v) => { utils.events.invalidate(); utils.dashboard.invalidate(); toast.success(v.accept ? "Événement publié" : "Proposition refusée"); }, onError: (e) => toast.error(e.message) });
  if (!pending.data?.length) return null;
  return (
    <section className="mb-7 p-5 sm:p-6 rounded-3xl flex flex-col gap-3" style={{ background: "var(--p-accent-soft)", border: "1px solid var(--p-accent-line)" }}>
      <div><span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-accent-text)" }}><ShieldCheck size={14} /> Équipe Présence · à valider</span><h2 className="m-0 text-[26px] leading-tight">{plural(pending.data.length, "événement proposé", "événements proposés")}</h2></div>
      {pending.data.map((e) => (
        <article key={e.id} className="p-card p-4 flex flex-wrap gap-4 items-start">
          <Avatar m={e.host} size={44} />
          <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-1">
            <span className="text-[13px] p-muted">Proposé par {e.host.name} · {KIND[e.kind]}</span>
            <span className="serif text-[22px] leading-tight">{e.title}</span>
            <span className="text-[13.5px]">{longDate(new Date(e.startsAt))} · {hour(new Date(e.startsAt))} · {duration(e.durationMin)}{e.maxSeats ? ` · ${e.maxSeats} places` : ""}</span>
            <span className="text-[13px] p-muted">{e.kind === "onsite" ? e.address : e.meetingUrl}</span>
            {e.description && <p className="m-0 text-[14.5px] leading-relaxed">{e.description}</p>}
          </div>
          <div className="flex gap-2 self-center">
            <button type="button" className="p-btn-primary p-btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: e.id, accept: true })}>Publier</button>
            <button type="button" className="p-btn-outline p-btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: e.id, accept: false })}>Refuser</button>
          </div>
        </article>
      ))}
    </section>
  );
}
