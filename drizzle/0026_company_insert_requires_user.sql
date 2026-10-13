-- RLS-005: Harden company_insert_policy.
-- Antes: WITH CHECK true — qualquer contexto (mesmo sem app.user_id) inseria companies.
-- Agora: WITH CHECK (get_user_id() IS NOT NULL) — exige contexto de utilizador (fail-closed).
-- Mantém o self-service (FR-014): qualquer utilizador autenticado pode criar a sua própria
-- empresa; só se impede inserção sem GUC de utilizador (caminhos anónimos/sistema).
-- O caminho de produção (createCompanyWithOwner) seta app.user_id via withTenant → continua a funcionar.

DROP POLICY IF EXISTS "company_insert_policy" ON "company";
CREATE POLICY "company_insert_policy" ON "company" FOR INSERT
  WITH CHECK (get_user_id() IS NOT NULL);

-- Rollback for this migration:
-- DROP POLICY IF EXISTS "company_insert_policy" ON "company";
-- CREATE POLICY "company_insert_policy" ON "company" FOR INSERT WITH CHECK (true);
