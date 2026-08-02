-- Remove/leave member: estende cm_delete_policy (0009) para permitir que um
-- member saia da empresa deletando a PRÓPRIA linha (nunca uma linha de owner).
--
-- Cláusulas (avaliadas na execução — backstop TOCTOU):
--   1. owner do tenant remove qualquer member  (usado por removeCompanyMember
--      e por softDeleteCompany, que deleta TODAS as linhas incluindo a do owner)
--   2. user remove a própria linha, desde que role <> 'owner' (leave)
--
-- A cláusula 1 NÃO restringe role <> 'owner' de propósito: softDeleteCompany
-- precisa remover a linha do próprio owner junto com as demais. O bloqueio de
-- "não remover owner" fica na camada de app (403), que é autoritativa — trocar
-- role exige ser owner (cm_update_policy, 0008), então o remover é quem
-- controla mutações de role na janela guard→operação.
--> statement-breakpoint
DROP POLICY IF EXISTS cm_delete_policy ON company_member;
CREATE POLICY cm_delete_policy ON company_member FOR DELETE
  USING (
    (company_id = get_tenant_id() AND is_company_owner(company_id))
    OR (user_id = get_user_id() AND role <> 'owner')
  );
