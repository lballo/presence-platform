/**
 * Présence IA : la vidéo part du navigateur en morceaux de quelques mégaoctets, et chaque morceau est
 * transmis aussitôt à Gemini. Le serveur ne garde jamais la vidéo entière, en mémoire comme sur disque :
 * c'est ce qui bloquait les vidéos longues sur la petite instance Render.
 */
import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { advice, speechScores, speeches } from "../../db/schema";
import {
  GEMINI_MAX_BYTES, analyzeVideoWithGemini, deleteGeminiFile, queryGeminiUpload, sendGeminiChunk, startGeminiUpload, waitForFileActive, type GeminiFile,
} from "./gemini";

export const MAX_VIDEO_BYTES = GEMINI_MAX_BYTES;
export const MAX_VIDEO_SECONDS = 60 * 60;
const LOW_RESOLUTION_AFTER_SECONDS = 20 * 60;
const TARGET_CHUNK = 8 * 1024 * 1024;
const STALE_MS = 45 * 60 * 1000;

// Formats que Gemini lit ; le QuickTime de l'iPhone s'y appelle « video/mov ».
const GEMINI_TYPES: Record<string, string> = { "video/quicktime": "video/mov", "video/x-m4v": "video/mp4" };
const ACCEPTED = ["video/mp4", "video/mpeg", "video/mov", "video/avi", "video/x-msvideo", "video/webm", "video/3gpp", "video/wmv", "video/x-flv", "video/mpg"];

export function geminiMimeType(type: string): string | null {
  const t = GEMINI_TYPES[type] ?? type;
  return ACCEPTED.includes(t) ? (t === "video/x-msvideo" ? "video/avi" : t) : null;
}

type Session = {
  memberId: number;
  uploadUrl: string;
  size: number;
  received: number;
  durationSec: number | null;
  busy: boolean;
  touchedAt: number;
};

const sessions = new Map<number, Session>();
const analysing = new Set<number>();

export class UploadError extends Error {
  status: 400 | 404 | 409 | 502;
  received?: number;
  constructor(message: string, status: UploadError["status"], received?: number) {
    super(message);
    this.status = status;
    this.received = received;
  }
}

/** Crée l'analyse et ouvre l'envoi chez Gemini. Renvoie la taille des morceaux à envoyer. */
export async function startVideoUpload(memberId: number, input: { title: string; size: number; type: string; durationSec?: number }) {
  const mimeType = geminiMimeType(input.type);
  if (!mimeType) throw new UploadError("Ce format de vidéo n’est pas lu. Choisissez un fichier MP4, MOV ou WebM.", 400);
  if (input.size <= 0) throw new UploadError("Ce fichier est vide.", 400);
  if (input.size > MAX_VIDEO_BYTES) throw new UploadError("La vidéo dépasse 2 Go.", 400);
  if (input.durationSec && input.durationSec > MAX_VIDEO_SECONDS + 30) throw new UploadError("La vidéo dépasse une heure. Coupez-la en plusieurs parties.", 400);

  const { uploadUrl, granularity } = await startGeminiUpload(input.size, mimeType, input.title);
  const chunkSize = Math.max(1, Math.round(TARGET_CHUNK / granularity)) * granularity;
  const durationSec = input.durationSec ? Math.round(input.durationSec) : null;
  const [row] = await getDb().insert(speeches).values({ title: input.title, duration: durationSec, videoUrl: "gemini", memberId, status: "uploading" }).returning({ id: speeches.id });
  sessions.set(row.id, { memberId, uploadUrl, size: input.size, received: 0, durationSec, busy: false, touchedAt: Date.now() });
  return { id: row.id, chunkSize };
}

/** Un morceau reçu du navigateur, transmis tel quel à Gemini. Le dernier lance l'analyse. */
export async function receiveChunk(memberId: number, speechId: number, offset: number, bytes: Uint8Array<ArrayBuffer>) {
  const s = sessions.get(speechId);
  if (!s || s.memberId !== memberId) throw new UploadError("Cet envoi n’existe plus. Recommencez avec la vidéo.", 404);
  if (s.busy) throw new UploadError("Un morceau est déjà en cours d’envoi.", 409, s.received);
  if (offset !== s.received) throw new UploadError("Morceau inattendu.", 409, s.received);
  if (bytes.byteLength === 0 || offset + bytes.byteLength > s.size) throw new UploadError("Morceau de taille invalide.", 400, s.received);
  const last = offset + bytes.byteLength === s.size;
  s.busy = true;
  s.touchedAt = Date.now();
  try {
    const file = await sendGeminiChunk(s.uploadUrl, offset, bytes, last);
    s.received += bytes.byteLength;
    if (file) {
      sessions.delete(speechId);
      void runAnalysis(speechId, file, s);
    }
    return { received: s.received, done: last };
  } catch (e) {
    // Gemini a peut-être reçu une partie du morceau : on repart de ce qu'il a vraiment.
    const real = await queryGeminiUpload(s.uploadUrl);
    if (real !== null) s.received = real;
    throw new UploadError(e instanceof Error ? e.message : "Envoi interrompu.", 502, s.received);
  } finally {
    s.busy = false;
  }
}

async function runAnalysis(speechId: number, file: GeminiFile, s: Session) {
  const db = getDb();
  analysing.add(speechId);
  await db.update(speeches).set({ status: "processing", updatedAt: new Date() }).where(eq(speeches.id, speechId));
  try {
    await waitForFileActive(file.uri, s.size);
    const lowResolution = (s.durationSec ?? 0) > LOW_RESOLUTION_AFTER_SECONDS || (!s.durationSec && s.size > 400 * 1024 * 1024);
    const analysis = await analyzeVideoWithGemini(file, { lowResolution });
    for (const [category, data] of Object.entries(analysis.scores)) {
      await db.insert(speechScores).values({ speechId, category: category as "voice" | "bodyLanguage" | "structure" | "impact", score: data.score, insight: data.insight });
    }
    for (const a of analysis.advice) {
      await db.insert(advice).values({ speechId, category: a.category, priority: a.priority, title: a.title, description: a.description, actionStep: a.actionStep });
    }
    await db.update(speeches).set({ overallScore: analysis.overallScore, summary: analysis.summary, keyInsight: analysis.keyInsight, status: "completed", updatedAt: new Date() }).where(eq(speeches.id, speechId));
  } catch (error) {
    console.error(`[speech ${speechId}] analyse échouée :`, error);
    // Pour une analyse en échec, le résumé porte la raison affichée au membre.
    await db.update(speeches).set({ status: "failed", summary: failureMessage(error), updatedAt: new Date() }).where(eq(speeches.id, speechId));
  } finally {
    analysing.delete(speechId);
    deleteGeminiFile(file.uri).catch(() => {});
  }
}

function failureMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  if (/trop longtemps/.test(text)) return "Gemini a mis trop longtemps à préparer la vidéo. Réessayez, ou envoyez une version plus courte.";
  if (/pas pu lire/.test(text)) return "Gemini n’a pas pu lire cette vidéo. Essayez de l’exporter en MP4.";
  return "L’analyse a échoué. Réessayez dans quelques minutes.";
}

/** Envois abandonnés (page fermée) ou analyses perdues (redémarrage du serveur) : passés en échec. */
export async function markStaleSpeeches(memberId: number) {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.touchedAt > STALE_MS) sessions.delete(id);
  const live = [...sessions.keys(), ...analysing];
  const rows = await getDb().select({ id: speeches.id }).from(speeches)
    .where(and(eq(speeches.memberId, memberId), inArray(speeches.status, ["uploading", "processing"]), lt(speeches.updatedAt, new Date(now - STALE_MS))));
  const stale = rows.map((r) => r.id).filter((id) => !live.includes(id));
  if (stale.length) {
    await getDb().update(speeches).set({ status: "failed", summary: "L’envoi a été interrompu avant la fin. Recommencez avec la vidéo.", updatedAt: new Date() }).where(inArray(speeches.id, stale));
  }
}
