-- AUD-11: a role de app (merp_app, split da 0014) ficou sem DML nas tabelas
-- criadas depois do grant inicial (docs/multi-tenancy/withtenant-rls-review.md):
-- auth_security_state (0011), invite (0012), auth_event — rate limit, convites
-- e auditoria quebrariam em produção ("permission denied" → 500 em /api/auth/*).
-- GRANT é idempotente (reaplicável pelo apply-custom-sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_security_state, auth_event, invite TO merp_app;