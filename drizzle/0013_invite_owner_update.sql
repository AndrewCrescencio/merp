-- AUD-01 (residual registrado para revisão): members podiam UPDATE/DELETE
-- invites não-aceitos na mesma empresa (policy antiga sem check de role).
-- Agora UPDATE exige owner OU o claim por token (mesmo padrão do
-- cm_insert_policy): email do invite = email do usuário da sessão + token
-- SHA-256 no GUC + pendente + não expirado. DELETE fica owner-only (o app não
-- tem caminho de revogação; quando houver, será restrito a owner).
CREATE POLICY invite_update_policy ON invite FOR UPDATE
  USING (
    "company_id" = get_tenant_id()
    AND (
      is_company_owner("company_id")
      OR (
        "email" = (SELECT email FROM "user" WHERE id = get_user_id())
        AND "token_hash" = current_setting('app.invite_token_hash', true)
        AND "accepted_at" IS NULL
        AND "expires_at" > now()
      )
    )
  )
  WITH CHECK (
    "company_id" = get_tenant_id()
    AND (
      is_company_owner("company_id")
      OR (
        "email" = (SELECT email FROM "user" WHERE id = get_user_id())
        AND "token_hash" = current_setting('app.invite_token_hash', true)
        AND "expires_at" > now()
      )
    )
  );
--> statement-breakpoint
CREATE POLICY invite_delete_policy ON invite FOR DELETE
  USING (is_company_owner("company_id"));