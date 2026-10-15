---
title: 'Testing Guide — MERP'
slug: 'testing-guide'
category: 'guide'
status: 'active'
version: '1.0.0'
owner: '@qa-lead'
reviewers: ['@tech-lead']
module: 'getting-started'
tags: ['testing', 'vitest', 'unit', 'integration']
audience: ['dev', 'qa']
created: '2026-10-03'
updated: '2026-10-03'
review-cycle: 'quarterly'
related:
  - 'quickstart'
  - 'dev-environment'
replaces: []
replaced-by: null
---

# Testing Guide — MERP

## Visão Geral

- **Unit tests**: `*.spec.ts` — sem DB, rápidos, mockado
- **Integration tests**: `*.test.ts` — DB real (PostgreSQL), `DB_AVAILABLE=true`
- **Cobertura**: `npm test` roda ambos

## Estrutura

```
server/api/auth/              → .spec.ts (unit)
server/utils/auth/            → .test.ts (integration, real DB)
server/utils/shared/          → .spec.ts (utility)
vitest.config.ts              → Config de ambiente
```

## Rodar Testes

```bash
# Todos
npm test

# Watch mode
npm run test:watch

# Apenas unit (sem DB)
npm test -- --reporter=verbose

# Integração (requer Docker)
DB_AVAILABLE=true npm test
```

## Factories de Dados de Teste

```typescript
// test-setup.ts
const testUser = {
  id: 'user-123',
  email: 'test@merp.com',
  name: 'Test User',
  companyId: 'company-1',
}

const testProduct = (overrides = {}) => ({
  id: 'prod-1',
  name: 'Test Product',
  sku: 'TP-001',
  price: 99.99,
  ...overrides,
})
```

## Padrões

- Testes de repo usam `withTenant` + RLS
- Cleanup automático via `afterEach` / transactions
- Canary test roda primeiro (RLS bypass check)
