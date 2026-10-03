---
title: "API Contract: Auth"
slug: "api-auth"
category: "api"
status: "active"
version: "1.0.0"
owner: "@auth-owner"
reviewers: ["@tech-lead", "@frontend-lead"]
module: "auth"
tags: ["api", "contract", "auth", "openapi"]
audience: ["dev", "qa", "frontend"]
created: "2026-09-22"
updated: "2026-09-22"
review-cycle: "on-change"
related:
  - "spec-auth"
  - "data-model-auth"
replaces: []
replaced-by: null
---

# API: Auth

> Base path: `/api/auth`
> Auth: Bearer token (session cookie) + CSRF header
> Rate limit: 5 req/min per email (sliding window)
> Errors: `{ "error": "code", "message": "human", "details?" }`

## Endpoints

### `POST /api/auth/register`

**Descrição:** Registra novo usuário.

**Request Body:**

```json
{ "email": "string", "password": "string", "consentTermsVersion": "string" }
```

**Validação:** `email` formato válido, `password` >= 8 chars, `consentTermsVersion` required.

**Response 201:**

```json
{ "status": true }
```

**Erros:** `400` (validation), `429` (rate limit), `503` (service unavailable)

---

### `POST /api/auth/login`

**Descrição:** Login com email e senha.

**Request Body:**

```json
{ "email": "string", "password": "string", "rememberMe": "boolean?" }
```

**Response 200:** Cookie `merp-session_token` (httpOnly, Secure, SameSite=Lax) + `{ "status": true }`

**Erros:** `401` (invalid_credentials), `403` (email_not_verified), `429` (rate_limit_exceeded), `503`

---

### `POST /api/auth/logout`

**Descrição:** Logout e revogação de sessão.

**Response 200:** `{ "status": true }` + cookie revogado

**Erros:** `401` (unauthorized), `503`

---

### `GET /api/auth/me`

**Descrição:** Perfil do usuário autenticado + empresas + activeCompanyId.

**Response 200:**

```json
{
  "user": { "id": "...", "email": "...", "name": "..." },
  "companies": [{ "id": "...", "name": "...", "role": "owner|member" }],
  "activeCompanyId": "..."
}
```

**Erros:** `401` (unauthorized), `403` (forbidden), `503`

---

### `POST /api/auth/companies`

**Descrição:** Cria empresa (owner bootstrap).

**Request Body:**

```json
{ "name": "string", "cnpj": "string?", "razaoSocial": "string?" }
```

**Response 201:** Empresa criada + membership owner

**Erros:** `400` (validation), `409` (cnpj conflict), `401`, `403`, `503`

---

### `GET /api/auth/companies?q=`

**Descrição:** Busca empresas onde é membro.

**Query Params:** `q` (string, opcional)

**Response 200:** Lista de empresas

**Erros:** `401`, `403`, `503`

---

### `POST /api/auth/companies/switch`

**Descrição:** Troca activeCompanyId (valida membership).

**Request Body:**

```json
{ "companyId": "string" }
```

**Response 200:** `{ "status": true }`

**Erros:** `400` (validation), `403` (not member), `401`, `503`

---

### `POST /api/auth/invite`

**Descrição:** Cria convite — token retornado **uma vez** (owner only).

**Request Body:**

```json
{ "email": "string" }
```

**Response 201:** `{ "token": "string", "expiresAt": "ISO8601" }`

**Erros:** `400`, `403` (not owner), `409` (invite pending), `401`, `503`

---

### `POST /api/auth/invites/accept`

**Descrição:** Aceita convite → cria membership (email = convite).

**Request Body:**

```json
{ "token": "string" }
```

**Response 200:** `{ "status": true }`

**Erros:** `400` (token invalid/expired), `409` (already member), `503`

---

### `GET /api/auth/export`

**Descrição:** LGPD Art. 18 — perfil + empresas + sessões + authEvents.

**Response 200:** JSON com todos dados pessoais do usuário

**Erros:** `401`, `503`

---

### `POST /api/auth/forget-password`

**Descrição:** Solicita link de reset (anti-enumeração).

**Request Body:** `{ "email": "string" }`

**Response 200:** `{ "status": true }` (sempre, mesmo para email inexistente)

**Erros:** `429`, `503`

---

### `POST /api/auth/reset-password`

**Descrição:** Consome token de reset e define nova senha.

**Request Body:** `{ "token": "string", "password": "string" }`

**Response 200:** `{ "status": true }` + revoga todas sessões

**Erros:** `400` (token invalid/expired), `422` (weak password), `503`

---

### `GET /api/auth/reset-password/[token]`

**Descrição:** Valida token de reset (sem consumir).

**Response 200:** `{ "valid": true, "email": "string" }`

**Erros:** `400` (token invalid/expired), `503`

---

### `GET /api/auth/verify-email`

**Descrição:** Verifica email com token.

**Query Params:** `token` (string)

**Response 200:** `{ "status": true }`

**Erros:** `400` (token invalid/expired), `503`

---

### `POST /api/auth/send-verification-email`

**Descrição:** Reenvia email de verificação (anti-enumeração).

**Request Body:** `{ "email": "string" }`

**Response 200:** `{ "status": true }` (sempre, mesmo para email desconhecido/já verificado)

**Erros:** `429`, `503`

---

### `POST /api/auth/deactivate`

**Descrição:** Desativa conta (soft delete).

**Response 200:** `{ "status": true }` + revoga todas sessões

**Erros:** `401`, `503`

---

### `POST /api/auth/consent/withdraw`

**Descrição:** Retira consentimento → desativação imediata.

**Response 200:** `{ "status": true }`

**Erros:** `401`, `503`

---

## Códigos de Erro

| Código | HTTP | Quando |
|--------|------|--------|
| `validation_error` | 400 | Body inválido |
| `invalid_credentials` | 401 | Email/senha incorretos |
| `unauthorized` | 401 | Sem sessão válida |
| `email_not_verified` | 403 | Login com email não verificado |
| `forbidden` | 403 | Sem permissão / não é owner |
| `not_found` | 404 | Recurso não encontrado (genérico) |
| `conflict` | 409 | Unicidade violada (CNPJ, email) |
| `rate_limit_exceeded` | 429 | 5 req/min email, 20/min IP, 60/min user |
| `account_locked` | 429 | 10 falhas (par) ou 50 falhas (global) → 30min |
| `weak_password` | 400 | Senha fraca / HIBP breach |
| `token_expired` | 400 | Token verify/reset/invite expirou |
| `token_invalid` | 400 | Token inválido ou já consumido |
| `internal_error` | 500 | Erro inesperado |
| `service_unavailable` | 503 | DB/Auth/Email indisponível |
| `auth_unavailable` | 503 | Better Auth falhou ao iniciar |
| `upstream_timeout` | 503 | Timeout chamada externa |

## Headers de Rate Limit

Todas respostas 429 incluem:
- `Retry-After`: segundos até reset
- `RateLimit-Reset`: Unix timestamp fim da janela
- `RateLimit-Remaining`: requisições restantes na janela

## Exemplos (cURL)

```bash
# Register
curl -X POST "http://localhost:3000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@merp.com","password":"senha123","consentTermsVersion":"1.0"}'

# Login
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@merp.com","password":"senha123","rememberMe":true}'

# Me (com cookie de sessão)
curl -X GET "http://localhost:3000/api/auth/me" \
  -H "Cookie: merp-session_token=..."
```