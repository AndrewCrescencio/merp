-- CONSOLIDATED: Merges 0010_next_morbius + 0011_sliding_window_rate_limit
-- Creates auth_security_state with sliding window column from the start.
-- Idempotent: safe to run on DBs where 0010/0011 already applied.

CREATE TABLE IF NOT EXISTS "auth_security_state" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"reset_at" timestamp with time zone,
	"window" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_security_state_reset_at_idx" ON "auth_security_state" USING btree ("reset_at");

-- Backfill window column if table existed without it (from 0010 only)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_security_state' AND column_name = 'window'
  ) THEN
    ALTER TABLE "auth_security_state" ADD COLUMN "window" jsonb DEFAULT '[]'::jsonb NOT NULL;
  END IF;
END $$;