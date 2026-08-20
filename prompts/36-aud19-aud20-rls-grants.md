# Prompt 36 — AUD-19 (role/grants em migração) + AUD-20 (company_select_policy restrita)

## AUD-19 — role `merp_app` e grants core fora de migração; `DATABASE_URL` owner no container

- `drizzle/0017_app_role_core_grants.sql` (novo): DO block cria a role
  `merp_app` se ausente (sem senha — segredo de operação via APP_DATABASE_URL)
  - `GRANT USAGE ON SCHEMA public` + DML em `ALL TABLES`/`ALL SEQUENCES`.
    Padrão idempotente do `apply-custom-sql` (>= 0005, reaplicável).
- `docker-compose.prod.yml`: remover `- DATABASE_URL=${DATABASE_URL?...}` —
  o app usa apenas `APP_DATABASE_URL` em produção (exigida no boot, AUD-05).
- `server/utils/test-setup.ts`: `ensureAppRole` passa a só garantir a senha de
  teste (ALTER ROLE idempotente quando a role já existe pela migração 0017).

## AUD-20 — `company_select_policy` aberta / `findCompanyById` sem membership

- `drizzle/0016_company_select_membership.sql` (novo): policy restrita a
  `id = get_tenant_id()` OU `EXISTS (SELECT 1 FROM company_member cm WHERE
cm.company_id = company.id AND cm.user_id = get_user_id())`. O escape por
  tenant preserva os `UPDATE/DELETE ... RETURNING` (soft-delete/update rodam
  com `withTenant(companyId, userId)`).
- `server/utils/auth/company/repository.ts`:
  - `findCompanyById(id, userId)` roda com `withTenant(null, userId)` —
    outsider → 0 rows → null (404 nos handlers). Interface atualizada.
  - `createCompany`/`createCompanyWithOwner`: o id é gerado no app
    (`randomUUID()`) e o tenant GUC é setado ANTES do `INSERT ... RETURNING` —
    a SELECT policy filtra rows retornadas; sem GUC o RETURNING volta vazio.
- Handlers: passar `user.id` em todos os call sites de `findCompanyById`
  (invite.post, companies.update.post, invites.get, companies.delete.post,
  companies.switch.post, companies/members.delete.post).
- Testes: `repository.test.ts` — novo caso outsider (null) + owner (row);
  chamadas existentes ajustadas para o owner.

Verificação: pnpm test, pnpm lint. Commits:

1. fix(security): role/grants core em migração e DATABASE_URL fora do container (AUD-19)
2. fix(security): company_select_policy restrita a membership e findCompanyById com userId (AUD-20)
3. docs(security): pendências 31/32 resolvidas (AUD-19/20)
