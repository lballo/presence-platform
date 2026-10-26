import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { X, Send, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { CoachMascot } from "./CoachMascot";

// Suggestions adaptées à la page où l'on se trouve
const CONTEXT: { match: RegExp; prompts: string[] }[] = [
  { match: /^\/evenements/, prompts: ["Comment aborder un événement où je ne connais personne ?", "Aide-moi à préparer une présentation de moi en 30 secondes"] },
  { match: /^\/forum/, prompts: ["Aide-moi à formuler un retour bienveillant et précis", "Comment raconter une victoire sans me mettre en avant ?"] },
  { match: /^\/messages/, prompts: ["Aide-moi à écrire un premier message à un membre", "Comment relancer quelqu’un sans insister ?"] },
  { match: /^\/matching/, prompts: ["Comment préparer un premier échange de 30 minutes ?", "Que demander à un mentor la première fois ?"] },
  { match: /^\/ruches/, prompts: ["Comment animer une ruche pour qu’elle reste vivante ?", "Aide-moi à lancer un projet avec d’autres membres"] },
  { match: /^\/talk-show/, prompts: ["Aide-moi à trouver l’idée de mon talk", "Comment structurer un talk de dix minutes ?"] },
  { match: /^\/membres/, prompts: ["Avec qui devrais-je échanger en priorité ?", "Comment demander conseil à un pair ?"] },
];
const DEFAULT = ["J’ai une décision difficile à prendre", "Je prépare une prise de parole importante", "Une relation au travail me pèse"];
const HINT_KEY = "presence-coach-hint-seen";

export function CoachBubble() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(HINT_KEY) === "1"; } catch { /* stockage indisponible */ }
    if (seen) return;
    const t = window.setTimeout(() => setHint(true), 2500);
    return () => window.clearTimeout(t);
  }, []);
  const dismissHint = () => { setHint(false); try { sessionStorage.setItem(HINT_KEY, "1"); } catch { /* ignore */ } };

  // La page Présence IA contient déjà le coach en grand format
  if (pathname.startsWith("/presence-ia")) return null;

  return (
    <div className="fixed z-40 right-4 bottom-4 sm:right-6 sm:bottom-6 flex flex-col items-end gap-3 pointer-events-none">
      {open && <Panel pathname={pathname} onClose={() => setOpen(false)} />}
      {!open && hint && (
        <div className="p-pop pointer-events-auto max-w-[240px] p-3.5 pr-8 rounded-2xl rounded-br-md shadow-lg text-[14px] leading-snug relative" style={{ background: "var(--p-surface)", border: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
          Besoin d’un coup de pouce ? Je suis votre coach Présence.
          <button type="button" aria-label="Masquer" className="absolute top-2 right-2 p-muted" onClick={dismissHint}><X size={14} /></button>
        </div>
      )}
      <button
        type="button"
        aria-label={open ? "Fermer le coach Présence" : "Ouvrir le coach Présence"}
        aria-expanded={open}
        onClick={() => { setOpen(!open); dismissHint(); }}
        className="pointer-events-auto w-[68px] h-[68px] rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95"
        style={{ background: "var(--p-surface)", border: "1px solid var(--p-line)" }}
      >
        {open ? <X size={24} style={{ color: "var(--p-accent-text)" }} /> : <span className="p-mascot-bob"><CoachMascot size={52} /></span>}
      </button>
    </div>
  );
}

function Panel({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const me = trpc.members.me.useQuery();
  const history = trpc.coach.history.useQuery();
  const send = trpc.coach.send.useMutation({ onSuccess: () => utils.coach.history.invalidate(), onError: (e) => toast.error(e.message) });
  const reset = trpc.coach.reset.useMutation({ onSuccess: () => utils.coach.history.invalidate() });
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prompts = CONTEXT.find((c) => c.match.test(pathname))?.prompts ?? DEFAULT;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [history.data, pending, send.isPending]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (t: string) => {
    const v = t.trim();
    if (!v || send.isPending) return;
    setText(""); setPending(v);
    try { await send.mutateAsync({ text: v }); } finally { setPending(null); }
  };
  const empty = (history.data?.length ?? 0) === 0 && !pending;

  return (
    <section role="dialog" aria-label="Coach Présence" className="p-pop pointer-events-auto w-[min(390px,calc(100vw-32px))] h-[min(600px,calc(100vh-120px))] rounded-3xl shadow-2xl flex flex-col overflow-hidden" style={{ background: "var(--p-surface)", border: "1px solid var(--p-line)" }}>
      <header className="flex items-center gap-3 px-4 py-3 border-b flex-none" style={{ borderColor: "var(--p-line)", background: "var(--p-surface-2)" }}>
        <CoachMascot size={40} mood={send.isPending ? "thinking" : "happy"} />
        <span className="flex flex-col flex-1 min-w-0"><span className="font-semibold text-[15px]">Coach Présence</span><span className="text-[12px] p-muted">{send.isPending ? "réfléchit…" : "à votre écoute, en toute confidentialité"}</span></span>
        {!empty && <button type="button" title="Nouvelle conversation" aria-label="Nouvelle conversation" className="w-9 h-9 rounded-full flex items-center justify-center p-muted" onClick={() => reset.mutate()}><RotateCcw size={16} /></button>}
        <button type="button" aria-label="Fermer" className="w-9 h-9 rounded-full flex items-center justify-center p-muted" onClick={onClose}><X size={18} /></button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {empty && (
          <div className="flex flex-col gap-3">
            <div className="px-3.5 py-3 rounded-2xl rounded-tl-md text-[14.5px] leading-relaxed" style={{ background: "var(--p-surface-2)" }}>
              Bonjour {me.data?.firstName} ! De quoi avez-vous besoin ? Une décision, une prise de parole, une relation qui pèse… Dites-le avec vos mots.
            </div>
          </div>
        )}
        {history.data?.map((m) => <Line key={m.id} user={m.role === "user"} text={m.text} />)}
        {pending && <Line user text={pending} />}
        {send.isPending && <div className="text-[13px] p-muted flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Le coach réfléchit…</div>}
        <div ref={endRef} />
      </div>

      {(empty || history.data?.length === 0) && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 flex-none">
          {prompts.map((p) => <button key={p} type="button" className="text-left text-[12.5px] px-3 py-1.5 rounded-full border" style={{ borderColor: "var(--p-accent-line)", color: "var(--p-accent-text)", background: "var(--p-accent-soft)" }} onClick={() => submit(p)}>{p}</button>)}
        </div>
      )}

      <form className="flex items-end gap-2 p-3 border-t flex-none" style={{ borderColor: "var(--p-line)" }} onSubmit={(e) => { e.preventDefault(); submit(text); }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(text); } }}
          placeholder="Écrivez au coach…"
          className="p-field flex-1 resize-none max-h-[120px] text-[14.5px]"
          style={{ minHeight: 44 }}
        />
        <button type="submit" className="p-btn-primary w-11 h-11 p-0 rounded-full flex items-center justify-center flex-none" disabled={send.isPending || !text.trim()} aria-label="Envoyer"><Send size={16} /></button>
      </form>
    </section>
  );
}

function Line({ user, text }: { user: boolean; text: string }) {
  return (
    <div className={`flex ${user ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[14.5px] leading-relaxed whitespace-pre-wrap ${user ? "rounded-br-md" : "rounded-tl-md"}`} style={user ? { background: "var(--p-accent)", color: "#fff" } : { background: "var(--p-surface-2)", color: "var(--p-ink)" }}>{text}</div>
    </div>
  );
}
