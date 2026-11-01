import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../server/router";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
import type { ReactNode } from "react";
import { accessToken, supabase } from "@/lib/supabase";

export const trpc = createTRPCReact<AppRouter>();

type AppError = { data?: { code?: string; accountBlock?: string | null } | null };

/** Session expirée ou compte bloqué en cours de route : on sort proprement de l'application. */
function handleAccessError(error: unknown) {
  const data = (error as AppError).data;
  if (data?.accountBlock) {
    if (window.location.pathname !== "/acces-termine") window.location.assign("/acces-termine");
  } else if (data?.code === "UNAUTHORIZED") {
    supabase().auth.signOut().then(() => queryClient.clear());
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAccessError }),
  // Après chaque action, on regarde si du miel a été gagné (le coach l'annonce).
  mutationCache: new MutationCache({ onError: handleAccessError, onSuccess: (_d, _v, _c, mutation) => { const key = mutation.options.mutationKey as unknown[] | undefined; if (!JSON.stringify(key ?? "").includes("honey")) void queryClient.invalidateQueries({ queryKey: [["honey"]] }); } }),
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        const code = (error as AppError).data?.code;
        return code !== "UNAUTHORIZED" && code !== "FORBIDDEN" && count < 3;
      },
    },
  },
});
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        const token = await accessToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
