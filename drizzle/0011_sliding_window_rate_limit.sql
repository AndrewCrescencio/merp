-- SUPERSEDED by 0018_consolidated_auth_security_state.sql
-- This migration is kept for history. 0018 includes the window column and backfill.
--
-- FR-010: janela deslizante do rate limit (timestamps ISO dos hits).
-- Idempotente: aplicado pelo drizzle-kit migrate E reaplicado pelo apply-custom-sql.
--> statement-breakpoint
ALTER TABLE "auth_security_state" ADD COLUMN IF NOT EXISTS "window" jsonb DEFAULT '[]'::jsonb NOT NULL;
