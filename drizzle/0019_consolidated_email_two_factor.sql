-- CONSOLIDATED: Merges 0012_dry_vanisher + 0013_noisy_mimic
-- Creates email_queue, two_factor, adds token_hash to invite, adds two_factor_enabled to user.
-- Idempotent: safe to run on DBs where 0012/0013 already applied.

CREATE TABLE IF NOT EXISTS "email_queue" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "two_factor" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite" ADD COLUMN IF NOT EXISTS "token_hash" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_queue_status_idx" ON "email_queue" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_queue_scheduled_at_idx" ON "email_queue" USING btree ("scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_pending_token_hash_idx" ON "invite" USING btree ("token_hash") WHERE "invite"."accepted_at" IS NULL;