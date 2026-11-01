import { COVERS } from "@/pages/Ruches";

/** La couleur d'un événement sans photo : celle qui a été choisie, sinon celle de son format. */
export const eventCover = (e: { cover?: string; kind: string }) => COVERS[e.cover ?? ""] ?? COVERS[e.kind === "onsite" ? "or" : e.kind === "salon" ? "rouge" : "nuit"];
