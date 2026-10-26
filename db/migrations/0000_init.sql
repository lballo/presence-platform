CREATE TYPE "public"."advice_category" AS ENUM('voice', 'bodyLanguage', 'structure', 'impact', 'general');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('voice', 'bodyLanguage', 'structure', 'impact');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('onsite', 'online', 'salon');--> statement-breakpoint
CREATE TYPE "public"."forum_kind" AS ENUM('victoire', 'video', 'question');--> statement-breakpoint
CREATE TYPE "public"."hive_access" AS ENUM('libre', 'validation');--> statement-breakpoint
CREATE TYPE "public"."hive_phase" AS ENUM('idee', 'en_cours', 'termine');--> statement-breakpoint
CREATE TYPE "public"."hive_role" AS ENUM('founder', 'leader', 'member', 'pending');--> statement-breakpoint
CREATE TYPE "public"."hive_type" AS ENUM('communaute', 'projet');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('pending', 'published');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('recrut', 'fin', 'assoc');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('doc', 'pdf', 'sheet', 'slides', 'link');--> statement-breakpoint
CREATE TYPE "public"."speech_status" AS ENUM('uploading', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "advice" (
	"id" serial PRIMARY KEY NOT NULL,
	"speechId" bigint NOT NULL,
	"category" "advice_category" NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"actionStep" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"role" varchar(10) NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"number" integer NOT NULL,
	"total" integer DEFAULT 12 NOT NULL,
	"title" varchar(200) NOT NULL,
	"starts_at" timestamp NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"format" varchar(40) DEFAULT 'Visio' NOT NULL,
	"done" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"waitlist" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "event_kind" NOT NULL,
	"hive_id" integer,
	"host_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"days" integer DEFAULT 1 NOT NULL,
	"city" varchar(80),
	"where" varchar(200) DEFAULT '' NOT NULL,
	"lang" varchar(5) DEFAULT 'FR' NOT NULL,
	"max_seats" integer,
	"featured" boolean DEFAULT false NOT NULL,
	"photo_url" text,
	"with_line" text DEFAULT '' NOT NULL,
	"in_agenda" boolean DEFAULT true NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"member_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"kind" "forum_kind" NOT NULL,
	"text" text NOT NULL,
	"ask_feedback" boolean DEFAULT false NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hive_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"hive_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"role" "hive_role" DEFAULT 'member' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hive_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"hive_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"text" text NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hive_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"hive_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"kind" "resource_kind" DEFAULT 'doc' NOT NULL,
	"title" varchar(200) NOT NULL,
	"meta" varchar(200) DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hives" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "hive_type" DEFAULT 'communaute' NOT NULL,
	"parent_id" integer,
	"name" varchar(160) NOT NULL,
	"theme" varchar(120) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cover" varchar(20) DEFAULT 'rouge' NOT NULL,
	"access" "hive_access" DEFAULT 'libre' NOT NULL,
	"founder_id" integer NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"phase" "hive_phase",
	"end_month" varchar(7),
	"needs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"gender" varchar(1) DEFAULT 'f' NOT NULL,
	"role" varchar(160) DEFAULT '' NOT NULL,
	"org" varchar(160) DEFAULT '' NOT NULL,
	"city" varchar(80) DEFAULT '' NOT NULL,
	"zone" varchar(40) DEFAULT 'France' NOT NULL,
	"photo_url" text,
	"bio" text DEFAULT '' NOT NULL,
	"intention" text DEFAULT '' NOT NULL,
	"values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"intents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pole" varchar(40) DEFAULT '' NOT NULL,
	"langs" varchar(160) DEFAULT 'Français' NOT NULL,
	"visible_in_directory" boolean DEFAULT true NOT NULL,
	"rencontre_enabled" boolean DEFAULT false NOT NULL,
	"rencontre_pref" varchar(3) DEFAULT 'all' NOT NULL,
	"rencontre_blurb" text DEFAULT '' NOT NULL,
	"is_coached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"text" text NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "opportunity_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_interests" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer NOT NULL,
	"member_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speech_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"speechId" bigint NOT NULL,
	"category" "category" NOT NULL,
	"score" integer NOT NULL,
	"insight" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speeches" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer DEFAULT 1 NOT NULL,
	"title" varchar(255) NOT NULL,
	"videoUrl" text NOT NULL,
	"duration" integer,
	"overallScore" integer,
	"status" "speech_status" DEFAULT 'uploading' NOT NULL,
	"summary" text,
	"keyInsight" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_id" integer NOT NULL,
	"to_id" integer NOT NULL,
	"goal" varchar(20) NOT NULL,
	"liked" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talks" (
	"id" serial PRIMARY KEY NOT NULL,
	"speaker_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"duration_min" integer DEFAULT 12 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"video_url" text,
	"published_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "advice_speech_id_idx" ON "advice" USING btree ("speechId");--> statement-breakpoint
CREATE UNIQUE INDEX "event_reg_uniq" ON "event_registrations" USING btree ("event_id","member_id");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "forum_likes_uniq" ON "forum_likes" USING btree ("post_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hive_members_uniq" ON "hive_members" USING btree ("hive_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opp_interest_uniq" ON "opportunity_interests" USING btree ("opportunity_id","member_id");--> statement-breakpoint
CREATE INDEX "speech_scores_speech_id_idx" ON "speech_scores" USING btree ("speechId");--> statement-breakpoint
CREATE UNIQUE INDEX "speech_category_idx" ON "speech_scores" USING btree ("speechId","category");--> statement-breakpoint
CREATE INDEX "status_idx" ON "speeches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "created_at_idx" ON "speeches" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "swipes_uniq" ON "swipes" USING btree ("from_id","to_id","goal");