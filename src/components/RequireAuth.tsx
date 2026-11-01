import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/providers/auth";
import { trpc } from "@/providers/trpc";
import Accueil from "@/pages/onboarding/Accueil";

/** Ouvre l'application aux seuls comptes connectés, actifs et dont le mot de passe est choisi. */
export default function RequireAuth() {
  const { session, loading, signOut } = useAuth();
  const { pathname, search } = useLocation();
  const status = trpc.auth.status.useQuery(undefined, { enabled: !!session, retry: false });
  const orphan = status.data?.state === "anonymous"; // session Supabase sans fiche membre

  useEffect(() => {
    if (orphan) signOut();
  }, [orphan]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || (session && status.isLoading)) {
    return <div className="min-h-screen flex items-center justify-center p-muted text-[15px]">Un instant…</div>;
  }
  if (!session || orphan) return <Navigate to={pathname === "/" ? "/connexion" : `/connexion?retour=${encodeURIComponent(pathname + search)}`} replace />;
  if (status.data?.state === "blocked") return <Navigate to="/acces-termine" replace />;
  if (status.data?.state === "ok" && status.data.needsPassword) return <Navigate to="/choisir-mot-de-passe" replace />;
  if (status.data?.state === "ok" && status.data.needsOnboarding) return <Accueil />;
  return <Outlet />;
}

/** Pages ouvertes sans compte (événement public) : un membre connecté passe quand même par l'accueil. */
export function OnboardingGate() {
  const { session } = useAuth();
  const status = trpc.auth.status.useQuery(undefined, { enabled: !!session, retry: false });
  if (session && status.data?.state === "ok" && status.data.needsPassword) return <Navigate to="/choisir-mot-de-passe" replace />;
  if (session && status.data?.state === "ok" && status.data.needsOnboarding) return <Accueil />;
  return <Outlet />;
}
