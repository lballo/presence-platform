import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Send, RotateCcw, UploadCloud, Loader2, AlertCircle, Video, Clock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { CoachMascot } from "@/components/CoachMascot";
import { ago } from "@/lib/format";
import { sendVideoInChunks, videoDuration } from "@/lib/videoUpload";

export default function PresenceIA() {
  const [tab, setTab] = useState<"coach" | "video">("coach");
  return (
    <>
      <PageHeader eyebrow="Mon parcours" title="Présence IA" intro="Votre coach, à toute heure, pour préparer vos moments importants, et l’analyse de vos vidéos de prise de parole, reprise de PresenceAI." />
      <div className="flex gap-2 mb-6">
        {([["coach", "Coach IA"], ["video", "Analyse vidéo"]] as const).map(([k, l]) => (
          <button key={k} type="button" className={`p-chip h-10 ${tab === k ? "p-chip-on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "coach" ? <Coach /> : <VideoAnalysis />}
    </>
  );
}

function Coach() {
  const utils = trpc.useUtils();
  const me = trpc.members.me.useQuery();
  const history = trpc.coach.history.useQuery();
  const exercises = trpc.coach.exercises.useQuery();
  const send = trpc.coach.send.useMutation({ onSuccess: () => utils.coach.history.invalidate(), onError: (e) => toast.error(e.message) });
  const reset = trpc.coach.reset.useMutation({ onSuccess: () => utils.coach.history.invalidate() });
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history.data, pending]);

  const submit = async (t: string) => {
    const v = t.trim();
    if (!v || send.isPending) return;
    setText(""); setPending(v);
    try { await send.mutateAsync({ text: v }); } finally { setPending(null); }
  };

  return (
    <div className="flex flex-wrap gap-6 items-start">
      <section className="flex-[2_1_520px] min-w-0 p-card flex flex-col" style={{ minHeight: 560 }}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--p-line)" }}>
          <span className="flex items-center gap-2.5"><CoachMascot size={40} mood={send.isPending ? "thinking" : "happy"} /><span className="font-semibold">Coach Présence</span></span>
          <button type="button" className="p-btn-ghost text-[13px] p-muted" onClick={() => reset.mutate()}><RotateCcw size={14} /> Nouvelle conversation</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {(history.data?.length ?? 0) === 0 && !pending && (
            <div className="p-soft p-5 text-[15px] leading-relaxed">
              Bonjour {me.data?.firstName}. De quoi avez-vous besoin aujourd’hui ? Une décision à prendre, une prise de parole à préparer, une relation qui pèse… Dites-le avec vos mots.
            </div>
          )}
          {history.data?.map((m) => <Bubble key={m.id} role={m.role} text={m.text} me={me.data} />)}
          {pending && <Bubble role="user" text={pending} me={me.data} />}
          {send.isPending && <div className="text-[13.5px] p-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Le coach réfléchit…</div>}
          <div ref={endRef} />
        </div>
        <form className="flex gap-2 p-4 border-t" style={{ borderColor: "var(--p-line)" }} onSubmit={(e) => { e.preventDefault(); submit(text); }}>
          <input className="p-field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Écrivez au coach…" />
          <button type="submit" className="p-btn-primary px-5" disabled={send.isPending || !text.trim()} aria-label="Envoyer"><Send size={17} /></button>
        </form>
      </section>
      <aside className="flex-[1_1_280px] min-w-0 flex flex-col gap-3">
        <span className="p-eyebrow">Mon chemin</span>
        <article className="p-card p-4 flex flex-col gap-2">
          <p className="m-0 text-[14px] leading-relaxed p-muted">Le coach peut garder le fil de votre formation et relier ce que vous découvrez.</p>
          <button type="button" className="p-btn-ghost text-[13.5px]" disabled={send.isPending} onClick={() => submit("Retrace mon chemin depuis le début de ma formation.")}>Retracer mon chemin <ArrowRight size={14} /></button>
          <Link to="/parametres/confidentialite/memoire" className="p-btn-ghost text-[13.5px] no-underline">Ce que le coach retient de moi <ArrowRight size={14} /></Link>
        </article>
        <span className="p-eyebrow">Exercices courts</span>
        {exercises.data?.map((ex) => (
          <article key={ex.id} className="p-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2"><span className="font-semibold">{ex.title}</span><span className="text-[12.5px] p-muted flex items-center gap-1"><Clock size={12} /> {ex.minutes} min</span></div>
            <p className="m-0 text-[14px] leading-relaxed p-muted">{ex.text}</p>
            <button type="button" className="p-btn-ghost text-[13.5px]" onClick={() => submit(`Je viens de faire l’exercice « ${ex.title} ». Qu’est-ce que je peux en retirer pour ma journée ?`)}>En parler au coach <ArrowRight size={14} /></button>
          </article>
        ))}
      </aside>
    </div>
  );
}

function Bubble({ role, text, me }: { role: string; text: string; me?: { initials: string; photoUrl?: string | null } }) {
  const user = role === "user";
  return (
    <div className={`flex gap-3 ${user ? "flex-row-reverse" : ""}`}>
      {user ? (me ? <Avatar m={me} size={34} /> : null) : <span className="flex-none"><CoachMascot size={34} /></span>}
      <div className="max-w-[78%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap" style={user ? { background: "var(--p-accent)", color: "#fff" } : { background: "var(--p-surface-2)" }}>{text}</div>
    </div>
  );
}

/* ── Analyse vidéo : reprise de PresenceAI (Upload.tsx) ────────────────── */

type UploadState = "idle" | "uploading" | "processing" | "error";
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_SECONDS = 60 * 60;

function VideoAnalysis() {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [state, setState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [speechId, setSpeechId] = useState<number | null>(null);
  const list = trpc.speech.list.useQuery(undefined, { refetchInterval: (q) => (q.state.data?.some((s) => s.status === "uploading" || s.status === "processing") ? 8000 : false) });
  const start = trpc.speech.startUpload.useMutation();
  // L'analyse tourne sur le serveur : la page vient voir où elle en est.
  const watched = trpc.speech.getById.useQuery({ id: speechId ?? 0 }, { enabled: state === "processing" && !!speechId, refetchInterval: 4000 });

  const result = state === "processing" ? watched.data : undefined;
  useEffect(() => {
    if (result?.status === "completed") navigate(`/parcours/presence-ia/analyse/${result.id}`);
    if (result?.status === "completed" || result?.status === "failed") utils.speech.list.invalidate();
  }, [result?.status, result?.id, navigate, utils]);
  // Une analyse en échec s'affiche comme une erreur d'envoi : le résumé porte sa raison.
  const failed = result?.status === "failed";
  const shown: UploadState = failed ? "error" : state;
  const shownError = failed ? result.summary || "L’analyse a échoué. Réessayez." : error;

  // Fermer la page pendant l'envoi l'interromprait : le navigateur le rappelle.
  useEffect(() => {
    if (state !== "uploading") return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const onDrop = useCallback(async (files: File[], rejected: FileRejection[]) => {
    if (rejected.length) { setState("error"); setError(rejected[0].errors[0]?.code === "file-too-large" ? "La vidéo dépasse 2 Go." : "Ce fichier n’est pas une vidéo lue par Présence IA (MP4, MOV, WebM)."); return; }
    const file = files[0];
    if (!file) return;
    setFileName(file.name); setProgress(0); setError(""); setState("uploading");
    try {
      const durationSec = await videoDuration(file);
      if (durationSec && durationSec > MAX_SECONDS + 30) throw new Error("La vidéo dépasse une heure. Coupez-la en plusieurs parties, chacune sera analysée.");
      const { id, chunkSize } = await start.mutateAsync({ title: file.name.replace(/\.[^/.]+$/, "") || "Ma vidéo", size: file.size, type: file.type || "video/mp4", durationSec: durationSec ?? undefined });
      setSpeechId(id);
      utils.speech.list.invalidate();
      await sendVideoInChunks(id, file, chunkSize, setProgress);
      setState("processing");
    } catch (e) {
      setState("error"); setError(e instanceof Error ? e.message : "L’envoi a échoué. Réessayez.");
      utils.speech.list.invalidate();
    }
  }, [start, utils]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "video/*": [".mp4", ".mov", ".webm", ".avi", ".m4v"] }, maxSize: MAX_BYTES, multiple: false, disabled: state === "uploading" || state === "processing" });

  return (
    <div className="flex flex-wrap gap-6 items-start">
      <section className="flex-[2_1_480px] min-w-0 flex flex-col gap-5">
        {shown === "idle" && (
          <div {...getRootProps()} className="rounded-3xl border-2 border-dashed min-h-[280px] flex flex-col items-center justify-center p-8 cursor-pointer text-center" style={{ borderColor: isDragActive ? "var(--p-accent)" : "var(--p-line-2)", background: isDragActive ? "var(--p-accent-soft)" : "var(--p-surface)" }}>
            <input {...getInputProps()} />
            <span className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><UploadCloud size={30} /></span>
            <h3 className="text-[26px] m-0 mb-1">{isDragActive ? "Déposez votre vidéo ici" : "Glissez-déposez votre vidéo"}</h3>
            <p className="m-0 text-[14px] p-muted mb-5">ou cliquez pour choisir un fichier · MP4, MOV, WebM · jusqu’à une heure et 2 Go</p>
            <span className="p-btn-outline p-btn-sm">Sélectionner un fichier</span>
          </div>
        )}
        {(shown === "uploading" || shown === "processing") && (
          <div className="p-card p-8 text-center flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: "var(--p-accent-text)" }} />
            <h3 className="text-[26px] m-0">{shown === "uploading" ? "Envoi de la vidéo" : "Analyse en cours"}</h3>
            {shown === "uploading" ? (
              <>
                <div className="w-full max-w-[380px] h-2 rounded-full overflow-hidden" style={{ background: "var(--p-track)" }} role="progressbar" aria-label="Envoi de la vidéo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                  <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(2, progress * 100)}%`, background: "var(--p-accent)" }} />
                </div>
                <p className="m-0 text-[14px] p-muted max-w-[380px]">{fileName} · {Math.round(progress * 100)} %. Gardez cette page ouverte jusqu’à la fin de l’envoi.</p>
              </>
            ) : (
              <p className="m-0 text-[14px] p-muted max-w-[380px]">{fileName}. Gemini examine votre voix, votre posture et la structure de votre message. Comptez quelques minutes, davantage pour une longue vidéo : vous pouvez quitter la page, l’analyse vous attendra dans « Mes analyses ».</p>
            )}
          </div>
        )}
        {shown === "error" && (
          <div className="p-card p-8 text-center flex flex-col items-center gap-3">
            <AlertCircle size={32} style={{ color: "var(--p-accent-text)" }} />
            <h3 className="text-[26px] m-0">Une erreur est survenue</h3>
            <p className="m-0 text-[14px] p-muted max-w-[380px]">{shownError}</p>
            <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setState("idle")}>Réessayer</button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {["Filmez-vous de face, à hauteur des yeux", "Un éclairage uniforme, de préférence naturel", "Parlez au moins deux minutes", "Fond neutre, tenue soignée"].map((t) => <div key={t} className="p-soft px-4 py-3 text-[14px]">{t}</div>)}
        </div>
      </section>
      <aside className="flex-[1_1_300px] min-w-0 flex flex-col gap-3">
        <span className="p-eyebrow">Mes analyses</span>
        {list.data?.length === 0 && <p className="text-[14px] p-muted m-0">Aucune analyse pour l’instant.</p>}
        {list.data?.map((s) => (
          <Link key={s.id} to={s.status === "completed" ? `/parcours/presence-ia/analyse/${s.id}` : "#"} className="p-card p-4 flex items-center gap-3 no-underline" style={{ color: "var(--p-ink)" }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-none" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><Video size={18} /></span>
            <span className="flex flex-col min-w-0 flex-1"><span className="font-semibold truncate">{s.title}</span><span className="text-[12.5px] p-muted">{ago(new Date(s.createdAt))} · {s.status === "completed" ? `score ${s.overallScore}` : s.status === "failed" ? "échec" : s.status === "uploading" ? "envoi en cours" : "analyse en cours"}</span></span>
            {s.status === "completed" && <ArrowRight size={16} className="p-faint" />}
          </Link>
        ))}
      </aside>
    </div>
  );
}
