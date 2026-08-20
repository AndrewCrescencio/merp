-- AUD-20: company_select_policy restrita a membership — antes, qualquer
-- autenticado lia todas as empresas não-deletadas (oráculo de existência por
-- ID + ponto de vazamento de name/cnpj/razaoSocial para endpoint futuro).
-- Agora a leitura exige (a) tenant em contexto (GUC app.tenant_id, setado por
-- withTenant — cobre os UPDATE/DELETE ... RETURNING do soft-delete/update)
-- ou (b) membership real do usuário da sessão (EXISTS em company_member com
-- get_user_id()). findCompanyById passou a rodar com withTenant(null, userId)
-- — a membership é o gate (app + DB, defesa em profundidade).
--> statement-breakpoint
DROP POLICY IF EXISTS company_select_policy ON company;
CREATE POLICY company_select_policy ON company FOR SELECT
  USING (
    id = get_tenant_id()
    OR EXISTS (
      SELECT 1 FROM company_member cm
      WHERE cm.company_id = company.id AND cm.user_id = get_user_id()
    )
  );