/**
 * Inviter une personne, en attendant le panneau d'administration :
 *   npm run invite -- email "Prénom Nom" rôle type_acces [--fiche=2] [--sans-email]
 *   rôle : membre | organisateur | administrateur
 *   type_acces : collectif | individuel | les_deux
 * --fiche=N relie une fiche existante ; --sans-email affiche le lien sans rien envoyer.
 */
import { inviteMember } from "../server/lib/invitations";

const ROLES = ["membre", "organisateur", "administrateur"] as const;
const ACCESS = ["collectif", "individuel", "les_deux"] as const;

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [email, name, role, accessType] = args.filter((a) => !a.startsWith("--"));

function fail(message: string): never {
  console.error(message);
  console.error('Usage : npm run invite -- email "Prénom Nom" rôle type_acces [--fiche=2] [--sans-email]');
  process.exit(1);
}

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Adresse e-mail manquante ou invalide.");
if (!name?.trim()) fail("Nom manquant.");
if (!ROLES.includes(role as (typeof ROLES)[number])) fail(`Rôle invalide : ${ROLES.join(", ")}.`);
if (!ACCESS.includes(accessType as (typeof ACCESS)[number])) fail(`Type d’accès invalide : ${ACCESS.join(", ")}.`);

const [firstName, ...rest] = name.trim().split(/\s+/);
const fiche = flags.find((f) => f.startsWith("--fiche="))?.split("=")[1];
const sendEmail = !flags.includes("--sans-email");

try {
  const result = await inviteMember({
    email, firstName, lastName: rest.join(" "),
    role: role as (typeof ROLES)[number], accessType: accessType as (typeof ACCESS)[number],
    ficheId: fiche ? Number(fiche) : undefined, sendEmail,
  });
  console.log(sendEmail ? `Invitation envoyée à ${email} (fiche n° ${result.memberId}).` : `Compte préparé pour ${email} (fiche n° ${result.memberId}), aucun e-mail envoyé.`);
  console.log(`Lien valable jusqu’au ${result.expiresAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} :`);
  console.log(result.url);
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
