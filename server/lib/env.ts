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
  notionSections: process.env.NOTION_SECTIONS_SOURCE ?? "be28ef82-c56e-4c06-9a6c-d8927fbd9fde",
  notionLecons: process.env.NOTION_LECONS_SOURCE ?? "967c97ab-f4a2-44dc-92ba-0736348024e8",
  // Page « Catalogue de tests » : lue seulement, jamais écrite
  notionThemes: process.env.NOTION_THEMES_SOURCE ?? "205b3cae-3e9c-4599-9c98-3625ca7d83b1",
  notionTests: process.env.NOTION_TESTS_SOURCE ?? "c1704579-844e-4b85-b6eb-0e1920288ae8",
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
  // Suivi du coaching : les bases de Laura, lues seulement (sauf le compte rendu d'une séance)
  notionCoachingOffers: process.env.NOTION_COACHING_OFFERS_SOURCE ?? "313075e1-27d2-80a0-a06d-000b3feef6b9",
  notionCoachingClients: process.env.NOTION_COACHING_CLIENTS_SOURCE ?? "127075e1-27d2-817d-bcf2-000bb2a66e96",
  notionCoachingEnrollments: process.env.NOTION_COACHING_ENROLLMENTS_SOURCE ?? "b1eeb59c-bfbf-4133-a667-1655124d594c",
  notionCoachingSessions: process.env.NOTION_COACHING_SESSIONS_SOURCE ?? "b0d80298-177a-4cf3-a12b-2f25fab354e3",
  // Réponses aux questionnaires de satisfaction du coaching (pas ceux des stagiaires, qui restent dans l'outil Qualiopi)
  notionCoachingSatisfaction: process.env.NOTION_COACHING_SATISFACTION_SOURCE ?? "2d2825d0-c3f7-405b-aeb1-391f9cc4a71c",
  // Abonnements : clé secrète Stripe (sk_live_… ou rk_live_…). Absente, la rubrique Abonnement l'indique.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeApiBase: (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, ""),
};
