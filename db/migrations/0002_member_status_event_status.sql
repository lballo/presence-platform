CREATE TYPE "public"."event_status" AS ENUM('pending', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('member', 'organizer', 'admin');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "status" "event_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "status" "member_status" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "organizer_request" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "organizer_requested_at" timestamp;