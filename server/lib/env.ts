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
  // Adresse publique de l'application (liens d'invitation)
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  // Page expliquant comment revenir, affichée quand un accès est terminé
  membershipUrl: process.env.MEMBERSHIP_URL ?? "",
  // Stockage des vidéos de talks (bucket Supabase « talks », envoi direct depuis le navigateur via URL signée)
  supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  calendlyUrl: process.env.CALENDLY_URL ?? "",
  calendlyExploUrl: process.env.CALENDLY_EXPLO_URL ?? "",
};
