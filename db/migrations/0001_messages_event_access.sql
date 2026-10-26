CREATE TYPE "public"."talk_status" AS ENUM('pending', 'published', 'rejected');--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_id" integer NOT NULL,
	"to_id" integer NOT NULL,
	"text" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "meeting_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "talks" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "talks" ADD COLUMN "status" "talk_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "talks" ADD COLUMN "submitted_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_pair_idx" ON "messages" USING btree ("from_id","to_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_to_idx" ON "messages" USING btree ("to_id","read_at");