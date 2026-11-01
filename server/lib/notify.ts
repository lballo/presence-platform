import { getDb } from "../queries/connection";
import { notifications } from "../../db/schema";

/** Prévenir des membres dans l'application (cloche du menu). */
export async function notify(memberIds: number[], n: { title: string; body?: string; href?: string }) {
  const ids = [...new Set(memberIds)];
  if (!ids.length) return;
  await getDb().insert(notifications).values(ids.map((memberId) => ({ memberId, title: n.title.slice(0, 200), body: n.body ?? "", href: n.href ?? "" })));
}
