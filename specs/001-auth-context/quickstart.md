# Auth Bounded Context — Quickstart

Setup mínimo para levantar o contexto auth e bater nos endpoints.

## Prerequisites

- Docker + docker-compose
- Node.js 20+

## Setup

```bash
# Install dependencies
npm install

# Start infrastructure
docker compose up -d postgres

# Run migrations (inclui RLS custom via scripts/apply-custom-sql.ts)
npm run db:migrate:full

# Start dev server
npm run dev
```

## Relevant Files

| Path                                                                               | Purpose                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `server/api/auth/register.post.ts`                                                 | Registration                                                 |
| `server/api/auth/login.post.ts`, `logout.post.ts`                                  | Login / logout                                               |
| `server/api/auth/email/verification.post.ts`, `email/verification/confirm.post.ts` | Email verification (resend + confirm)                        |
| `server/api/auth/password/forgot.post.ts`, `password/reset.post.ts`                | Password recovery                                            |
| `server/api/v1/me/index.get.ts`                                                    | Session check                                                |
| `server/api/v1/me/data-export/index.get.ts`                                        | LGPD export                                                  |
| `server/api/v1/me/deactivate/index.post.ts`                                        | Deactivation                                                 |
| `server/api/v1/me/consents/withdraw/index.post.ts`                                 | LGPD consent withdrawal                                      |
| `server/api/v1/companies/index.post.ts`, `index.get.ts`                            | Company create + search                                      |
| `server/api/v1/companies/[companyId]/index.patch.ts`, `index.delete.ts`            | Company update + soft delete                                 |
| `server/api/v1/companies/[companyId]/members/[userId]/index.delete.ts`             | Remove member / leave company                                |
| `server/api/v1/companies/[companyId]/invitations/index.post.ts`                    | Create invite                                                |
| `server/api/v1/me/invitations/index.get.ts`, `invitations/accept/index.post.ts`    | List invites + accept                                        |
| `server/middleware/auth.ts`                                                        | Session validation + user rate limit (60/min)                |
| `server/middleware/tenant.ts`                                                      | Resolves `companyId` from the path → `event.context.tenant`  |
| `server/middleware/02-csrf-validate.ts`                                            | CSRF double-submit                                           |
| `server/middleware/pii-audit.ts`                                                   | PII audit                                                    |
| `server/utils/auth/identity/queries.ts`, `client.ts`                               | Identity + session + verification (via Better Auth)          |
| `server/utils/auth/company/repository.ts`, `membership.ts`                         | Company + membership                                         |
| `server/utils/auth/invite/repository.ts`                                           | Invites                                                      |
| `server/utils/db/tenant-context.ts`                                                | `withTenant`                                                 |
| `server/utils/shared/*`                                                            | errors, security (rate limit/lockout), audit, csrf, ip, etc. |
| `server/utils/schema/*`                                                            | Drizzle tables by feature                                    |
| `shared/auth.ts`, `shared/logger.ts`                                               | Better Auth instance + logger                                |

## Testing

Tests are co-located beside the files they validate.

```bash
# All unit tests (co-located)
npx vitest run server/

# Run a specific test file
npx vitest run server/api/auth/register.post.spec.ts

# Watch mode during development
npx vitest
```

## Verification

`POST` fora da lista de exempt (`register`, `login`, `password/forgot`,
`password/reset`, `email/verification`, `email/verification/confirm`) exige o
header `x-csrf-token` igual ao cookie `merp-csrf_token`. Extraia-o do
`cookies.txt` após o login:

```bash
CSRF=$(grep merp-csrf_token cookies.txt | awk '{print $7}')
```

```bash
# Register a user (with optional LGPD consent) — CSRF-exempt
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123","name":"Test User","consentTermsVersion":"v1"}'

# Login (session cookie saved) — CSRF-exempt
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}' \
  -c cookies.txt

# Check session
curl http://localhost:3000/api/v1/me -b cookies.txt

# Export personal data
curl http://localhost:3000/api/v1/me/data-export -b cookies.txt

# Deactivate account
curl -X POST http://localhost:3000/api/v1/me/deactivate \
  -b cookies.txt -H "x-csrf-token: $CSRF"

# Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -b cookies.txt -H "x-csrf-token: $CSRF"
```

### Email verification / password recovery

O token **nunca** vai em path ou query (R6) — os links de e-mail apontam para
páginas do Nuxt, que fazem `POST` com o token no body.

```bash
# Resend the verification link — CSRF-exempt
curl -X POST http://localhost:3000/api/auth/email/verification \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Confirm the email — CSRF-exempt, token no BODY
curl -X POST http://localhost:3000/api/auth/email/verification/confirm \
  -H "Content-Type: application/json" \
  -d '{"token":"<signed-jwt-do-email>"}'

# Request a reset link — CSRF-exempt
curl -X POST http://localhost:3000/api/auth/password/forgot \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Set the new password — CSRF-exempt, token no BODY
curl -X POST http://localhost:3000/api/auth/password/reset \
  -H "Content-Type: application/json" \
  -d '{"token":"<single-use-token>","newPassword":"new-secure-password-456"}'
```

### Multi-Tenant Verification

O tenant vive **no path** (`/api/v1/companies/{companyId}/...`), não em sessão.
Não há `switch` — escolher a empresa é escolher a URL.

```bash
# Create company
curl -X POST http://localhost:3000/api/v1/companies \
  -H "Content-Type: application/json" \
  -b cookies.txt -H "x-csrf-token: $CSRF" \
  -d '{"name":"My Company","cnpj":"12.345.678/0001-90"}'

# Search companies
curl "http://localhost:3000/api/v1/companies?q=My%20Company" -b cookies.txt

# Update company (owner only) — id no PATH, campos no body
curl -X PATCH http://localhost:3000/api/v1/companies/<company-uuid> \
  -H "Content-Type: application/json" \
  -b cookies.txt -H "x-csrf-token: $CSRF" \
  -d '{"name":"New Name"}'

# Remove a member — os dois ids no PATH, sem body
curl -X DELETE http://localhost:3000/api/v1/companies/<company-uuid>/members/<member-user-uuid> \
  -b cookies.txt -H "x-csrf-token: $CSRF"

# Invite someone (owner only) — companyId no PATH, email no body
curl -X POST http://localhost:3000/api/v1/companies/<company-uuid>/invitations \
  -H "Content-Type: application/json" \
  -b cookies.txt -H "x-csrf-token: $CSRF" \
  -d '{"email":"invitee@example.com"}'

# Soft-delete the company (owner only) — DELETE sem body
curl -X DELETE http://localhost:3000/api/v1/companies/<company-uuid> \
  -b cookies.txt -H "x-csrf-token: $CSRF"
```

Não-membro e empresa inexistente devolvem o **mesmo `404`** (o middleware
`tenant` não vaza existência entre tenants); membro sem papel devolve `403`.

## Health

```bash
# Liveness — sempre 200 enquanto o processo responde
curl http://localhost:3000/api/health/live

# Readiness — 503 se o banco estiver indisponível
curl -i http://localhost:3000/api/health/ready
```
