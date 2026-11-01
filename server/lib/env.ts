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
  // Courte vidéo de Laura dans le premier panneau d'accueil (vide : panneau sans vidéo)
  welcomeVideoUrl: process.env.WELCOME_VIDEO_URL ?? "",
  // Stockage des vidéos de talks (bucket Supabase « talks », envoi direct depuis le navigateur via URL signée)
  supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  // Clé de l'intégration interne Notion, connectée à la seule page « Formations Présence »
  notionToken: process.env.NOTION_TOKEN ?? "",
  notionApiBase: (process.env.NOTION_API_BASE ?? "https://api.notion.com").replace(/\/$/, ""),
  notionFormations: process.env.NOTION_FORMATIONS_SOURCE ?? "0e9a7241-e511-48be-8b84-4c3646e46048",
  notionModules: process.env.NOTION_MODULES_SOURCE ?? "be28ef82-c56e-4c06-9a6c-d8927fbd9fde",
  // Clé de chiffrement du journal, des résultats de tests et de la mémoire du coach (32 octets en base64)
  privateDataKey: process.env.PRIVATE_DATA_KEY ?? "",
  geminiApiBase: (process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com").replace(/\/$/, ""),
  // Relances par e-mail : l'offre gratuite de Render bloque le SMTP, l'envoi passe donc par l'API de Resend
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailApiBase: (process.env.EMAIL_API_BASE ?? "https://api.resend.com").replace(/\/$/, ""),
  emailFrom: process.env.EMAIL_FROM ?? "Laura Ballo <contact@lauraballo.com>",
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? "contact@lauraballo.com",
  calendlyUrl: process.env.CALENDLY_URL ?? "",
  calendlyExploUrl: process.env.CALENDLY_EXPLO_URL ?? "",
};
