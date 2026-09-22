-- FIX (ordering banco limpo): garante merp_app ANTES de 0015_app_role_grants.
-- 0015 faz GRANT ... TO merp_app, mas a role só era criada em 0017 →
-- banco 100% limpo quebrava em 0015 ("role merp_app does not exist") e o
-- applier (ON_ERROR_STOP) abortava sem aplicar 0017+. Só passava com volume
-- reaproveitado (role pré-existente). Em CI limpa, quebra.
--
-- Numerado 0014 de propósito (não 0020): o applier aplica em ordem numérica
-- e aborta no primeiro erro — um arquivo após 0015 jamais executaria no banco
-- limpo. "0014_app_role_ensure" ordena antes de 0014_bootstrap_role_split
-- ('a' < 'b') e de 0015, entra no filtro >=0005 do applier e no range
-- 0010…0019 do runbook do README. Agrupa com o batch AUD-11 (0014 é o
-- role-split que a 0015 cita).
--
-- Idempotente (no-op em bancos já migrados) e fora do journal do
-- drizzle-kit (como 0014–0019): `migrate` ignora, o applier reaplica.
-- Bloco idêntico ao da 0017 — mesma definição, sem senha: credencial é da
-- operação/bootstrap (APP_DATABASE_URL; em testes, ensureAppRole).
-- Atributos resultantes: LOGIN, NOBYPASSRLS (default) e INHERIT (default) —
-- iguais aos do ensureAppRole, então RLS continua valendo para a role.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'merp_app') THEN
    CREATE ROLE merp_app WITH LOGIN;
  END IF;
END $$;
