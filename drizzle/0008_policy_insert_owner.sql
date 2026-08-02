CREATE OR REPLACE FUNCTION is_company_owner(cid text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_member
    WHERE company_id = cid AND user_id = get_user_id() AND role = 'owner'
  );
$$ LANGUAGE SQL STABLE;
--> statement-breakpoint
CREATE POLICY company_insert_policy ON company FOR INSERT
  WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS cm_insert_policy ON company_member;

CREATE POLICY cm_insert_policy ON company_member FOR INSERT
  WITH CHECK (
    -- owner adiciona qualquer membro (qualquer role)
    is_company_owner(company_id)
    -- auto-inserção com contexto válido: bootstrap do criador e aceite de convite
    OR (user_id = get_user_id() AND company_id = get_tenant_id())
  );
--> statement-breakpoint
DROP POLICY IF EXISTS cm_update_policy ON company_member;

CREATE POLICY cm_update_policy ON company_member FOR UPDATE
  USING (company_id = get_tenant_id())
  WITH CHECK (is_company_owner(company_id));
