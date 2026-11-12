import { and, eq, gt, inArray, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import { forumPosts } from "../../db/schema";
import { can, type Actor, type HiveRole } from "./permissions";

/**
 * Qui voit quelle publication du forum. Espaces et ruches suivent la même règle, dans cet ordre :
 * l'auteur voit toujours la sienne ; l'équipe voit aussi ce qui est programmé ou terminé ;
 * les autres voient ce qui est en ligne et les concerne. La RLS (0011_forum_rls.sql) en est le second rempart.
 */
// « moderateurs » (retour vidéo) n'entre dans aucun audiencesOf : seuls son auteur et l'équipe la lisent.
export type Audience = "tous" | "collectif" | "accompagnement" | "moderateurs";
export type AccessType = "collectif" | "individuel" | "les_deux";
export type PostState = "live" | "scheduled" | "ended" | "pending" | "rejected" | "hidden";

type Member = Actor & { accessType: AccessType };
type PostFacts = { authorId: number; hiveId: number | null; status: "published" | "pending" | "rejected"; audience: Audience; publishedAt: Date; endsAt: Date | null; hiddenAt?: Date | null };

/** Les publics visés qui concernent un membre, selon son accompagnement. */
export function audiencesOf(accessType: AccessType): Audience[] {
  if (accessType === "collectif") return ["tous", "collectif"];
  if (accessType === "individuel") return ["tous", "accompagnement"];
  return ["tous", "collectif", "accompagnement"];
}

export function postState(p: Pick<PostFacts, "status" | "publishedAt" | "endsAt" | "hiddenAt">, now = new Date()): PostState {
  if (p.hiddenAt) return "hidden";
  if (p.status !== "published") return p.status;
  if (p.publishedAt > now) return "scheduled";
  if (p.endsAt && p.endsAt <= now) return "ended";
  return "live";
}

/** Ce membre peut-il lire cette publication ? Pour une ruche : hiveRole et hiveOpen (adhésion libre). */
export function canReadPost(m: Member, p: PostFacts, hive: { hiveRole?: HiveRole; hiveOpen?: boolean } = {}, now = new Date()): boolean {
  if (p.authorId === m.id || can(m, "moderate")) return true;
  if (p.hiveId) {
    if (!p.hiddenAt && can(m, "hive.announce", { hiveRole: hive.hiveRole })) return true;
    return postState(p, now) === "live" && (hive.hiveOpen === true || can(m, "hive.contribute", { hiveRole: hive.hiveRole }));
  }
  return postState(p, now) === "live" && audiencesOf(m.accessType).includes(p.audience);
}

/** En ligne maintenant : publiée, date de publication passée, date de fin pas atteinte. */
export const isLive = (now = new Date()): SQL =>
  and(eq(forumPosts.status, "published"), isNull(forumPosts.hiddenAt), lte(forumPosts.publishedAt, now), or(isNull(forumPosts.endsAt), gt(forumPosts.endsAt, now)))!;

/** Le fil d'actualité : uniquement ce qui est en ligne et concerne le membre. */
export function feedFilter(m: Member, now = new Date()): SQL {
  const live = and(isNotNull(forumPosts.spaceId), isLive(now))!;
  return can(m, "moderate") ? live : and(live, inArray(forumPosts.audience, audiencesOf(m.accessType)))!;
}

/**
 * Dans un espace : en plus, mes publications en relecture ou programmées.
 * L'équipe voit aussi les annonces programmées et terminées (les opportunités à relire ont leur propre file).
 */
export function spaceFilter(m: Member, now = new Date()): SQL {
  const mine = eq(forumPosts.authorId, m.id);
  if (can(m, "moderate")) return and(isNotNull(forumPosts.spaceId), or(mine, eq(forumPosts.status, "published")))!;
  return and(isNotNull(forumPosts.spaceId), or(mine, and(isLive(now), inArray(forumPosts.audience, audiencesOf(m.accessType)))))!;
}

/** Dans une ruche : les leaders voient aussi ce qui est programmé ou terminé. */
export function hiveFilter(m: Member, hiveId: number, hiveRole: HiveRole, now = new Date()): SQL {
  const inHive = eq(forumPosts.hiveId, hiveId);
  if (can(m, "moderate")) return inHive;
  const mine = eq(forumPosts.authorId, m.id);
  return can(m, "hive.announce", { hiveRole }) ? and(inHive, or(mine, isNull(forumPosts.hiddenAt)))! : and(inHive, or(mine, isLive(now)))!;
}
