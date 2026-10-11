---
title: 'Error Codes — MERP'
slug: 'error-codes'
category: 'reference'
status: 'active'
version: '1.0.0'
owner: '@docs-maintainer'
reviewers: ['@tech-lead']
module: 'reference'
tags: ['errors', 'http', 'codes', 'api', 'better-auth']
audience: ['dev', 'qa', 'support']
created: '2026-10-10'
updated: '2026-10-10'
review-cycle: 'quarterly'
related: []
replaces: []
replaced-by: null
---

# Error Codes — MERP

Códigos de erro padronizados retornados pela API. Padrão: **anti-enumeração** — erros de autenticação retornam `201 Created` genérico com corpo mínimo para não vazar existência de email/usuário.

## Formato Padrão

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Descrição legível",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Códigos por Categoria

### Autenticação (`/api/auth/*`)

| HTTP | Code                  | Endpoint                                                                                                                      | Descrição                                                              |
| ---- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 201  | `SUCCESS`             | register, login, logout, forget-password, reset-password, send-verification-email, verify-email, consent/withdraw, deactivate | **Anti-enumeração**: sempre 201 com corpo mínimo `{ success: true }`   |
| 400  | `VALIDATION_ERROR`    | Qualquer                                                                                                                      | Body inválido (Zod) — detalhes em `details`                            |
| 400  | `INVALID_CSRF_TOKEN`  | POST/PATCH/DELETE autenticados                                                                                                | Token CSRF ausente ou inválido                                         |
| 401  | `UNAUTHORIZED`        | Endpoints com sessão                                                                                                          | Sessão ausente, expirada ou inválida                                   |
| 403  | `EMAIL_NOT_VERIFIED`  | login                                                                                                                         | Email não verificado (bloqueia login)                                  |
| 403  | `ACCOUNT_DEACTIVATED` | login                                                                                                                         | Conta desativada (consentimento retirado)                              |
| 403  | `SESSION_REVOKED`     | Qualquer autenticado                                                                                                          | Sessão revogada (logout, password reset, consent withdrawal)           |
| 404  | `NOT_FOUND`           | verify-email, reset-password/[token]                                                                                          | Token inválido ou expirado                                             |
| 409  | `CONFLICT`            | register, companies                                                                                                           | Email já registrado, CNPJ duplicado, etc.                              |
| 422  | `WEAK_PASSWORD`       | register, reset-password                                                                                                      | Senha fraca (HIBP breach, length, complexity)                          |
| 429  | `RATE_LIMITED`        | register, login, forget-password, send-verification-email                                                                     | Rate limit excedido (IP 20/min, email 5/min, user 60/min)              |
| 429  | `LOCKED_OUT`          | login                                                                                                                         | Lockout dual-tier: (email+IP) 10 tentativas OU global email 50 → 30min |

### Empresas/Membros/Convites (`/api/auth/companies*`, `/api/auth/invites*`)

| HTTP | Code                | Endpoint                              | Descrição                                |
| ---- | ------------------- | ------------------------------------- | ---------------------------------------- |
| 403  | `FORBIDDEN`         | companies/_, invites/_                | Não é membro da empresa ou não é owner   |
| 404  | `COMPANY_NOT_FOUND` | companies/get, switch, update, delete | Empresa não existe ou soft-deleted       |
| 404  | `INVITE_NOT_FOUND`  | invites/accept                        | Convite não existe, expirado ou já usado |
| 409  | `ALREADY_MEMBER`    | invites/accept                        | Email já é membro da empresa             |
| 400  | `INVALID_TOKEN`     | invites/accept                        | Token de convite inválido                |

### Health/Metrics/Público

| HTTP | Code                  | Endpoint                      | Descrição                                 |
| ---- | --------------------- | ----------------------------- | ----------------------------------------- |
| 200  | `OK`                  | health, metrics, security.txt | Sempre 200; body indica readiness de deps |
| 503  | `SERVICE_UNAVAILABLE` | health                        | Dependência crítica down (DB)             |

### Rate Limit Headers

Todos os endpoints rate-limited retornam headers:

```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1700000000
Retry-After: 45  (quando 429)
```

## Better Auth Errors (Mapeados)

Better Auth lança erros internos que são mapeados para os códigos acima em `server/utils/shared/errors.ts` via `handleDatabaseError` e `sendAuthError`.

| Better Auth Error      | MERP Code             | HTTP |
| ---------------------- | --------------------- | ---- |
| `EMAIL_ALREADY_EXISTS` | `CONFLICT`            | 409  |
| `INVALID_CREDENTIALS`  | `SUCCESS` (201)       | 201  |
| `EMAIL_NOT_VERIFIED`   | `EMAIL_NOT_VERIFIED`  | 403  |
| `SESSION_EXPIRED`      | `UNAUTHORIZED`        | 401  |
| `SESSION_REVOKED`      | `SESSION_REVOKED`     | 403  |
| `ACCOUNT_DEACTIVATED`  | `ACCOUNT_DEACTIVATED` | 403  |

## Erros de Banco (PostgreSQL)

| PG Code | Condição                 | MERP Code          | HTTP |
| ------- | ------------------------ | ------------------ | ---- |
| `23505` | `unique_violation`       | `CONFLICT`         | 409  |
| `23503` | `foreign_key_violation`  | `VALIDATION_ERROR` | 400  |
| `23514` | `check_violation`        | `VALIDATION_ERROR` | 400  |
| `42501` | `insufficient_privilege` | `FORBIDDEN`        | 403  |
| `42P01` | `undefined_table`        | `INTERNAL_ERROR`   | 500  |

## Exemplos

### Validation Error (400)

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "email": "Invalid email format",
    "password": "Password must be at least 8 characters"
  }
}
```

### Rate Limited (429)

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "code": "RATE_LIMITED",
  "details": { "retryAfter": 45 }
}
```

Headers: `X-RateLimit-Limit: 20`, `X-RateLimit-Remaining: 0`, `Retry-After: 45`

### Unauthorized (401)

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Session expired or invalid",
  "code": "UNAUTHORIZED",
  "details": {}
}
```

## Notas de Implementação

- **Anti-enumeração**: `register`, `login`, `forget-password`, `reset-password`, `send-verification-email`, `verify-email`, `consent/withdraw`, `deactivate` **sempre retornam 201** com `{ success: true }` independentemente de o email existir. O frontend deve tratar todos como "verifique seu email".
- **CSRF**: Endpoints `POST`/`PATCH`/`DELETE` autenticados exigem header `x-csrf-token`. Isentos: auth público (register, login, forget-password, reset-password, send-verification-email) + todos `GET`.
- **RLS**: Erro `42501` (insufficient_privilege) → `FORBIDDEN` 403. Não vaza se o recurso existe.
