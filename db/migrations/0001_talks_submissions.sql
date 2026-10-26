CREATE TYPE "public"."talk_status" AS ENUM('pending', 'published', 'rejected');--> statement-breakpoint
ALTER TABLE "talks" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "talks" ADD COLUMN "status" "talk_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "talks" ADD COLUMN "submitted_at" timestamp DEFAULT now() NOT NULL;
