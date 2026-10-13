-- RLS-006: auth_event (PII) — RLS user-scoped, append-only.
-- SELECT: só o próprio utilizador lê os seus eventos (get_user_id()). Eventos de
--   login falhado (user_id NULL) não são legíveis via app (ficam para revisão
--   operacional por acesso direto) — protege o email tentado.
-- INSERT: permite o próprio utilizador (user_id = get_user_id()) OU eventos sem
--   utilizador (user_id IS NULL — login falhado, trilha de segurança FR-023).
-- Sem policy de UPDATE/DELETE → append-only (auditoria imutável).
-- Escrito por createAuthEvent (withTenant com app.user_id); lido por
--   listUserAuthEvents / export.get (LGPD) sob withTenant.
-- NÃO toca o core Better Auth (user/session/account/verification) — sem GUC,
--   RLS aí quebraria o login (ver ADR pendente RLS-006).

ALTER TABLE auth_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_event FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_event_select_policy ON auth_event;
CREATE POLICY auth_event_select_policy ON auth_event FOR SELECT
  USING (user_id = get_user_id());

DROP POLICY IF EXISTS auth_event_insert_policy ON auth_event;
CREATE POLICY auth_event_insert_policy ON auth_event FOR INSERT
  WITH CHECK (user_id = get_user_id() OR user_id IS NULL);

-- Rollback for this migration:
-- DROP POLICY IF EXISTS auth_event_select_policy ON auth_event;
-- DROP POLICY IF EXISTS auth_event_insert_policy ON auth_event;
-- ALTER TABLE auth_event NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE auth_event DISABLE ROW LEVEL SECURITY;
