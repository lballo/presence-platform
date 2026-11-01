import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { invitations, members, type Member } from "../../db/schema";
import { env } from "./env";
import { supabaseAdmin } from "./supabaseAdmin";

const INVITATION_DAYS = 7;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type InviteInput = {
  email: string;
  firstName: string;
  lastName: string;
  role: Member["role"];
  accessType: Member["accessType"];
  ficheId?: number; // relier une fiche existante plutôt que d'en créer une
  accessEndsAt?: Date | null;
  sendEmail: boolean; // false : aucun e-mail, le lien est seulement renvoyé
};

/** Crée (ou reprend) la fiche, un jeton de 7 jours, le compte Supabase, et envoie l'invitation. */
export async function inviteMember(input: InviteInput) {
  const db = getDb();
  const email = input.email.trim().toLowerCase();

  const [byEmail] = await db.select().from(members).where(sql`lower(${members.email}) = ${email}`).limit(1);
  const [byId] = input.ficheId ? await db.select().from(members).where(eq(members.id, input.ficheId)).limit(1) : [undefined];
  if (input.ficheId && !byId) throw new Error(`Aucune fiche n° ${input.ficheId}.`);
  if (byEmail && byId && byEmail.id !== byId.id) throw new Error(`Cet e-mail appartient déjà à la fiche n° ${byEmail.id}.`);
  const existing = byId ?? byEmail;
  if (existing?.authUserId && existing.passwordChosenAt) throw new Error("Cette personne a déjà un compte actif.");

  const now = new Date();
  const [member] = existing
    ? await db.update(members).set({ email, role: input.role, accessType: input.accessType, invitedAt: now, onboardingCompletedAt: null, accessEndsAt: input.accessEndsAt ?? existing.accessEndsAt, status: "actif" }).where(eq(members.id, existing.id)).returning()
    : await db.insert(members).values({ email, firstName: input.firstName, lastName: input.lastName, role: input.role, accessType: input.accessType, accessEndsAt: input.accessEndsAt ?? null, invitedAt: now }).returning();

  // Un nouveau lien remplace le précédent.
  await db.update(invitations).set({ revokedAt: now }).where(and(eq(invitations.memberId, member.id), isNull(invitations.usedAt), isNull(invitations.revokedAt)));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(invitations).values({ memberId: member.id, tokenHash: hashToken(token), expiresAt });
  const url = `${env.appUrl}/invitation/${token}`;

  // Le modèle d'e-mail Supabase affiche {{ .Data.invitation_url }} : notre lien de 7 jours, pas le sien de 24 h.
  const metadata = { invitation_url: url, first_name: member.firstName };
  const auth = supabaseAdmin().auth.admin;
  let userId = member.authUserId;
  if (userId) {
    const { error } = await auth.updateUserById(userId, { user_metadata: metadata });
    if (error) throw new Error(`Supabase : ${error.message}`);
  }
  if (input.sendEmail) {
    const { data, error } = await auth.inviteUserByEmail(email, { data: metadata, redirectTo: env.appUrl });
    if (error) throw new Error(`Supabase : ${error.message}`);
    userId = data.user.id;
  } else if (!userId) {
    const { data, error } = await auth.createUser({ email, user_metadata: metadata });
    if (error) throw new Error(`Supabase : ${error.message}`);
    userId = data.user.id;
  }
  const [linked] = await db.select({ id: members.id }).from(members).where(eq(members.authUserId, userId)).limit(1);
  if (linked && linked.id !== member.id) throw new Error(`Ce compte est déjà relié à la fiche n° ${linked.id}.`);
  await db.update(members).set({ authUserId: userId }).where(eq(members.id, member.id));
  return { memberId: member.id, url, expiresAt };
}

export type InvitationState = { valid: true; firstName: string; email: string; memberId: number } | { valid: false; reason: "inconnue" | "expiree" | "utilisee" };

/** État d'un jeton d'invitation, sans le consommer. */
export async function readInvitation(token: string): Promise<InvitationState> {
  const db = getDb();
  const row = await db.query.invitations.findFirst({ where: eq(invitations.tokenHash, hashToken(token)), with: { member: true } });
  if (!row || row.revokedAt || !row.member.email) return { valid: false, reason: "inconnue" };
  if (row.usedAt) return { valid: false, reason: "utilisee" };
  if (row.expiresAt <= new Date()) return { valid: false, reason: "expiree" };
  return { valid: true, firstName: row.member.firstName, email: row.member.email, memberId: row.memberId };
}

/** Au clic : produit le lien Supabase (de courte durée) qui ouvre la session pour choisir un mot de passe. */
export async function openInvitationSession(email: string) {
  const auth = supabaseAdmin().auth.admin;
  const invite = await auth.generateLink({ type: "invite", email });
  if (!invite.error) return { tokenHash: invite.data.properties.hashed_token, type: "invite" as const };
  // Le lien a déjà servi sans que le mot de passe soit choisi : le compte est confirmé, on passe par une récupération.
  const recovery = await auth.generateLink({ type: "recovery", email });
  if (recovery.error) throw new Error(`Supabase : ${recovery.error.message}`);
  return { tokenHash: recovery.data.properties.hashed_token, type: "recovery" as const };
}

/** Mot de passe choisi : les jetons de ce membre ne servent plus, les panneaux d'accueil peuvent commencer. */
export async function markPasswordChosen(memberId: number) {
  const db = getDb();
  const now = new Date();
  await db.update(members).set({ passwordChosenAt: now }).where(and(eq(members.id, memberId), isNull(members.passwordChosenAt)));
  await db.update(invitations).set({ usedAt: now }).where(and(eq(invitations.memberId, memberId), isNull(invitations.usedAt), isNull(invitations.revokedAt)));
}
