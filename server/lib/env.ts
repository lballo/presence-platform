import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Variable d’environnement manquante : ${name}`);
  }
  return value ?? "";
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // Pas d'authentification en v1 : le membre connecté est fixé ici (Hélène = 1 dans le seed).
  currentMemberId: Number(process.env.CURRENT_MEMBER_ID ?? 1),
  calendlyUrl: process.env.CALENDLY_URL ?? "",
  calendlyExploUrl: process.env.CALENDLY_EXPLO_URL ?? "",
};
