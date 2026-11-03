import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";

/** Prévenir avant de quitter la page avec une saisie non enregistrée. */
export function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

export function IssueList({ issues }: { issues: string[] }) {
  if (!issues.length) return null;
  return (
    <details className="p-3 rounded-xl text-[13px]" style={{ background: "var(--p-surface-2)" }}>
      <summary className="cursor-pointer font-medium">{issues.length} point{issues.length > 1 ? "s" : ""} à regarder</summary>
      <ul className="m-0 mt-2 pl-4 list-disc flex flex-col gap-1">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
    </details>
  );
}

/** La page a changé dans Notion pendant la saisie : rien n'est écrasé, on propose de reprendre la version de Notion. */
export function NotionConflict({ onResolved }: { onResolved: () => void }) {
  const utils = trpc.useUtils();
  const sync = trpc.build.syncNow.useMutation({ onSuccess: async () => { await utils.build.invalidate(); onResolved(); toast.success("Repris depuis Notion"); }, onError: (e) => toast.error(e.message) });
  return (
    <div role="alert" className="p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-[14px]" style={{ background: "var(--p-accent-soft)" }}>
      <span className="flex-[1_1_280px]">Cette page a changé dans Notion pendant que vous la modifiiez. Rien n’a été écrasé. Reprendre la version de Notion efface vos modifications non enregistrées ici.</span>
      <button type="button" className="cr-btn cr-btn-primary" disabled={sync.isPending} onClick={() => sync.mutate({ full: false })}>Reprendre la version de Notion</button>
    </div>
  );
}

export type SaveState = "saved" | "dirty" | "saving" | "error";

/**
 * L'enregistrement dans Notion, sans jamais couper la saisie : la page ne se recharge pas, les écritures partent une à une.
 * `auto` : tant que les membres ne voient pas la page, elle s'enregistre toute seule au fil de l'eau.
 * Sur une page publiée, rien ne change pour les membres avant un enregistrement volontaire.
 */
export function useDocSaver({ auto, ready, write }: { auto: boolean; ready: boolean; write: () => Promise<void> }) {
  const [state, setState] = useState<SaveState>("saved");
  const version = useRef(0);
  const written = useRef(0);
  const running = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const live = useRef({ auto, ready, write });
  live.current = { auto, ready, write };
  const pending = useCallback(() => version.current !== written.current, []);

  /** Une écriture. Si on a continué d'écrire pendant ce temps, la suivante attend une pause. */
  const once = useCallback(async (): Promise<boolean> => {
    if (running.current) return running.current;
    if (!pending()) return true;
    if (!live.current.ready) { setState("dirty"); return false; }
    const v = version.current;
    const run = (async () => {
      setState("saving");
      try {
        await live.current.write();
        written.current = v;
        setState(version.current === v ? "saved" : "dirty");
        return true;
      } catch {
        setState("error");
        return false;
      } finally {
        running.current = null;
      }
    })();
    running.current = run;
    const ok = await run;
    if (ok && pending() && live.current.auto) timer.current = window.setTimeout(() => void once(), 2500);
    return ok;
  }, [pending]);

  /** Vrai quand tout ce qui a été saisi est dans Notion. Attend l'écriture en cours, s'il y en a une. */
  const saveNow = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    for (;;) {
      if (!(await once())) return false;
      if (!pending()) return true;
    }
  }, [once, pending]);

  const touch = useCallback(() => {
    version.current++;
    setState((s) => (s === "saving" ? s : "dirty"));
    window.clearTimeout(timer.current);
    if (live.current.auto) timer.current = window.setTimeout(() => void once(), 2500);
  }, [once]);

  /** Une modification à enregistrer tout de suite : publier, dépublier. */
  const touchAndSave = useCallback(() => { version.current++; void saveNow(); }, [saveNow]);

  // Retour arrière du navigateur sur une page en brouillon : la dernière saisie part quand même
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (pending() && !running.current && live.current.auto && live.current.ready) live.current.write().catch(() => toast.error("Votre dernière saisie n’a pas pu être enregistrée dans Notion."));
  }, [pending]);

  return { state, touch, touchAndSave, saveNow, pending };
}

export function SaveStatus({ state, auto }: { state: SaveState; auto: boolean }) {
  const content: Record<SaveState, ReactNode> = {
    saved: <><Check size={12} strokeWidth={2.4} /> Enregistré</>,
    saving: <><Loader2 size={12} className="animate-spin" /> Écriture dans Notion…</>,
    dirty: auto ? "Modifications en attente" : "Non enregistré : les membres voient encore l’ancienne version",
    error: <><AlertCircle size={12} /> Échec de l’enregistrement</>,
  };
  return <span role="status" className="flex items-center gap-1.5 text-[11px] pr-1.5 max-w-[250px] leading-tight" style={{ color: state === "error" ? "var(--p-accent)" : "var(--p-ink-2)" }}>{content[state]}</span>;
}

/**
 * Quitter la page par un lien avec une saisie en attente. En brouillon, on enregistre et on continue.
 * Sur une page publiée, enregistrer change ce que voient les membres : la question est posée.
 */
export function useLeaveGuard({ pending, auto, save }: { pending: () => boolean; auto: boolean; save: () => Promise<boolean> }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState<string | null>(null);
  const live = useRef({ pending, auto, save });
  live.current = { pending, auto, save };
  const discard = useRef(false); // « Ne pas enregistrer » : le lien suivant passe
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (discard.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || !live.current.pending()) return;
      const a = (e.target as HTMLElement).closest("a");
      const href = a?.getAttribute("href");
      if (!a || !href?.startsWith("/") || a.target === "_blank") return;
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      if (live.current.auto) void live.current.save().then((ok) => { if (ok) navigate(href); else toast.error("Enregistrement impossible : restez sur la page pour garder votre saisie."); });
      else setAsking(href);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [navigate]);
  const dialog = (
    <Dialog open={asking !== null} onOpenChange={(o) => { if (!o) setAsking(null); }}>
      <DialogContent className="sm:max-w-[460px]" aria-describedby={undefined}>
        <DialogTitle className="text-[20px]">Enregistrer vos modifications ?</DialogTitle>
        <p className="m-0 text-[14px] p-muted">Cette page est publiée : enregistrer change ce que voient les membres. Sans enregistrer, vos dernières modifications sont perdues.</p>
        <span className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="cr-btn" onClick={() => setAsking(null)}>Rester ici</button>
          <button type="button" className="cr-btn" onClick={() => { const to = asking!; setAsking(null); discard.current = true; navigate(to); }}>Ne pas enregistrer</button>
          <button type="button" className="cr-btn cr-btn-primary" onClick={() => { const to = asking!; setAsking(null); void live.current.save().then((ok) => { if (ok) navigate(to); }); }}>Enregistrer</button>
        </span>
      </DialogContent>
    </Dialog>
  );
  return dialog;
}
