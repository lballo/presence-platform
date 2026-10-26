import { TRPCError } from "@trpc/server";
import { env } from "./env";

/**
 * Stockage de fichiers dans Supabase Storage.
 * Le serveur crée des URL d'envoi signées ; le navigateur envoie le fichier directement
 * (aucune limite de taille côté serveur). Buckets : « talks » et « forum » (lecture publique),
 * « messages » (privé : liens de téléchargement signés, valables une heure).
 */
export const BUCKETS = {
  talk: { bucket: "talks", maxMb: 500, videoOnly: true, public: true },
  forum: { bucket: "forum", maxMb: 500, videoOnly: true, public: true },
  message: { bucket: "messages", maxMb: 50, videoOnly: false, public: false },
} as const;
export type UploadKind = keyof typeof BUCKETS;

export const storageReady = () => !!(env.supabaseUrl && env.supabaseServiceKey);

const headers = () => ({ Authorization: `Bearer ${env.supabaseServiceKey}`, apikey: env.supabaseServiceKey, "Content-Type": "application/json" });

export async function createSignedUpload(kind: UploadKind, memberId: number, filename: string, contentType: string, size: number) {
  if (!storageReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le stockage des fichiers n’est pas encore configuré (SUPABASE_SERVICE_ROLE_KEY)." });
  const cfg = BUCKETS[kind];
  if (cfg.videoOnly && !contentType.startsWith("video/")) throw new TRPCError({ code: "BAD_REQUEST", message: "Choisissez un fichier vidéo (mp4, mov, webm)." });
  if (size > cfg.maxMb * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: `Le fichier dépasse ${cfg.maxMb} Mo.` });
  const ext = (filename.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const path = `membre-${memberId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await fetch(`${env.supabaseUrl}/storage/v1/object/upload/sign/${cfg.bucket}/${path}`, { method: "POST", headers: headers(), body: "{}" });
  if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Supabase Storage : ${res.status} ${await res.text()}` });
  const data = (await res.json()) as { url: string };
  return {
    uploadUrl: `${env.supabaseUrl}/storage/v1${data.url}`,
    apikey: env.supabaseAnonKey || env.supabaseServiceKey,
    contentType: contentType || "application/octet-stream",
    path,
    publicUrl: cfg.public ? `${env.supabaseUrl}/storage/v1/object/public/${cfg.bucket}/${path}` : null,
  };
}

/** Lien de téléchargement temporaire pour un fichier d'un bucket privé. */
export async function signedDownloadUrl(kind: UploadKind, path: string, downloadName?: string, expiresIn = 3600) {
  if (!storageReady()) return null;
  const res = await fetch(`${env.supabaseUrl}/storage/v1/object/sign/${BUCKETS[kind].bucket}/${path}`, { method: "POST", headers: headers(), body: JSON.stringify({ expiresIn }) });
  if (!res.ok) return null;
  const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const url = data.signedURL ?? data.signedUrl;
  if (!url) return null;
  const full = `${env.supabaseUrl}/storage/v1${url}`;
  return downloadName ? `${full}&download=${encodeURIComponent(downloadName)}` : full;
}
