CREATE TABLE "wage_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"hourly_rate" numeric(8, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wage_rates_user_id_effective_from_unique" UNIQUE("user_id","effective_from")
);
--> statement-breakpoint
ALTER TABLE "wage_rates" ADD CONSTRAINT "wage_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_rates" ADD CONSTRAINT "wage_rates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_rates" ADD CONSTRAINT "wage_rates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_wage_rates_user_from" ON "wage_rates" USING btree ("user_id","effective_from");--> statement-breakpoint
-- Seed: existujúce sadzby → prvý záznam histórie (platí od vzniku účtu),
-- aby minulé výplaty zostali prepočítané pôvodnou sadzbou.
INSERT INTO "wage_rates" ("organization_id", "user_id", "hourly_rate", "effective_from")
SELECT "organization_id", "id", "hourly_rate", "created_at"::date
FROM "user"
WHERE "hourly_rate" IS NOT NULL AND "organization_id" IS NOT NULL;