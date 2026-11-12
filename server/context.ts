import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { verifyAccessToken } from "./lib/supabaseAdmin";
import { members, type Member } from "../db/schema";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  member: Member | null; // null : pas de session valide, ou aucune fiche liée au compte
};

export async function createContext(opts: FetchCreateContextFnOptions): Promise<TrpcContext> {
  return { req: opts.req, resHeaders: opts.resHeaders, member: await memberFromRequest(opts.req) };
}

/** La fiche liée au jeton de session de la requête, aussi pour les routes hors tRPC. */
export async function memberFromRequest(req: Request): Promise<Member | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const userId = await verifyAccessToken(token);
  if (!userId) return null;
  const [member] = await getDb().select().from(members).where(eq(members.authUserId, userId)).limit(1);
  return member ?? null;
}
