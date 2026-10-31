import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/providers/trpc";

type AuthState = { session: Session | null; loading: boolean; signOut: () => Promise<void> };

const AuthContext = createContext<AuthState>({ session: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase().auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase().auth.signOut();
    queryClient.clear(); // rien du compte précédent ne reste en mémoire
  };

  return <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
