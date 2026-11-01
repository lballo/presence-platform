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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }), // nul : invitation pas encore acceptée
  email: varchar("email", { length: 255 }),
  authUserId: uuid("auth_user_id"), // auth.users(id) : clé étrangère posée par la migration Supabase
  organizerRequest: text("organizer_request").notNull().default(""), // motivation de la candidature organisateur
  organizerRequestedAt: timestamp("organizer_requested_at"), // non nul = candidature en attente
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Member = typeof members.$inferSelect;

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
export const forumAudienceEnum = pgEnum("forum_audience", ["tous", "collectif", "accompagnement"]);
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

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    kind: eventKindEnum("kind").notNull(),
    hiveId: integer("hive_id"), // événement de ruche ou salon porté par une ruche
    hostId: integer("host_id").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
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
    withLine: text("with_line").notNull().default(""),
    inAgenda: boolean("in_agenda").notNull().default(true), // aussi dans l'agenda du cercle
    live: boolean("live").notNull().default(false),
    status: eventStatusEnum("status").notNull().default("published"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ startsIdx: index("events_starts_idx").on(t.startsAt) })
);

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull(),
    memberId: integer("member_id").notNull(),
    waitlist: boolean("waitlist").notNull().default(false),
  },
  (t) => ({ uniq: uniqueIndex("event_reg_uniq").on(t.eventId, t.memberId) })
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    pairIdx: index("messages_pair_idx").on(t.fromId, t.toId, t.createdAt),
    toIdx: index("messages_to_idx").on(t.toId, t.readAt),
  })
);
