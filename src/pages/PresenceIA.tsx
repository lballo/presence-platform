import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDropzone } from "react-dropzone";
import { Send, RotateCcw, UploadCloud, Loader2, AlertCircle, Video, Clock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { CoachMascot } from "@/components/CoachMascot";
import { ago } from "@/lib/format";

export default function PresenceIA() {
  const [tab, setTab] = useState<"coach" | "video">("coach");
  return (
    <>
      <PageHeader eyebrow="Présence IA" title="Votre coach, à toute heure" intro="Un coach IA pour préparer vos moments importants, et l’analyse de vos vidéos de prise de parole, reprise de PresenceAI." />
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

function VideoAnalysis() {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const list = trpc.speech.list.useQuery();
  const create = trpc.speech.create.useMutation();
  const analyze = trpc.speech.generateAnalysis.useMutation();
  const [state, setState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setFileName(file.name); setState("uploading");
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.onerror = () => rej(new Error("Lecture impossible")); r.readAsDataURL(file); });
      const speech = await create.mutateAsync({ title: file.name.replace(/\.[^/.]+$/, "") });
      setState("processing");
      const result = await analyze.mutateAsync({ id: speech.id, videoDataUrl: dataUrl });
      utils.speech.list.invalidate();
      navigate(`/presence-ia/analyse/${result.id}`);
    } catch (e) {
      setState("error"); setError(e instanceof Error ? e.message : "L’analyse a échoué. Réessayez.");
      utils.speech.list.invalidate();
    }
  }, [create, analyze, navigate, utils]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "video/*": [".mp4", ".mov", ".webm", ".avi"] }, maxSize: 500 * 1024 * 1024, multiple: false, disabled: state === "uploading" || state === "processing" });

  return (
    <div className="flex flex-wrap gap-6 items-start">
      <section className="flex-[2_1_480px] min-w-0 flex flex-col gap-5">
        {state === "idle" && (
          <div {...getRootProps()} className="rounded-3xl border-2 border-dashed min-h-[280px] flex flex-col items-center justify-center p-8 cursor-pointer text-center" style={{ borderColor: isDragActive ? "var(--p-accent)" : "var(--p-line-2)", background: isDragActive ? "var(--p-accent-soft)" : "var(--p-surface)" }}>
            <input {...getInputProps()} />
            <span className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><UploadCloud size={30} /></span>
            <h3 className="text-[26px] m-0 mb-1">{isDragActive ? "Déposez votre vidéo ici" : "Glissez-déposez votre vidéo"}</h3>
            <p className="m-0 text-[14px] p-muted mb-5">ou cliquez pour choisir un fichier · MP4, MOV, WebM · 500 Mo max</p>
            <span className="p-btn-outline p-btn-sm">Sélectionner un fichier</span>
          </div>
        )}
        {(state === "uploading" || state === "processing") && (
          <div className="p-card p-8 text-center flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: "var(--p-accent-text)" }} />
            <h3 className="text-[26px] m-0">{state === "uploading" ? "Envoi de la vidéo" : "Analyse en cours"}</h3>
            <p className="m-0 text-[14px] p-muted max-w-[380px]">{fileName}. Gemini examine votre voix, votre posture et la structure de votre message. Comptez deux à quatre minutes.</p>
          </div>
        )}
        {state === "error" && (
          <div className="p-card p-8 text-center flex flex-col items-center gap-3">
            <AlertCircle size={32} style={{ color: "var(--p-accent-text)" }} />
            <h3 className="text-[26px] m-0">Une erreur est survenue</h3>
            <p className="m-0 text-[14px] p-muted max-w-[380px]">{error}</p>
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
          <Link key={s.id} to={s.status === "completed" ? `/presence-ia/analyse/${s.id}` : "#"} className="p-card p-4 flex items-center gap-3 no-underline" style={{ color: "var(--p-ink)" }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-none" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><Video size={18} /></span>
            <span className="flex flex-col min-w-0 flex-1"><span className="font-semibold truncate">{s.title}</span><span className="text-[12.5px] p-muted">{ago(new Date(s.createdAt))} · {s.status === "completed" ? `score ${s.overallScore}` : s.status === "failed" ? "échec" : "en cours"}</span></span>
            {s.status === "completed" && <ArrowRight size={16} className="p-faint" />}
          </Link>
        ))}
      </aside>
    </div>
  );
}
