import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowLeft, Eye, ImagePlus, Move, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { AccessFields, accessReady } from "@/components/EventAccess";
import { eventCover } from "@/components/events/cover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useLeaveWarning } from "@/pages/admin/construire/EditorParts";
import { EventBody, type Ev } from "@/pages/EventPage";
import { COVERS } from "@/pages/Ruches";
import { useUpload } from "@/lib/upload";
import { parisHour, parisInputs, parisLongDate, parisToDate } from "@/lib/format";
import { datesBetween, HORIZON_DAYS, REPEAT_LABEL, REPEATS, type Repeat } from "../../../server/lib/recurrence";

type Managed = RouterOutputs["events"]["manage"];
type CoverKey = "" | "rouge" | "or" | "vin" | "bronze" | "nuit" | "braise";
const CENTER = "50% 50%";
const clampPercent = (n: number) => Math.round(Math.min(100, Math.max(0, n)));
const percents = (position: string) => { const [x, y] = position.split(" ").map((p) => parseFloat(p)); return { x: x ?? 50, y: y ?? 50 }; };
const KINDS = [["onsite", "Présentiel"], ["online", "Visio"], ["salon", "Salon live"]] as const;
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/**
 * Créer ou modifier un événement, dans une fenêtre au centre de l'écran : les détails, le visuel, et l'aperçu de la page avant de publier.
 * Le formulaire s'adapte : « Proposer » pour un membre, « Publier » pour un organisateur ou une administratrice.
 * Depuis une ruche (hive), aucun réglage de visibilité : l'événement reste réservé à ses membres.
 */
export function EventForm({ initial, hive, onDone }: { initial?: Managed | null; hive?: { id: number; name: string } | null; onDone: (r?: { slug: string; status?: string }) => void }) {
  const utils = trpc.useUtils();
  const me = trpc.members.me.useQuery();
  const choices = trpc.events.speakerChoices.useQuery();
  const cfg = trpc.uploads.config.useQuery();
  const photo = useUpload("eventImage");
  const hiveId = initial ? initial.hiveId : hive?.id ?? null;
  const canPublish = !!me.data?.permissions.publishEventsDirectly || !!hiveId;
  const refresh = () => { utils.events.invalidate(); utils.hives.invalidate(); utils.dashboard.invalidate(); };
  const create = trpc.events.create.useMutation({
    onSuccess: (r) => { refresh(); toast.success(r.status !== "published" ? "Proposition envoyée à l’équipe Présence pour validation" : r.dates > 1 ? `Série publiée : ${r.dates} dates créées, la suite viendra d’elle-même` : "Événement publié"); onDone(r); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.events.update.useMutation({
    onSuccess: (r) => { refresh(); toast.success(r.restricted && r.registered ? `Événement mis à jour : ${r.registered > 1 ? `les ${r.registered} personnes déjà inscrites gardent leur place` : "la personne déjà inscrite garde sa place"}.` : r.following ? `Événement mis à jour, avec ${r.following} autre${r.following > 1 ? "s" : ""} date${r.following > 1 ? "s" : ""}` : "Événement mis à jour"); onDone(r); },
    onError: (e) => toast.error(e.message),
  });
  const start = initial ? parisInputs(new Date(initial.startsAt)) : { date: "", time: "19:00" };
  const [f, setF] = useState({
    kind: (initial?.kind ?? "onsite") as "onsite" | "online" | "salon",
    title: initial?.title ?? "",
    tagline: initial?.tagline ?? "",
    description: initial?.description ?? "",
    program: initial?.program ?? "",
    takeaways: (initial?.takeaways ?? []).join("\n"),
    faq: initial?.faq ?? ([] as { q: string; a: string }[]),
    photoUrl: initial?.photoUrl ?? "",
    cover: (initial?.cover ?? "") as CoverKey,
    photoPosition: initial?.photoPosition ?? CENTER,
    repeat: "" as Repeat | "",
    until: "",
    scope: "one" as "one" | "following",
    date: start.date,
    time: start.time,
    durationMin: initial?.durationMin ?? 60,
    maxSeats: initial?.maxSeats ?? ("" as number | ""),
    city: initial?.city ?? "",
    address: initial?.address ?? "",
    meetingUrl: initial?.meetingUrl ?? "",
    visibility: (initial?.visibility ?? "membres") as "membres" | "public",
    type: (initial?.type ?? "standard") as "standard" | "bienvenue",
    speakerIds: (initial?.speakers ?? []).map((s) => s.id),
    slug: initial?.slug ?? "",
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [search, setSearch] = useState("");
  const [editSlug, setEditSlug] = useState(false);
  const [view, setView] = useState<"details" | "apercu">("details");
  const [leaving, setLeaving] = useState(false);
  const pending = create.isPending || update.isPending;
  const startValues = useRef(JSON.stringify(f));
  const dirty = JSON.stringify(f) !== startValues.current;
  useLeaveWarning(dirty);
  // Fermer par erreur ne doit pas faire perdre ce qui est saisi
  const leave = () => { if (dirty) setLeaving(true); else onDone(); };

  const pickPhoto = async (file?: File) => {
    if (!file) return;
    if (file.size > (cfg.data?.maxMb.eventImage ?? 10) * 1048576) return void toast.error(`La photo dépasse ${cfg.data?.maxMb.eventImage ?? 10} Mo.`);
    try { set({ photoUrl: (await photo.upload(file)).publicUrl ?? "", photoPosition: CENTER }); } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); }
  };

  // Cadrer la photo : elle suit le curseur ou le doigt sans repeindre le formulaire, et le cadrage s'enregistre au relâchement
  const frame = useRef<HTMLImageElement>(null);
  const grab = useRef<{ x: number; y: number; from: { x: number; y: number }; roomX: number; roomY: number } | null>(null);
  const startFraming = (e: PointerEvent<HTMLDivElement>) => {
    const img = frame.current;
    if (!img || e.button !== 0 || (e.target as HTMLElement).closest("button, label")) return;
    const box = img.getBoundingClientRect();
    const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    grab.current = { x: e.clientX, y: e.clientY, from: percents(f.photoPosition), roomX: img.naturalWidth * scale - box.width, roomY: img.naturalHeight * scale - box.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const positionAt = (e: PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g) return null;
    const x = g.roomX > 0 ? clampPercent(g.from.x - ((e.clientX - g.x) / g.roomX) * 100) : g.from.x;
    const y = g.roomY > 0 ? clampPercent(g.from.y - ((e.clientY - g.y) / g.roomY) * 100) : g.from.y;
    return `${x}% ${y}%`;
  };
  const moveFraming = (e: PointerEvent<HTMLDivElement>) => { const p = positionAt(e); if (p && frame.current) frame.current.style.objectPosition = p; };
  const endFraming = (e: PointerEvent<HTMLDivElement>) => { const p = positionAt(e); grab.current = null; if (p) set({ photoPosition: p }); };
  const nudgeFraming = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key];
    if (!step || !f.photoUrl) return;
    e.preventDefault();
    const { x, y } = percents(f.photoPosition);
    set({ photoPosition: `${clampPercent(x + step[0])}% ${clampPercent(y + step[1])}%` });
  };

  const submit = () => {
    const data = {
      kind: f.kind, title: f.title, tagline: f.tagline, description: f.description, program: f.program, takeaways: lines(f.takeaways),
      faq: f.faq.filter((x) => x.q.trim() && x.a.trim()), photoUrl: f.photoUrl, cover: f.cover, photoPosition: f.photoPosition, repeat: f.repeat || null, until: f.repeat && f.until ? parisToDate(f.until, "23:59") : null, startsAt: parisToDate(f.date, f.time), durationMin: f.durationMin,
      city: f.kind === "onsite" ? f.city : undefined, address: f.kind === "onsite" ? f.address : "", meetingUrl: f.kind === "onsite" ? "" : f.meetingUrl,
      maxSeats: f.maxSeats === "" ? null : f.maxSeats, visibility: f.visibility, type: f.type, speakerIds: f.speakerIds, slug: f.slug.trim() || undefined, hiveId,
    };
    if (initial) update.mutate({ ...data, id: initial.id, scope: f.scope }); else create.mutate(data);
  };

  const people = choices.data ?? [];
  const chosen = f.speakerIds.map((id) => people.find((p) => p.id === id)).filter((p): p is (typeof people)[number] => !!p);
  const needle = search.trim().toLowerCase();
  const found = needle ? people.filter((p) => !f.speakerIds.includes(p.id) && p.name.toLowerCase().includes(needle)).slice(0, 6) : [];
  const ready = f.title.trim() && f.date && accessReady(f.kind, f.address, f.meetingUrl) && !pending && !photo.busy;
  const missing = [!f.title.trim() && "le titre", !f.date && "la date", !accessReady(f.kind, f.address, f.meetingUrl) && (f.kind === "onsite" ? "l’adresse" : "le lien de la visio")].filter(Boolean);
  const canPreview = !!f.title.trim() && !!f.date;
  // Les prochaines dates d'une série en cours de création : on voit tout de suite ce que le rythme donnera
  const firstDate = f.date ? parisToDate(f.date, f.time) : null;
  const nextDates = f.repeat && firstDate ? datesBetween(firstDate, f.repeat, firstDate, f.until ? parisToDate(f.until, "23:59") : new Date(firstDate.getTime() + HORIZON_DAYS * 86400000)) : [];
  const canRepeat = canPublish && !initial?.seriesId && (!initial || initial.status === "published");
  const title = initial ? "Modifier l’événement" : hive ? `Créer un événement de ${hive.name}` : canPublish ? "Créer un événement" : "Proposer un événement";
  const intro = initial ? "Les personnes inscrites verront les nouvelles informations." : hive ? "Il reste réservé aux membres de la ruche." : canPublish ? "Il sera publié directement." : "Votre proposition sera relue par l’équipe Présence.";

  /** L'événement tel qu'un membre connecté, pas encore inscrit, le verra. */
  const previewEvent = (): Ev => {
    const hostId = initial?.hostId ?? me.data?.id;
    return {
      id: initial?.id ?? 0, slug: f.slug || "apercu", replay: null, title: f.title, tagline: f.tagline, description: f.description, program: f.program, takeaways: lines(f.takeaways),
      faq: f.faq.filter((x) => x.q.trim() && x.a.trim()), photoUrl: f.photoUrl || null, photoPosition: f.photoPosition, cover: f.cover, kind: f.kind,
      series: initial?.series ? { label: initial.series.label, dates: initial.series.dates.filter((d) => !d.cancelled && d.slug !== initial.slug).slice(0, 6) } : f.repeat ? { label: REPEAT_LABEL[f.repeat], dates: nextDates.slice(0, 6).map((d) => ({ slug: d.toISOString(), startsAt: d })) } : null, type: f.type, visibility: hiveId ? "membres" : f.visibility, status: "published",
      startsAt: parisToDate(f.date, f.time), durationMin: f.durationMin, days: initial?.days ?? 1, city: f.kind === "onsite" ? f.city : null, where: f.kind === "onsite" ? f.city || "Présentiel" : "En ligne",
      hive: initial?.hive ?? hive ?? null, host: people.find((p) => p.id === hostId) ?? { id: hostId ?? 0, name: "", initials: "", photoUrl: null, jobTitle: "" }, speakers: chosen,
      maxSeats: f.maxSeats === "" ? null : f.maxSeats, taken: 0, seatsLeft: f.maxSeats === "" ? null : f.maxSeats, cancelled: false, past: false, registered: false, waitlisted: false, canRegister: false, canManage: false,
      address: "", meetingUrl: "", hasAccessInfo: !!(f.kind === "onsite" ? f.address : f.meetingUrl),
    };
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) leave(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} onInteractOutside={(e) => e.preventDefault()}
        className={`p-0 gap-0 flex flex-col overflow-hidden rounded-2xl w-full max-w-[calc(100%-1rem)] max-h-[94dvh] ${view === "apercu" ? "sm:max-w-[min(94vw,1120px)]" : "sm:max-w-[760px]"}`}
        style={{ background: "var(--p-bg)", color: "var(--p-ink)", borderColor: "var(--p-line)" }}>
        <header className="flex items-center gap-3 px-5 py-3.5 border-b flex-none" style={{ borderColor: "var(--p-line)", background: "var(--p-surface)" }}>
          <DialogTitle className="serif text-[26px] font-normal leading-tight flex-1 min-w-0">{view === "apercu" ? "Aperçu de la page" : title}</DialogTitle>
          <button type="button" aria-label="Fermer" className="w-9 h-9 rounded-full flex items-center justify-center flex-none p-muted hover:bg-black/5 dark:hover:bg-white/5" onClick={leave}><X size={18} /></button>
        </header>

        <div key={view} className="flex-1 min-h-0 overflow-y-auto">
          {view === "apercu" ? (
            <>
              <p className="m-0 px-5 py-2.5 text-[13.5px] text-center" style={{ background: "var(--p-accent-soft)" }}>Voici la page telle que la verront les membres. {initial ? "Vos changements ne sont pas encore enregistrés." : "Rien n’est encore publié."}</p>
              <EventBody e={previewEvent()} connected retour="" preview />
            </>
          ) : (
    <div className="p-5 sm:p-6 flex flex-col gap-4">
      <p className="m-0 text-[14.5px] p-muted">{intro} L’adresse et le lien de la visio ne sont communiqués qu’aux personnes inscrites.</p>

      <div className="flex flex-col gap-2" aria-label="Visuel de l’événement">
        <span className="text-[13.5px] p-muted">Visuel</span>
        {/* Même proportion que la page : le cadrage choisi ici est celui que les membres verront */}
        <div className={`relative overflow-hidden rounded-2xl select-none ${f.photoUrl ? "aspect-[16/10] sm:aspect-[21/9] cursor-grab active:cursor-grabbing touch-none" : "h-[170px] sm:h-[190px]"}`} style={{ background: eventCover(f) }}
          tabIndex={f.photoUrl ? 0 : undefined} aria-label={f.photoUrl ? "Cadrage de la photo : faites-la glisser, ou utilisez les flèches du clavier" : undefined}
          onPointerDown={startFraming} onPointerMove={moveFraming} onPointerUp={endFraming} onPointerCancel={() => { grab.current = null; if (frame.current) frame.current.style.objectPosition = f.photoPosition; }} onKeyDown={nudgeFraming}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pickPhoto(e.dataTransfer.files[0]); }}>
          {f.photoUrl && <img ref={frame} src={f.photoUrl} alt="Visuel de l’événement" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ objectPosition: f.photoPosition }} />}
          {f.photoUrl && <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-black/60 text-white text-[12.5px] pointer-events-none"><Move size={14} /> Faites glisser la photo pour la cadrer</span>}
          <div className="absolute right-2.5 bottom-2.5 flex flex-wrap justify-end gap-2">
            <label className="p-btn-white p-btn-sm cursor-pointer">
              <input type="file" accept={PHOTO_ACCEPT} className="hidden" aria-label="Importer une image" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
              <ImagePlus size={15} /> {photo.busy ? `Envoi… ${photo.progress ?? 0} %` : f.photoUrl ? "Changer l’image" : "Importer une image"}
            </label>
            {f.photoUrl && <button type="button" className="p-btn-white p-btn-sm" onClick={() => set({ photoUrl: "" })}><X size={15} /> Retirer</button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] p-muted">Ou une couleur :</span>
          {(Object.keys(COVERS) as CoverKey[]).map((k) => <button key={k} type="button" aria-label={`Couleur ${k}`} aria-pressed={!f.photoUrl && f.cover === k} className="w-[52px] h-8 rounded-lg" style={{ background: COVERS[k], boxShadow: !f.photoUrl && f.cover === k ? "0 0 0 2px var(--p-bg), 0 0 0 4px var(--p-ink)" : "none" }} onClick={() => set({ cover: k, photoUrl: "" })} />)}
        </div>
        <span className="text-[12px] p-muted">Image jpg, png ou webp, jusqu’à {cfg.data?.maxMb.eventImage ?? 10} Mo. Vous pouvez aussi la déposer sur le visuel.</span>
      </div>

      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Titre</span><input className="p-field" maxLength={200} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex. Dîner du cercle à Lyon" /></label>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Accroche <span className="p-faint">· une phrase qui donne envie de venir</span></span><input className="p-field" maxLength={240} value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} /></label>

      <div className="flex flex-wrap gap-2">{KINDS.map(([k, l]) => <button key={k} type="button" aria-pressed={f.kind === k} className={`p-chip h-9 ${f.kind === k ? "p-chip-on" : ""}`} onClick={() => set({ kind: k })}>{l}</button>)}</div>
      <div className="flex flex-wrap gap-3">
        <label className="flex-[1_1_160px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Date</span><input type="date" className="p-field" value={f.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="flex-[1_1_120px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Heure <span className="p-faint">· de Paris</span></span><input type="time" className="p-field" value={f.time} onChange={(e) => set({ time: e.target.value })} /></label>
        <label className="flex-[1_1_110px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Durée (min)</span><input type="number" min={15} step={15} className="p-field" value={f.durationMin} onChange={(e) => set({ durationMin: Number(e.target.value) })} /></label>
        <label className="flex-[1_1_110px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Places <span className="p-faint">· facultatif</span></span><input type="number" min={2} className="p-field" value={f.maxSeats} onChange={(e) => set({ maxSeats: e.target.value === "" ? "" : Number(e.target.value) })} /></label>
      </div>
      {initial?.series && !initial.series.stopped && (
        <div className="flex flex-col gap-2 p-4 rounded-2xl" style={{ background: "var(--p-surface-2)" }}>
          <span className="text-[14px]">Cette date fait partie d’une série : <b className="font-semibold">{initial.series.label.toLowerCase()}</b>. Appliquer mes changements à :</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={f.scope === "one"} className={`p-chip h-9 ${f.scope === "one" ? "p-chip-on" : ""}`} onClick={() => set({ scope: "one" })}>Cette date seulement</button>
            <button type="button" aria-pressed={f.scope === "following"} className={`p-chip h-9 ${f.scope === "following" ? "p-chip-on" : ""}`} onClick={() => set({ scope: "following" })}>Cette date et les suivantes{initial.series.following ? ` (${initial.series.following + 1})` : ""}</button>
          </div>
        </div>
      )}
      {canRepeat && (
        <div className="flex flex-col gap-2 p-4 rounded-2xl" style={{ background: "var(--p-surface-2)" }}>
          <span className="text-[13.5px] p-muted">Répétition</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={!f.repeat} className={`p-chip h-9 ${!f.repeat ? "p-chip-on" : ""}`} onClick={() => set({ repeat: "" })}>Une seule fois</button>
            {REPEATS.map((r) => <button key={r} type="button" aria-pressed={f.repeat === r} className={`p-chip h-9 ${f.repeat === r ? "p-chip-on" : ""}`} onClick={() => set({ repeat: r })}>{REPEAT_LABEL[r]}</button>)}
          </div>
          {f.repeat && (
            <>
              <label className="flex flex-col gap-1.5 text-[13.5px] p-muted sm:max-w-[260px]"><span>Jusqu’au <span className="p-faint">· facultatif</span></span><input type="date" className="p-field" min={f.date || undefined} value={f.until} onChange={(e) => set({ until: e.target.value })} /></label>
              <span className="text-[13px] p-muted">{f.until ? "La série s’arrêtera à cette date." : "Sans date de fin, la série continue d’elle-même : les dates se créent trois mois à l’avance. Vous pourrez l’arrêter à tout moment."} Chaque date a sa page et ses inscrits.</span>
              {nextDates.length > 0 && <span className="text-[13px]">Dates suivantes : {nextDates.slice(0, 3).map((d) => `${parisLongDate(d)} · ${parisHour(d)}`).join(", ")}{nextDates.length > 3 ? "…" : ""}</span>}
            </>
          )}
        </div>
      )}
      <AccessFields kind={f.kind} city={f.city} address={f.address} meetingUrl={f.meetingUrl} onChange={(p) => set(p)} />

      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Présentation</span><textarea className="p-field" rows={3} maxLength={4000} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="De quoi parlera-t-on, et pour qui ?" /></label>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Programme <span className="p-faint">· une étape par ligne, facultatif</span></span><textarea className="p-field" rows={3} maxLength={4000} value={f.program} onChange={(e) => set({ program: e.target.value })} placeholder={"19h : accueil\n19h30 : table ronde"} /></label>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Ce que l’on repart avec <span className="p-faint">· une idée par ligne, facultatif</span></span><textarea className="p-field" rows={3} value={f.takeaways} onChange={(e) => set({ takeaways: e.target.value })} /></label>

      <div className="flex flex-col gap-2">
        <span className="text-[13.5px] p-muted">Intervenants <span className="p-faint">· facultatif</span></span>
        {chosen.length > 0 && <div className="flex flex-wrap gap-1.5">{chosen.map((p) => <span key={p.id} className="p-chip h-10 pl-1.5 cursor-default"><Avatar m={p} size={28} /> {p.name}<button type="button" aria-label={`Retirer ${p.name}`} className="p-muted ml-0.5" onClick={() => set({ speakerIds: f.speakerIds.filter((x) => x !== p.id) })}><X size={14} /></button></span>)}</div>}
        <span className="relative"><Search size={15} className="absolute left-3 top-[15px] p-faint" /><input className="p-field pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un membre" aria-label="Rechercher un intervenant" /></span>
        {found.length > 0 && <div className="flex flex-col gap-0.5 p-1 rounded-xl" style={{ background: "var(--p-surface-2)" }}>{found.map((p) => <button key={p.id} type="button" className="flex items-center gap-2.5 p-1.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5" onClick={() => { set({ speakerIds: [...f.speakerIds, p.id] }); setSearch(""); }}><Avatar m={p} size={32} /><span className="flex flex-col min-w-0"><span className="text-[14px] font-medium truncate">{p.name}</span><span className="text-[12px] p-muted truncate">{p.jobTitle}</span></span></button>)}</div>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13.5px] p-muted">Questions fréquentes <span className="p-faint">· facultatif</span></span>
        {f.faq.map((x, i) => (
          <div key={i} className="flex flex-col gap-1.5 p-3 rounded-xl" style={{ background: "var(--p-surface-2)" }}>
            <span className="flex gap-2"><input className="p-field flex-1 min-w-0" value={x.q} placeholder="La question" aria-label={`Question ${i + 1}`} onChange={(e) => set({ faq: f.faq.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)) })} /><button type="button" aria-label={`Retirer la question ${i + 1}`} className="w-11 h-[46px] flex-none flex items-center justify-center p-muted" onClick={() => set({ faq: f.faq.filter((_, j) => j !== i) })}><Trash2 size={16} /></button></span>
            <textarea className="p-field" rows={2} value={x.a} placeholder="La réponse" aria-label={`Réponse ${i + 1}`} onChange={(e) => set({ faq: f.faq.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)) })} />
          </div>
        ))}
        {f.faq.length < 10 && <button type="button" className="p-btn-ghost self-start" onClick={() => set({ faq: [...f.faq, { q: "", a: "" }] })}><Plus size={15} /> Ajouter une question</button>}
      </div>

      {!hiveId && (
        <div className="flex flex-col gap-3 p-4 rounded-2xl" style={{ background: "var(--p-surface-2)" }}>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13.5px] p-muted">Qui peut voir cet événement ?</span>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={f.visibility === "membres"} className={`p-chip h-9 ${f.visibility === "membres" ? "p-chip-on" : ""}`} onClick={() => set({ visibility: "membres" })}>Tous les membres connectés</button>
              <button type="button" aria-pressed={f.visibility === "public"} className={`p-chip h-9 ${f.visibility === "public" ? "p-chip-on" : ""}`} onClick={() => set({ visibility: "public" })}>Public</button>
            </div>
            <span className="text-[12.5px] p-muted">{f.visibility === "public" ? "La page se lit sans compte et s’aperçoit sur LinkedIn. Seuls les membres s’inscrivent." : "Le lien demande de se connecter ; l’aperçu de partage reste générique."}</span>
          </div>
          {me.data?.permissions.publishEventsDirectly && (
            <label className="flex items-start gap-3 cursor-pointer">
              <Switch checked={f.type === "bienvenue"} onCheckedChange={(on) => set({ type: on ? "bienvenue" : "standard" })} aria-label="Réunion de bienvenue" className="mt-0.5" />
              <span className="flex flex-col"><span className="text-[14.5px] font-medium">Réunion de bienvenue</span><span className="text-[12.5px] p-muted">Proposée aux nouveaux membres dans « Mes premiers pas ». Choisissez une répétition pour proposer une nouvelle date régulièrement.</span></span>
            </label>
          )}
        </div>
      )}

      {editSlug || initial ? (
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Adresse de la page <span className="p-faint">· {initial ? "l’ancien lien ne fonctionnera plus si vous la changez" : "lettres, chiffres et tirets"}</span></span><span className="flex items-center gap-1.5"><span className="flex-none p-faint">/e/</span><input className="p-field flex-1 min-w-0" maxLength={100} value={f.slug} onChange={(e) => set({ slug: e.target.value })} placeholder="generee-depuis-le-titre" /></span></label>
      ) : <button type="button" className="p-btn-ghost self-start" onClick={() => setEditSlug(true)}>Choisir l’adresse de la page</button>}
    </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2.5 px-5 py-3.5 border-t flex-none" style={{ borderColor: "var(--p-line)", background: "var(--p-surface)" }}>
          {leaving ? (
            <>
              <span className="flex-[1_1_200px] text-[14px]">Abandonner ce que vous avez saisi ?</span>
              <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setLeaving(false)}>Continuer</button>
              <button type="button" className="p-btn-primary p-btn-sm" onClick={() => onDone()}>Abandonner</button>
            </>
          ) : (
            <>
              <span className="flex-[1_1_180px] min-w-0 text-[13px] p-muted">{missing.length ? `Il manque ${missing.join(", ")}.` : ""}</span>
              {view === "details"
                ? <button type="button" className="p-btn-outline p-btn-sm" disabled={!canPreview} title={canPreview ? undefined : "Indiquez d’abord le titre et la date"} onClick={() => setView("apercu")}><Eye size={15} /> Aperçu de la page</button>
                : <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setView("details")}><ArrowLeft size={15} /> Revenir aux détails</button>}
              <button type="button" className="p-btn-primary p-btn-sm" disabled={!ready} onClick={submit}>{pending ? "Envoi…" : initial ? "Enregistrer" : canPublish ? "Publier" : "Proposer"}</button>
            </>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
