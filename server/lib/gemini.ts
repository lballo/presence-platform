import { env } from "./env";

const MODEL = "gemini-2.5-flash";

export interface GeminiAnalysisResult {
  overallScore: number;
  summary: string;
  keyInsight: string;
  scores: {
    voice: { score: number; insight: string };
    bodyLanguage: { score: number; insight: string };
    structure: { score: number; insight: string };
    impact: { score: number; insight: string };
  };
  advice: Array<{
    category: "voice" | "bodyLanguage" | "structure" | "impact" | "general";
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    actionStep: string;
  }>;
}

const ANALYSIS_PROMPT = `Tu es un expert en prise de parole en public et en communication orale. 
Analyse cette vidéo d'une personne qui s'entraîne à parler en public.

Évalue les 4 dimensions suivantes sur 100 :
- voice (voix & ton) : débit, articulation, variation de ton, pauses, tics verbaux
- bodyLanguage (langage corporel) : posture, gestuelle, regard caméra, occupation de l'espace
- structure : introduction, transitions, clarté du message, conclusion
- impact : engagement, conviction, mémorabilité, connexion émotionnelle

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte avant ou après :
{
  "overallScore": <nombre entre 0 et 100>,
  "summary": "<résumé bienveillant de 2-3 phrases en français>",
  "keyInsight": "<1 observation clé la plus importante, max 20 mots>",
  "scores": {
    "voice": { "score": <0-100>, "insight": "<observation spécifique sur la voix, 1-2 phrases>" },
    "bodyLanguage": { "score": <0-100>, "insight": "<observation spécifique sur le corps, 1-2 phrases>" },
    "structure": { "score": <0-100>, "insight": "<observation spécifique sur la structure, 1-2 phrases>" },
    "impact": { "score": <0-100>, "insight": "<observation spécifique sur l'impact, 1-2 phrases>" }
  },
  "advice": [
    {
      "category": "<voice|bodyLanguage|structure|impact|general>",
      "priority": "<high|medium|low>",
      "title": "<titre court du conseil, max 8 mots>",
      "description": "<explication détaillée bienveillante, 2-3 phrases>",
      "actionStep": "<exercice pratique concret à faire immédiatement>"
    }
  ]
}

Fournis 3 à 5 conseils actionnables, classés par priorité (high en premier).
Sois encourageant, précis et bienveillant. L'objectif est d'aider la personne à progresser.`;

/** Gemini garde un fichier 48 heures et en accepte jusqu'à 2 Go. */
export const GEMINI_MAX_BYTES = 2 * 1024 * 1024 * 1024;

const base = () => env.geminiApiBase;

/**
 * Ouvre un envoi en plusieurs morceaux vers l'API Files de Gemini.
 * L'adresse renvoyée porte la session : elle reste côté serveur, jamais dans le navigateur.
 */
export async function startGeminiUpload(totalBytes: number, mimeType: string, displayName: string) {
  const res = await fetch(`${base()}/upload/v1beta/files?key=${env.geminiApiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(totalBytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
  });
  if (!res.ok) throw new Error(`Gemini refuse l’envoi (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  const uploadUrl = res.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini n’a pas renvoyé d’adresse d’envoi.");
  // Chaque morceau, sauf le dernier, doit être un multiple de cette taille.
  const granularity = Number(res.headers.get("x-goog-upload-chunk-granularity")) || 256 * 1024;
  return { uploadUrl, granularity };
}

export type GeminiFile = { uri: string; name: string; mimeType: string; state: string };

/** Envoie un morceau ; le dernier clôt l'envoi et renvoie le fichier créé. */
export async function sendGeminiChunk(uploadUrl: string, offset: number, bytes: Uint8Array<ArrayBuffer>, last: boolean): Promise<GeminiFile | null> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": last ? "upload, finalize" : "upload", "X-Goog-Upload-Offset": String(offset), "Content-Length": String(bytes.byteLength) },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Gemini n’a pas reçu le morceau (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  if (!last) return null;
  const data = (await res.json()) as { file?: GeminiFile };
  if (!data.file?.uri) throw new Error("Gemini n’a pas renvoyé le fichier.");
  return data.file;
}

/** Combien d'octets Gemini a vraiment reçus, pour reprendre après un morceau perdu. */
export async function queryGeminiUpload(uploadUrl: string): Promise<number | null> {
  const res = await fetch(uploadUrl, { method: "POST", headers: { "X-Goog-Upload-Command": "query" } }).catch(() => null);
  const received = res?.headers.get("x-goog-upload-size-received");
  return received ? Number(received) : null;
}

/** Gemini prépare la vidéo avant de pouvoir l'analyser : d'autant plus longtemps qu'elle est lourde. */
export async function waitForFileActive(fileUri: string, sizeBytes: number): Promise<void> {
  const fileName = fileUri.split("/").pop();
  const deadline = Date.now() + Math.min(25, 2 + Math.ceil(sizeBytes / (100 * 1024 * 1024))) * 60_000;
  while (Date.now() < deadline) {
    const resp = await fetch(`${base()}/v1beta/files/${fileName}?key=${env.geminiApiKey}`);
    if (!resp.ok) throw new Error("Impossible de suivre la préparation de la vidéo chez Gemini.");
    const data = (await resp.json()) as { state: string };
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new Error("Gemini n’a pas pu lire cette vidéo.");
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Gemini a mis trop longtemps à préparer la vidéo.");
}

/**
 * L'analyse elle-même. Au-delà de 20 minutes, la vidéo est lue en basse définition :
 * trois fois moins de jetons, ce qui laisse passer une heure de prise de parole.
 */
export async function analyzeVideoWithGemini(file: { uri: string; mimeType: string }, opts: { lowResolution: boolean }): Promise<GeminiAnalysisResult> {
  const resp = await fetch(`${base()}/v1beta/models/${MODEL}:generateContent?key=${env.geminiApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ file_data: { mime_type: file.mimeType, file_uri: file.uri } }, { text: ANALYSIS_PROMPT }] }],
      generationConfig: {
        temperature: 0.4,
        // La réflexion du modèle compte dans cette limite : trop basse, la réponse était coupée sur les longues vidéos.
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
        ...(opts.lowResolution ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}),
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini generateContent failed: ${err}`);
  }

  const data = (await resp.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  const rawText = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const clean = jsonMatch ? jsonMatch[0] : rawText.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean) as GeminiAnalysisResult;
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${clean.slice(0, 200)}`);
  }
}

export async function deleteGeminiFile(fileUri: string): Promise<void> {
  const fileName = fileUri.split("/").pop();
  await fetch(`${base()}/v1beta/files/${fileName}?key=${env.geminiApiKey}`, {
    method: "DELETE",
  });
}
