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
- `server/utils/db.ts` exports `db` (app role) and `createOwnerDb()` (owner role, for test setup only)
- Test setup (`server/utils/test-setup.ts`) uses owner role for DDL/migrations, seeds via `createOwnerDb()`
- All test assertions use `db` (app role) — RLS enforced

## Consequences

- Any new table MUST have explicit `GRANT` to `merp_app` (handled by migration 0017 + default privileges)
- Test setup code that seeds data must use `createOwnerDb()` to bypass RLS
- Canary test (`rls-canary.test.ts`) fails fast if suite accidentally runs as owner

## Verification

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('merp','merp_app');
-- Expected: merp (t,t), merp_app (f,f)
```

## References

- Phase 0 Security Gate specification
- Migration 0017: `app_role_core_grants.sql`
