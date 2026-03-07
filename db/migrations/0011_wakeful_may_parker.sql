ALTER TABLE "shift_rules" ADD COLUMN "max_claims" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "max_claims" integer DEFAULT 1 NOT NULL;