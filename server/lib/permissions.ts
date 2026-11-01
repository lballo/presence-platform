/**
 * Droits de la plateforme : la seule source de vérité, appliquée à toutes les routes (voir server/middleware.ts).
 * Les règles RLS (db/migrations/supabase/0008_rls_policies.sql) en sont le second rempart.
 */
export type MemberRole = "membre" | "organisateur" | "administrateur";
export type AccountStatus = "actif" | "suspendu" | "termine";
export type HiveRole = "founder" | "leader" | "member" | "pending" | "";

export type Actor = { id: number; role: MemberRole; status: AccountStatus; accessEndsAt: Date | null };

/** Ce sur quoi porte l'action : à qui appartient le contenu, mon rôle dans la ruche… */
export type Resource = { ownerId?: number; hiveId?: number | null; hiveRole?: HiveRole; status?: string };

export type AccountBlock = "suspendu" | "termine" | "expire";

/** Pourquoi un compte n'a plus accès (null : il a accès). */
export function accountBlock(m: Pick<Actor, "status" | "accessEndsAt">, now = new Date()): AccountBlock | null {
  if (m.status === "suspendu") return "suspendu";
  if (m.status === "termine") return "termine";
  if (m.accessEndsAt && m.accessEndsAt <= now) return "expire";
  return null;
}

const isOwner = (m: Actor, r: Resource) => r.ownerId === m.id;
const isAdmin = (m: Actor) => m.role === "administrateur";
const leads = (r: Resource) => r.hiveRole === "founder" || r.hiveRole === "leader";
const inside = (r: Resource) => leads(r) || r.hiveRole === "member";

const everyone = () => true;
const adminOnly = (m: Actor) => isAdmin(m);
const ownerOrAdmin = (m: Actor, r: Resource) => isOwner(m, r) || isAdmin(m);
const hiveManager = (m: Actor, r: Resource) => isAdmin(m) || leads(r);

const RULES = {
  // Tous les rôles
  "profile.use": everyone,
  "forum.use": everyone,
  "messages.use": everyone,
  "matching.use": everyone,
  "events.read": everyone,
  "events.register": everyone,
  "talks.use": everyone,
  "coach.use": everyone,
  "speech.use": everyone,
  "dashboard.read": everyone,
  "uploads.use": everyone,
  "course.use": everyone,

  // Contenus du forum : chacun les siens ; la suppression d'un autre relève de la modération
  "content.edit": (m: Actor, r: Resource) => isOwner(m, r),
  "content.delete": ownerOrAdmin,

  // Événements Présence
  "event.propose": everyone,
  "event.publish_directly": (m: Actor) => m.role === "organisateur" || isAdmin(m),
  // Réseau : celui qui l'a créé, administrateur tous. Ruche : le leader qui l'a créé, administrateur tous.
  "event.edit": (m: Actor, r: Resource) => isAdmin(m) || (isOwner(m, r) && (r.hiveId ? leads(r) : true)),
  // Retirer sa propre proposition tant qu'elle n'est pas publiée
  "event.withdraw": (m: Actor, r: Resource) => isOwner(m, r) && r.status !== "published",

  // Ruches : tout membre en crée ; fondatrice, leaders et administrateur les gèrent
  "hive.read": everyone,
  "hive.create": everyone,
  "hive.join": everyone,
  "hive.read_private": (m: Actor, r: Resource) => isAdmin(m) || inside(r),
  "hive.contribute": (_m: Actor, r: Resource) => inside(r),
  "hive.manage": hiveManager,
  "hive.validate_member": hiveManager,
  "hive.create_event": hiveManager,
  "hive.name_leader": hiveManager,
  "hive.remove_leader": (m: Actor, r: Resource) => isAdmin(m) || r.hiveRole === "founder",
  "hive.announce": hiveManager,

  // Candidature organisateur
  "organizer.apply": (m: Actor) => m.role === "membre",

  // Administrateur seulement
  "event.validate": adminOnly,
  "talk.validate": adminOnly,
  "opportunity.validate": adminOnly,
  "organizer.validate": adminOnly,
  "members.manage": adminOnly,
  "admin.panel": adminOnly,
  moderate: adminOnly,
  "hive.delete": adminOnly,
  "course.build": adminOnly, // onglet Construire, attributions, accès complet
  "forum.manage": adminOnly, // espaces, hashtags, épingles
  "forum.post_restricted": adminOnly, // publier dans un espace réservé (Bienvenue, Annonces)
} satisfies Record<string, (m: Actor, r: Resource) => boolean>;

export type Action = keyof typeof RULES;

/** La question unique : ce membre peut-il faire cette action sur cette ressource ? */
export function can(member: Actor | null | undefined, action: Action, resource: Resource = {}): boolean {
  if (!member || accountBlock(member)) return false;
  return (RULES[action] as (m: Actor, r: Resource) => boolean)(member, resource);
}
