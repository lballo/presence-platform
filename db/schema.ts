import {
  pgTable as pgTableRoot,
  pgEnum as pgEnumRoot,
  pgSchema,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  index,
  primaryKey,
  uniqueIndex,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CourseBlock, CourseContent, PageContent } from "../server/lib/courseBlocks";
import type { Repeat } from "../server/lib/recurrence";

// Schéma Postgres : "public" par défaut, ou celui de DB_SCHEMA (ex. "presence" sur Supabase,
// pour cohabiter avec d'autres applications dans la même base).
const schemaName = (process.env.DB_SCHEMA ?? "").replace(/[^a-z0-9_]/gi, "");
const dbSchema = schemaName && schemaName !== "public" ? pgSchema(schemaName) : null;
const pgTable: typeof pgTableRoot = dbSchema ? (dbSchema.table.bind(dbSchema) as unknown as typeof pgTableRoot) : pgTableRoot;
const pgEnum: typeof pgEnumRoot = dbSchema ? (dbSchema.enum.bind(dbSchema) as unknown as typeof pgEnumRoot) : pgEnumRoot;

// ─────────────────────────────────────────────────────────────
// Membres
// ─────────────────────────────────────────────────────────────

// Rôle dans la plateforme (droits : server/lib/permissions.ts)
export const memberRoleEnum = pgEnum("member_role", ["membre", "organisateur", "administrateur"]);
// Ce que comprend l'accompagnement du membre
export const accessTypeEnum = pgEnum("access_type", ["collectif", "individuel", "les_deux"]);
// État du compte : seul « actif » donne accès à la plateforme
export const accountStatusEnum = pgEnum("account_status", ["actif", "suspendu", "termine"]);

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 80 }).notNull(),
  gender: varchar("gender", { length: 1 }).notNull().default("f"), // f | m
  jobTitle: varchar("job_title", { length: 160 }).notNull().default(""),
  org: varchar("org", { length: 160 }).notNull().default(""),
  city: varchar("city", { length: 80 }).notNull().default(""),
  zone: varchar("zone", { length: 40 }).notNull().default("France"),
  photoUrl: text("photo_url"),
  bio: text("bio").notNull().default(""),
  intention: text("intention").notNull().default(""),
  ambition: text("ambition").notNull().default(""), // mon ambition (texte libre)
  passions: jsonb("passions").$type<string[]>().notNull().default([]),
  bucketList: jsonb("bucket_list").$type<string[]>().notNull().default([]), // ma bucket list : désirs, rêves, lieux à découvrir
  linkedinUrl: text("linkedin_url").notNull().default(""),
  values: jsonb("values").$type<string[]>().notNull().default([]),
  // codes : "mentorat:seek" | "mentorat:offer" | "pairs:sym" | "associe:sym" | "invest:seek" | "invest:offer"
  //         "recrut:seek" | "recrut:offer" | "amitie:sym" | "parole:seek" | "parole:offer"
  intents: jsonb("intents").$type<string[]>().notNull().default([]),
  pole: varchar("pole", { length: 40 }).notNull().default(""),
  langs: varchar("langs", { length: 160 }).notNull().default("Français"),
  visibleInDirectory: boolean("visible_in_directory").notNull().default(true),
  rencontreEnabled: boolean("rencontre_enabled").notNull().default(false),
  rencontrePref: varchar("rencontre_pref", { length: 3 }).notNull().default("all"), // f | m | all
  rencontreBlurb: text("rencontre_blurb").notNull().default(""),
  isCoached: boolean("is_coached").notNull().default(false),
  role: memberRoleEnum("role").notNull().default("membre"),
  accessType: accessTypeEnum("access_type").notNull().default("collectif"),
  accessEndsAt: timestamp("access_ends_at", { withTimezone: true }),
  status: accountStatusEnum("status").notNull().default("actif"),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  passwordChosenAt: timestamp("password_chosen_at", { withTimezone: true }), // nul : invitation pas encore acceptée
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }), // nul : panneaux d'accueil pas encore terminés
  onboardingStep: integer("onboarding_step").notNull().default(0),
  goals: jsonb("goals").$type<string[]>().notNull().default([]), // ce qui m'amène
  goalsOther: text("goals_other").notNull().default(""),
  matchProfiles: jsonb("match_profiles").$type<string[]>().notNull().default([]), // profils que je veux rencontrer
  matchSectors: jsonb("match_sectors").$type<string[]>().notNull().default([]), // secteurs qui m'intéressent
  profileType: varchar("profile_type", { length: 40 }).notNull().default(""),
  sector: varchar("sector", { length: 40 }).notNull().default(""),
  country: varchar("country", { length: 80 }).notNull().default(""),
  tour: jsonb("tour").$type<{ status: "pending" | "done" | "skipped"; step: number; seen: string[] }>().notNull().default({ status: "pending", step: 0, seen: [] }),
  email: varchar("email", { length: 255 }),
  authUserId: uuid("auth_user_id"), // auth.users(id) : clé étrangère posée par la migration Supabase
  organizerRequest: text("organizer_request").notNull().default(""), // motivation de la candidature organisateur
  organizerRequestedAt: timestamp("organizer_requested_at"), // non nul = candidature en attente
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // supprimé : compte désactivé, profil anonymisé, publications conservées
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Member = typeof members.$inferSelect;

// Journal d'administration : qui, quoi, quand, sur quoi
export const adminLog = pgTable("admin_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  actorName: varchar("actor_name", { length: 170 }).notNull().default(""),
  action: varchar("action", { length: 80 }).notNull(),
  targetType: varchar("target_type", { length: 40 }).notNull(),
  targetId: integer("target_id"),
  targetLabel: text("target_label").notNull().default(""),
  detail: text("detail").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Signalements : une publication, une réponse, un message privé reçu, un message de ruche
export const reportKindEnum = pgEnum("report_kind", ["post", "reply", "message", "hive_post"]);
export const reportStatusEnum = pgEnum("report_status", ["ouvert", "traite", "classe"]);
export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    reporterId: integer("reporter_id").notNull(),
    kind: reportKindEnum("kind").notNull(),
    targetId: integer("target_id").notNull(),
    authorId: integer("author_id").notNull(),
    reason: text("reason").notNull(),
    snapshot: text("snapshot").notNull().default(""), // le contenu au moment du signalement
    status: reportStatusEnum("status").notNull().default("ouvert"),
    decision: varchar("decision", { length: 30 }).notNull().default(""),
    decidedBy: integer("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    once: uniqueIndex("reports_reporter_kind_target_key").on(t.reporterId, t.kind, t.targetId),
    statusIdx: index("reports_status_idx").on(t.status, t.createdAt),
    targetIdx: index("reports_target_idx").on(t.kind, t.targetId),
  })
);

// Le miel : barème modifiable et grand livre (une ligne par action et par membre pour les premiers pas)
export const honeyRules = pgTable("honey_rules", {
  action: varchar("action", { length: 40 }).primaryKey(),
  amount: integer("amount").notNull(),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const honeyLedger = pgTable(
  "honey_ledger",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 40 }).notNull().references(() => honeyRules.action),
    amount: integer("amount").notNull(),
    ref: varchar("ref", { length: 80 }),
    announced: integer("announced").notNull().default(0), // quantité déjà annoncée par l'animation du coach
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ once: uniqueIndex("honey_ledger_once").on(t.memberId, t.action, sql`coalesce(${t.ref}, '')`) })
);

// Jetons d'invitation valables 7 jours : le lien Supabase, limité à 24 h, n'est produit qu'au clic.
export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────
// Coaching individuel
// ─────────────────────────────────────────────────────────────

export const coachingSessions = pgTable("coaching_sessions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull(),
  number: integer("number").notNull(), // séance n°
  total: integer("total").notNull().default(12),
  title: varchar("title", { length: 200 }).notNull(),
  startsAt: timestamp("starts_at").notNull(),
  durationMin: integer("duration_min").notNull().default(60),
  format: varchar("format", { length: 40 }).notNull().default("Visio"),
  done: boolean("done").notNull().default(false),
});

// ─────────────────────────────────────────────────────────────
// Forum
// ─────────────────────────────────────────────────────────────

export const forumKindEnum = pgEnum("forum_kind", ["victoire", "video", "question"]);
export const forumSpaceKindEnum = pgEnum("forum_space_kind", ["libre", "annonces", "video", "opportunites"]);
export const forumPostStatusEnum = pgEnum("forum_post_status", ["published", "pending", "rejected"]);
// « moderateurs » : demande de retour vidéo visible de son auteur et de l'équipe seulement
export const forumAudienceEnum = pgEnum("forum_audience", ["tous", "collectif", "accompagnement", "moderateurs"]);
export const opportunityTypeEnum = pgEnum("opportunity_type", ["recrut", "fin", "assoc"]);

// Le slug reste stable (il sert d'adresse) ; nom, emoji et ordre sont modifiables par l'administratrice.
export const forumSpaces = pgTable("forum_spaces", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull().default(""),
  description: text("description").notNull().default(""),
  groupKey: varchar("group_key", { length: 20 }).notNull(), // arriver | echanger
  position: integer("position").notNull().default(0),
  kind: forumSpaceKindEnum("kind").notNull().default("libre"),
  adminOnly: boolean("admin_only").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PostAttachment = { path: string; name: string; type: string; size: number };

export const forumPosts = pgTable(
  "forum_posts",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id").notNull(),
    spaceId: integer("space_id").references(() => forumSpaces.id), // espace du réseau…
    hiveId: integer("hive_id").references(() => hives.id, { onDelete: "cascade" }), // …ou annonce de ruche
    kind: forumKindEnum("kind"), // conservé pour les publications d'avant les espaces
    title: varchar("title", { length: 200 }).notNull().default(""),
    text: text("text").notNull(), // version sans mise en forme (extraits, recherche)
    html: text("html").notNull().default(""), // texte mis en forme, nettoyé par le serveur (server/lib/richText.ts)
    coverUrl: text("cover_url").notNull().default(""),
    attachments: jsonb("attachments").$type<PostAttachment[]>().notNull().default([]),
    askFeedback: boolean("ask_feedback").notNull().default(false),
    videoUrl: text("video_url").notNull().default(""), // lien (YouTube, Drive…) ou vidéo chargée
    status: forumPostStatusEnum("status").notNull().default("published"), // relecture des opportunités
    reviewNote: text("review_note").notNull().default(""), // message de l'équipe à la validation
    hiddenAt: timestamp("hidden_at", { withTimezone: true }), // masquée par la modération
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    audience: forumAudienceEnum("audience").notNull().default("tous"),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(), // dans le futur : publication programmée
    endsAt: timestamp("ends_at", { withTimezone: true }), // fin d'affichage d'une annonce
    oppType: opportunityTypeEnum("opp_type"),
    facts: jsonb("facts").$type<string[]>().notNull().default([]),
    likes: integer("likes").notNull().default(0),
    replies: integer("replies").notNull().default(0),
    editedAt: timestamp("edited_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    spaceIdx: index("forum_posts_space_idx").on(t.spaceId, t.publishedAt),
    hiveIdx: index("forum_posts_hive_idx").on(t.hiveId, t.publishedAt),
    statusIdx: index("forum_posts_status_idx").on(t.status),
  })
);

export type ForumPost = typeof forumPosts.$inferSelect;

// Liste partagée, définie par l'administratrice. Elle n'est pas propre au forum :
// les contenus de formation auront leur propre table de liaison vers cette même liste.
export const hashtags = pgTable(
  "hashtags",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 40 }).notNull(),
    color: varchar("color", { length: 7 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ nameUniq: uniqueIndex("hashtags_name_unique").on(sql`lower(${t.name})`) })
);

export const forumPostHashtags = pgTable(
  "forum_post_hashtags",
  {
    postId: integer("post_id").notNull().references(() => forumPosts.id, { onDelete: "cascade" }),
    hashtagId: integer("hashtag_id").notNull().references(() => hashtags.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.postId, t.hashtagId] }), tagIdx: index("forum_post_hashtags_tag_idx").on(t.hashtagId) })
);

// Lecture d'une annonce : read_at (point de couleur, nombre de lectures), dismissed_at (fermée du tableau de bord)
export const forumPostReads = pgTable(
  "forum_post_reads",
  {
    postId: integer("post_id").notNull().references(() => forumPosts.id, { onDelete: "cascade" }),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.postId, t.memberId] }), memberIdx: index("forum_post_reads_member_idx").on(t.memberId) })
);

// « Ça m'intéresse » sur une opportunité
export const forumPostInterests = pgTable(
  "forum_post_interests",
  {
    postId: integer("post_id").notNull().references(() => forumPosts.id, { onDelete: "cascade" }),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.postId, t.memberId] }) })
);

// Brouillon enregistré automatiquement, un par fenêtre de publication et par membre
export const forumDrafts = pgTable(
  "forum_drafts",
  {
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 40 }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.memberId, t.key] }) })
);

// Réponses aux publications du forum
export const forumReplies = pgTable(
  "forum_replies",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").notNull(),
    authorId: integer("author_id").notNull(),
    text: text("text").notNull(),
    editedAt: timestamp("edited_at"),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }), // masquée par la modération
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ postIdx: index("forum_replies_post_idx").on(t.postId, t.createdAt) })
);

export const forumLikes = pgTable(
  "forum_likes",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").notNull(),
    memberId: integer("member_id").notNull(),
  },
  (t) => ({ uniq: uniqueIndex("forum_likes_uniq").on(t.postId, t.memberId) })
);

export const opportunityStatusEnum = pgEnum("opportunity_status", ["pending", "published", "rejected"]);

// Anciennes tables des opportunités, reprises dans forum_posts : conservées, mais plus lues ni écrites.
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull(),
  type: opportunityTypeEnum("type").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  text: text("text").notNull(),
  facts: jsonb("facts").$type<string[]>().notNull().default([]),
  status: opportunityStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const opportunityInterests = pgTable(
  "opportunity_interests",
  {
    id: serial("id").primaryKey(),
    opportunityId: integer("opportunity_id").notNull(),
    memberId: integer("member_id").notNull(),
  },
  (t) => ({ uniq: uniqueIndex("opp_interest_uniq").on(t.opportunityId, t.memberId) })
);

// ─────────────────────────────────────────────────────────────
// Ruches (communautés et ruches projet)
// ─────────────────────────────────────────────────────────────

export const hiveTypeEnum = pgEnum("hive_type", ["communaute", "projet"]);
export const hiveAccessEnum = pgEnum("hive_access", ["libre", "validation"]);
export const hivePhaseEnum = pgEnum("hive_phase", ["idee", "en_cours", "termine"]);
export const hiveRoleEnum = pgEnum("hive_role", ["founder", "leader", "member", "pending"]);

export const hives = pgTable("hives", {
  id: serial("id").primaryKey(),
  type: hiveTypeEnum("type").notNull().default("communaute"),
  parentId: integer("parent_id"), // ruche d'origine pour une ruche projet
  name: varchar("name", { length: 160 }).notNull(),
  theme: varchar("theme", { length: 120 }).notNull().default(""),
  description: text("description").notNull().default(""),
  cover: varchar("cover", { length: 20 }).notNull().default("rouge"),
  access: hiveAccessEnum("access").notNull().default("libre"),
  founderId: integer("founder_id").notNull(),
  // ruche projet
  goal: text("goal").notNull().default(""),
  phase: hivePhaseEnum("phase"),
  endMonth: varchar("end_month", { length: 7 }), // "2027-06" ou null = au long cours
  needs: jsonb("needs").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hiveMembers = pgTable(
  "hive_members",
  {
    id: serial("id").primaryKey(),
    hiveId: integer("hive_id").notNull(),
    memberId: integer("member_id").notNull(),
    role: hiveRoleEnum("role").notNull().default("member"),
    note: text("note").notNull().default(""), // message de demande d'adhésion
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniq: uniqueIndex("hive_members_uniq").on(t.hiveId, t.memberId) })
);

export const hivePosts = pgTable("hive_posts", {
  id: serial("id").primaryKey(),
  hiveId: integer("hive_id").notNull(),
  authorId: integer("author_id").notNull(),
  text: text("text").notNull(),
  likes: integer("likes").notNull().default(0),
  replies: integer("replies").notNull().default(0),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }), // masqué par la modération
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const resourceKindEnum = pgEnum("resource_kind", ["doc", "pdf", "sheet", "slides", "link"]);

export const hiveResources = pgTable("hive_resources", {
  id: serial("id").primaryKey(),
  hiveId: integer("hive_id").notNull(),
  authorId: integer("author_id").notNull(),
  kind: resourceKindEnum("kind").notNull().default("doc"),
  title: varchar("title", { length: 200 }).notNull(),
  meta: varchar("meta", { length: 200 }).notNull().default(""),
  url: text("url").notNull().default(""),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────
// Événements (programme de la communauté, événements de ruche, salons live)
// ─────────────────────────────────────────────────────────────

export const eventKindEnum = pgEnum("event_kind", ["onsite", "online", "salon"]);
// Les événements proposés par un membre simple attendent la validation de l'équipe
export const eventStatusEnum = pgEnum("event_status", ["pending", "published", "rejected"]);
// Événement du réseau : ouvert aux membres connectés ou public. Événement de ruche : toujours réservé à la ruche.
export const eventVisibilityEnum = pgEnum("event_visibility", ["membres", "public"]);
export const eventTypeEnum = pgEnum("event_type", ["standard", "bienvenue"]);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    kind: eventKindEnum("kind").notNull(),
    hiveId: integer("hive_id"), // événement de ruche ou salon porté par une ruche
    hostId: integer("host_id").notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique("events_slug_unique"), // adresse de la page : /e/{slug}
    visibility: eventVisibilityEnum("visibility").notNull().default("membres"),
    type: eventTypeEnum("type").notNull().default("standard"),
    title: varchar("title", { length: 200 }).notNull(),
    tagline: text("tagline").notNull().default(""), // accroche
    description: text("description").notNull().default(""),
    program: text("program").notNull().default(""), // programme, une étape par ligne
    takeaways: jsonb("takeaways").$type<string[]>().notNull().default([]), // ce que l'on repart avec
    faq: jsonb("faq").$type<{ q: string; a: string }[]>().notNull().default([]),
    views: integer("views").notNull().default(0),
    guestsAllowed: boolean("guests_allowed").notNull().default(false), // prévu pour des invités extérieurs, pas encore activé
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    startsAt: timestamp("starts_at").notNull(),
    durationMin: integer("duration_min").notNull().default(60),
    days: integer("days").notNull().default(1),
    city: varchar("city", { length: 80 }),
    where: varchar("where", { length: 200 }).notNull().default(""), // lieu public (ville, « En ligne »)
    address: text("address").notNull().default(""), // adresse précise (présentiel) — visible des inscrits uniquement
    meetingUrl: text("meeting_url").notNull().default(""), // lien visio (en ligne, salon) — visible des inscrits uniquement
    lang: varchar("lang", { length: 5 }).notNull().default("FR"),
    maxSeats: integer("max_seats"),
    featured: boolean("featured").notNull().default(false),
    photoUrl: text("photo_url"),
    cover: varchar("cover", { length: 20 }).notNull().default(""), // couleur d'un événement sans photo ; vide, elle suit le format
    photoPosition: varchar("photo_position", { length: 20 }).notNull().default("50% 50%"), // cadrage de la photo
    seriesId: integer("series_id"), // une date d'un événement récurrent
    replayUrl: text("replay_url"), // l'enregistrement d'un événement en ligne, pour les membres (lien ou fichier sur Présence)
    replayAddedAt: timestamp("replay_added_at", { withTimezone: true }),
    withLine: text("with_line").notNull().default(""),
    inAgenda: boolean("in_agenda").notNull().default(true), // aussi dans l'agenda du cercle
    live: boolean("live").notNull().default(false),
    status: eventStatusEnum("status").notNull().default("published"),
    reviewNote: text("review_note").notNull().default(""), // message de l'équipe à la validation
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ startsIdx: index("events_starts_idx").on(t.startsAt) })
);

/** Un événement récurrent : chaque date est un événement ordinaire, créé à l'avance (server/lib/eventSeries.ts). */
export const eventSeries = pgTable("event_series", {
  id: serial("id").primaryKey(),
  every: varchar("every", { length: 20 }).$type<Repeat>().notNull(),
  anchorAt: timestamp("anchor_at", { withTimezone: true }).notNull(), // la date dont partent les suivantes
  untilAt: timestamp("until_at", { withTimezone: true }), // vide : la série continue tant qu'elle n'est pas arrêtée
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull(),
    memberId: integer("member_id").notNull(),
    waitlist: boolean("waitlist").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    attendedAt: timestamp("attended_at", { withTimezone: true }), // présence cochée par l'organisateur
  },
  (t) => ({ uniq: uniqueIndex("event_reg_uniq").on(t.eventId, t.memberId) })
);

export const eventSpeakers = pgTable(
  "event_speakers",
  {
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.eventId, t.memberId] }) })
);

// Inscriptions d'invités extérieurs : la structure est prête, rien ne l'utilise encore.
export const eventGuests = pgTable(
  "event_guests",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ uniq: uniqueIndex("event_guests_uniq").on(t.eventId, sql`lower(${t.email})`) })
);

// Notifications dans l'application (cloche)
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull().default(""),
    href: text("href").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ memberIdx: index("notifications_member_idx").on(t.memberId, t.createdAt) })
);

// ─────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────

export const swipes = pgTable(
  "swipes",
  {
    id: serial("id").primaryKey(),
    fromId: integer("from_id").notNull(),
    toId: integer("to_id").notNull(),
    goal: varchar("goal", { length: 20 }).notNull(), // code d'intention ou "amour"
    liked: boolean("liked").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniq: uniqueIndex("swipes_uniq").on(t.fromId, t.toId, t.goal) })
);

// ─────────────────────────────────────────────────────────────
// Talk Show
// ─────────────────────────────────────────────────────────────

export const talkStatusEnum = pgEnum("talk_status", ["pending", "published", "rejected"]);

export const talks = pgTable("talks", {
  id: serial("id").primaryKey(),
  speakerId: integer("speaker_id").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  summary: text("summary").notNull().default(""), // accroche affichée (reprise de la description à la publication)
  description: text("description").notNull().default(""), // description / motivation envoyée par le membre
  status: talkStatusEnum("status").notNull().default("published"),
  reviewNote: text("review_note").notNull().default(""), // message de l'équipe à la validation
  durationMin: integer("duration_min").notNull().default(12),
  views: integer("views").notNull().default(0),
  videoUrl: text("video_url"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────
// Coach IA (conversation avec le bot)
// ─────────────────────────────────────────────────────────────

export const coachMessages = pgTable("coach_messages", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull(),
  role: varchar("role", { length: 10 }).notNull(), // user | coach
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────
// Analyse vidéo (repris de PresenceAI)
// ─────────────────────────────────────────────────────────────

export const speechStatusEnum = pgEnum("speech_status", ["uploading", "processing", "completed", "failed"]);
export const categoryEnum = pgEnum("category", ["voice", "bodyLanguage", "structure", "impact"]);
export const adviceCategoryEnum = pgEnum("advice_category", ["voice", "bodyLanguage", "structure", "impact", "general"]);
export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);

export const speeches = pgTable(
  "speeches",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    videoUrl: text("videoUrl").notNull(),
    duration: integer("duration"),
    overallScore: integer("overallScore"),
    status: speechStatusEnum("status").default("uploading").notNull(),
    summary: text("summary"),
    keyInsight: text("keyInsight"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("status_idx").on(table.status),
    createdAtIdx: index("created_at_idx").on(table.createdAt),
  })
);

export type Speech = typeof speeches.$inferSelect;

export const speechScores = pgTable(
  "speech_scores",
  {
    id: serial("id").primaryKey(),
    speechId: bigint("speechId", { mode: "number" }).notNull(),
    category: categoryEnum("category").notNull(),
    score: integer("score").notNull(),
    insight: text("insight"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    speechIdIdx: index("speech_scores_speech_id_idx").on(table.speechId),
    uniqueCategory: uniqueIndex("speech_category_idx").on(table.speechId, table.category),
  })
);

export const advice = pgTable(
  "advice",
  {
    id: serial("id").primaryKey(),
    speechId: bigint("speechId", { mode: "number" }).notNull(),
    category: adviceCategoryEnum("category").notNull(),
    priority: priorityEnum("priority").default("medium").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    actionStep: text("actionStep"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    speechIdIdx: index("advice_speech_id_idx").on(table.speechId),
  })
);

// ─────────────────────────────────────────────────────────────
// Messagerie entre membres
// ─────────────────────────────────────────────────────────────
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    fromId: integer("from_id").notNull(),
    toId: integer("to_id").notNull(),
    text: text("text").notNull(),
    // pièce jointe (bucket privé « messages ») : chemin, nom d'origine, type et taille
    attachmentPath: text("attachment_path"),
    attachmentName: text("attachment_name"),
    attachmentType: text("attachment_type"),
    attachmentSize: integer("attachment_size"),
    readAt: timestamp("read_at"),
    editedAt: timestamp("edited_at"),
    replyToId: integer("reply_to_id"), // réponse à un message précis (citation, comme sur WhatsApp)
    deletedAt: timestamp("deleted_at"), // message supprimé par son auteur : on garde la trace « Message supprimé »
    hiddenAt: timestamp("hidden_at", { withTimezone: true }), // masqué par la modération
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    pairIdx: index("messages_pair_idx").on(t.fromId, t.toId, t.createdAt),
    toIdx: index("messages_to_idx").on(t.toId, t.readAt),
  })
);

// ─────────────────────────────────────────────────────────────
// Formations : Notion fait foi pour les contenus, ces tables en gardent une copie
// et enregistrent ce qui appartient aux membres (server/lib/notionSync.ts).
// ─────────────────────────────────────────────────────────────

export const coursePublicEnum = pgEnum("course_public", ["tous", "attribution"]);
export const courseRhythmEnum = pgEnum("course_rhythm", ["hebdo", "complet"]);
export const contentStatusEnum = pgEnum("content_status", ["brouillon", "relecture", "publie"]);
export const lessonTypeEnum = pgEnum("lesson_type", ["contenu", "video", "exercice", "test", "defi"]);

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  notionPageId: varchar("notion_page_id", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  tagline: text("tagline").notNull().default(""),
  emoji: varchar("emoji", { length: 16 }).notNull().default(""),
  coverUrl: text("cover_url").notNull().default(""),
  coverKey: text("cover_key").notNull().default(""), // identifie le fichier Notion déjà recopié dans notre stockage
  public: coursePublicEnum("public").notNull().default("tous"),
  rhythm: courseRhythmEnum("rhythm").notNull().default("hebdo"),
  status: contentStatusEnum("status").notNull().default("brouillon"),
  position: integer("position").notNull().default(0),
  content: jsonb("content").$type<CourseContent>().notNull().default({}),
  issues: jsonb("issues").$type<string[]>().notNull().default([]),
  notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Course = typeof courses.$inferSelect;

// Ancien modèle à deux niveaux : plus lu que par la reprise de la progression (server/lib/courseResume.ts), retiré ensuite.
export const courseModules = pgTable(
  "course_modules",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    notionPageId: varchar("notion_page_id", { length: 64 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    position: integer("position").notNull().default(0), // « Ordre » dans Notion : fixe la semaine d'ouverture
    status: contentStatusEnum("status").notNull().default("brouillon"),
    intention: text("intention").notNull().default(""),
    durationMin: integer("duration_min"),
    videoUrl: text("video_url").notNull().default(""),
    testUrl: text("test_url").notNull().default(""),
    coachBrief: text("coach_brief").notNull().default(""), // « Ce que le coach IA retient » : jamais envoyé aux membres
    content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
    issues: jsonb("issues").$type<string[]>().notNull().default([]),
    notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ courseIdx: index("course_modules_course_idx").on(t.courseId, t.position) })
);

export const courseSections = pgTable(
  "course_sections",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    notionPageId: varchar("notion_page_id", { length: 64 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    position: integer("position").notNull().default(0), // « Ordre » dans Notion : fixe la semaine d'ouverture
    // Pas de statut : une section apparaît dès qu'une de ses leçons est publiée. La colonne status reste en base jusqu'à la migration 0018.
    intention: text("intention").notNull().default(""),
    content: jsonb("content").$type<PageContent>().notNull().default({}),
    issues: jsonb("issues").$type<string[]>().notNull().default([]),
    notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ courseIdx: index("course_sections_course_idx").on(t.courseId, t.position) })
);

export type CourseSection = typeof courseSections.$inferSelect;

export const courseLessons = pgTable(
  "course_lessons",
  {
    id: serial("id").primaryKey(),
    sectionId: integer("section_id").notNull().references(() => courseSections.id, { onDelete: "cascade" }),
    notionPageId: varchar("notion_page_id", { length: 64 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    position: integer("position").notNull().default(0), // « Ordre » dans Notion : place dans la section
    type: lessonTypeEnum("type").notNull().default("contenu"),
    status: contentStatusEnum("status").notNull().default("brouillon"),
    intention: text("intention").notNull().default(""),
    durationMin: integer("duration_min"),
    videoUrl: text("video_url").notNull().default(""),
    testUrl: text("test_url").notNull().default(""),
    content: jsonb("content").$type<PageContent>().notNull().default({}),
    issues: jsonb("issues").$type<string[]>().notNull().default([]),
    legacyModuleId: integer("legacy_module_id").unique(), // l'ancien module repris sur cette leçon : garde les anciennes adresses valables
    notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ sectionIdx: index("course_lessons_section_idx").on(t.sectionId, t.position) })
);

export type CourseLesson = typeof courseLessons.$inferSelect;

export const courseHashtags = pgTable(
  "course_hashtags",
  {
    courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    hashtagId: integer("hashtag_id").notNull().references(() => hashtags.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.courseId, t.hashtagId] }) })
);

export const courseSectionHashtags = pgTable(
  "course_section_hashtags",
  {
    sectionId: integer("section_id").notNull().references(() => courseSections.id, { onDelete: "cascade" }),
    hashtagId: integer("hashtag_id").notNull().references(() => hashtags.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sectionId, t.hashtagId] }), tagIdx: index("course_section_hashtags_tag_idx").on(t.hashtagId) })
);

export const courseLessonHashtags = pgTable(
  "course_lesson_hashtags",
  {
    lessonId: integer("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    hashtagId: integer("hashtag_id").notNull().references(() => hashtags.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.lessonId, t.hashtagId] }), tagIdx: index("course_lesson_hashtags_tag_idx").on(t.hashtagId) })
);

// Étiquettes de membres : servent à attribuer une formation à un groupe
export const memberTags = pgTable(
  "member_tags",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 60 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ nameUniq: uniqueIndex("member_tags_name_unique").on(sql`lower(${t.name})`) })
);

export const memberTagLinks = pgTable(
  "member_tag_links",
  {
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => memberTags.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.memberId, t.tagId] }) })
);

// Une formation « sur attribution » : à un membre, à un type d'accès ou à une étiquette
export const courseAssignments = pgTable("course_assignments", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  memberId: integer("member_id").references(() => members.id, { onDelete: "cascade" }),
  accessType: accessTypeEnum("access_type"),
  tagId: integer("tag_id").references(() => memberTags.id, { onDelete: "cascade" }),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const courseEnrollments = pgTable(
  "course_enrollments",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    fullAccessAt: timestamp("full_access_at", { withTimezone: true }), // accès complet donné par l'administration, réversible
    fullAccessBy: integer("full_access_by"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({ uniq: uniqueIndex("course_enrollments_course_id_member_id_key").on(t.courseId, t.memberId), memberIdx: index("course_enrollments_member_idx").on(t.memberId) })
);

export const sectionProgress = pgTable(
  "section_progress",
  {
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    sectionId: integer("section_id").notNull().references(() => courseSections.id, { onDelete: "cascade" }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    openedViaFullAccess: boolean("opened_via_full_access").notNull().default(false), // ouverte avant sa date : se referme si l'accès complet est retiré
    completedAt: timestamp("completed_at", { withTimezone: true }),
    challengeDoneAt: timestamp("challenge_done_at", { withTimezone: true }),
    challengeNoteEnc: text("challenge_note_enc").notNull().default(""),
  },
  (t) => ({ pk: primaryKey({ columns: [t.memberId, t.sectionId] }), sectionIdx: index("section_progress_section_idx").on(t.sectionId) })
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    challengeDoneAt: timestamp("challenge_done_at", { withTimezone: true }),
    challengeNoteEnc: text("challenge_note_enc").notNull().default(""),
  },
  (t) => ({ pk: primaryKey({ columns: [t.memberId, t.lessonId] }), lessonIdx: index("lesson_progress_lesson_idx").on(t.lessonId) })
);

// Ancien modèle : plus lu que par la reprise de la progression, retiré ensuite.
export const moduleProgress = pgTable(
  "module_progress",
  {
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    moduleId: integer("module_id").notNull().references(() => courseModules.id, { onDelete: "cascade" }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    openedViaFullAccess: boolean("opened_via_full_access").notNull().default(false), // ouvert avant sa date : se referme si l'accès complet est retiré
    completedAt: timestamp("completed_at", { withTimezone: true }),
    challengeDoneAt: timestamp("challenge_done_at", { withTimezone: true }),
    challengeNoteEnc: text("challenge_note_enc").notNull().default(""),
    memoryStatus: varchar("memory_status", { length: 12 }).notNull().default(""), // "" | en_attente | fait | echec
  },
  (t) => ({ pk: primaryKey({ columns: [t.memberId, t.moduleId] }), moduleIdx: index("module_progress_module_idx").on(t.moduleId) })
);

// Données privées, chiffrées par server/lib/privateBox.ts : visibles du seul membre, sauf ce qu'il partage.
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
    moduleId: integer("module_id").references(() => courseModules.id, { onDelete: "set null" }), // ancien modèle
    courseTitle: varchar("course_title", { length: 200 }).notNull().default(""),
    lessonTitle: varchar("lesson_title", { length: 200 }).notNull().default(""),
    moduleTitle: varchar("module_title", { length: 200 }).notNull().default(""), // ancien modèle
    questionId: varchar("question_id", { length: 64 }).notNull(), // identifiant du bloc Notion, ou « note » pour une réflexion libre
    questionText: text("question_text").notNull().default(""), // copie : la question peut changer dans Notion
    answerEnc: text("answer_enc").notNull(),
    kind: varchar("kind", { length: 20 }).notNull().default("exercice"), // exercice | reflexion ; plus tard : entrée libre, question du jour
    sharedAt: timestamp("shared_at", { withTimezone: true }), // « À travailler en coaching avec Laura » : sans cette date, personne d'autre ne lit la réponse
    coachingDiscussedAt: timestamp("coaching_discussed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ uniq: uniqueIndex("journal_entries_member_lesson_question_key").on(t.memberId, t.lessonId, t.questionId) })
);

export const testResults = pgTable("test_results", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  moduleId: integer("module_id").references(() => courseModules.id, { onDelete: "set null" }), // ancien modèle
  courseTitle: varchar("course_title", { length: 200 }).notNull().default(""),
  lessonTitle: varchar("lesson_title", { length: 200 }).notNull().default(""),
  moduleTitle: varchar("module_title", { length: 200 }).notNull().default(""), // ancien modèle
  testId: integer("test_id").references(() => tests.id, { onDelete: "set null" }), // un test de Mes ressources ; lessonTitle garde alors son titre
  resultEnc: text("result_enc").notNull(), // vide : le test a été passé, sans résultat renvoyé
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  passedAt: timestamp("passed_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Mes ressources : copie du catalogue de tests de Notion (Notion fait foi) ───

export const testThemes = pgTable("test_themes", {
  id: serial("id").primaryKey(),
  notionPageId: varchar("notion_page_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  title: varchar("title", { length: 200 }).notNull().default(""),
  profileLabel: varchar("profile_label", { length: 120 }).notNull().default(""),
  emoji: varchar("emoji", { length: 16 }).notNull().default(""),
  position: integer("position").notNull().default(0),
  status: contentStatusEnum("status").notNull().default("brouillon"),
  intro: jsonb("intro").$type<CourseBlock[]>().notNull().default([]),
  notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tests = pgTable("tests", {
  id: serial("id").primaryKey(),
  notionPageId: varchar("notion_page_id", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  durationMin: integer("duration_min"),
  resultType: varchar("result_type", { length: 40 }).notNull().default(""),
  canRetake: boolean("can_retake").notNull().default(false),
  savesResult: boolean("saves_result").notNull().default(false),
  linkUrl: text("link_url").notNull().default(""),
  status: contentStatusEnum("status").notNull().default("brouillon"),
  htmlPath: text("html_path").notNull().default(""),
  htmlName: varchar("html_name", { length: 200 }).notNull().default(""),
  htmlUpdatedAt: timestamp("html_updated_at", { withTimezone: true }),
  htmlHasResultBlock: boolean("html_has_result_block").notNull().default(false),
  notionFileKey: text("notion_file_key").notNull().default(""),
  issues: jsonb("issues").$type<string[]>().notNull().default([]),
  notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const testThemeLinks = pgTable("test_theme_links", {
  testId: integer("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  themeId: integer("theme_id").notNull().references(() => testThemes.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.testId, t.themeId] }) }));

export const testLessonLinks = pgTable("test_lesson_links", {
  testId: integer("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.testId, t.lessonId] }) }));

export const testHashtags = pgTable("test_hashtags", {
  testId: integer("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  hashtagId: integer("hashtag_id").notNull().references(() => hashtags.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.testId, t.hashtagId] }) }));

/** Une ligne : le membre montre ce thème de son profil aux autres membres. Sans ligne, c'est privé. */
export const profileThemeShares = pgTable("profile_theme_shares", {
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  themeId: integer("theme_id").notNull().references(() => testThemes.id, { onDelete: "cascade" }),
  sharedAt: timestamp("shared_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.memberId, t.themeId] }) }));

export type TestTheme = typeof testThemes.$inferSelect;
export type Test = typeof tests.$inferSelect;

export const coachMemory = pgTable(
  "coach_memory",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 20 }).notNull(), // exercice | reflexion | test | defi
    sourceLabel: varchar("source_label", { length: 240 }).notNull().default(""), // « Fondations · Faire le point »
    courseId: integer("course_id").references(() => courses.id, { onDelete: "set null" }),
    sectionId: integer("section_id").references(() => courseSections.id, { onDelete: "set null" }),
    lessonId: integer("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
    moduleId: integer("module_id").references(() => courseModules.id, { onDelete: "set null" }), // ancien modèle
    origin: varchar("origin", { length: 60 }), // l'entrée dont vient ce souvenir : journal:12, test:3, defi:lecon:7, defi:section:2
    contentEnc: text("content_enc").notNull(),
    correctedAt: timestamp("corrected_at", { withTimezone: true }),
    erasedAt: timestamp("erased_at", { withTimezone: true }), // effacé par le membre : il ne reste que l'origine, pour ne pas revenir tout seul
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ originUniq: uniqueIndex("coach_memory_member_origin_key").on(t.memberId, t.origin) })
);

export const coachSettings = pgTable("coach_settings", {
  memberId: integer("member_id").primaryKey().references(() => members.id, { onDelete: "cascade" }),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  consentVersion: varchar("consent_version", { length: 20 }).notNull().default(""),
  refusedAt: timestamp("refused_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notionSyncRuns = pgTable("notion_sync_runs", {
  id: serial("id").primaryKey(),
  trigger: varchar("trigger", { length: 20 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: varchar("status", { length: 12 }).notNull().default("en_cours"), // en_cours | ok | erreur
  pagesChanged: integer("pages_changed").notNull().default(0),
  detail: text("detail").notNull().default(""),
});

// Ce que fait un membre, sans jamais aucun contenu privé
export const memberActivity = pgTable(
  "member_activity",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull(),
    courseId: integer("course_id"),
    sectionId: integer("section_id"),
    lessonId: integer("lesson_id"),
    moduleId: integer("module_id"), // ancien modèle
    label: text("label").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ memberIdx: index("member_activity_member_idx").on(t.memberId, t.createdAt) })
);

// Relances automatiques : des modèles que l'administration active et dont elle règle le texte
export const workflows = pgTable("workflows", {
  key: varchar("key", { length: 60 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  delayDays: integer("delay_days").notNull().default(0),
  emailEnabled: boolean("email_enabled").notNull().default(false), // l'envoi automatique par e-mail s'active ici
  emailSubject: text("email_subject").notNull().default(""),
  emailBody: text("email_body").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: serial("id").primaryKey(),
    workflowKey: varchar("workflow_key", { length: 60 }).notNull().references(() => workflows.key, { onDelete: "cascade" }),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    ref: varchar("ref", { length: 80 }).notNull(), // une relance ne part qu'une fois pour un même objet
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ once: uniqueIndex("workflow_runs_workflow_key_member_id_ref_key").on(t.workflowKey, t.memberId, t.ref) })
);

// Relances par e-mail : une ligne de préférence seulement si le membre a choisi (server/lib/email.ts)
export const emailPreferences = pgTable(
  "email_preferences",
  {
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 30 }).notNull(),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.memberId, t.category] }) })
);

// Chaque envoi, ou chaque envoi écarté et pourquoi. Jamais l'adresse, jamais de contenu privé.
export const emailSends = pgTable(
  "email_sends",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 30 }).notNull(),
    kind: varchar("kind", { length: 12 }).notNull(), // manuel | auto | essai
    template: varchar("template", { length: 60 }).notNull().default(""),
    courseId: integer("course_id"),
    sectionId: integer("section_id"),
    lessonId: integer("lesson_id"),
    moduleId: integer("module_id"), // ancien modèle
    subject: text("subject").notNull().default(""),
    status: varchar("status", { length: 12 }).notNull(), // envoye | ignore | echec
    reason: varchar("reason", { length: 40 }).notNull().default(""),
    providerId: varchar("provider_id", { length: 100 }).notNull().default(""),
    sentBy: integer("sent_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ memberIdx: index("email_sends_member_idx").on(t.memberId, t.createdAt), courseIdx: index("email_sends_course_idx").on(t.courseId, t.memberId, t.createdAt) })
);

// ─────────────────────────────────────────────────────────────
// Suivi du coaching individuel (db/migrations/supabase/0021_coaching_suivi.sql)
// Copie des bases Notion de Laura : Notion fait foi. Les textes sont chiffrés (server/lib/privateBox.ts).
// ─────────────────────────────────────────────────────────────

export const coachingOffers = pgTable("coaching_offers", {
  id: serial("id").primaryKey(),
  notionPageId: varchar("notion_page_id", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 300 }).notNull().default(""),
  sessions: integer("sessions"),
  individual: boolean("individual").notNull().default(true),
  presenceAccess: boolean("presence_access").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coachingEngagements = pgTable(
  "coaching_engagements",
  {
    id: serial("id").primaryKey(),
    notionPageId: varchar("notion_page_id", { length: 64 }).notNull().unique(),
    memberId: integer("member_id").references(() => members.id, { onDelete: "set null" }),
    clientPageId: varchar("client_page_id", { length: 64 }).notNull().default(""),
    clientName: varchar("client_name", { length: 200 }).notNull().default(""),
    clientEmail: varchar("client_email", { length: 255 }).notNull().default(""),
    offerId: integer("offer_id").references(() => coachingOffers.id, { onDelete: "set null" }),
    title: varchar("title", { length: 300 }).notNull().default(""),
    status: varchar("status", { length: 20 }).notNull().default(""),
    startsOn: date("starts_on", { mode: "string" }),
    plannedEndOn: date("planned_end_on", { mode: "string" }),
    sessionsPlanned: integer("sessions_planned"),
    accessEndsAt: timestamp("access_ends_at", { withTimezone: true }),
    accessAppliedAt: timestamp("access_applied_at", { withTimezone: true }),
    midpointEmailAt: timestamp("midpoint_email_at", { withTimezone: true }),
    inspirationEnc: text("inspiration_enc").notNull().default(""),
    exerciseEnc: text("exercise_enc").notNull().default(""),
    notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ memberIdx: index("coaching_engagements_member_idx").on(t.memberId) })
);
export type CoachingEngagement = typeof coachingEngagements.$inferSelect;

export const coachingMeetings = pgTable(
  "coaching_meetings",
  {
    id: serial("id").primaryKey(),
    notionPageId: varchar("notion_page_id", { length: 64 }).notNull().unique(),
    engagementId: integer("engagement_id").references(() => coachingEngagements.id, { onDelete: "cascade" }),
    number: integer("number"),
    kind: varchar("kind", { length: 40 }).notNull().default(""),
    state: varchar("state", { length: 20 }).notNull().default("Non planifié"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    keyPointsEnc: text("key_points_enc").notNull().default(""),
    actionsEnc: text("actions_enc").notNull().default(""),
    reportShared: boolean("report_shared").notNull().default(false),
    notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ engagementIdx: index("coaching_meetings_engagement_idx").on(t.engagementId) })
);
export type CoachingMeeting = typeof coachingMeetings.$inferSelect;

export const coachingGoals = pgTable("coaching_goals", {
  id: serial("id").primaryKey(),
  engagementId: integer("engagement_id").notNull().references(() => coachingEngagements.id, { onDelete: "cascade" }),
  textEnc: text("text_enc").notNull(),
  doneAt: timestamp("done_at", { withTimezone: true }),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coachingNotes = pgTable("coaching_notes", {
  id: serial("id").primaryKey(),
  engagementId: integer("engagement_id").notNull().references(() => coachingEngagements.id, { onDelete: "cascade" }),
  meetingId: integer("meeting_id").references(() => coachingMeetings.id, { onDelete: "set null" }),
  textEnc: text("text_enc").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coachingJournal = pgTable("coaching_journal", {
  id: serial("id").primaryKey(),
  engagementId: integer("engagement_id").notNull().references(() => coachingEngagements.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  textEnc: text("text_enc").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coachingSyncRuns = pgTable("coaching_sync_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: varchar("status", { length: 12 }).notNull().default("en_cours"),
  detail: text("detail").notNull().default(""),
});
