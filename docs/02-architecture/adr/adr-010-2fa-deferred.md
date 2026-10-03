---
title: "2FA Deferred"
slug: "adr-010-2fa-deferred"
category: "adr"
status: "deferred"
version: "1.0.0"
owner: "@auth-owner"
reviewers: ["@tech-lead", "@security-lead"]
module: "auth"
tags: ["architecture", "decision", "2fa", "mfa", "deferred"]
audience: ["dev", "architect", "security"]
created: "2026-09-22"
updated: "2026-09-22"
review-cycle: "on-change"
related:
  - "adr-004-session-ttl-by-profile"
replaces: []
replaced-by: null
---

# ADR-010: 2FA Deferred

## Contexto

2FA (TOTP + backup codes) foi implementado no Better Auth plugin `twoFactor` com tabela `two_factor` e RLS policies associadas. Durante a validação do gate de segurança, descobriu-se que o adapter Drizzle + plugin 2FA + RLS `location_id` criava conflitos de migração (ordem de criação de tabelas, grants, policies) e aumentava a superfície de ataque sem benefício imediato para o MVP.

## Decisão

Remover 2FA do escopo atual. Reintroduzir depois com spec completa.

## Ações executadas

1. Deletada seção `TwoFactor` de `specs/001-auth-context/data-model.md`
2. Deletado `server/utils/schema/two-factor.ts`
3. Removido `export * from './two-factor'` de `server/utils/schema/index.ts`
4. Removido `import { twoFactor } from 'better-auth/plugins'` de `shared/auth.ts`
5. Removido `twoFactor` do `schema` do adapter Drizzle
6. Removido `twoFactor` do array `plugins` do Better Auth
7. Criada migration `drizzle/0021_drop_two_factor.sql` com `DROP TABLE IF EXISTS two_factor CASCADE`
8. Adicionado em `specs/README.md` "Dívidas conhecidas": "2FA removido do escopo (ver ADR-010)"

## Motivo

Landmine técnico: adapter Drizzle × plugin 2FA × RLS `location_id` causava:

- Conflito de ordem nas migrações (tabela `two_factor` criada antes da role `merp_app` existir)
- Grants inconsistentes (RLS policies requerem `location_id` que 2FA não tem)
- Surface area de autenticação dobrada sem usuário real usando

## Critério para retomar

1. Feature flag `auth.twoFactor` para habilitar condicionalmente
2. Migration dedicada que cria `two_factor` COM `company_id` + `location_id` (alinhado ao ADR-002)
3. Testes de RLS completos com `app.location_id` setado
4. Spec de UX completa (enrollment, recovery, backup codes, admin override)
