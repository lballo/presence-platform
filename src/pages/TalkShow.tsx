import { useRef, useState } from "react";
import { Play, Clock, Eye, Upload, Link2, X, CheckCircle2, Hourglass, XCircle, Film } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { ago, plural } from "@/lib/format";
import { embedUrl } from "@/components/VideoEmbed";

type Talk = RouterOutputs["talks"]["list"][number];

export default function TalkShow() {
  const me = trpc.members.me.useQuery();
  const talks = trpc.talks.list.useQuery();
  const [first, ...rest] = talks.data ?? [];
  const [playing, setPlaying] = useState<Talk | null>(null);
  const [proposing, setProposing] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const openForm = () => { setProposing(true); setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  return (
    <>
      <PageHeader eyebrow="Talk Show" title="Des membres, des idées qui transforment" intro="Chaque mois, des leaders du cercle racontent l’idée qui a changé leur façon de diriger. En vidéo, puis en direct."
        action={<button type="button" className="p-btn-primary" onClick={openForm}><Film size={17} /> Proposer mon talk</button>} />

      {me.data?.isAdmin && <PendingPanel onPlay={setPlaying} />}

      {proposing && <div ref={formRef}><SubmitForm onDone={() => setProposing(false)} /></div>}

      <MySubmissions onPlay={(t) => setPlaying(t as Talk)} />

      {first && (
        <article className="p-band flex flex-wrap items-center gap-8 p-7 sm:p-10 mb-8">
          <div className="flex-[1_1_380px] min-w-0 flex flex-col gap-4">
            <span className="text-[12px] font-medium uppercase tracking-[0.3em]" style={{ color: "var(--p-gold-bright)" }}>Le talk de la semaine</span>
            <h2 className="serif text-[clamp(32px,4vw,46px)] leading-[1.08] m-0">{first.title}</h2>
            <p className="m-0 text-[16px] text-white/80 leading-relaxed">{first.summary}</p>
            <div className="flex items-center gap-3"><Avatar m={first.speaker} size={44} /><span className="flex flex-col"><span className="font-semibold">{first.speaker.name}</span><span className="text-[13px] text-white/70">{first.speaker.role} · {first.speaker.city}</span></span></div>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button type="button" className="p-btn-white" onClick={() => setPlaying(first)} disabled={!first.videoUrl}><Play size={18} /> {first.videoUrl ? `Regarder · ${first.durationMin} min` : "Vidéo bientôt disponible"}</button>
              <span className="text-[13px] text-white/65 flex items-center gap-1.5"><Eye size={13} /> {first.views} vues</span>
            </div>
          </div>
          <div className="flex-[0_1_340px] aspect-[4/5] max-w-full rounded-2xl overflow-hidden bg-white/10 flex items-center justify-center">
            {first.speaker.photoUrl ? <img src={first.speaker.photoUrl} alt="" className="w-full h-full object-cover" /> : <span className="serif text-[120px] italic" style={{ color: "var(--p-gold-bright)" }}>{first.speaker.initials}</span>}
          </div>
        </article>
      )}

      <div className="flex flex-wrap gap-8 items-start">
        <section className="flex-[2_1_520px] min-w-0">
          <h2 className="text-[30px] mb-4">Les derniers talks</h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(250px, 100%), 1fr))" }}>
            {rest.map((t) => (
              <article key={t.id} className="p-card overflow-hidden flex flex-col">
                <button type="button" className="aspect-video flex items-center justify-center relative w-full" style={{ background: "var(--p-surface-2)" }} onClick={() => t.videoUrl && setPlaying(t)} aria-label={`Regarder ${t.title}`}>
                  {t.speaker.photoUrl ? <img src={t.speaker.photoUrl} alt="" className="w-full h-full object-cover object-top" /> : <span className="serif text-[64px] italic" style={{ color: "var(--p-accent-text)" }}>{t.speaker.initials}</span>}
                  <span className="absolute inset-0 flex items-center justify-center"><span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center" style={{ color: "var(--p-ink)" }}><Play size={20} /></span></span>
                </button>
                <div className="p-4 flex flex-col gap-1.5">
                  <h3 className="m-0 text-[22px] leading-tight">{t.title}</h3>
                  <span className="text-[13px] p-muted">{t.speaker.name} · {t.speaker.city}</span>
                  <span className="text-[12.5px] p-faint flex items-center gap-3"><span className="flex items-center gap-1"><Clock size={12} /> {t.durationMin} min</span><span className="flex items-center gap-1"><Eye size={12} /> {t.views}</span></span>
                </div>
              </article>
            ))}
          </div>
          {talks.data && talks.data.length === 0 && <div className="p-soft p-8 text-center p-muted">Aucun talk publié pour l’instant. Le vôtre sera peut-être le premier.</div>}
        </section>
        <aside className="flex-[1_1_300px] min-w-0 flex flex-col gap-4">
          <section className="p-soft p-5 flex flex-col gap-2">
            <span className="p-eyebrow">Proposer un talk</span>
            <p className="m-0 text-[14px] leading-relaxed p-muted">Une idée qui a changé votre façon de diriger ? Dix minutes, face caméra. Vous envoyez votre vidéo, l’équipe Présence la regarde et la publie.</p>
            <button type="button" className="p-btn-outline p-btn-sm self-start" onClick={openForm}><Film size={15} /> Soumettre ma vidéo</button>
            <Link to="/presence-ia" className="p-btn-ghost text-[14px] no-underline">Répéter avec Présence IA →</Link>
          </section>
        </aside>
      </div>

      {playing && <Player talk={playing} onClose={() => setPlaying(null)} />}
    </>
  );
}

/* ───────────── Soumission ───────────── */

function SubmitForm({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const cfg = trpc.talks.uploadConfig.useQuery();
  const createUrl = trpc.talks.createUploadUrl.useMutation();
  const submit = trpc.talks.submit.useMutation({ onSuccess: () => { utils.talks.mine.invalidate(); utils.talks.pending.invalidate(); toast.success("Talk envoyé en validation"); onDone(); }, onError: (e) => toast.error(e.message) });
  const [f, setF] = useState({ title: "", description: "", durationMin: 10, link: "" });
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const canUpload = cfg.data?.enabled ?? false;
  const effectiveMode = canUpload ? mode : "link";

  const pick = (fl: File | undefined) => {
    if (!fl) return;
    if (!fl.type.startsWith("video/")) { toast.error("Choisissez un fichier vidéo (mp4, mov, webm)."); return; }
    if (fl.size > (cfg.data?.maxMb ?? 500) * 1024 * 1024) { toast.error(`La vidéo dépasse ${cfg.data?.maxMb ?? 500} Mo.`); return; }
    setFile(fl);
  };

  const uploadFile = (fl: File): Promise<string> =>
    new Promise((resolve, reject) => {
      createUrl.mutate({ filename: fl.name, contentType: fl.type, size: fl.size }, {
        onError: (e) => reject(new Error(e.message)),
        onSuccess: (u) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", u.uploadUrl);
          xhr.setRequestHeader("Content-Type", u.contentType);
          xhr.setRequestHeader("apikey", u.apikey);
          xhr.setRequestHeader("x-upsert", "false");
          xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100)); };
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(u.publicUrl ?? "") : reject(new Error(`Envoi refusé (${xhr.status}) : ${xhr.responseText.slice(0, 200)}`)));
          xhr.onerror = () => reject(new Error("L’envoi de la vidéo a échoué. Vérifiez votre connexion et réessayez."));
          xhr.send(fl);
        },
      });
    });

  const go = async () => {
    try {
      let videoUrl = f.link.trim();
      if (effectiveMode === "file") {
        if (!file) { toast.error("Ajoutez votre vidéo."); return; }
        setProgress(0);
        videoUrl = await uploadFile(file);
      }
      if (!/^https?:\/\//.test(videoUrl)) { toast.error("Le lien de la vidéo doit commencer par https://"); setProgress(null); return; }
      submit.mutate({ title: f.title.trim(), description: f.description.trim(), videoUrl, durationMin: f.durationMin });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur pendant l’envoi");
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null || submit.isPending;
  const ready = f.title.trim().length >= 3 && f.description.trim().length >= 10 && (effectiveMode === "file" ? !!file : !!f.link.trim());

  return (
    <section className="p-card p-6 sm:p-8 flex flex-col gap-5 mb-8" style={{ borderColor: "var(--p-accent-line)" }}>
      <div className="flex items-start justify-between gap-4">
        <div><span className="p-eyebrow">Proposer mon talk</span><h2 className="m-0 text-[32px] leading-tight">Votre idée, en dix minutes face caméra</h2><p className="m-0 mt-1 text-[14.5px] p-muted">Après envoi, l’équipe Présence regarde votre vidéo et la publie dans le Talk Show. Vous suivez l’avancement ici.</p></div>
        <button type="button" className="p-btn-ghost" onClick={onDone} aria-label="Fermer"><X size={18} /></button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Titre de la vidéo</span><input className="p-field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. Le silence, mon meilleur argument" maxLength={200} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Durée (minutes)</span><input type="number" min={1} max={120} className="p-field" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) || 10 })} /></label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Description et motivation</span><textarea className="p-field" rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="De quoi parle votre talk, et pourquoi avez-vous envie de le partager avec le cercle ?" maxLength={3000} /><span className="p-faint text-[12.5px] self-end">{f.description.length} / 3000</span></label>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] p-muted mr-1">Votre vidéo</span>
          {canUpload && <button type="button" className={`p-chip h-9 ${effectiveMode === "file" ? "p-chip-on" : ""}`} onClick={() => setMode("file")}><Upload size={14} /> Charger un fichier</button>}
          <button type="button" className={`p-chip h-9 ${effectiveMode === "link" ? "p-chip-on" : ""}`} onClick={() => setMode("link")}><Link2 size={14} /> Coller un lien</button>
        </div>
        {effectiveMode === "file" ? (
          <label
            className="flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed text-center cursor-pointer"
            style={{ borderColor: dragging ? "var(--p-accent)" : "var(--p-line-2)", background: dragging ? "var(--p-accent-soft)" : "var(--p-surface-2)" }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
          >
            <input type="file" accept="video/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <Upload size={26} style={{ color: "var(--p-accent-text)" }} />
            {file ? <><span className="font-semibold">{file.name}</span><span className="text-[13px] p-muted">{(file.size / 1024 / 1024).toFixed(1)} Mo · cliquez pour changer</span></> : <><span className="font-semibold">Déposez votre vidéo ici, ou cliquez pour la choisir</span><span className="text-[13px] p-muted">mp4, mov ou webm · jusqu’à {cfg.data?.maxMb ?? 500} Mo · format portrait ou paysage</span></>}
            {progress !== null && <div className="w-full max-w-[360px] mt-2"><div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--p-line)" }}><div className="h-full transition-all" style={{ width: `${progress}%`, background: "var(--p-accent)" }} /></div><span className="text-[12.5px] p-muted">Envoi en cours · {progress}%</span></div>}
          </label>
        ) : (
          <div className="flex flex-col gap-1.5">
            <input className="p-field" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://… (YouTube, Vimeo, Google Drive, Loom)" />
            {!canUpload && <span className="text-[12.5px] p-faint">Le chargement direct de fichiers n’est pas encore activé sur cette version : partagez un lien vers votre vidéo.</span>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t" style={{ borderColor: "var(--p-line)" }}>
        <button type="button" className="p-btn-primary" disabled={!ready || busy} onClick={go}>{busy ? "Envoi…" : "Envoyer en validation"}</button>
        <button type="button" className="p-btn-outline" onClick={onDone} disabled={busy}>Annuler</button>
        <span className="text-[12.5px] p-faint">En envoyant, vous acceptez que votre vidéo soit diffusée aux membres du cercle une fois validée.</span>
      </div>
    </section>
  );
}

/* ───────────── Mes propositions ───────────── */

const STATUS = {
  pending: { label: "En attente de validation", icon: Hourglass, color: "var(--p-gold)" },
  published: { label: "Publié", icon: CheckCircle2, color: "var(--p-accent-text)" },
  rejected: { label: "Non retenu", icon: XCircle, color: "var(--p-ink-2)" },
} as const;

function MySubmissions({ onPlay }: { onPlay: (t: unknown) => void }) {
  const utils = trpc.useUtils();
  const me = trpc.members.me.useQuery();
  const mine = trpc.talks.mine.useQuery();
  const withdraw = trpc.talks.withdraw.useMutation({ onSuccess: () => { utils.talks.invalidate(); toast("Proposition retirée"); } });
  if (!mine.data?.length) return null;
  return (
    <section className="mb-8 flex flex-col gap-3">
      <h2 className="m-0 text-[26px]">Mes propositions <span className="text-[14px] font-sans p-faint">{mine.data.length}</span></h2>
      <div className="flex flex-col gap-2.5">
        {mine.data.map((t) => { const st = STATUS[t.status]; const Icon = st.icon; return (
          <div key={t.id} className="p-card p-4 flex flex-wrap items-center gap-3">
            <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-none" style={{ background: "var(--p-pill)", color: "var(--p-accent-text)" }}><Film size={20} /></span>
            <span className="flex-[1_1_240px] min-w-0 flex flex-col gap-0.5"><span className="font-semibold text-[16px] truncate">{t.title}</span><span className="text-[13px] p-muted">Envoyé {ago(new Date(t.submittedAt))} · {t.durationMin} min</span></span>
            <span className="flex items-center gap-1.5 text-[13.5px] font-medium" style={{ color: st.color }}><Icon size={15} /> {st.label}</span>
            {t.videoUrl && me.data && <button type="button" className="p-btn-outline p-btn-sm" onClick={() => onPlay({ ...t, speaker: me.data })}><Play size={14} /> Voir</button>}
            {t.status === "pending" && <button type="button" className="p-btn-ghost text-[13.5px]" onClick={() => withdraw.mutate({ id: t.id })}>Retirer</button>}
          </div>
        ); })}
      </div>
    </section>
  );
}

/* ───────────── Validation (équipe Présence) ───────────── */

function PendingPanel({ onPlay }: { onPlay: (t: Talk) => void }) {
  const utils = trpc.useUtils();
  const pending = trpc.talks.pending.useQuery();
  const decide = trpc.talks.decide.useMutation({ onSuccess: (_r, v) => { utils.talks.invalidate(); utils.dashboard.invalidate(); toast.success(v.accept ? "Talk publié" : "Talk refusé"); }, onError: (e) => toast.error(e.message) });
  if (!pending.data?.length) return null;
  return (
    <section className="mb-8 p-5 sm:p-6 rounded-3xl flex flex-col gap-4" style={{ background: "var(--p-accent-soft)", border: "1px solid var(--p-accent-line)" }}>
      <div><span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-accent-text)" }}>Équipe Présence · à valider</span><h2 className="m-0 text-[28px] leading-tight">{plural(pending.data.length, "talk en attente", "talks en attente")}</h2></div>
      {pending.data.map((t) => (
        <article key={t.id} className="p-card p-5 flex flex-wrap gap-4 items-start">
          <Avatar m={t.speaker} size={48} />
          <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-1.5">
            <span className="text-[13px] p-muted">{t.speaker.name} · {t.speaker.role} · envoyé {ago(new Date(t.submittedAt))}</span>
            <h3 className="m-0 text-[24px] leading-tight">{t.title}</h3>
            <p className="m-0 text-[15px] leading-relaxed whitespace-pre-line">{t.description}</p>
            <span className="text-[12.5px] p-faint flex items-center gap-1"><Clock size={12} /> {t.durationMin} min</span>
          </div>
          <div className="flex flex-wrap gap-2 self-center">
            {t.videoUrl && <button type="button" className="p-btn-outline p-btn-sm" onClick={() => onPlay(t as Talk)}><Play size={14} /> Regarder</button>}
            <button type="button" className="p-btn-primary p-btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: t.id, accept: true })}>Publier</button>
            <button type="button" className="p-btn-outline p-btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: t.id, accept: false })}>Refuser</button>
          </div>
        </article>
      ))}
    </section>
  );
}

/* ───────────── Lecteur ───────────── */

function Player({ talk, onClose }: { talk: Talk; onClose: () => void }) {
  const view = trpc.talks.view.useMutation();
  const utils = trpc.useUtils();
  const counted = useRef(false);
  const url = talk.videoUrl ?? "";
  const embed = embedUrl(url);
  const count = () => { if (!counted.current) { counted.current = true; view.mutate({ id: talk.id }, { onSuccess: () => utils.talks.list.invalidate() }); } };
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" style={{ background: "rgba(14,13,12,0.92)" }} onClick={onClose}>
      <div className="w-full max-w-[960px] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 text-white">
          <div className="flex flex-col gap-0.5"><span className="text-[12px] font-medium uppercase tracking-[0.3em]" style={{ color: "var(--p-gold-bright)" }}>Talk Show</span><span className="serif text-[28px] leading-tight">{talk.title}</span><span className="text-[13.5px] text-white/70">{talk.speaker.name}</span></div>
          <button type="button" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-none" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
          {embed ? <iframe src={embed} title={talk.title} className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen onLoad={count} />
            : <video src={url} controls autoPlay playsInline className="w-full h-full" onPlay={count} />}
        </div>
        {!embed && <a href={url} target="_blank" rel="noopener" className="text-[13px] text-white/60 self-end underline">Ouvrir la vidéo dans un nouvel onglet</a>}
      </div>
    </div>
  );
}
