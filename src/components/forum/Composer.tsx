import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent } from "@tiptap/react";
import { ChevronDown, Hash, ImagePlus, Link2, Mic, Paperclip, Pin, ShieldCheck, Tag, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/providers/trpc";
import { fileSize, useUpload } from "@/lib/upload";
import { hour } from "@/lib/format";
import { EditorToolbar, IMAGE_ACCEPT, ToolButton, useRichEditor, type ToolPanel } from "./RichEditor";
import { VoiceRecorder } from "./VoiceRecorder";
import { AUDIENCES, OPP, SPACE_GROUPS, TagLabel, type OppType, type Post, type Space } from "./shared";
import { HELP, PAY_UNITS, SCHEDULES, WORK_MODES, jobFacts, parseJobFacts, type HelpKind, type Job, type PayUnit } from "./facts";
import { VIDEO_TIPS } from "@/content/accueil";

export type ComposerTarget =
  | { mode: "new"; spaceSlug?: string; announcement?: boolean; hive?: { id: number; name: string }; prefill?: { title: string; html: string }; tips?: boolean }
  | { mode: "edit"; post: Post };

type Attachment = { path: string; name: string; type: string; size: number };
type Form = {
  spaceId: number | null;
  title: string;
  html: string;
  coverUrl: string;
  videoUrl: string;
  attachments: Attachment[];
  hashtagIds: number[];
  pinned: boolean;
  audience: keyof typeof AUDIENCES;
  videoAudience: "tous" | "moderateurs"; // retour vidéo : la communauté ou les seuls modérateurs
  publishAt: string; // saisie locale « 2026-11-02T09:00 »
  endsAt: string;
  oppType: OppType;
  facts: string;
  job: Job; // recrutement
  help: HelpKind | ""; // entraide
};

const EMPTY_JOB: Job = { workMode: "", schedule: "", location: "", payAmount: "", payUnit: "mois" };

const MAX_HASHTAGS = 5;
const toLocalInput = (d: Date) => {
  const n = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${n(d.getMonth() + 1)}-${n(d.getDate())}T${n(d.getHours())}:${n(d.getMinutes())}`;
};
const textToHtml = (text: string) => text.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`).join("");
const hasContent = (f: Form) => !!(f.title.trim() || f.html || f.coverUrl || f.videoUrl || f.attachments.length);

function draftKeyOf(target: ComposerTarget) {
  if (target.mode === "edit") return `edit-${target.post.id}`;
  if (target.hive) return `hive-${target.hive.id}`;
  if (target.tips) return "presentation";
  return target.announcement ? "annonce" : "new";
}

/** Espace préréglé : celui qui est ouvert s'il est permis, sinon Conversations. */
function presetSpace(target: Extract<ComposerTarget, { mode: "new" }>, spaces: Space[]) {
  if (target.hive) return null;
  const postable = spaces.filter((s) => s.canPost);
  if (target.announcement) return postable.find((s) => s.kind === "annonces")?.id ?? null;
  return (postable.find((s) => s.slug === target.spaceSlug) ?? postable.find((s) => s.slug === "conversations") ?? postable[0])?.id ?? null;
}

function baseForm(target: ComposerTarget, spaces: Space[]): Form {
  const empty: Form = { spaceId: null, title: "", html: "", coverUrl: "", videoUrl: "", attachments: [], hashtagIds: [], pinned: false, audience: "tous", videoAudience: "tous", publishAt: "", endsAt: "", oppType: "recrut", facts: "", job: EMPTY_JOB, help: "" };
  if (target.mode === "new") return { ...empty, spaceId: presetSpace(target, spaces), ...(target.prefill ?? {}) };
  const p = target.post;
  return {
    spaceId: p.spaceId,
    title: p.title,
    html: p.html || (p.text ? textToHtml(p.text) : ""),
    coverUrl: p.coverUrl,
    videoUrl: p.videoUrl,
    attachments: p.attachments.map(({ path, name, type, size }) => ({ path, name, type, size })),
    hashtagIds: p.hashtags.map((t) => t.id),
    pinned: p.pinned,
    audience: p.audience === "moderateurs" ? "tous" : p.audience,
    videoAudience: p.audience === "moderateurs" ? "moderateurs" : "tous",
    publishAt: p.state === "scheduled" ? toLocalInput(new Date(p.publishedAt)) : "",
    endsAt: p.endsAt ? toLocalInput(new Date(p.endsAt)) : "",
    oppType: p.oppType ?? "recrut",
    // Une ancienne annonce de recrutement au format libre garde ses étiquettes dans le champ libre.
    facts: p.oppType === "recrut" && parseJobFacts(p.facts) ? "" : p.facts.join(", "),
    job: (p.oppType === "recrut" && parseJobFacts(p.facts)) || EMPTY_JOB,
    help: (Object.keys(HELP) as HelpKind[]).find((k) => p.facts[0] === HELP[k]) ?? "",
  };
}

/** Le formulaire de départ : la publication ou l'espace préréglé, complétés par le brouillon s'il existe. */
function startingForm(target: ComposerTarget, spaces: Space[], saved?: Partial<Form>): Form {
  const base = baseForm(target, spaces);
  if (!saved) return base;
  // L'espace ouvert garde la priorité sur celui du brouillon ; depuis le fil, on reprend celui du brouillon.
  const openedSpace = target.mode === "new" && !!(target.spaceSlug || target.announcement);
  const savedSpaceOk = spaces.some((s) => s.canPost && s.id === saved.spaceId);
  return { ...base, ...saved, job: { ...EMPTY_JOB, ...saved.job }, spaceId: !openedSpace && savedSpaceOk ? saved.spaceId! : base.spaceId };
}

function Shell({ onRequestClose, children }: { onRequestClose: () => void; children: ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onRequestClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        className="flex flex-col gap-0 p-0 overflow-hidden top-0 left-0 translate-x-0 translate-y-0 w-full max-w-none h-[100dvh] rounded-none border-0 sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-[720px] sm:h-auto sm:max-h-[90vh] sm:rounded-[18px] sm:border"
        style={{ background: "var(--p-surface)", color: "var(--p-ink)" }}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Fenêtre de publication : création, annonce et modification. Au centre de l'écran, plein écran sur téléphone. */
export default function Composer({ target, onClose, onSaved }: { target: ComposerTarget; onClose: () => void; onSaved?: (id: number) => void }) {
  const key = draftKeyOf(target);
  const spaces = trpc.forum.spaces.useQuery();
  const draft = trpc.forum.draft.useQuery({ key }, { gcTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false });
  if (!spaces.data || draft.isLoading) return <Shell onRequestClose={onClose}><DialogTitle className="sr-only">Fenêtre de publication</DialogTitle><p className="p-muted text-center py-16 m-0">Chargement…</p></Shell>;
  return <ComposerForm target={target} draftKey={key} spaces={spaces.data.spaces} canManage={spaces.data.canManage} saved={draft.data?.data as Partial<Form> | undefined} onClose={onClose} onSaved={onSaved} />;
}

function ComposerForm({ target, draftKey, spaces, canManage, saved, onClose, onSaved }: {
  target: ComposerTarget; draftKey: string; spaces: Space[]; canManage: boolean; saved?: Partial<Form>; onClose: () => void; onSaved?: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const cfg = trpc.uploads.config.useQuery();
  const tags = trpc.hashtags.list.useQuery();
  const restored = !!saved;
  const [initial] = useState(() => startingForm(target, spaces, saved));
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const [panel, setPanel] = useState<ToolPanel>(null);
  const togglePanel = (p: ToolPanel) => setPanel(panel === p ? null : p);
  const [videoLink, setVideoLink] = useState("");
  const [asking, setAsking] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showRestored, setShowRestored] = useState(restored);
  const canUpload = !!cfg.data?.enabled;

  const hive = target.mode === "new" ? target.hive : target.post.hive;
  const editing = target.mode === "edit";
  const legacyNoTitle = editing && !target.post.title; // publications d'avant les espaces, sans titre
  const space = spaces.find((s) => s.id === form.spaceId);
  const isAnnouncement = !!hive || space?.kind === "annonces";
  const isOpp = space?.kind === "opportunites";
  const needsVideo = space?.kind === "video";
  const isHelp = space?.slug === "entraide";
  const isJob = isOpp && form.oppType === "recrut";
  const job = jobFacts(form.job);
  const setJob = (patch: Partial<Job>) => setForm((f) => ({ ...f, job: { ...f.job, ...patch } }));
  const canReview = spaces.find((s) => s.kind === "annonces")?.canPost ?? false; // équipe : publie sans relecture
  const scheduled = isAnnouncement && !!form.publishAt && new Date(form.publishAt) > new Date();

  const image = useUpload("forumImage");
  const video = useUpload("forum");
  const file = useUpload("forumFile");
  const uploading = image.busy || video.busy || file.busy;
  const uploadImage = async (f: File) => {
    if (f.size > (cfg.data?.maxMb.forumImage ?? 10) * 1048576) { toast.error(`L’image dépasse ${cfg.data?.maxMb.forumImage ?? 10} Mo.`); return null; }
    try { return (await image.upload(f)).publicUrl; } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); return null; }
  };
  const uploadVideo = async (f?: File) => {
    if (!f) return;
    if (f.size > (cfg.data?.maxMb.forum ?? 500) * 1048576) return void toast.error(`La vidéo dépasse ${cfg.data?.maxMb.forum ?? 500} Mo.`);
    try { set({ videoUrl: (await video.upload(f)).publicUrl ?? "" }); setPanel(null); } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); }
  };
  const uploadFile = async (f?: File) => {
    if (!f) return;
    if (f.size > (cfg.data?.maxMb.forumFile ?? 50) * 1048576) return void toast.error(`Le fichier dépasse ${cfg.data?.maxMb.forumFile ?? 50} Mo.`);
    try {
      const u = await file.upload(f);
      setForm((x) => ({ ...x, attachments: [...x.attachments, { path: u.path, name: u.name, type: u.type, size: u.size }] }));
      if (f.type.startsWith("audio/")) setPanel(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); }
  };

  // Brouillon enregistré automatiquement, une seconde après la dernière frappe
  const saveDraft = trpc.forum.saveDraft.useMutation();
  const deleteDraft = trpc.forum.deleteDraft.useMutation();
  const lastSaved = useRef(JSON.stringify(initial));
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const flush = () => {
    const snapshot = JSON.stringify(form);
    if (snapshot === lastSaved.current || !hasContent(form)) return saving.current;
    lastSaved.current = snapshot;
    saving.current = saveDraft.mutateAsync({ key: draftKey, data: form }).then((r) => setSavedAt(new Date(r.updatedAt))).catch(() => { lastSaved.current = ""; });
    return saving.current;
  };
  const closing = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { if (!closing.current) void flush(); }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || (restored && hasContent(form));
  const requestClose = () => {
    if (dirty && hasContent(form)) return setAsking(true);
    if (restored) deleteDraft.mutate({ key: draftKey }); // brouillon entièrement vidé
    onClose();
  };
  const keepDraft = async () => { closing.current = true; await flush(); onClose(); };
  const discard = async () => {
    closing.current = true;
    await saving.current;
    await deleteDraft.mutateAsync({ key: draftKey }).catch(() => undefined);
    utils.forum.draft.invalidate({ key: draftKey });
    onClose();
  };

  const create = trpc.forum.createPost.useMutation();
  const update = trpc.forum.updatePost.useMutation();
  const pending = create.isPending || update.isPending;
  const canSubmit = (form.title.trim() || legacyNoTitle) && (form.html || form.videoUrl || form.attachments.length) && (!needsVideo || form.videoUrl) && (!isJob || job) && (!isHelp || form.help) && (hive || form.spaceId) && !uploading && !pending;
  const submit = async () => {
    closing.current = true;
    await saving.current;
    const input = {
      spaceId: hive ? null : form.spaceId,
      hiveId: hive?.id ?? null,
      title: form.title,
      html: form.html,
      coverUrl: form.coverUrl,
      videoUrl: form.videoUrl,
      attachments: form.attachments,
      hashtagIds: form.hashtagIds,
      pinned: form.pinned,
      audience: isAnnouncement ? form.audience : needsVideo ? form.videoAudience : "tous" as const,
      publishAt: form.publishAt ? new Date(form.publishAt) : null,
      endsAt: form.endsAt ? new Date(form.endsAt) : null,
      oppType: isOpp ? form.oppType : null,
      facts: isJob ? job ?? [] : isOpp ? form.facts.split(",").map((x) => x.trim()).filter(Boolean) : isHelp && form.help ? [HELP[form.help]] : [],
      draftKey,
    };
    try {
      const r = editing ? await update.mutateAsync({ ...input, id: target.post.id }) : await create.mutateAsync(input);
      utils.forum.invalidate();
      utils.hashtags.invalidate();
      toast.success(r.status === "pending" ? "Envoyé à l’équipe pour relecture" : needsVideo && form.videoAudience === "moderateurs" && !editing ? "Envoyé aux modérateurs" : scheduled ? "Annonce programmée" : editing ? "Publication modifiée" : isAnnouncement ? "Annonce publiée" : "Publié dans le cercle");
      onSaved?.(r.id);
      onClose();
    } catch (e) {
      closing.current = false;
      toast.error(e instanceof Error ? e.message : "Publication impossible");
    }
  };

  const editor = useRichEditor({
    value: form.html,
    placeholder: isOpp ? "Le contexte, ce que vous cherchez, ce que vous proposez en retour." : "Écrivez votre message…",
    onChange: (html) => set({ html }),
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const title = editing ? (isAnnouncement ? "Modifier l’annonce" : "Modifier la publication") : target.announcement || target.hive ? "Créer une annonce" : "Nouvelle publication";
  const submitLabel = editing ? "Enregistrer" : isOpp && !canReview ? "Envoyer en relecture" : scheduled ? "Programmer" : "Publier";
  const allTags = tags.data ?? [];
  const chosen = form.hashtagIds.filter((id) => allTags.some((t) => t.id === id));

  return (
    <Shell onRequestClose={requestClose}>
      <header className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b flex-none" style={{ borderColor: "var(--p-line)" }}>
        <DialogTitle className="serif text-[26px] font-medium leading-tight m-0 flex-1 min-w-0">{title}</DialogTitle>
        {canUpload && !form.coverUrl && (
          <label className="p-btn-outline p-btn-sm cursor-pointer flex-none" title="Image de couverture, facultative">
            <input type="file" accept={IMAGE_ACCEPT} className="hidden" aria-label="Choisir une image de couverture" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const url = await uploadImage(f); if (url) set({ coverUrl: url }); } }} />
            <ImagePlus size={16} /><span className="hidden sm:inline">Ajouter une couverture</span><span className="sm:hidden">Couverture</span>
          </label>
        )}
        <button type="button" aria-label="Fermer la fenêtre" className="w-10 h-10 flex-none rounded-full flex items-center justify-center p-muted hover:bg-black/5 dark:hover:bg-white/5" onClick={requestClose}><X size={20} /></button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col [&>*]:flex-none">
        {showRestored && (
          <div className="flex flex-wrap items-center gap-2 mx-4 sm:mx-6 mt-3 px-3.5 py-2 rounded-xl text-[13.5px]" style={{ background: "var(--p-surface-2)" }}>
            <span className="flex-1 min-w-[180px]">Votre brouillon a été repris.</span>
            <button type="button" className="p-btn-ghost min-h-0 text-[13.5px]" onClick={() => setShowRestored(false)}>Compris</button>
          </div>
        )}

        {form.coverUrl && (
          <div className="relative mx-4 sm:mx-6 mt-3">
            <img src={form.coverUrl} alt="Image de couverture" className="w-full h-[150px] object-cover rounded-2xl" />
            <button type="button" aria-label="Retirer l’image de couverture" className="absolute right-2 top-2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center" onClick={() => set({ coverUrl: "" })}><X size={16} /></button>
          </div>
        )}

        <input className="w-full px-4 sm:px-6 pt-4 pb-1 bg-transparent outline-none serif text-[30px] leading-tight placeholder:text-[var(--p-ink-3)]" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder={isOpp ? `Titre · ${OPP[form.oppType].ph}` : legacyNoTitle ? "Titre (facultatif pour cette ancienne publication)" : "Titre de la publication"} aria-label="Titre de la publication" />

        <div className="px-1 sm:px-3"><EditorContent editor={editor} /></div>

        <div className="px-4 sm:px-6 pb-4 flex flex-col gap-3 [&>*]:flex-none">
          {needsVideo && !form.videoUrl && <span className="text-[13px] p-muted flex items-center gap-1.5"><Video size={14} style={{ color: "var(--p-accent-text)" }} /> Ajoutez votre vidéo (lien ou fichier) pour demander un retour.</span>}
          {space?.slug === "presentations" && (
            <details className="p-soft px-3.5 py-2.5 text-[13.5px]" open={target.mode === "new" && !!target.tips}>
              <summary className="cursor-pointer font-medium flex items-center gap-1.5"><Video size={14} style={{ color: "var(--p-accent-text)" }} /> {VIDEO_TIPS.title}</summary>
              <ul className="m-0 mt-2 pl-5 list-disc p-muted flex flex-col gap-1">{VIDEO_TIPS.tips.map((t) => <li key={t}>{t}</li>)}</ul>
            </details>
          )}

          {uploading && <div className="text-[13px] p-muted" role="status">Envoi du fichier… {image.progress ?? video.progress ?? file.progress ?? 0} %</div>}

          {(form.videoUrl || form.attachments.length > 0) && (
            <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
              {form.videoUrl && (
                <li className="flex items-center gap-2 h-10 pl-3 pr-1 rounded-xl text-[13.5px]" style={{ background: "var(--p-surface-2)" }}>
                  <Video size={15} className="flex-none" style={{ color: "var(--p-accent-text)" }} /><span className="flex-1 truncate">{form.videoUrl.includes("/storage/v1/object/") ? "Vidéo chargée" : form.videoUrl}</span>
                  <button type="button" aria-label="Retirer la vidéo" className="w-8 h-8 flex items-center justify-center" onClick={() => set({ videoUrl: "" })}><X size={15} /></button>
                </li>
              )}
              {form.attachments.map((a) => {
                const Icon = a.type.startsWith("audio/") ? Mic : Paperclip;
                return (
                  <li key={a.path} className="flex items-center gap-2 h-10 pl-3 pr-1 rounded-xl text-[13.5px]" style={{ background: "var(--p-surface-2)" }}>
                    <Icon size={15} className="flex-none" style={{ color: "var(--p-accent-text)" }} /><span className="flex-1 truncate">{a.name}</span><span className="text-[12px] p-faint flex-none">{fileSize(a.size)}</span>
                    <button type="button" aria-label={`Retirer ${a.name}`} className="w-8 h-8 flex items-center justify-center" onClick={() => set({ attachments: form.attachments.filter((x) => x.path !== a.path) })}><X size={15} /></button>
                  </li>
                );
              })}
            </ul>
          )}

          {isOpp && (
            <section className="flex flex-col gap-3 p-4 rounded-2xl" style={{ background: "var(--p-surface-2)" }} aria-label="Détails de l’opportunité">
              <div className="flex flex-wrap gap-1.5">{(Object.keys(OPP) as OppType[]).map((k) => <button key={k} type="button" aria-pressed={form.oppType === k} className={`p-chip h-8 text-[13px] ${form.oppType === k ? "p-chip-on" : ""}`} onClick={() => set({ oppType: k })}>{OPP[k].label}</button>)}</div>
              {isJob ? <JobFields job={form.job} set={setJob} /> : <input className="p-field" value={form.facts} placeholder="Lieu et format, séparés par des virgules · Ex. Lyon, CDI, dès janvier" aria-label="Lieu et format" onChange={(e) => set({ facts: e.target.value })} />}
              {!canReview && <span className="flex items-start gap-1.5 text-[12.5px] p-muted"><ShieldCheck size={14} className="flex-none mt-0.5" style={{ color: "var(--p-accent-text)" }} /> Les opportunités sont relues par l’équipe Présence avant d’être visibles par tous les membres{editing ? ", y compris après une modification" : ""}.</span>}
            </section>
          )}

          {isHelp && (
            <section className="flex flex-col gap-2 p-4 rounded-2xl" style={{ background: "var(--p-surface-2)" }} aria-label="Votre demande d’entraide">
              <span className="text-[13.5px] p-muted">Vous…</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Proposer ou demander de l’aide">
                {(["propose", "demande"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={form.help === k} className={`p-chip h-9 text-[13.5px] ${form.help === k ? "p-chip-on" : ""}`} onClick={() => set({ help: k })}>{k === "propose" ? "Je propose mon aide" : "Je demande de l’aide"}</button>)}
              </div>
            </section>
          )}

          {needsVideo && (
            <section className="flex flex-col gap-2 p-4 rounded-2xl" style={{ background: "var(--p-surface-2)" }} aria-label="À qui demander un retour">
              <span className="text-[13.5px] p-muted">Demander un retour…</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="À qui demander un retour">
                {(["tous", "moderateurs"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={form.videoAudience === k} className={`p-chip h-9 text-[13.5px] ${form.videoAudience === k ? "p-chip-on" : ""}`} onClick={() => set({ videoAudience: k })}>{k === "tous" ? "À la communauté" : "Aux modérateurs du réseau"}</button>)}
              </div>
              <span className="text-[12.5px] p-muted leading-relaxed">{form.videoAudience === "tous" ? "Votre vidéo et les retours sont visibles de tous les membres." : "Seuls vous et les modérateurs (l’équipe Présence) voyez votre vidéo et les retours. Ils sont prévenus de votre demande."}</span>
            </section>
          )}

          {isAnnouncement && (
            <section className="flex flex-col gap-3.5 p-4 rounded-2xl" style={{ background: "var(--p-surface-2)" }} aria-label="Options de l’annonce">
              <label className="flex items-start gap-3 cursor-pointer">
                <Switch checked={form.pinned} onCheckedChange={(pinned) => set({ pinned })} aria-label="Épingler l’annonce" className="mt-0.5" />
                <span className="flex flex-col"><span className="flex items-center gap-1.5 text-[14.5px] font-medium"><Pin size={14} /> Épingler</span><span className="text-[12.5px] p-muted">En tête de {hive ? "l’onglet" : "l’espace"} et en haut du tableau de bord des personnes concernées, jusqu’à ce qu’elles la ferment.</span></span>
              </label>
              {!hive && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13.5px] p-muted">Public visé</span>
                  <div className="flex flex-wrap gap-1.5">{(Object.keys(AUDIENCES) as (keyof typeof AUDIENCES)[]).map((k) => <button key={k} type="button" aria-pressed={form.audience === k} className={`p-chip h-8 text-[13px] ${form.audience === k ? "p-chip-on" : ""}`} onClick={() => set({ audience: k })}>{AUDIENCES[k]}</button>)}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <label className="flex-[1_1_210px] min-w-0 flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Publication programmée <span className="p-faint">· facultatif</span></span><input type="datetime-local" className="p-field" value={form.publishAt} onChange={(e) => set({ publishAt: e.target.value })} /></label>
                <label className="flex-[1_1_210px] min-w-0 flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Fin d’affichage <span className="p-faint">· facultatif</span></span><input type="datetime-local" className="p-field" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></label>
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="flex-none border-t" style={{ borderColor: "var(--p-line)" }}>
        {panel === "video" && (
          <div className="flex flex-col gap-2.5 px-4 sm:px-6 py-3 border-b" style={{ borderColor: "var(--p-line)" }}>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\/\S+$/.test(videoLink.trim())) { set({ videoUrl: videoLink.trim() }); setVideoLink(""); setPanel(null); } else toast.error("Le lien de la vidéo doit commencer par https://"); }}>
              <span className="relative flex-[1_1_240px]"><Link2 size={15} className="absolute left-3 top-[15px] p-faint" /><input className="p-field pl-9" value={videoLink} autoFocus onChange={(e) => setVideoLink(e.target.value)} placeholder="Lien : YouTube, Vimeo, Loom, Google Drive…" aria-label="Lien de la vidéo" /></span>
              <button type="submit" className="p-btn-outline p-btn-sm h-[46px]" disabled={!videoLink.trim()}>Ajouter ce lien</button>
            </form>
            {canUpload ? (
              <label className="flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed cursor-pointer text-[14px] font-medium" style={{ borderColor: "var(--p-line-2)" }}>
                <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" className="hidden" aria-label="Choisir une vidéo" onChange={(e) => { void uploadVideo(e.target.files?.[0]); e.target.value = ""; }} />
                <Upload size={16} style={{ color: "var(--p-accent-text)" }} /> Charger un fichier vidéo <span className="text-[12px] font-normal p-faint">· jusqu’à {cfg.data?.maxMb.forum ?? 500} Mo</span>
              </label>
            ) : <span className="text-[12px] p-faint">Le chargement de fichiers sera disponible une fois le stockage configuré ; en attendant, partagez un lien.</span>}
          </div>
        )}
        {panel === "voice" && <VoiceRecorder busy={file.busy} onAdd={(f) => void uploadFile(f)} />}
        <EditorToolbar
          editor={editor}
          panel={panel}
          setPanel={setPanel}
          uploadImage={uploadImage}
          start={<>
            <ToolButton label="Hashtags" active={panel === "tags" || chosen.length > 0} onClick={() => togglePanel("tags")}><Hash size={18} /></ToolButton>
            <ToolButton label="Pièce jointe" disabled={!canUpload} onClick={() => fileInput.current?.click()}><Paperclip size={18} /></ToolButton>
            <ToolButton label="Vidéo" active={panel === "video" || !!form.videoUrl} onClick={() => togglePanel("video")}><Video size={19} /></ToolButton>
          </>}
          end={<ToolButton label="Note vocale" disabled={!canUpload} active={panel === "voice"} onClick={() => togglePanel("voice")}><Mic size={18} /></ToolButton>}
        />
        <input ref={fileInput} type="file" className="hidden" aria-label="Choisir une pièce jointe" onChange={(e) => { void uploadFile(e.target.files?.[0]); e.target.value = ""; }} />

        <section className="border-t" style={{ borderColor: "var(--p-line)" }} aria-label="Hashtags">
          <button type="button" aria-expanded={panel === "tags"} className="w-full flex items-center gap-2 min-h-[44px] px-4 sm:px-6 py-1.5 text-left text-[14px]" onClick={() => togglePanel("tags")}>
            <Tag size={15} className="p-muted flex-none" />
            {chosen.length ? <span className="flex-1 min-w-0 flex flex-wrap gap-1">{allTags.filter((t) => chosen.includes(t.id)).map((t) => <span key={t.id} className="p-pill h-6 text-[12.5px]" style={{ color: "var(--p-ink)" }}><TagLabel tag={t} /></span>)}</span> : <span className="flex-1 p-muted">Choisissez jusqu’à {MAX_HASHTAGS} hashtags</span>}
            <ChevronDown size={16} className="p-muted flex-none transition-transform" style={{ transform: panel === "tags" ? "rotate(180deg)" : undefined }} />
          </button>
          {panel === "tags" && (
            <div className="px-4 sm:px-6 pb-3 max-h-[150px] overflow-y-auto">
              {allTags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((t) => {
                    const on = form.hashtagIds.includes(t.id);
                    return <button key={t.id} type="button" aria-pressed={on} disabled={!on && chosen.length >= MAX_HASHTAGS} className={`p-chip h-8 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed ${on ? "p-chip-on" : ""}`} onClick={() => set({ hashtagIds: on ? form.hashtagIds.filter((x) => x !== t.id) : [...chosen, t.id] })}><TagLabel tag={t} /></button>;
                  })}
                </div>
              ) : <span className="text-[13px] p-faint">{canManage ? "Aucun hashtag pour l’instant : créez la liste dans « Gérer le forum »." : "Aucun hashtag pour l’instant."}</span>}
            </div>
          )}
        </section>
      </div>

      <footer className="flex-none flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 pt-3 border-t" style={{ borderColor: "var(--p-line)", background: "var(--p-surface-2)", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        {asking ? (
          <>
            <span className="flex-[1_1_200px] text-[14px]">{editing ? "Garder vos modifications en brouillon ?" : "Garder ce brouillon pour plus tard ?"}</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="p-btn-primary p-btn-sm" onClick={keepDraft}>Garder le brouillon</button>
              <button type="button" className="p-btn-outline p-btn-sm" onClick={discard}>{editing ? "Abandonner" : "Supprimer"}</button>
              <button type="button" className="p-btn-ghost px-2" onClick={() => setAsking(false)}>Continuer</button>
            </div>
          </>
        ) : (
          <>
            <label className="flex-[1_1_240px] min-w-0 flex items-center gap-1.5 text-[14px] p-muted">
              <span className="whitespace-nowrap">Publication dans :</span>
              {hive ? <span className="font-medium truncate" style={{ color: "var(--p-ink)" }}>🐝 Annonces · {hive.name}</span> : (
                <select className="min-w-0 max-w-full h-10 bg-transparent outline-none font-medium cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--p-accent)]" style={{ color: "var(--p-ink)" }} value={form.spaceId ?? ""} onChange={(e) => set({ spaceId: Number(e.target.value) })}>
                  {SPACE_GROUPS.map(([g, label]) => {
                    const options = spaces.filter((s) => s.groupKey === g && s.canPost);
                    return options.length ? <optgroup key={g} label={label}>{options.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}</optgroup> : null;
                  })}
                </select>
              )}
            </label>
            {savedAt && <span className="text-[12px] p-faint sm:ml-auto" role="status">Brouillon enregistré à {hour(savedAt)}</span>}
            <div className="flex items-center gap-2 ml-auto">
              <button type="button" className="p-btn-outline p-btn-sm" onClick={requestClose}>Annuler</button>
              <button type="button" className="p-btn-primary p-btn-sm whitespace-nowrap" disabled={!canSubmit} onClick={submit}>{submitLabel}</button>
            </div>
          </>
        )}
      </footer>
    </Shell>
  );
}

/** Recrutement : quatre champs demandés, qui deviennent les étiquettes de l'annonce. */
function Choice({ label, values, value, pick }: { label: string; values: readonly string[]; value: string; pick: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13.5px] p-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {values.map((v) => <button key={v} type="button" role="radio" aria-checked={value === v} className={`p-chip h-8 text-[13px] ${value === v ? "p-chip-on" : ""}`} onClick={() => pick(v)}>{v}</button>)}
      </div>
    </div>
  );
}

function JobFields({ job, set }: { job: Job; set: (patch: Partial<Job>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Choice label="Lieu de travail" values={WORK_MODES} value={job.workMode} pick={(workMode) => set({ workMode })} />
      <Choice label="Temps de travail" values={SCHEDULES} value={job.schedule} pick={(schedule) => set({ schedule })} />
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Localisation</span><input className="p-field" maxLength={60} value={job.location} placeholder="Ex. Lyon, Genève, Paris et alentours" onChange={(e) => set({ location: e.target.value })} /></label>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13.5px] p-muted" id="remuneration">Rémunération</span>
        <div className="flex flex-wrap items-center gap-2" aria-labelledby="remuneration">
          <input className="p-field w-[150px] flex-none" inputMode="decimal" maxLength={12} value={job.payAmount} placeholder={job.payUnit === "h" ? "Ex. 24" : "Ex. 2 000"} aria-label="Montant en euros" onChange={(e) => set({ payAmount: e.target.value })} />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rémunération horaire ou mensuelle">
            {(Object.keys(PAY_UNITS) as PayUnit[]).map((u) => <button key={u} type="button" role="radio" aria-checked={job.payUnit === u} className={`p-chip h-8 text-[13px] ${job.payUnit === u ? "p-chip-on" : ""}`} onClick={() => set({ payUnit: u })}>{u === "h" ? "€ de l’heure" : "€ par mois"}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}
