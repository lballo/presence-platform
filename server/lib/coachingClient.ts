import { engagementsOf } from "./coachingSync";

/**
 * Client du coaching individuel : une inscription à un accompagnement individuel, dans la base Inscriptions de Laura,
 * reliée à sa fiche par l'adresse e-mail du CRM. Ni le type d'accès de la fiche, ni une réponse marquée ne suffisent.
 */
export async function isCoachingClient(memberId: number) {
  return (await engagementsOf(memberId)).length > 0;
}
