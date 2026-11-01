import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";

const MAX_SECONDS = 300;
const FORMATS: [string, string][] = [["audio/webm;codecs=opus", "webm"], ["audio/mp4", "m4a"], ["audio/ogg;codecs=opus", "ogg"]];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Enregistrer une note vocale depuis le micro, l'écouter, puis l'ajouter à la publication. */
export function VoiceRecorder({ busy, onAdd }: { busy: boolean; onAdd: (file: File) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "ready">("idle");
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; ext: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const micro = useRef<MediaStream | null>(null);
  const supported = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const stopMicro = () => { micro.current?.getTracks().forEach((t) => t.stop()); micro.current = null; };
  useEffect(() => stopMicro, []);
  useEffect(() => () => { if (take) URL.revokeObjectURL(take.url); }, [take]);
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setSeconds((s) => {
      if (s + 1 >= MAX_SECONDS) recorder.current?.stop();
      return s + 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [state]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micro.current = stream;
      const [mimeType, ext] = FORMATS.find(([m]) => MediaRecorder.isTypeSupported(m)) ?? ["", "webm"];
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stopMicro();
        const blob = new Blob(chunks, { type: rec.mimeType.split(";")[0] || "audio/webm" });
        setTake({ blob, url: URL.createObjectURL(blob), ext });
        setState("ready");
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setState("recording");
    } catch {
      stopMicro();
      toast.error("Micro inaccessible : autorisez-le dans votre navigateur, puis réessayez.");
    }
  };

  if (!supported) return <p className="m-0 px-4 sm:px-6 py-3 text-[13.5px] p-muted border-b" style={{ borderColor: "var(--p-line)" }}>Votre navigateur ne permet pas d’enregistrer une note vocale.</p>;

  return (
    <div className="flex flex-wrap items-center gap-2.5 px-4 sm:px-6 py-3 border-b" style={{ borderColor: "var(--p-line)" }}>
      {state === "idle" && <button type="button" className="p-btn-outline p-btn-sm" onClick={start}><Mic size={16} style={{ color: "var(--p-accent-text)" }} /> Enregistrer une note vocale</button>}
      {state === "recording" && (
        <>
          <span className="relative w-2.5 h-2.5 rounded-full p-live-dot flex-none" style={{ background: "var(--p-accent)", color: "var(--p-accent)" }} />
          <span className="text-[14px] font-medium tabular-nums" role="status">{clock(seconds)}</span>
          <span className="text-[12.5px] p-faint">jusqu’à {clock(MAX_SECONDS)}</span>
          <button type="button" className="p-btn-primary p-btn-sm ml-auto" onClick={() => recorder.current?.stop()}><Square size={14} fill="currentColor" /> Arrêter</button>
        </>
      )}
      {state === "ready" && take && (
        <>
          <audio controls src={take.url} className="flex-[1_1_220px] min-w-0 h-10" aria-label="Écouter la note vocale" />
          <span className="flex gap-2 ml-auto">
            <button type="button" className="p-btn-outline p-btn-sm" aria-label="Recommencer la note vocale" onClick={() => { setTake(null); setState("idle"); }}><RotateCcw size={15} /> Recommencer</button>
            <button type="button" className="p-btn-primary p-btn-sm" disabled={busy} onClick={() => onAdd(new File([take.blob], `Note vocale ${clock(seconds).replace(":", "m")}s.${take.ext}`, { type: take.blob.type }))}>Ajouter</button>
          </span>
        </>
      )}
    </div>
  );
}
