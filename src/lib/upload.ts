import { useState } from "react";
import { trpc } from "@/providers/trpc";

type Kind = "forum" | "message";
export type Uploaded = { path: string; publicUrl: string | null; name: string; type: string; size: number };

/** Envoi direct d'un fichier vers Supabase Storage (URL signée), avec progression. */
export function useUpload(kind: Kind) {
  const create = trpc.uploads.create.useMutation();
  const [progress, setProgress] = useState<number | null>(null);
  const upload = async (file: File): Promise<Uploaded> => {
    setProgress(0);
    try {
      const u = await create.mutateAsync({ kind, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", u.uploadUrl);
        xhr.setRequestHeader("Content-Type", u.contentType);
        xhr.setRequestHeader("apikey", u.apikey);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Envoi refusé (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("L’envoi du fichier a échoué. Vérifiez votre connexion et réessayez."));
        xhr.send(file);
      });
      return { path: u.path, publicUrl: u.publicUrl, name: file.name, type: file.type, size: file.size };
    } finally {
      setProgress(null);
    }
  };
  return { upload, progress, busy: progress !== null };
}

export const fileSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
