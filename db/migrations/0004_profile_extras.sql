ALTER TABLE "members" ADD COLUMN "ambition" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "passions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "linkedin_url" text DEFAULT '' NOT NULL;