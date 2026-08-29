-- SUPERSEDED by 0019_consolidated_email_two_factor.sql
-- This migration is kept for history. 0019 includes the two_factor_enabled column.
--
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;