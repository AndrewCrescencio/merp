---
title: "Glossário — MERP"
slug: "glossary"
category: "reference"
status: "active"
version: "1.0.0"
owner: "@docs-maintainer"
reviewers: ["@tech-lead"]
module: "overview"
tags: ["glossary", "terms", "domain"]
audience: ["dev", "qa", "product", "support"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "quarterly"
related: []
replaces: []
replaced-by: null
---

# Glossário — MERP

| Termo | Definição |
|-------|-----------|
| **Tenant** | Sinônimo de `company` — unidade de isolamento de dados (ADR-001) |
| **Company** | Tabela raiz do tenant (`company.id`, `company.name`, `company.cnpj`) |
| **Pack Vertical** | Feature flag por tenant (restaurant, retail, erp-b2b) |
| **RLS** | Row Level Security — policies no PostgreSQL para isolamento |
| **GUC** | Grand Unified Configuration — `app.tenant_id`, `app.user_id` setados via `SET LOCAL` |
| **withTenant** | Helper obrigatório para queries tenant-scoped: `withTenant(tenantId, userId, fn, tx?)` |
| **Vertical Slice** | Feature completa: API + Repository + Schema + Testes (ADR-008) |
| **MVP** | Núcleo comum: auth, company, catalog, inventory, order, payment, fiscal, finance, audit |
| **ADR** | Architecture Decision Record — decisão irreversível documentada |
| **FR** | Functional Requirement — requisito funcional numerado e testável |
| **SC** | Success Criteria — critério de sucesso mensurável |
| **PII** | Personally Identifiable Information — dados pessoais (LGPD) |
| **Idempotency-Key** | Header obrigatório para escritas críticas (ex: `pay`, criar pedido) |
| **Anti-enumeration** | Resposta idêntica para recurso existente/inexistente (ex: register 201 genérico) |
| **Double-submit CSRF** | Cookie `csrf_token` + header `X-CSRF-Token` validado no middleware |
| **Sliding Window** | Rate limit com janela deslizante (não fixa) |
| **Lockout** | Bloqueio de conta após N tentativas (dual-tier: par email+IP + global email) |
| **Soft Delete** | Flag `is_deleted` / `is_active=false` — nunca hard delete em dados fiscais |
| **Canary Test** | Teste que falha se RLS estiver em bypass (roda primeiro na suite) |
| **merp_app** | Role PostgreSQL non-superuser, NOBYPASSRLS — runtime da aplicação |
| **merp** | Role PostgreSQL superuser — apenas migrações (owner) |