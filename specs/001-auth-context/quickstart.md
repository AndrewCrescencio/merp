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
| `server/api/auth/register.post.ts`         | Registration endpoint                   |
| `server/api/auth/login.post.ts`            | Login endpoint                          |
| `server/api/auth/logout.post.ts`           | Logout endpoint                         |
| `server/api/auth/me.get.ts`                | Session check endpoint                  |
| `server/api/auth/companies.post.ts`        | Company creation endpoint               |
| `server/api/auth/companies.get.ts`         | Company search endpoint                 |
| `server/api/auth/companies.switch.post.ts` | Company context switch                  |
| `server/middleware/auth.ts`                | Session validation middleware           |
| `server/utils/auth/repository.ts`          | IAuthRepository + DrizzleAuthRepository |
| `server/utils/auth/helpers.ts`             | Auth business logic helpers             |
| `server/utils/schema.ts`                   | Drizzle table definitions               |
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
# Register a user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}'

# Login (session cookie saved)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}' \
  -c cookies.txt

# Check session
curl http://localhost:3000/api/auth/me -b cookies.txt

# Logout
curl -X POST http://localhost:3000/api/auth/logout -b cookies.txt
```
