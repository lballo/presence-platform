import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { readTestHeight, readTestResult, type TestResult } from "@/lib/courseTest";

/**
 * Un test déposé sur le réseau, servi par /api/test-html dans un cadre isolé.
 */
export function HostedTest({ src, title, onResult }: { src: string; title: string; onResult: (r: TestResult) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(640);
  const handler = useRef(onResult);
  useEffect(() => { handler.current = onResult; }, [onResult]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Un cadre isolé n'a pas d'origine : c'est « null ». Seul ce cadre-là est écouté.
      if (e.source !== frame.current?.contentWindow || e.origin !== "null") return;
      const h = readTestHeight(e.data);
      if (h) { setHeight(h); return; }
      const result = readTestResult(e.data);
      if (result) handler.current(result);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  // Sans allow-same-origin : le test ne peut lire ni la session, ni le stockage, ni la page de l'application.
  return <iframe ref={frame} src={src} title={title} sandbox="allow-scripts allow-forms allow-modals allow-downloads" referrerPolicy="no-referrer" className="w-full rounded-2xl border" style={{ height, borderColor: "var(--p-line)", background: "#fff" }} />;
}

/**
 * Un test en page HTML autonome, sur un autre domaine que l'application.
 * Seuls les messages de cette page, venant de son origine exacte, sont lus : tout autre message est ignoré.
 */
export function TestEmbed({ url, title, onResult }: { url: string; title: string; onResult: (r: TestResult) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(640);
  const origin = useMemo(() => { try { return new URL(url).origin; } catch { return null; } }, [url]);
  const handler = useRef(onResult);
  useEffect(() => { handler.current = onResult; }, [onResult]);

  useEffect(() => {
    if (!origin) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return;
      const h = readTestHeight(e.data);
      if (h) { setHeight(h); return; }
      const result = readTestResult(e.data);
      if (result) handler.current(result);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  if (!origin || origin === window.location.origin) return <p className="m-0 text-[14px] p-muted">Ce test ne peut pas s’afficher ici.</p>;
  return (
    <div className="flex flex-col gap-2">
      {/* Le test reste enfermé dans son cadre : il ne peut ni changer de page, ni lire l'application. */}
      <iframe ref={frame} src={url} title={title} sandbox="allow-scripts allow-forms allow-same-origin allow-popups" referrerPolicy="no-referrer" className="w-full rounded-2xl border" style={{ height, borderColor: "var(--p-line)", background: "#fff" }} />
      <a href={url} target="_blank" rel="noopener noreferrer" className="p-link text-[13px] flex items-center gap-1.5 self-start"><ExternalLink size={13} /> Le test ne s’affiche pas ? Ouvrez-le à part (votre résultat ne sera alors pas enregistré).</a>
    </div>
  );
}
