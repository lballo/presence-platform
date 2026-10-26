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
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Schéma Postgres : "public" par défaut, ou celui de DB_SCHEMA (ex. "presence" sur Supabase,
// pour cohabiter avec d'autres applications dans la même base).
const schemaName = (process.env.DB_SCHEMA ?? "").replace(/[^a-z0-9_]/gi, "");
const dbSchema = schemaName && schemaName !== "public" ? pgSchema(schemaName) : null;
const pgTable: typeof pgTableRoot = dbSchema ? (dbSchema.table.bind(dbSchema) as unknown as typeof pgTableRoot) : pgTableRoot;
const pgEnum: typeof pgEnumRoot = dbSchema ? (dbSchema.enum.bind(dbSchema) as unknown as typeof pgEnumRoot) : pgEnumRoot;

// ─────────────────────────────────────────────────────────────
// Membres
// ─────────────────────────────────────────────────────────────

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 80 }).notNull(),
  gender: varchar("gender", { length: 1 }).notNull().default("f"), // f | m
  role: varchar("role", { length: 160 }).notNull().default(""),
  org: varchar("org", { length: 160 }).notNull().default(""),
  city: varchar("city", { length: 80 }).notNull().default(""),
  zone: varchar("zone", { length: 40 }).notNull().default("France"),
  photoUrl: text("photo_url"),
  bio: text("bio").notNull().default(""),
  intention: text("intention").notNull().default(""),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Member = typeof members.$inferSelect;

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

export const forumPosts = pgTable("forum_posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull(),
  kind: forumKindEnum("kind").notNull(),
  text: text("text").notNull(),
  askFeedback: boolean("ask_feedback").notNull().default(false),
  likes: integer("likes").notNull().default(0),
  replies: integer("replies").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const forumLikes = pgTable(
  "forum_likes",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").notNull(),
    memberId: integer("member_id").notNull(),
  },
  (t) => ({ uniq: uniqueIndex("forum_likes_uniq").on(t.postId, t.memberId) })
);

export const opportunityTypeEnum = pgEnum("opportunity_type", ["recrut", "fin", "assoc"]);
export const opportunityStatusEnum = pgEnum("opportunity_status", ["pending", "published"]);

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
    where: varchar("where", { length: 200 }).notNull().default(""),
    lang: varchar("lang", { length: 5 }).notNull().default("FR"),
    maxSeats: integer("max_seats"),
    featured: boolean("featured").notNull().default(false),
    photoUrl: text("photo_url"),
    withLine: text("with_line").notNull().default(""),
    inAgenda: boolean("in_agenda").notNull().default(true), // aussi dans l'agenda du cercle
    live: boolean("live").notNull().default(false),
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

export const talks = pgTable("talks", {
  id: serial("id").primaryKey(),
  speakerId: integer("speaker_id").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  summary: text("summary").notNull().default(""),
  durationMin: integer("duration_min").notNull().default(12),
  views: integer("views").notNull().default(0),
  videoUrl: text("video_url"),
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
    memberId: integer("member_id").notNull().default(1),
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
