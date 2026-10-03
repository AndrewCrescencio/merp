---
title: "Error Codes — MERP"
slug: "error-codes"
category: "reference"
status: "active"
version: "1.0.0"
owner: "@backend-lead"
reviewers: ["@tech-lead"]
module: "reference"
tags: ["errors", "codes", "api", "http"]
audience: ["dev", "qa", "frontend", "support"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "on-change"
related:
  - "api-auth"
  - "api-catalog"
replaces: []
replaced-by: null
---

# Error Codes — MERP

## Formato Padrão

```json
{
  "error": "error_code",
  "message": "Human readable message",
  "details": {}  // opcional, por campo
}
```

## Códigos HTTP Base

| HTTP | Error Code | Quando |
|------|------------|--------|
| 400 | `validation_error` | Body inválido (Zod) |
| 401 | `unauthorized` | Sem sessão válida |
| 403 | `forbidden` | Sem permissão / email não verificado |
| 404 | `not_found` | Recurso não encontrado (genérico, nunca vaza existência) |
| 409 | `conflict` | Conflito de unicidade (ex: SKU, email) |
| 422 | `business_rule_violation` | Regra de negócio violada (ex: estoque insuficiente) |
| 429 | `rate_limit_exceeded` | Rate limit excedido |
| 500 | `internal_error` | Erro inesperado (nunca vaza stack trace) |
| 503 | `service_unavailable` | Dependência indisponível (DB, Better Auth, email) |
| 503 | `auth_unavailable` | Better Auth falhou ao inicializar |
| 503 | `upstream_timeout` | Timeout em chamada externa (5s auth, 10s OAuth) |

## Auth Specific

| Code | HTTP | Descrição |
|------|------|-----------|
| `email_not_verified` | 403 | Login com email não verificado |
| `invalid_credentials` | 401 | Email/senha incorretos (anti-enum: genérico) |
| `session_expired` | 401 | Sessão expirou (7d TTL fixo) |
| `rate_limit_exceeded` | 429 | 5 req/min por email, 20/min por IP, 60/min por user |
| `account_locked` | 429 | 10 falhas (par) ou 50 falhas (global) → 30min |
| `weak_password` | 400 | Senha na lista de fracas / HIBP breach |
| `token_expired` | 400 | Token de verify/reset/invite expirou (1h/7d) |
| `token_invalid` | 400 | Token inválido ou já consumido |
| `consent_required` | 403 | Termos não aceitos no registro |
| `consent_withdrawn` | 403 | Consentimento retirado → conta desativada |

## Catalog Specific (Planejado)

| Code | HTTP | Descrição |
|------|------|-----------|
| `sku_conflict` | 409 | SKU já existe na company |
| `slug_conflict` | 409 | Slug já existe na company |
| `insufficient_stock` | 422 | Tentativa de vender sem estoque |
| `product_inactive` | 422 | Produto inativo não pode ser vendido |
| `category_not_found` | 404 | Categoria não existe no tenant |

## Orders Specific (Planejado)

| Code | HTTP | Descrição |
|------|------|-----------|
| `invalid_transition` | 422 | Transição de estado inválida (ex: delivered → draft) |
| `order_not_found` | 404 | Pedido não encontrado no tenant |
| `idempotency_conflict` | 409 | Idempotency-Key já processada com payload diferente |

## Headers de Rate Limit

Todas as respostas 429 incluem:
- `Retry-After`: segundos até reset
- `RateLimit-Reset`: Unix timestamp do fim da janela
- `RateLimit-Remaining`: requisições restantes na janela atual