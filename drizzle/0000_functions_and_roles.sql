-- Etapa functions_and_roles da cadeia única de migrações (0000 → 0005; ver drizzle/meta/_journal.json).
-- Cria a role da aplicação `merp_app` (fail-closed por RLS): NOBYPASSRLS por
-- default, INHERIT e sem BYPASSRLS, então nunca contorna as policies.
-- Definida aqui porque os GRANTs da 0002 falhariam com "role does not exist".
--
-- SEM senha: a credencial é segredo de operação (APP_DATABASE_URL) e nunca
-- entra em migração; testes e CI fazem ALTER ROLE ... PASSWORD no setup.
--
-- IF NOT EXISTS porque roles são cluster-globais: em clusters reutilizados a
-- role pode já ter sido criada por outro banco/ambiente.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'merp_app') THEN
    CREATE ROLE merp_app WITH LOGIN;
  END IF;
END $$;
