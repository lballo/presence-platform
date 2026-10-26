import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { members } from "../db/schema";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  memberId: number; // membre "connecté" (v1 sans authentification)
  status: "member" | "organizer" | "admin";
  isAdmin: boolean;
  isOrganizer: boolean; // organisateur ou administrateur
};

export async function createContext(opts: FetchCreateContextFnOptions): Promise<TrpcContext> {
  const header = opts.req.headers.get("x-member-id");
  const memberId = header && /^\d+$/.test(header) ? Number(header) : env.currentMemberId;
  let status: TrpcContext["status"] = "member";
  try {
    const [row] = await getDb().select({ status: members.status }).from(members).where(eq(members.id, memberId)).limit(1);
    if (row) status = row.status;
  } catch {
    /* base indisponible : on reste en membre simple */
  }
  // ADMIN_MEMBER_ID reste un filet de sécurité tant qu'il n'y a pas d'authentification
  const isAdmin = status === "admin" || memberId === env.adminMemberId;
  return { req: opts.req, resHeaders: opts.resHeaders, memberId, status: isAdmin ? "admin" : status, isAdmin, isOrganizer: isAdmin || status === "organizer" };
}
