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

| Path                                       | Purpose                                 |
| ------------------------------------------ | --------------------------------------- |
| `server/api/auth/register.post.ts`         | Registration endpoint (LGPD consent)    |
| `server/api/auth/login.post.ts`            | Login endpoint                          |
| `server/api/auth/logout.post.ts`           | Logout endpoint                         |
| `server/api/auth/me.get.ts`                | Session check endpoint                  |
| `server/api/auth/deactivate.post.ts`       | User deactivation (soft delete)         |
| `server/api/auth/export.get.ts`            | Personal data export                    |
| `server/api/auth/companies.post.ts`        | Company creation endpoint               |
| `server/api/auth/companies.get.ts`         | Company search endpoint                 |
| `server/api/auth/companies.switch.post.ts` | Company context switch                  |
| `server/api/auth/companies.delete.post.ts` | Company deletion (soft delete)          |
| `server/api/auth/companies.join.post.ts`   | Join existing company                   |
| `server/middleware/auth.ts`                | Session validation middleware           |
| `server/middleware/pii-audit.ts`           | PII access audit logging middleware     |
| `server/utils/auth/repository.ts`          | IAuthRepository + DrizzleAuthRepository |
| `server/utils/auth/helpers.ts`             | Auth business logic helpers             |
| `server/utils/schema.ts`                   | Drizzle table definitions               |
| `server/tasks/purge-sessions.ts`           | Expired session purge (daily cron)      |
| `shared/auth.ts`                           | Better Auth instance initialization     |
| `shared/logger.ts`                         | Shared logger                           |

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
