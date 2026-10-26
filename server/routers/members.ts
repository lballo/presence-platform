import { z } from "zod";
import { eq, and, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { members } from "../../db/schema";
import { publicMember } from "../lib/format";
import { INTENT_CODES, INTENT_GROUPS, intentLabel, myIntentLabel } from "../lib/intents";

async function requireMember(id: number) {
  const db = getDb();
  const m = await db.query.members.findFirst({ where: eq(members.id, id) });
  if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable" });
  return m;
}

export const membersRouter = createRouter({
  /** Le membre "connecté" et son profil complet. */
  me: proc.query(async ({ ctx }) => {
    const m = await requireMember(ctx.memberId);
    return {
      ...publicMember(m),
      intentLabels: m.intents.map((c) => ({ code: c, label: myIntentLabel(c) })),
      intentGroups: INTENT_GROUPS,
      isAdmin: ctx.isAdmin,
    };
  }),

  updateProfile: proc
    .input(
      z.object({
        firstName: z.string().min(1).max(80),
        lastName: z.string().max(80).default(""),
        role: z.string().max(160).default(""),
        city: z.string().max(80).default(""),
        intention: z.string().max(400).default(""),
        values: z.array(z.string().min(1).max(40)).max(5),
        intents: z.array(z.enum(INTENT_CODES)).max(3),
        langs: z.string().max(160).default(""),
        visibleInDirectory: z.boolean(),
        rencontreEnabled: z.boolean(),
        rencontrePref: z.enum(["f", "m", "all"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.update(members).set(input).where(eq(members.id, ctx.memberId));
      return requireMember(ctx.memberId);
    }),

  /** Annuaire : tous les membres visibles sauf moi. */
  directory: proc.query(async ({ ctx }) => {
    const db = getDb();
    const list = await db.query.members.findMany({
      where: and(eq(members.visibleInDirectory, true), ne(members.id, ctx.memberId)),
      orderBy: (m, { asc }) => [asc(m.lastName)],
    });
    return list.map((m) => ({
      ...publicMember(m),
      // la rencontre amoureuse ne sort jamais de l'annuaire
      rencontreEnabled: undefined,
      rencontrePref: undefined,
      rencontreBlurb: undefined,
      tags: m.intents.map((code) => ({ code, key: code.split(":")[0], offer: code.endsWith(":offer"), label: intentLabel(code, m.gender) })),
    }));
  }),

  byId: proc.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const m = await requireMember(input.id);
    return { ...publicMember(m), tags: m.intents.map((code) => ({ code, label: intentLabel(code, m.gender) })) };
  }),
});
