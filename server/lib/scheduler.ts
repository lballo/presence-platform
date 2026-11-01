import { processPendingMemories } from "./coachMemory";
import { notionReady } from "./notion";
import { syncAll } from "./notionSync";
import { runWorkflows } from "./workflows";

const EVERY_MS = 15 * 60 * 1000;

/**
 * Le travail régulier : relire Notion, reprendre les mémoires en attente, envoyer les relances.
 * Sur l'offre gratuite de Render, le serveur s'endort : ce travail reprend à son réveil.
 */
async function tick(trigger: "auto" | "demarrage") {
  try {
    if (notionReady()) await syncAll({ trigger });
    await processPendingMemories();
    await runWorkflows();
  } catch (e) {
    console.error("Travail régulier :", e instanceof Error ? e.message : "erreur");
  }
}

export function startScheduler() {
  setTimeout(() => void tick("demarrage"), 20000);
  setInterval(() => void tick("auto"), EVERY_MS);
}
