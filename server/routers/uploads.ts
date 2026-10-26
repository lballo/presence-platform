import { z } from "zod";
import { createRouter, proc } from "../middleware";
import { BUCKETS, createSignedUpload, storageReady } from "../lib/storage";

export const uploadsRouter = createRouter({
  /** Le stockage est-il disponible, et quelles limites ? */
  config: proc.query(() => ({
    enabled: storageReady(),
    maxMb: { forum: BUCKETS.forum.maxMb, message: BUCKETS.message.maxMb, talk: BUCKETS.talk.maxMb },
  })),

  /** URL d'envoi signée pour un fichier (vidéo du forum ou pièce jointe d'un message). */
  create: proc
    .input(z.object({ kind: z.enum(["forum", "message"]), filename: z.string().min(1).max(200), contentType: z.string().max(120), size: z.number().int().min(0) }))
    .mutation(({ ctx, input }) => createSignedUpload(input.kind, ctx.memberId, input.filename, input.contentType, input.size)),
});
