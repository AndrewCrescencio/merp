-- Rate limiter e lockout persistentes (pendência #9): estado de segurança de
-- autenticação fora de memória, compartilhado entre workers/instâncias.
--
-- Chaves: `rate:<email>` (janela de 60s, máx. 5 requisições — FR-010) e
-- `lockout:<email>` (10 falhas → bloqueio de 30min).
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_security_state" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"reset_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_security_state_reset_at_idx" ON "auth_security_state" USING btree ("reset_at");
