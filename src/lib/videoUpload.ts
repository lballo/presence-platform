import { accessToken } from "@/lib/supabase";

/** Durée de la vidéo lue par le navigateur, sans l'envoyer ; null s'il ne sait pas la lire. */
export function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (d: number | null) => { URL.revokeObjectURL(url); resolve(d); };
    const timer = setTimeout(() => done(null), 8000);
    v.preload = "metadata";
    v.onloadedmetadata = () => { clearTimeout(timer); done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null); };
    v.onerror = () => { clearTimeout(timer); done(null); };
    v.src = url;
  });
}

type ChunkReply = { received: number; done: boolean } | { error: string; received: number | null };

/**
 * Envoie la vidéo morceau par morceau. Un morceau perdu (réseau, mise en veille) est renvoyé
 * jusqu'à quatre fois, en reprenant là où le serveur en est vraiment.
 */
export async function sendVideoInChunks(id: number, file: File, chunkSize: number, onProgress: (ratio: number) => void) {
  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    const token = await accessToken();
    let reply: ChunkReply;
    let ok = false;
    try {
      const res = await fetch(`/api/speech/${id}/chunk`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "X-Upload-Offset": String(offset), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: file.slice(offset, offset + chunkSize),
      });
      ok = res.ok;
      reply = (await res.json().catch(() => ({ error: "Réponse illisible du serveur.", received: null }))) as ChunkReply;
      if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 400) throw new Error("error" in reply ? reply.error : "Envoi refusé.");
    } catch (e) {
      if (e instanceof Error && !/fetch|network|Load failed/i.test(e.message)) throw e;
      reply = { error: "Connexion interrompue.", received: null };
    }
    if (ok && "done" in reply) {
      offset = reply.received;
      failures = 0;
      onProgress(offset / file.size);
      if (reply.done) return;
      continue;
    }
    if (++failures > 4) throw new Error("error" in reply ? `${reply.error} L’envoi s’est arrêté.` : "L’envoi s’est arrêté.");
    if ("received" in reply && typeof reply.received === "number") offset = reply.received;
    await new Promise((r) => setTimeout(r, 1500 * failures));
  }
}
