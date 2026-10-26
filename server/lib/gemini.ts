import { env } from "./env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
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

export async function uploadVideoToGemini(
  videoBase64: string,
  mimeType: string
): Promise<string> {
  const apiKey = env.geminiApiKey;

  // Decode base64 to get binary size
  const binaryStr = atob(videoBase64);
  const totalBytes = binaryStr.length;

  // Initiate resumable upload
  const initResp = await fetch(
    `${GEMINI_API_BASE}/upload/v1beta/files?uploadType=resumable&key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(totalBytes),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: "speech_video" } }),
    }
  );

  if (!initResp.ok) {
    const err = await initResp.text();
    throw new Error(`Gemini File API init failed: ${err}`);
  }

  const uploadUrl = initResp.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("No upload URL returned from Gemini");

  // Convert base64 to Uint8Array
  const bytes = new Uint8Array(totalBytes);
  for (let i = 0; i < totalBytes; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Upload the file
  const uploadResp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": mimeType,
    },
    body: bytes,
  });

  if (!uploadResp.ok) {
    const err = await uploadResp.text();
    throw new Error(`Gemini file upload failed: ${err}`);
  }

  const fileData = (await uploadResp.json()) as { file: { uri: string; state: string } };
  const fileUri = fileData.file?.uri;
  if (!fileUri) throw new Error("No file URI returned from Gemini");

  // Wait for file to be ACTIVE
  await waitForFileActive(fileUri, apiKey);

  return fileUri;
}

async function waitForFileActive(fileUri: string, apiKey: string): Promise<void> {
  const fileName = fileUri.split("/").pop();
  const maxRetries = 20;
  const delay = 3000;

  for (let i = 0; i < maxRetries; i++) {
    const resp = await fetch(
      `${GEMINI_API_BASE}/v1beta/files/${fileName}?key=${apiKey}`
    );
    if (!resp.ok) throw new Error("Failed to check file status");

    const data = (await resp.json()) as { state: string };
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new Error("Gemini file processing failed");

    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("Gemini file did not become ACTIVE in time");
}

export async function analyzeVideoWithGemini(
  fileUri: string
): Promise<GeminiAnalysisResult> {
  const apiKey = env.geminiApiKey;

  const resp = await fetch(
    `${GEMINI_API_BASE}/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { file_data: { mime_type: "video/mp4", file_uri: fileUri } },
              { text: ANALYSIS_PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini generateContent failed: ${err}`);
  }

  const data = (await resp.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
const jsonMatch = rawText.match(/\{[\s\S]*\}/);
const clean = jsonMatch ? jsonMatch[0] : rawText.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean) as GeminiAnalysisResult;
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${clean.slice(0, 200)}`);
  }
}

export async function deleteGeminiFile(fileUri: string): Promise<void> {
  const apiKey = env.geminiApiKey;
  const fileName = fileUri.split("/").pop();
  await fetch(`${GEMINI_API_BASE}/v1beta/files/${fileName}?key=${apiKey}`, {
    method: "DELETE",
  });
}
