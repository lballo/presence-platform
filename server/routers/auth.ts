import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { blockMessage, createRouter, procFor, publicProc } from "../middleware";
import { getDb } from "../queries/connection";
import { members } from "../../db/schema";
import { accountBlock } from "../lib/permissions";
import { markPasswordChosen, openInvitationSession, readInvitation } from "../lib/invitations";

const token = z.object({ token: z.string().min(20).max(200) });

export const authRouter = createRouter({
  /** Où en est la session : le front décide ici d'ouvrir l'application ou d'expliquer le refus. */
  status: publicProc.query(({ ctx }) => {
    if (!ctx.member) return { state: "anonymous" as const };
    const block = accountBlock(ctx.member);
    if (block) return { state: "blocked" as const, block, message: blockMessage(block, ctx.member.accessEndsAt) };
    return { state: "ok" as const, needsPassword: !ctx.member.passwordChosenAt, needsOnboarding: !ctx.member.onboardingCompletedAt };
  }),

  /** Page d'invitation : le lien est-il encore valable ? (ne le consomme pas : les antivirus ouvrent les liens) */
  invitation: publicProc.input(token).query(async ({ input }) => {
    const inv = await readInvitation(input.token);
    if (!inv.valid) return { valid: false as const, reason: inv.reason };
    const member = await getDb().query.members.findFirst({ where: eq(members.id, inv.memberId) });
    if (member && accountBlock(member)) return { valid: false as const, reason: "inconnue" as const };
    return { valid: true as const, firstName: inv.firstName, email: inv.email };
  }),

  /** Clic sur « Choisir mon mot de passe » : produit le lien Supabase à cet instant précis. */
  acceptInvitation: publicProc.input(token).mutation(async ({ input }) => {
    const inv = await readInvitation(input.token);
    if (!inv.valid) throw new TRPCError({ code: "BAD_REQUEST", message: inv.reason === "expiree" ? "Ce lien d’invitation a expiré." : "Ce lien d’invitation n’est plus valable." });
    const member = await getDb().query.members.findFirst({ where: eq(members.id, inv.memberId) });
    if (!member || accountBlock(member)) throw new TRPCError({ code: "FORBIDDEN", message: "Ce lien d’invitation n’est plus valable." });
    return openInvitationSession(inv.email);
  }),

  /** Mot de passe choisi. */
  passwordChosen: procFor("profile.use").mutation(async ({ ctx }) => {
    await markPasswordChosen(ctx.memberId);
    return { ok: true };
  }),
});
