import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AppConfig = { supabaseUrl: string; supabaseAnonKey: string; membershipUrl: string };

let client: SupabaseClient | null = null;
let config: AppConfig = { supabaseUrl: "", supabaseAnonKey: "", membershipUrl: "" };

/** Lit la configuration publique du serveur, avant le premier affichage. */
export async function loadConfig(): Promise<boolean> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return false;
    config = await res.json();
  } catch {
    return false;
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey) return false;
  // Session gardée dans le navigateur et renouvelée automatiquement.
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return true;
}

export const supabase = () => client!;
export const membershipUrl = () => config.membershipUrl;

export async function accessToken(): Promise<string | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}
