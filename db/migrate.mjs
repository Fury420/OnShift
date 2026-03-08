import postgres from "postgres"

const client = postgres(process.env.DATABASE_URL, { ssl: false, max: 1 })

console.log("Running database migrations...")

// ── Previous migrations ────────────────────────────────────────────────────

await client`
  ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL
`

await client`
  ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "hourly_rate" numeric(8, 2)
`

await client`
  ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "edited_at" timestamp
`

await client`
  ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "edited_by" text
`

await client`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'attendance_edited_by_user_id_fk'
    ) THEN
      ALTER TABLE "attendance"
      ADD CONSTRAINT "attendance_edited_by_user_id_fk"
      FOREIGN KEY ("edited_by") REFERENCES "user"("id") ON DELETE set null;
    END IF;
  END $$
`

// ── business_hours table ───────────────────────────────────────────────────

await client`
  CREATE TABLE IF NOT EXISTS "business_hours" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid NOT NULL,
    "day_of_week" text NOT NULL,
    "open_time" time,
    "close_time" time,
    "is_closed" boolean NOT NULL DEFAULT true,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    UNIQUE("organization_id", "day_of_week")
  )
`

await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_hours_organization_id_organizations_id_fk') THEN
      ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;
    END IF;
  END $$
`

// ── license_type enum + organizations.license_type ─────────────────────────

await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'license_type') THEN
      CREATE TYPE "public"."license_type" AS ENUM('free', 'basic', 'pro');
    END IF;
  END $$
`

await client`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'organizations' AND column_name = 'license_type'
    ) THEN
      ALTER TABLE "organizations" ADD COLUMN "license_type" "license_type" NOT NULL DEFAULT 'free';
    END IF;
  END $$
`

// ── Migration 0004: organizations + superadmin role ────────────────────────

// Add superadmin to role enum (IF NOT EXISTS workaround via DO block)
await client`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'role'::regtype AND enumlabel = 'superadmin'
    ) THEN
      ALTER TYPE "public"."role" ADD VALUE 'superadmin' BEFORE 'admin';
    END IF;
  END $$
`

await client`
  CREATE TABLE IF NOT EXISTS "organizations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )
`

// Seed default organization for existing data
await client`
  INSERT INTO "organizations" ("id", "name")
  VALUES ('00000000-0000-0000-0000-000000000001', 'Hlavný bar')
  ON CONFLICT DO NOTHING
`

await client`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "organization_id" uuid`
await client`ALTER TABLE "leaves" ADD COLUMN IF NOT EXISTS "organization_id" uuid`
await client`ALTER TABLE "shift_replacements" ADD COLUMN IF NOT EXISTS "organization_id" uuid`
await client`ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "organization_id" uuid`
await client`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "organization_id" uuid`

// Backfill existing rows
await client`UPDATE "attendance" SET "organization_id" = '00000000-0000-0000-0000-000000000001' WHERE "organization_id" IS NULL`
await client`UPDATE "leaves" SET "organization_id" = '00000000-0000-0000-0000-000000000001' WHERE "organization_id" IS NULL`
await client`UPDATE "shift_replacements" SET "organization_id" = '00000000-0000-0000-0000-000000000001' WHERE "organization_id" IS NULL`
await client`UPDATE "shifts" SET "organization_id" = '00000000-0000-0000-0000-000000000001' WHERE "organization_id" IS NULL`
await client`UPDATE "user" SET "organization_id" = '00000000-0000-0000-0000-000000000001' WHERE "organization_id" IS NULL AND "role" != 'superadmin'`

// Set NOT NULL on app tables
await client`
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'attendance' AND column_name = 'organization_id' AND is_nullable = 'YES'
    ) THEN
      ALTER TABLE "attendance" ALTER COLUMN "organization_id" SET NOT NULL;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'leaves' AND column_name = 'organization_id' AND is_nullable = 'YES'
    ) THEN
      ALTER TABLE "leaves" ALTER COLUMN "organization_id" SET NOT NULL;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'shift_replacements' AND column_name = 'organization_id' AND is_nullable = 'YES'
    ) THEN
      ALTER TABLE "shift_replacements" ALTER COLUMN "organization_id" SET NOT NULL;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'shifts' AND column_name = 'organization_id' AND is_nullable = 'YES'
    ) THEN
      ALTER TABLE "shifts" ALTER COLUMN "organization_id" SET NOT NULL;
    END IF;
  END $$
`

// Add FK constraints (IF NOT EXISTS)
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_organization_id_organizations_id_fk') THEN
      ALTER TABLE "attendance" ADD CONSTRAINT "attendance_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leaves_organization_id_organizations_id_fk') THEN
      ALTER TABLE "leaves" ADD CONSTRAINT "leaves_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_replacements_organization_id_organizations_id_fk') THEN
      ALTER TABLE "shift_replacements" ADD CONSTRAINT "shift_replacements_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_organization_id_organizations_id_fk') THEN
      ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_organization_id_organizations_id_fk') THEN
      ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE set null;
    END IF;
  END $$
`

// ── Migration: shift_status "requested" ────────────────────────────────────

await client`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'shift_status'::regtype AND enumlabel = 'requested'
    ) THEN
      ALTER TYPE "public"."shift_status" ADD VALUE 'requested' BEFORE 'draft';
    END IF;
  END $$
`

// ── Migration 0007: open shifts + open_shift_claims ────────────────────────

// Add "open" value to shift_status enum
await client`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'shift_status'::regtype AND enumlabel = 'open'
    ) THEN
      ALTER TYPE "public"."shift_status" ADD VALUE 'open' BEFORE 'published';
    END IF;
  END $$
`

// Create open_shift_claim_status enum
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'open_shift_claim_status') THEN
      CREATE TYPE "public"."open_shift_claim_status" AS ENUM('pending', 'approved', 'rejected');
    END IF;
  END $$
`

// Create open_shift_claims table
await client`
  CREATE TABLE IF NOT EXISTS "open_shift_claims" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid NOT NULL,
    "shift_id" uuid NOT NULL,
    "claimed_by_user_id" text NOT NULL,
    "status" "open_shift_claim_status" DEFAULT 'pending' NOT NULL,
    "note" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )
`

// Add FK constraints for open_shift_claims
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'open_shift_claims_organization_id_organizations_id_fk') THEN
      ALTER TABLE "open_shift_claims" ADD CONSTRAINT "open_shift_claims_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'open_shift_claims_shift_id_shifts_id_fk') THEN
      ALTER TABLE "open_shift_claims" ADD CONSTRAINT "open_shift_claims_shift_id_shifts_id_fk"
      FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'open_shift_claims_claimed_by_user_id_user_id_fk') THEN
      ALTER TABLE "open_shift_claims" ADD CONSTRAINT "open_shift_claims_claimed_by_user_id_user_id_fk"
      FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
    END IF;
  END $$
`

// Make shifts.user_id nullable (for open shifts)
await client`
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'shifts' AND column_name = 'user_id' AND is_nullable = 'NO'
    ) THEN
      ALTER TABLE "shifts" ALTER COLUMN "user_id" DROP NOT NULL;
    END IF;
  END $$
`

// ── Migration 0009: shift_rules + shift_exceptions ──────────────────────

await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_exception_action') THEN
      CREATE TYPE "public"."shift_exception_action" AS ENUM('skip', 'modify');
    END IF;
  END $$
`

await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_rule_frequency') THEN
      CREATE TYPE "public"."shift_rule_frequency" AS ENUM('once', 'weekly', 'monthly');
    END IF;
  END $$
`

await client`
  CREATE TABLE IF NOT EXISTS "shift_exceptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "rule_id" uuid NOT NULL,
    "date" date NOT NULL,
    "action" "shift_exception_action" NOT NULL,
    "user_id" text,
    "start_time" time,
    "end_time" time,
    "note" text,
    "created_at" timestamp DEFAULT now() NOT NULL
  )
`

await client`
  CREATE TABLE IF NOT EXISTS "shift_rules" (
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
  )
`

await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_exceptions_rule_id_shift_rules_id_fk') THEN
      ALTER TABLE "shift_exceptions" ADD CONSTRAINT "shift_exceptions_rule_id_shift_rules_id_fk"
      FOREIGN KEY ("rule_id") REFERENCES "public"."shift_rules"("id") ON DELETE cascade;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_exceptions_user_id_user_id_fk') THEN
      ALTER TABLE "shift_exceptions" ADD CONSTRAINT "shift_exceptions_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_rules_organization_id_organizations_id_fk') THEN
      ALTER TABLE "shift_rules" ADD CONSTRAINT "shift_rules_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;
    END IF;
  END $$
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_rules_user_id_user_id_fk') THEN
      ALTER TABLE "shift_rules" ADD CONSTRAINT "shift_rules_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
    END IF;
  END $$
`

// ── Migration 0010: leaves.suggested_replacement_user_id ─────────────────

await client`
  ALTER TABLE "leaves" ADD COLUMN IF NOT EXISTS "suggested_replacement_user_id" text
`
await client`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leaves_suggested_replacement_user_id_user_id_fk') THEN
      ALTER TABLE "leaves" ADD CONSTRAINT "leaves_suggested_replacement_user_id_user_id_fk"
      FOREIGN KEY ("suggested_replacement_user_id") REFERENCES "public"."user"("id") ON DELETE set null;
    END IF;
  END $$
`

// ── Migration 0011: max_claims ──────────────────────────────────────────

await client`
  ALTER TABLE "shift_rules" ADD COLUMN IF NOT EXISTS "max_claims" integer DEFAULT 1 NOT NULL
`
await client`
  ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "max_claims" integer DEFAULT 1 NOT NULL
`

console.log("Migrations complete")
await client.end()
