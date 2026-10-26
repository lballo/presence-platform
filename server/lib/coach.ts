import { env } from "./env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const MODEL = "gemini-2.5-flash";

const SYSTEM = `Tu es le coach IA de Présence, le réseau des dirigeants sensibles et ambitieux fondé par Laura Ballo.
Tu accompagnes des dirigeants et des personnes en responsabilité qui veulent réussir et s'exposer en restant fidèles à leurs valeurs.
Ton style : chaleureux, précis, sans jargon, en français. Tu poses une question à la fois, tu reformules ce que la personne dit,
et tu proposes quand c'est utile un exercice court et concret (respiration, intention, phrase à préparer, silence à tenir).
Tu ne poses jamais de diagnostic médical ou psychologique. Si la personne va mal, tu l'invites à en parler à un professionnel ou à Laura.
Réponds en 4 à 8 phrases maximum, en paragraphes courts. Pas de listes à puces sauf pour un exercice en étapes.`;

export const EXERCISES = [
  { id: "respiration", title: "Respiration carrée", minutes: 3, text: "Inspirez 4 secondes, retenez 4, expirez 4, retenez 4. Six cycles, les pieds bien posés au sol. À faire juste avant une prise de parole." },
  { id: "intention", title: "L’intention du jour", minutes: 2, text: "Terminez cette phrase à voix haute : « Aujourd’hui, je veux que mon équipe sente que… ». Gardez-la en tête à chaque réunion." },
  { id: "silence", title: "Tenir un silence", minutes: 5, text: "Dans votre prochaine réunion, après une question importante, comptez trois secondes avant de répondre. Observez ce que le silence produit." },
  { id: "non", title: "Le non qui respecte", minutes: 4, text: "Écrivez une demande que vous voulez refuser. Formulez votre non en trois temps : ce que vous entendez, ce que vous décidez, ce que vous proposez à la place." },
];

export type ChatTurn = { role: "user" | "coach"; text: string };

export async function coachReply(history: ChatTurn[], member: { firstName: string; role: string; intention: string }): Promise<string> {
  if (!env.geminiApiKey) {
    // Sans clé Gemini : réponse de secours pour que l'interface reste utilisable.
    const last = history[history.length - 1]?.text ?? "";
    return `Merci ${member.firstName}. Si je comprends bien : « ${last.slice(0, 120)} ». Qu’est-ce qui, dans cette situation, vous coûte le plus aujourd’hui ? (Ajoutez une clé GEMINI_API_KEY pour activer le coach IA.)`;
  }
  const contents = history.map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text }] }));
  const resp = await fetch(`${GEMINI_API_BASE}/v1beta/models/${MODEL}:generateContent?key=${env.geminiApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM}\n\nLa personne s'appelle ${member.firstName}, ${member.role}. Son intention du moment : « ${member.intention} ».` }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini : ${await resp.text()}`);
  const data = (await resp.json()) as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "Je n’ai pas réussi à répondre. Pouvez-vous reformuler ?";
}
