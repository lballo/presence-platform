import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { env } from "./lib/env";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  memberId: number; // membre "connecté" (v1 sans authentification)
};

export async function createContext(opts: FetchCreateContextFnOptions): Promise<TrpcContext> {
  const header = opts.req.headers.get("x-member-id");
  const memberId = header && /^\d+$/.test(header) ? Number(header) : env.currentMemberId;
  return { req: opts.req, resHeaders: opts.resHeaders, memberId };
}
