import { useEffect, useRef } from "react";
import { trpc, type RouterOutputs } from "@/providers/trpc";

const MAX_AGE_MS = 60 * 1000;

/** En ouvrant Construire, on relit Notion sans attendre : ce qui vient d'y changer apparaît tout de suite. */
export function useFreshNotion(status: RouterOutputs["build"]["status"] | undefined) {
  const utils = trpc.useUtils();
  const sync = trpc.build.syncNow.useMutation({ onSuccess: (r) => { if (r.changed) void utils.build.invalidate(); else void utils.build.status.invalidate(); } });
  const asked = useRef(false);
  const ready = !!status?.notionReady && !status.running;
  const last = status?.lastSync ? +new Date(status.lastSync.startedAt) : 0;
  useEffect(() => {
    if (!ready || asked.current || Date.now() - last < MAX_AGE_MS) return;
    asked.current = true;
    sync.mutate({ full: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, last]);
}
