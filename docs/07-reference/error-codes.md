---
title: 'Error Codes — MERP'
slug: 'error-codes'
category: 'reference'
status: 'active'
version: '1.1.0'
owner: '@docs-maintainer'
reviewers: ['@tech-lead']
module: 'reference'
tags: ['errors', 'http', 'codes', 'api', 'better-auth']
audience: ['dev', 'qa', 'support']
created: '2026-10-10'
updated: '2026-10-13'
review-cycle: 'quarterly'
related: []
replaces: []
replaced-by: null
---

# Error Codes — MERP

Códigos de erro retornados pela API.

**Anti-enumeração** não é "sempre 201": é garantida por duas camadas — o corpo
da resposta ser idêntico para recurso existente/inexistente **e** um piso de
tempo de resposta (`enforceMinimumTime`), para que o relógio não vaze a
existência da conta.

## Formato Padrão

Sucesso: `200` (ou `201` nos endpoints de criação) com o corpo do recurso.

Erro: o handler do Nitro responde com o envelope abaixo. **`message` é uma
string contendo JSON** — não um objeto:

```json
{
  "statusCode": 401,
  "statusMessage": "401",
  "message": "{\"error\":\"unauthorized\",\"message\":\"Authentication required.\"}"
}
```

O código legível fica dentro de `message` (formato `{ error, message }`), que é
o que `sendAuthError` em `server/utils/shared/errors.ts` serializa.

## Sucesso por Endpoint

| HTTP | Endpoint                                                    | Corpo                                                                         |
| ---- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 201  | `register`                                                  | `{ id, email, name, createdAt }` — **idêntico** para email duplicado (AUD-03) |
| 201  | `companies`, `invite`                                       | dados do recurso criado                                                       |
| 200  | `login`                                                     | `{ id, email, name }` + cookie de sessão                                      |
| 200  | `forget-password`                                           | `{ status: true, message }` — **idêntico** se o email não existir (AUD-04)    |
| 200  | `reset-password`, `send-verification-email`, `verify-email` | `{ status: true }`                                                            |
| 200  | `logout`                                                    | `{ message: 'Logged out successfully' }`                                      |

## Códigos de Erro

| HTTP | `error`               | Onde                                                              | Descrição                                           |
| ---- | --------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| 400  | `validation_error`    | qualquer                                                          | Body inválido (Zod, tamanho, formato)               |
| 401  | `unauthorized`        | endpoints com sessão                                              | Sessão ausente ou inválida                          |
| 401  | `session_expired`     | endpoints com sessão (`server/middleware/auth.ts:131`)            | Havia cookie, mas a sessão expirou ou foi revogada  |
| 401  | `invalid_credentials` | `login`                                                           | Email ou senha errados — resposta genérica          |
| 401  | `account_deactivated` | `login`                                                           | Conta desativada ou consentimento retirado (AUD-07) |
| 403  | `email_not_verified`  | `login`                                                           | Email não verificado (bloqueia login)               |
| 403  | `forbidden`           | `companies*`, `invites*`                                          | Não é membro da empresa ou não é owner              |
| 404  | `not_found`           | `verify-email`, `reset-password/[token]`                          | Token inválido ou expirado                          |
| 429  | `rate_limit_exceeded` | `register`, `login`, `forget-password`, `send-verification-email` | IP 20/min, email 5/min, user 60/min                 |
| 503  | `service_unavailable` | qualquer com banco down                                           | Falha de banco não-classificada                     |
| 503  | `upstream_timeout`    | chamadas ao Better Auth (`callBetterAuth`, timeout 5s)            | Tempo esgotado aguardando o Better Auth             |
| 503  | `auth_unavailable`    | qualquer com Better Auth fora                                     | Instância do Better Auth inicializando              |

### `409` nunca é retornado

`sendConflictError` existe em `errors.ts` mas **não é chamado por nenhum
handler**. Email duplicado, CNPJ duplicado e `unique_violation` de banco não
produzem `409`:

- **`register`** com email já existente devolve `201` com corpo forjado, nunca
  `409` (AUD-03 / FR-003 — unicidade é garantida pelo banco, não por código de
  erro).
- **`23505`** (`unique_violation`) é classificado como `503` por
  `classifyDatabaseError` — conflitos são tratados pelos chamadores antes de
  chegar no banco (ver `errors.spec.ts`).

## Rate Limit Headers

Todos os endpoints rate-limited retornam headers:

```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1700000000
Retry-After: 45  (quando 429)
```

## Erros de Banco (PostgreSQL)

Classificados por `classifyDatabaseError` / `handleDatabaseError` em
`server/utils/shared/errors.ts`:

| PG Code | Condição                 | `error`               | HTTP |
| ------- | ------------------------ | --------------------- | ---- |
| `42501` | `insufficient_privilege` | `forbidden`           | 403  |
| `P0001` | policy function error    | `forbidden`           | 403  |
| `23505` | `unique_violation`       | `service_unavailable` | 503  |
| outros  | conexão, timeout, etc.   | `service_unavailable` | 503  |

`23503` e `23514` caem no ramo genérico → `503`, não `400`: por virem do banco
já passaram da validação.

## Melhor Auth

Erros internos do Better Auth viram `APIError` com `statusCode`. O fluxo de
login converte tudo em códigos genéricos em
`server/utils/auth/identity/queries.ts`:

| Better Auth                 | `error`               | HTTP |
| --------------------------- | --------------------- | ---- |
| `INVALID_EMAIL_OR_PASSWORD` | `invalid_credentials` | 401  |
| `EMAIL_NOT_VERIFIED`        | `email_not_verified`  | 403  |
| conta inativa               | `account_deactivated` | 401  |
| sessão inválida/expirada    | `unauthorized`        | 401  |

`EMAIL_ALREADY_EXISTS` do Better Auth não chega ao cliente: `registerUser`
converte `422`/duplicata em `null` e o handler responde `201` forjado.

## Exemplos

### Validação (400)

```json
{
  "statusCode": 400,
  "statusMessage": "400",
  "message": "{\"error\":\"validation_error\",\"message\":\"Valid email is required\"}"
}
```

### Rate limited (429)

```json
{
  "statusCode": 429,
  "statusMessage": "429",
  "message": "{\"error\":\"rate_limit_exceeded\",\"message\":\"Too many requests. Try again later.\"}"
}
```

Headers: `X-RateLimit-Limit: 20`, `X-RateLimit-Remaining: 0`, `Retry-After: 45`

### Credenciais inválidas (401)

```json
{
  "statusCode": 401,
  "statusMessage": "401",
  "message": "{\"error\":\"invalid_credentials\",\"message\":\"Invalid email or password\"}"
}
```

Idêntico para email inexistente e para senha errada — inclusive em duração
(Better Auth faz um hash scrypt dummy no caminho sem conta).

## Notas de Implementação

- **Anti-enumeração**: `register` devolve `201` com corpo forjado e
  `forget-password` devolve `200` idêntico, ambos com piso de tempo
  (`enforceMinimumTime`) para o relógio não denunciar a existência da conta.
  `login` devolve `401` genérico com custo de scrypt equalizado. O frontend deve
  tratar `register`/`forget-password` como "verifique seu email" sempre.
- **CSRF**: `POST`/`PATCH`/`DELETE` autenticados exigem header `x-csrf-token`.
  Isentos: auth público (register, login, forget-password, reset-password,
  send-verification-email) + todos `GET`.
- **RLS**: erro `42501` (insufficient_privilege) → `forbidden` `403`. Não vaza se
  o recurso existe.
