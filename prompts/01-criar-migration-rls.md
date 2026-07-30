Crie o arquivo `drizzle/0005_misty_silver_sable.sql` com o seguinte conteúdo:

```sql
-- Create helper functions for RLS policies
CREATE OR REPLACE FUNCTION get_tenant_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_user_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '');
$$ LANGUAGE SQL STABLE;

-- Enable RLS on company table
ALTER TABLE company ENABLE ROW LEVEL SECURITY;

-- Allow SELECT on non-deleted companies (public search) or if tenant context matches
CREATE POLICY company_select_policy ON company FOR SELECT
  USING (is_deleted = false OR id = get_tenant_id());

-- Restrict UPDATE/DELETE to tenant context only
CREATE POLICY company_modify_policy ON company FOR UPDATE
  USING (id = get_tenant_id());
CREATE POLICY company_delete_policy ON company FOR DELETE
  USING (id = get_tenant_id());

-- Enable RLS on company_member table
ALTER TABLE company_member ENABLE ROW LEVEL SECURITY;

-- Allow SELECT if same tenant or same user
CREATE POLICY cm_select_policy ON company_member FOR SELECT
  USING (company_id = get_tenant_id() OR user_id = get_user_id());

-- Allow INSERT (app-layer validates membership)
CREATE POLICY cm_insert_policy ON company_member FOR INSERT
  WITH CHECK (true);

-- Restrict UPDATE/DELETE to tenant context
CREATE POLICY cm_update_policy ON company_member FOR UPDATE
  USING (company_id = get_tenant_id());
CREATE POLICY cm_delete_policy ON company_member FOR DELETE
  USING (company_id = get_tenant_id());
```

Após criar, execute:

```bash
npx drizzle-kit generate
```
