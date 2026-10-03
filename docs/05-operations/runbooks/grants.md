---
title: "Runbook: Grants e DEFAULT PRIVILEGES para merp_app"
slug: "runbook-grants"
category: "guide"
status: "active"
version: "1.0.0"
owner: "@devops"
reviewers: ["@dba"]
module: "operations"
tags: ["runbook", "grants", "rls", "postgresql"]
audience: ["devops", "dev"]
created: "2026-09-22"
updated: "2026-09-22"
review-cycle: "semiannual"
related:
  - "adr-007-test-suite-runs-as-merp-app"
replaces: []
replaced-by: null
---

# Runbook: Grants e DEFAULT PRIVILEGES para merp_app

## Visão Geral

O role `merp_app` (non-superuser, NOBYPASSRLS) deve ter grants em todas as tabelas/sequences operacionais. Desde GATE C, isso é garantido por:

1. **Migration 0017** — grants explícitos nas tabelas existentes
2. **Migration 0020** — `ALTER DEFAULT PRIVILEGES` para tabelas/sequences futuras
3. **Teste de paridade** (`grants-parity.test.ts`) — bloqueia CI se faltar grant

## Aplicação por Ambiente

### Dev Local

```bash
# Já aplicado automaticamente pelo test-setup
docker compose up -d postgres
DATABASE_URL=... npx drizzle-kit push
# test-setup.ts roda migration 0020 via applyCustomSql
```

### CI (GitHub Actions)

```yaml
# .github/workflows/test.yml
- name: Run migrations (owner)
  run: DATABASE_URL=${{ secrets.DATABASE_URL }} npx drizzle-kit migrate

- name: Run tests (merp_app)
  run: |
    export APP_DATABASE_URL=${{ secrets.APP_DATABASE_URL }}
    export DB_AVAILABLE=true
    pnpm test
```

### Staging/Produção

```bash
# 1. Migrações como owner (DATABASE_URL)
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm app npx drizzle-kit migrate

# 2. Verificar grants
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U merp -d merp -c "
  SELECT * FROM pg_default_acl WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'merp');
"
```

## Verificação Manual

```sql
-- 1. Default privileges ativas
SELECT * FROM pg_default_acl
WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'merp')
  AND defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 2. Tabelas sem grant (deve retornar 0 rows)
SELECT t.table_name
FROM information_schema.tables t
LEFT JOIN information_schema.table_privileges p
  ON p.table_schema = t.table_schema
  AND p.table_name = t.table_name
  AND p.grantee = 'merp_app'
  AND p.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT IN ('__drizzle_migrations')
  AND p.privilege_type IS NULL;

-- 3. Testar herança: criar tabela e verificar grant
CREATE TABLE test_grant_inherit (id serial, name text);
SELECT * FROM information_schema.table_privileges
WHERE table_name = 'test_grant_inherit' AND grantee = 'merp_app';
DROP TABLE test_grant_inherit;
```

## Troubleshooting

### Tabela nova sem grant

**Sintoma**: App retorna `permission denied for table X` em produção
**Causa**: Migration criou tabela mas não rodou DEFAULT PRIVILEGES (ex.: migration manual sem aplicar)
**Fix**:

```sql
-- Como owner (merp)
GRANT SELECT, INSERT, UPDATE, DELETE ON X TO merp_app;
-- E garantir que DEFAULT PRIVILEGES está ativo (migration 0020)
```

### Sequence sem grant

**Sintoma**: `nextval: permission denied for sequence X`
**Fix**:

```sql
GRANT USAGE, SELECT ON SEQUENCE X TO merp_app;
```

### Canário falha (GATE B)

**Sintoma**: `RLS BYPASS DETECTED` no canário
**Causa**: Suite rodando como owner (APP_DATABASE_URL não setado ou errado)
**Fix**: Verificar CI env vars: `APP_DATABASE_URL` = merp_app, `DATABASE_URL` = merp

## Referências

- ADR-007: "Grants e DEFAULT PRIVILEGES (GATE C)"
- Migration 0017: `app_role_core_grants.sql`
- Migration 0020: `app_role_default_privileges.sql`
- Teste: `server/utils/grants-parity.test.ts`
