import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { CoachMascot } from "@/components/CoachMascot";
import { HONEY_LINES } from "@/content/accueil";

/** Chaque gain s'annonce par une petite animation du coach rouge (« +20 miels »), un à la fois. */
export function HoneyToast() {
  const utils = trpc.useUtils();
  const pending = trpc.honey.unannounced.useQuery(undefined, { refetchInterval: 30000 });
  const done = trpc.honey.markAnnounced.useMutation({ onSuccess: () => utils.honey.unannounced.invalidate() });
  const first = pending.data?.[0];
  const shown = useRef<number | null>(null);

  useEffect(() => {
    if (!first || shown.current === first.id) return;
    shown.current = first.id;
    const t = window.setTimeout(() => { shown.current = null; done.mutate({ id: first.id }); }, 3200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.id]);

  if (!first) return null;
  return (
    <div key={first.id} role="status" aria-live="polite" className="p-honey fixed z-[70] top-16 right-3 lg:top-6 lg:right-6 flex items-center gap-3 pl-3 pr-5 py-2.5 rounded-full shadow-2xl" style={{ background: "var(--p-surface)", border: "1px solid var(--p-accent-line)", color: "var(--p-ink)" }}>
      <span className="p-mascot-bob flex-none"><CoachMascot size={44} /></span>
      <span className="flex flex-col leading-tight">
        <span className="serif text-[24px] font-semibold" style={{ color: "var(--p-accent-text)" }}>+{first.gained} miels</span>
        <span className="text-[12.5px] p-muted">{HONEY_LINES[first.action] ?? "Le précieux nectar coule."}</span>
      </span>
    </div>
  );
}
