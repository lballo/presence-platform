import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, procFor, publicProc } from "../middleware";
import { getDb } from "../queries/connection";
import { members } from "../../db/schema";
import { EMAIL_CATEGORIES, memberPreferences, setPreference, validUnsubscribe, type EmailCategory } from "../lib/email";

const category = z.enum(Object.keys(EMAIL_CATEGORIES) as [EmailCategory, ...EmailCategory[]]);
const link = z.object({ m: z.number().int(), c: z.string().max(30), t: z.string().max(64) });

/** Les relances que chaque membre accepte de recevoir par e-mail. */
export const emailPrefsRouter = createRouter({
  get: procFor("profile.use").query(async ({ ctx }) => {
    const prefs = await memberPreferences(ctx.memberId);
    return { email: ctx.member.email, categories: (Object.keys(EMAIL_CATEGORIES) as EmailCategory[]).map((key) => ({ key, label: EMAIL_CATEGORIES[key].label, description: EMAIL_CATEGORIES[key].description, enabled: prefs[key] })) };
  }),

  set: procFor("profile.use").input(z.object({ category, enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    await setPreference(ctx.memberId, input.category, input.enabled);
    return { ok: true };
  }),

  /** La page ouverte depuis le lien de l'e-mail : sans compte. Le clic de confirmation évite qu'un antivirus de messagerie désinscrive en ouvrant le lien. */
  describeLink: publicProc.input(link).query(async ({ input }) => {
    if (!validUnsubscribe(input.m, input.c, input.t)) return { valid: false as const };
    const [m] = await getDb().select({ deletedAt: members.deletedAt }).from(members).where(eq(members.id, input.m)).limit(1);
    if (!m || m.deletedAt) return { valid: false as const };
    const prefs = await memberPreferences(input.m);
    return { valid: true as const, label: EMAIL_CATEGORIES[input.c as EmailCategory].label, enabled: prefs[input.c as EmailCategory] };
  }),

  unsubscribeByLink: publicProc.input(link).mutation(async ({ input }) => {
    if (!validUnsubscribe(input.m, input.c, input.t)) return { ok: false };
    await setPreference(input.m, input.c as EmailCategory, false);
    return { ok: true };
  }),
});
