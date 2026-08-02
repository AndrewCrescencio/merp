-- Backstop TOCTOU: policies de DELETE (e UPDATE do soft-delete) exigem owner,
-- reavaliado no momento da execução (is_company_owner usa get_user_id()).
-- Ordem importa em softDeleteCompany: update em company ANTES do delete de
-- members — owner ainda é membro neste ponto (ver repository.ts).
--> statement-breakpoint
DROP POLICY IF EXISTS company_modify_policy ON company;
CREATE POLICY company_modify_policy ON company FOR UPDATE
  USING (id = get_tenant_id() AND is_company_owner(id));
--> statement-breakpoint
DROP POLICY IF EXISTS company_delete_policy ON company;
CREATE POLICY company_delete_policy ON company FOR DELETE
  USING (id = get_tenant_id() AND is_company_owner(id));
--> statement-breakpoint
DROP POLICY IF EXISTS cm_delete_policy ON company_member;
CREATE POLICY cm_delete_policy ON company_member FOR DELETE
  USING (company_id = get_tenant_id() AND is_company_owner(company_id));
