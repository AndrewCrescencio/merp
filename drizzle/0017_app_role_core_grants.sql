-- AUD-19: role de app (merp_app) e grants core em migração idempotente.
-- Antes viviam só em server/utils/test-setup.ts e docs — deploy em produção
-- dependia de passo manual (esquecer = permission denied em todos os
-- endpoints). A senha NÃO é fixada aqui (definida pela operação via
-- APP_DATABASE_URL); a migração garante existência da role + privilégios
-- mínimos nas tabelas/sequências do schema public.
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'merp_app') THEN
    CREATE ROLE merp_app WITH LOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO merp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO merp_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO merp_app;