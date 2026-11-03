import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { env } from "./env";

/**
 * Le coffre du journal, des résultats de tests et de la mémoire du coach : ces textes sont chiffrés
 * avant d'entrer dans la base, partagée avec une autre application. La clé ne vit que sur le serveur.
 * Chaque texte est lié à son membre : déplacé sur une autre fiche, il devient illisible.
 */
function key(): Buffer | null {
  if (!env.privateDataKey) return null;
  const k = Buffer.from(env.privateDataKey, "base64");
  return k.length === 32 ? k : null;
}

export const privateBoxReady = () => !!key();

// Le texte est lié à son propriétaire : un membre, ou un accompagnement (« coaching:12 »)
const aad = (owner: number | string) => Buffer.from(typeof owner === "number" ? `membre:${owner}` : owner);

export function seal(memberId: number | string, text: string): string {
  const k = key();
  if (!k) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le journal privé n’est pas encore activé : la clé de chiffrement manque sur le serveur." });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  cipher.setAAD(aad(memberId));
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

/** null : illisible (clé changée, texte déplacé). L'interface le dit plutôt que de tout bloquer. */
export function open(memberId: number | string, sealed: string): string | null {
  const k = key();
  if (!k) return null;
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    decipher.setAAD(aad(memberId));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
