import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

/** Client Supabase côté serveur (clé service) : vérification des jetons et invitations. */
export function supabaseAdmin(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceKey) throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires à la connexion.");
  client ??= createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}

// Le membre est relu en base à chaque requête (une suspension s'applique aussitôt) ;
// seule la validité du jeton auprès de Supabase est gardée 30 secondes.
const verified = new Map<string, { userId: string; until: number }>();

/** Vérifie un jeton de session Supabase et renvoie l'identifiant de l'utilisateur, ou null. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  const now = Date.now();
  const hit = verified.get(token);
  if (hit && hit.until > now) return hit.userId;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    verified.delete(token);
    return null;
  }
  if (verified.size > 2000) verified.clear();
  verified.set(token, { userId: data.user.id, until: now + 30_000 });
  return data.user.id;
}
