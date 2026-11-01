import { z } from "zod";
import { createRouter, procFor } from "../middleware";
import { BUCKETS, createSignedUpload, storageReady } from "../lib/storage";

const uploadProc = procFor("uploads.use");

export const uploadsRouter = createRouter({
  /** Le stockage est-il disponible, et quelles limites ? */
  config: uploadProc.query(() => ({
    enabled: storageReady(),
    maxMb: { forum: BUCKETS.forum.maxMb, forumImage: BUCKETS.forumImage.maxMb, forumFile: BUCKETS.forumFile.maxMb, eventImage: BUCKETS.eventImage.maxMb, avatar: BUCKETS.avatar.maxMb, message: BUCKETS.message.maxMb, talk: BUCKETS.talk.maxMb },
  })),

  /** URL d'envoi signée pour un fichier (vidéo, image ou pièce jointe du forum, pièce jointe d'un message). */
  create: uploadProc
    .input(z.object({ kind: z.enum(["forum", "forumImage", "forumFile", "eventImage", "avatar", "message"]), filename: z.string().min(1).max(200), contentType: z.string().max(120), size: z.number().int().min(0) }))
    .mutation(({ ctx, input }) => createSignedUpload(input.kind, ctx.memberId, input.filename, input.contentType, input.size)),
});
