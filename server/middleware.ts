import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { accountBlock, can, type AccountBlock, type Action, type Resource } from "./lib/permissions";
import type { Member } from "../db/schema";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: { ...shape.data, accountBlock: (error.cause as { accountBlock?: AccountBlock } | undefined)?.accountBlock ?? null },
  }),
});

export const createRouter = t.router;

/** Routes accessibles sans session : santé, page d'invitation. */
export const publicProc = t.procedure;

export function blockMessage(block: AccountBlock, accessEndsAt?: Date | null): string {
  if (block === "suspendu") return "Votre compte est suspendu. Écrivez à Laura pour en parler : contact@lauraballo.com.";
  if (block === "expire" && accessEndsAt) return `Votre accès à Présence a pris fin le ${accessEndsAt.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })}.`;
  return "Votre accès à Présence est terminé.";
}

class AccountBlockedCause extends Error {
  accountBlock: AccountBlock;
  constructor(block: AccountBlock) {
    super(block);
    this.accountBlock = block;
  }
}

/** Session valide et compte actif, sinon refus avec un message clair. */
const authed = t.procedure.use(({ ctx, next }) => {
  if (!ctx.member) throw new TRPCError({ code: "UNAUTHORIZED", message: "Connectez-vous pour accéder à Présence." });
  const block = accountBlock(ctx.member);
  if (block) throw new TRPCError({ code: "FORBIDDEN", message: blockMessage(block, ctx.member.accessEndsAt), cause: new AccountBlockedCause(block) });
  return next({ ctx: { ...ctx, member: ctx.member, memberId: ctx.member.id } });
});

/** Toute route membre passe par ici : session, compte actif, puis can(membre, action). */
export function procFor(action: Action) {
  return authed.use(({ ctx, next }) => {
    assertCan(ctx.member, action);
    return next();
  });
}

const FORBIDDEN_MESSAGE = "Vous n’avez pas les droits pour cette action.";

/** Pour les droits qui dépendent de la ressource (auteur, rôle dans la ruche…). */
export function assertCan(member: Member, action: Action, resource?: Resource, message = FORBIDDEN_MESSAGE) {
  if (!can(member, action, resource)) throw new TRPCError({ code: "FORBIDDEN", message });
}
