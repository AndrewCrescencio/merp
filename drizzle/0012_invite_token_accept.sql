-- SUPERSEDED by 0014_bootstrap_role_split.sql
-- This migration's cm_insert_policy is fully replaced by 0014 which splits
-- bootstrap flags by role (allow_founder_bootstrap / allow_member_bootstrap).
-- The invite_token_select_policy remains valid but is also included in 0014's
-- policy logic. Kept for history.
--
-- AUD-01: aceite de convite por token secreto, com backstop no banco.
-- O self-insert em company_member deixa de ser permitido incondicionalmente:
-- só passa com (a) flag de bootstrap do fundador (app.allow_owner_bootstrap)
-- ou (b) token SHA-256 válido (app.invite_token_hash) correspondente a um
-- convite para o email do usuário da sessão. A garantia de uso único NÃO vive
-- aqui (accepted_at é setado pelo claim antes do insert) — o claim atômico
-- (UPDATE ... WHERE accepted_at IS NULL) é quem impede reuso. Remover o check
-- no app deixa de ser suficiente — o banco nega na execução.
CREATE POLICY cm_insert_policy ON company_member FOR INSERT
  WITH CHECK (
    is_company_owner(company_id)
    OR (
      user_id = get_user_id() AND company_id = get_tenant_id()
      AND (
        current_setting('app.allow_owner_bootstrap', true) = 'true'
        OR EXISTS (
          SELECT 1 FROM invite
          WHERE invite.company_id = get_tenant_id()
            AND invite.email = (SELECT email FROM "user" WHERE id = get_user_id())
            AND invite.token_hash = current_setting('app.invite_token_hash', true)
            AND invite.expires_at > now()
        )
      )
    )
  );
--> statement-breakpoint
-- Possuidor do token (GUC setado no mesmo tx) pode ler o convite fora do
-- contexto de tenant — necessário para o lookup por token no aceite. Sem
-- token setado, current_setting retorna NULL → nunca casa (fail-closed).
CREATE POLICY invite_token_select_policy ON invite FOR SELECT
  USING (
    "company_id" = get_tenant_id()
    OR "token_hash" = current_setting('app.invite_token_hash', true)
  );
--> statement-breakpoint
-- Convites pendentes criados antes do token_hash não têm como ser aceitos —
-- invalidados (expirados) em vez de perpetuarem convites sem segredo.
UPDATE invite SET expires_at = now() WHERE accepted_at IS NULL AND token_hash IS NULL;