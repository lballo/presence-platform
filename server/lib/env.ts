import "dotenv/config";

// Ne jette pas au chargement : une variable absente est signalée par /api/health
// et au moment de la première requête, plutôt que de faire planter toute l'API.
function required(name: string): string {
  return process.env[name] ?? "";
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // Pas d'authentification en v1 : le membre connecté est fixé ici (Hélène = 1 dans le seed).
  currentMemberId: Number(process.env.CURRENT_MEMBER_ID ?? 1),
  // Membre « administrateur » (valide les talks) tant qu'il n'y a pas d'authentification : Laura = 2 dans le seed.
  adminMemberId: Number(process.env.ADMIN_MEMBER_ID ?? 2),
  // Stockage des vidéos de talks (bucket Supabase « talks », envoi direct depuis le navigateur via URL signée)
  supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  calendlyUrl: process.env.CALENDLY_URL ?? "",
  calendlyExploUrl: process.env.CALENDLY_EXPLO_URL ?? "",
};
