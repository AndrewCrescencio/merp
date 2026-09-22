# ADR-007: Test Suite Runs as `merp_app` Role

## Status

Accepted

## Context

The test suite was previously running as the `merp` (owner/superuser) role, which bypasses all Row Level Security (RLS) policies. This created a false sense of security — tests passed vacuously because RLS was never exercised.

## Decision

The integration test suite MUST run as the `merp_app` role (non-superuser, `NOBYPASSRLS`). This ensures:

- Every query is subject to RLS policies
- Cross-tenant isolation is actually tested
- Missing grants are caught during test runs (not in production)

## Implementation

- `vitest.config.ts` sets `APP_DATABASE_URL=postgres://merp_app:merp_app@localhost:5432/merp_test`
- `server/utils/db.ts` exports `db` (app role) and `createOwnerDbForSetupOnly()` (owner role, for test setup only)
- Test setup (`server/utils/test-setup.ts`) uses owner role for DDL/migrations, seeds via `createOwnerDbForSetupOnly()`
- All test assertions use `db` (app role) — RLS enforced

## Consequences

- Any new table MUST have explicit `GRANT` to `merp_app` (handled by migration 0017 + default privileges)
- Test setup code that seeds data must use `createOwnerDbForSetupOnly()` to bypass RLS
- Canary test (`server/utils/00-rls-canary.test.ts`) fails fast if suite accidentally runs as owner

### Regra do `createOwnerDbForSetupOnly`

- **Permitido**: setup/teardown/fixtures (beforeAll, beforeEach, test-setup.ts, seed scripts)
- **Proibido**: asserção (expect), corpo de teste (it), código de produção (server/routes, plugins, middleware)
- **Enforcement**:
  - ESLint rule `no-restricted-imports` bloqueia import fora de `*.test-setup.ts` e `*.test.ts` em contexto de setup
  - PR review verifica uso correto
  - Grep CI: `grep -r "createOwnerDbForSetupOnly" --include="*.ts" | grep -v "test-setup\|.test.ts" || true` deve retornar vazio

### Ordem do Canário (GATE B)

- **Arquivo**: `server/utils/00-rls-canary.test.ts` (prefixo `00-` garante execução primeiro via ordenação alfabética)
- **Vitest config**: `sequence.shuffle: false` + `fileParallelism: false` no `vitest.config.ts`
- **CI**: canário é job separado, required check, roda ANTES da suíte geral
  - Se canário falhar → pipeline para; suíte geral NÃO roda
  - Motivo: se a suíte roda como owner, o resto é teatro

## Verification

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('merp','merp_app');
-- Expected: merp (t,t), merp_app (f,f)
```

## References

- Phase 0 Security Gate specification
- Migration 0017: `app_role_core_grants.sql`
- `eslint.config.mjs`: `no-restricted-imports` rule
- `vitest.config.ts`: `sequence.shuffle: false`, `fileParallelism: false`
