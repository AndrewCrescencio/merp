-- AUD-11 (revisão 2026-08-15): o flag de bootstrap era único — qualquer
-- chamador de createCompanyMember podia se auto-inserir como OWNER de qualquer
-- empresa (mina de escalada; o backstop RLS do AUD-01 não cobria o caminho,
-- pois a própria função setava o flag que a policy exigia).
-- Os flags agora são escopados por role:
--   app.allow_founder_bootstrap → self-insert role='owner'  (só createCompanyWithOwner)
--   app.allow_member_bootstrap  → self-insert role='member' (só createCompanyMember)
-- A branch de token de convite também passa a exigir role='member' (o aceite
-- sempre insere member). A branch is_company_owner segue liberando owner a
-- adicionar qualquer membro (decisão da 0008, por design).
DROP POLICY IF EXISTS cm_insert_policy ON company_member;
CREATE POLICY cm_insert_policy ON company_member FOR INSERT
  WITH CHECK (
    is_company_owner(company_id)
    OR (
      user_id = get_user_id() AND company_id = get_tenant_id()
      AND (
        (current_setting('app.allow_founder_bootstrap', true) = 'true' AND role = 'owner')
        OR (current_setting('app.allow_member_bootstrap', true) = 'true' AND role = 'member')
        OR (
          role = 'member'
          AND EXISTS (
            SELECT 1 FROM invite
            WHERE invite.company_id = get_tenant_id()
              AND invite.email = (SELECT email FROM "user" WHERE id = get_user_id())
              AND invite.token_hash = current_setting('app.invite_token_hash', true)
              AND invite.expires_at > now()
          )
        )
      )
    )
  );
