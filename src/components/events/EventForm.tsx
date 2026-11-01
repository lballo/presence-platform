import { useRef, useState } from "react";
import { ArrowLeft, Eye, ImagePlus, Plus, Search, Trash2, X } from "lucide-react";
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
import { parisInputs, parisToDate } from "@/lib/format";

type Managed = RouterOutputs["events"]["manage"];
type CoverKey = "" | "rouge" | "or" | "vin" | "bronze" | "nuit" | "braise";
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
    onSuccess: (r) => { refresh(); toast.success(r.status === "published" ? "Événement publié" : "Proposition envoyée à l’équipe Présence pour validation"); onDone(r); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.events.update.useMutation({
    onSuccess: (r) => { refresh(); toast.success(r.restricted && r.registered ? `Événement mis à jour : ${r.registered > 1 ? `les ${r.registered} personnes déjà inscrites gardent leur place` : "la personne déjà inscrite garde sa place"}.` : "Événement mis à jour"); onDone(r); },
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
    try { set({ photoUrl: (await photo.upload(file)).publicUrl ?? "" }); } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); }
  };
  const submit = () => {
    const data = {
      kind: f.kind, title: f.title, tagline: f.tagline, description: f.description, program: f.program, takeaways: lines(f.takeaways),
      faq: f.faq.filter((x) => x.q.trim() && x.a.trim()), photoUrl: f.photoUrl, cover: f.cover, startsAt: parisToDate(f.date, f.time), durationMin: f.durationMin,
      city: f.kind === "onsite" ? f.city : undefined, address: f.kind === "onsite" ? f.address : "", meetingUrl: f.kind === "onsite" ? "" : f.meetingUrl,
      maxSeats: f.maxSeats === "" ? null : f.maxSeats, visibility: f.visibility, type: f.type, speakerIds: f.speakerIds, slug: f.slug.trim() || undefined, hiveId,
    };
    if (initial) update.mutate({ ...data, id: initial.id }); else create.mutate(data);
  };

  const people = choices.data ?? [];
  const chosen = f.speakerIds.map((id) => people.find((p) => p.id === id)).filter((p): p is (typeof people)[number] => !!p);
  const needle = search.trim().toLowerCase();
  const found = needle ? people.filter((p) => !f.speakerIds.includes(p.id) && p.name.toLowerCase().includes(needle)).slice(0, 6) : [];
  const ready = f.title.trim() && f.date && accessReady(f.kind, f.address, f.meetingUrl) && !pending && !photo.busy;
  const missing = [!f.title.trim() && "le titre", !f.date && "la date", !accessReady(f.kind, f.address, f.meetingUrl) && (f.kind === "onsite" ? "l’adresse" : "le lien de la visio")].filter(Boolean);
  const canPreview = !!f.title.trim() && !!f.date;
  const title = initial ? "Modifier l’événement" : hive ? `Créer un événement de ${hive.name}` : canPublish ? "Créer un événement" : "Proposer un événement";
  const intro = initial ? "Les personnes inscrites verront les nouvelles informations." : hive ? "Il reste réservé aux membres de la ruche." : canPublish ? "Il sera publié directement." : "Votre proposition sera relue par l’équipe Présence.";

  /** L'événement tel qu'un membre connecté, pas encore inscrit, le verra. */
  const previewEvent = (): Ev => {
    const hostId = initial?.hostId ?? me.data?.id;
    return {
      id: initial?.id ?? 0, slug: f.slug || "apercu", title: f.title, tagline: f.tagline, description: f.description, program: f.program, takeaways: lines(f.takeaways),
      faq: f.faq.filter((x) => x.q.trim() && x.a.trim()), photoUrl: f.photoUrl || null, cover: f.cover, kind: f.kind, type: f.type, visibility: hiveId ? "membres" : f.visibility, status: "published",
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
        <div className="relative overflow-hidden rounded-2xl h-[170px] sm:h-[190px]" style={{ background: eventCover(f) }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pickPhoto(e.dataTransfer.files[0]); }}>
          {f.photoUrl && <img src={f.photoUrl} alt="Visuel de l’événement" className="absolute inset-0 w-full h-full object-cover" />}
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
              <span className="flex flex-col"><span className="text-[14.5px] font-medium">Réunion de bienvenue</span><span className="text-[12.5px] p-muted">Proposée aux nouveaux membres dans « Mes premiers pas ». Créez un événement par date.</span></span>
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
