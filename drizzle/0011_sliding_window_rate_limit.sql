-- FR-010: janela deslizante do rate limit (timestamps ISO dos hits).
-- Idempotente: aplicado pelo drizzle-kit migrate E reaplicado pelo apply-custom-sql.
--> statement-breakpoint
ALTER TABLE "auth_security_state" ADD COLUMN IF NOT EXISTS "window" jsonb DEFAULT '[]'::jsonb NOT NULL;
