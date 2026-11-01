import { useEffect } from "react";
import { toast } from "sonner";
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
    <details className="p-3.5 rounded-xl text-[14px]" style={{ background: "rgba(176, 134, 60, .1)" }}>
      <summary className="cursor-pointer font-medium">{issues.length} point{issues.length > 1 ? "s" : ""} à regarder</summary>
      <ul className="m-0 mt-2 pl-5 list-disc flex flex-col gap-1">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
    </details>
  );
}

/** La page a changé dans Notion pendant la saisie : rien n'est écrasé, on propose de reprendre la version de Notion. */
export function NotionConflict({ onResolved }: { onResolved: () => void }) {
  const utils = trpc.useUtils();
  const sync = trpc.build.syncNow.useMutation({ onSuccess: async () => { await utils.build.invalidate(); onResolved(); toast.success("Repris depuis Notion"); }, onError: (e) => toast.error(e.message) });
  return (
    <div role="alert" className="p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-[14.5px]" style={{ background: "var(--p-accent-soft)" }}>
      <span className="flex-[1_1_280px]">Cette page a changé dans Notion pendant que vous la modifiiez. Rien n’a été écrasé. Reprendre la version de Notion efface vos modifications non enregistrées ici.</span>
      <button type="button" className="p-btn-primary p-btn-sm" disabled={sync.isPending} onClick={() => sync.mutate({ full: false })}>Reprendre la version de Notion</button>
    </div>
  );
}

export function SaveBar({ dirty, disabled, saving, onSave }: { dirty: boolean; disabled: boolean; saving: boolean; onSave: () => void }) {
  return (
    <div className="sticky bottom-[72px] lg:bottom-3 z-20 p-card p-2.5 pl-4 mr-[66px] lg:mr-[78px] flex items-center justify-between gap-3 shadow-lg">
      <span className="text-[13.5px] p-muted min-w-0 leading-snug">{dirty ? "Modifications non enregistrées." : "Tout est enregistré dans Notion."}</span>
      <button type="button" className="p-btn-primary p-btn-sm flex-none" disabled={disabled || saving} onClick={onSave}>{saving ? "Écriture…" : "Enregistrer"}</button>
    </div>
  );
}
