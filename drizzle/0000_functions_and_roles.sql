-- Etapa functions_and_roles da cadeia única de migrações (0000 → 0001 → 0002).
-- Vem ANTES do baseline porque o baseline (0001) cria order_item.line_total como
-- coluna gerada GENERATED ALWAYS AS (round_half_up(...)) — sem a função, o
-- CREATE TABLE falha e o drizzle-kit faz rollback da migração inteira. Foi
-- exatamente o bug que existia enquanto round_half_up vivia fora do journal e
-- obrigava ao scripts/pre-migrate.ts.

-- Definição final de round_half_up (histórico: 0013_round_half_up.sql,
-- reaplicada depois por 0022_round_half_up.sql). Não é IF NOT EXISTS: uma
-- função nova não pode já existir — se existir, é sinal de estado inesperado e
-- a migração tem de falhar em vez de mascarar o conflito.
CREATE OR REPLACE FUNCTION round_half_up(v numeric) RETURNS numeric(12,2) LANGUAGE sql IMMUTABLE AS $$
  SELECT floor(v * 100 + 0.5) / 100.0;
$$;

-- Role da aplicação (RLS fail-closed: merp_app é NOBYPASSRLS por default, tal
-- como INHERIT e sem BYPASSRLS — ADR-010/AUD-19). Definida aqui porque os
-- GRANTs da 0002_rls_policies_grants falhariam com "role does not exist".
--
-- SEM senha: credencial é segredo de operação (APP_DATABASE_URL) e nunca entra
-- em migração; testes e CI fazem ALTER ROLE ... PASSWORD no próprio setup.
--
-- IF NOT EXISTS porque roles são cluster-globais: em clusters reutilizados a
-- role pode já ter sido criada por outro banco/ambiente.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'merp_app') THEN
    CREATE ROLE merp_app WITH LOGIN;
  END IF;
END $$;
