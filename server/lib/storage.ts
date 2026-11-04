import { TRPCError } from "@trpc/server";
import { env } from "./env";

/**
 * Stockage de fichiers dans Supabase Storage.
 * Le serveur crée des URL d'envoi signées ; le navigateur envoie le fichier directement
 * (aucune limite de taille côté serveur). Buckets : « talks », « forum » et « forum-images » (lecture publique),
 * « messages » et « forum-fichiers » (privés : liens de téléchargement signés, valables une heure).
 */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const BUCKETS: Record<"talk" | "eventReplay" | "forum" | "forumImage" | "forumFile" | "message" | "eventImage" | "avatar" | "courseImage" | "courseVideo" | "courseFile" | "testFile", { bucket: string; maxMb: number; types?: "video" | string[]; public: boolean }> = {
  talk: { bucket: "talks", maxMb: 500, types: "video", public: true },
  eventReplay: { bucket: "talks", maxMb: 500, types: "video", public: true }, // l'enregistrement d'un événement en ligne
  forum: { bucket: "forum", maxMb: 500, types: "video", public: true },
  forumImage: { bucket: "forum-images", maxMb: 10, types: IMAGE_TYPES, public: true },
  forumFile: { bucket: "forum-fichiers", maxMb: 50, public: false },
  eventImage: { bucket: "event-images", maxMb: 10, types: PHOTO_TYPES, public: true },
  avatar: { bucket: "avatars", maxMb: 5, types: PHOTO_TYPES, public: true },
  message: { bucket: "messages", maxMb: 50, public: false },
  // Médias des formations : ajoutés depuis Construire, ou recopiés depuis Notion (ses liens expirent)
  courseImage: { bucket: "course-images", maxMb: 10, types: IMAGE_TYPES, public: true },
  courseVideo: { bucket: "course-videos", maxMb: 500, types: "video", public: true },
  courseFile: { bucket: "course-files", maxMb: 50, public: true },
  // Les tests HTML ne sortent du bucket que par /api/test-html, dans un cadre isolé
  testFile: { bucket: "test-files", maxMb: 15, types: ["text/html"], public: false },
};
export type UploadKind = keyof typeof BUCKETS;

/** Une image chargée dans ce bucket public de notre stockage, jamais une image externe. */
export const isOurImage = (kind: "eventImage" | "avatar" | "forumImage" | "courseImage", url: string) => isOurFile(kind, url);

/** Un fichier de ce bucket public de notre stockage (une vidéo YouTube, par exemple, n'en est pas un). */
export const isOurFile = (kind: UploadKind, url: string | null | undefined) => !!url && url.startsWith(`${env.supabaseUrl}/storage/v1/object/public/${BUCKETS[kind].bucket}/`) && !url.includes("..");

export const storageReady = () => !!(env.supabaseUrl && env.supabaseServiceKey);

const headers = () => ({ Authorization: `Bearer ${env.supabaseServiceKey}`, apikey: env.supabaseServiceKey, "Content-Type": "application/json" });

export async function createSignedUpload(kind: UploadKind, memberId: number, filename: string, contentType: string, size: number) {
  if (!storageReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le stockage des fichiers n’est pas encore configuré (SUPABASE_SERVICE_ROLE_KEY)." });
  const cfg = BUCKETS[kind];
  if (cfg.types === "video" && !contentType.startsWith("video/")) throw new TRPCError({ code: "BAD_REQUEST", message: "Choisissez un fichier vidéo (mp4, mov, webm)." });
  if (Array.isArray(cfg.types) && !cfg.types.includes(contentType)) throw new TRPCError({ code: "BAD_REQUEST", message: cfg.types === IMAGE_TYPES ? "Choisissez une image (jpg, png, webp ou gif)." : cfg.types === PHOTO_TYPES ? "Choisissez une photo (jpg, png ou webp)." : "Choisissez un fichier HTML (.html)." });
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

/**
 * Retire un fichier d'un bucket public d'après son adresse publique.
 * Ne touche qu'aux fichiers de ce bucket chez nous : une adresse extérieure (YouTube…) renvoie false sans rien faire.
 */
export async function removePublicFile(kind: UploadKind, url: string | null): Promise<boolean> {
  if (!url || !storageReady()) return false;
  const { bucket } = BUCKETS[kind];
  const prefix = `${env.supabaseUrl}/storage/v1/object/public/${bucket}/`;
  const path = url.split("?")[0].slice(prefix.length);
  if (!url.startsWith(prefix) || !path || path.includes("..")) return false;
  const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${bucket}/${path}`, { method: "DELETE", headers: headers() });
  return res.ok;
}

/** Enregistre un fichier côté serveur (recopie depuis Notion) et renvoie son adresse publique. */
export async function uploadBuffer(kind: UploadKind, path: string, data: Buffer, contentType: string): Promise<string> {
  const { bucket } = BUCKETS[kind];
  const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.supabaseServiceKey}`, apikey: env.supabaseServiceKey, "Content-Type": contentType, "x-upsert": "true" },
    body: new Uint8Array(data),
  });
  if (!res.ok) throw new Error(`Supabase Storage : ${res.status}`);
  return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

/** Lit un fichier d'un bucket privé côté serveur. Absent : null. */
export async function downloadBuffer(kind: UploadKind, path: string): Promise<Buffer | null> {
  if (!storageReady()) return null;
  const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${BUCKETS[kind].bucket}/${path}`, { headers: { Authorization: `Bearer ${env.supabaseServiceKey}`, apikey: env.supabaseServiceKey } });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
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
