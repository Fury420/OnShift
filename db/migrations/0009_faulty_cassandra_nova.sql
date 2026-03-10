CREATE TYPE "public"."shift_exception_action" AS ENUM('skip', 'modify');--> statement-breakpoint
CREATE TYPE "public"."shift_rule_frequency" AS ENUM('once', 'weekly', 'monthly');--> statement-breakpoint
ALTER TYPE "public"."shift_status" ADD VALUE 'requested' BEFORE 'draft';--> statement-breakpoint
CREATE TABLE "shift_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"date" date NOT NULL,
	"action" "shift_exception_action" NOT NULL,
	"user_id" text,
	"start_time" time,
	"end_time" time,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text,
	"frequency" "shift_rule_frequency" NOT NULL,
	"date" date,
	"days" text,
	"day_of_month" text,
	"valid_from" date,
	"valid_until" date,
	"start_time" time,
	"end_time" time,
	"all_day" boolean DEFAULT false NOT NULL,
	"note" text,
	"status" "shift_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shift_exceptions" ADD CONSTRAINT "shift_exceptions_rule_id_shift_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."shift_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_exceptions" ADD CONSTRAINT "shift_exceptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_rules" ADD CONSTRAINT "shift_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_rules" ADD CONSTRAINT "shift_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;