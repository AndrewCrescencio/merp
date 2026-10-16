# Auth Bounded Context — Quickstart

## Prerequisites

- Docker + docker-compose
- Node.js 20+

## Setup

```bash
# Install dependencies
npm install

# Start infrastructure
docker compose up -d postgres

# Run migrations
npx drizzle-kit generate
npx drizzle-kit migrate

# Start dev server
npm run dev
```

## Relevant Files

| Path (correto)                                                                                       | Purpose                                                             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `server/api/auth/register.post.ts`                                                                   | Registration                                                        |
| `server/api/auth/login.post.ts`                                                                      | Login                                                               |
| `server/api/auth/logout.post.ts`                                                                     | Logout                                                              |
| `server/api/auth/me.get.ts`                                                                          | Session check                                                       |
| `server/api/auth/export.get.ts`                                                                      | LGPD export                                                         |
| `server/api/auth/deactivate.post.ts`                                                                 | Deactivation                                                        |
| `server/api/auth/consent/withdraw.post.ts`                                                           | LGPD consent withdrawal                                             |
| `server/api/auth/companies*.ts`                                                                      | Company CRUD + switch + members                                     |
| `server/api/auth/invite.post.ts`, `invites.get.ts`, `invites.accept.post.ts`                         | Invites                                                             |
| `server/api/auth/verify-email.get.ts`, `send-verification-email.post.ts`                             | Email verification                                                  |
| `server/api/auth/forget-password.post.ts`, `reset-password.post.ts`, `reset-password/[token].get.ts` | Password recovery                                                   |
| `server/middleware/auth.ts`                                                                          | Session validation + user rate limit                                |
| `server/middleware/pii-audit.ts`                                                                     | PII audit                                                           |
| `server/utils/auth/identity/repository.ts`                                                           | Identity + session + verification                                   |
| `server/utils/auth/company/repository.ts`                                                            | Company + membership                                                |
| `server/utils/auth/invite/repository.ts`                                                             | Invites                                                             |
| `server/utils/db/tenant-context.ts`                                                                  | `withTenant`                                                        |
| `server/utils/order/repository.ts`                                                                   | Orders                                                              |
| `server/utils/shared/*`                                                                              | errors, security (rate limit/lockout), audit, csrf, email, ip, etc. |
| `server/utils/schema/*`                                                                              | Drizzle tables by feature                                           |
| `server/tasks/purge-*.ts`                                                                            | Retention tasks                                                     |
| `shared/auth.ts`, `shared/logger.ts`                                                                 | Better Auth instance + logger                                       |

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

```bash
# Register a user (with optional LGPD consent)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123","name":"Test User","consentTermsVersion":"v1"}'

# Login (session cookie saved)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}' \
  -c cookies.txt

# Check session
curl http://localhost:3000/api/auth/me -b cookies.txt

# Export personal data
curl http://localhost:3000/api/auth/export -b cookies.txt

# Deactivate account
curl -X POST http://localhost:3000/api/auth/deactivate -b cookies.txt

# Logout
curl -X POST http://localhost:3000/api/auth/logout -b cookies.txt
```

### Multi-Tenant Verification

```bash
# Create company
curl -X POST http://localhost:3000/api/auth/companies \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"My Company","cnpj":"12.345.678/0001-90"}'

# Search companies
curl "http://localhost:3000/api/auth/companies?q=My%20Company" -b cookies.txt

# Switch active company
curl -X POST http://localhost:3000/api/auth/companies/switch \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"companyId":"<company-uuid>"}'

# Delete company (soft delete)
curl -X POST http://localhost:3000/api/auth/companies/delete \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"companyId":"<company-uuid>"}'
```

### Session Purge Task

```bash
# Trigger manually via Nitro task API
curl http://localhost:3000/api/_tasks/purge-sessions
```
