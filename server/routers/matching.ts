import { z } from "zod";
import { eq, and, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, proc } from "../middleware";
import { getDb } from "../queries/connection";
import { members, swipes } from "../../db/schema";
import { publicMember } from "../lib/format";
import { complement, intentKey, intentLabel, myIntentLabel } from "../lib/intents";

async function me(id: number) {
  const m = await getDb().query.members.findFirst({ where: eq(members.id, id) });
  if (!m) throw new TRPCError({ code: "NOT_FOUND" });
  return m;
}

export const matchingRouter = createRouter({
  /** Mes intentions (réglées dans le profil) : ce sur quoi le matching peut tourner. */
  goals: proc.query(async ({ ctx }) => {
    const m = await me(ctx.memberId);
    const codes = [...m.intents, ...(m.rencontreEnabled ? ["amour"] : [])];
    return codes.map((code) => ({ code, label: myIntentLabel(code), key: intentKey(code) }));
  }),

  /** Profils à découvrir pour une intention, hors ceux déjà vus. */
  deck: proc.input(z.object({ goal: z.string() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const m = await me(ctx.memberId);
    const goalKey = intentKey(input.goal);
    const allowed = [...m.intents, ...(m.rencontreEnabled ? ["amour"] : [])];
    if (!allowed.includes(input.goal)) return [];

    const others = await db.query.members.findMany({ where: ne(members.id, ctx.memberId) });
    const seen = await db.query.swipes.findMany({ where: and(eq(swipes.fromId, ctx.memberId), eq(swipes.goal, goalKey)) });
    const seenIds = new Set(seen.map((s) => s.toId));

    let candidates;
    if (input.goal === "amour") {
      candidates = others.filter((o) => o.rencontreEnabled && (m.rencontrePref === "all" || o.gender === m.rencontrePref) && (o.rencontrePref === "all" || m.gender === o.rencontrePref));
    } else {
      const code = complement(input.goal);
      candidates = others.filter((o) => o.visibleInDirectory && o.intents.includes(code));
    }
    return candidates
      .filter((o) => !seenIds.has(o.id))
      .map((o) => {
        const common = o.values.filter((v) => m.values.includes(v));
        return {
          ...publicMember(o),
          rencontreEnabled: undefined, rencontrePref: undefined,
          reason: input.goal === "amour" ? "Espace Rencontre" : intentLabel(complement(input.goal), o.gender),
          common: common.length ? common : (o.pole === m.pole ? [`Pôle ${o.pole.toLowerCase()} en commun`] : o.values.slice(0, 2)),
          blurb: input.goal === "amour" ? o.rencontreBlurb : o.bio,
          affinity: common.length >= 2 ? "très forte" : common.length === 1 || o.pole === m.pole ? "forte" : "bonne",
        };
      })
      .sort((a, b) => ["très forte", "forte", "bonne"].indexOf(a.affinity) - ["très forte", "forte", "bonne"].indexOf(b.affinity));
  }),

  /** Glisser : à droite (liked) ou à gauche. Un intérêt réciproque fait un match. */
  swipe: proc.input(z.object({ toId: z.number(), goal: z.string(), liked: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const goalKey = intentKey(input.goal);
    await db.insert(swipes).values({ fromId: ctx.memberId, toId: input.toId, goal: goalKey, liked: input.liked })
      .onConflictDoUpdate({ target: [swipes.fromId, swipes.toId, swipes.goal], set: { liked: input.liked } });
    if (!input.liked) return { matched: false };
    const back = await db.query.swipes.findFirst({ where: and(eq(swipes.fromId, input.toId), eq(swipes.toId, ctx.memberId), eq(swipes.goal, goalKey), eq(swipes.liked, true)) });
    return { matched: !!back };
  }),

  undo: proc.input(z.object({ toId: z.number(), goal: z.string() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await db.delete(swipes).where(and(eq(swipes.fromId, ctx.memberId), eq(swipes.toId, input.toId), eq(swipes.goal, intentKey(input.goal))));
    return { ok: true };
  }),

  /** Mes matchs : intérêt réciproque sur une même intention. */
  matches: proc.query(async ({ ctx }) => {
    const db = getDb();
    const mine = await db.query.swipes.findMany({ where: and(eq(swipes.fromId, ctx.memberId), eq(swipes.liked, true)) });
    const theirs = await db.query.swipes.findMany({ where: and(eq(swipes.toId, ctx.memberId), eq(swipes.liked, true)) });
    const out: { memberId: number; goal: string; at: Date }[] = [];
    for (const s of mine) {
      if (theirs.some((t) => t.fromId === s.toId && t.goal === s.goal)) out.push({ memberId: s.toId, goal: s.goal, at: s.createdAt });
    }
    const ids = [...new Set(out.map((o) => o.memberId))];
    const people = ids.length ? await db.query.members.findMany({ where: (m, { inArray }) => inArray(m.id, ids) }) : [];
    const GOALS: Record<string, string> = { mentorat: "Mentorat", pairs: "Pairs", associe: "Associé", invest: "Investissement", recrut: "Recrutement", amitie: "Amitié", parole: "Prise de parole", amour: "Espace Rencontre" };
    return out
      .sort((a, b) => +b.at - +a.at)
      .map((o) => { const p = people.find((x) => x.id === o.memberId)!; return { ...publicMember(p), goal: o.goal, goalLabel: GOALS[o.goal] ?? o.goal, at: o.at, rencontreEnabled: undefined, rencontreBlurb: undefined }; });
  }),
});
