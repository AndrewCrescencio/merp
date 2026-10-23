# Merp — ERP Multi-Tenant Backend

Sistema ERP multi-tenant (Nuxt 4 / Nitro, Better Auth, Drizzle, PostgreSQL + RLS).
Apenas backend implementado: autenticação, empresas, membros, convites, health checks.

## Stack

- Framework: Nuxt 4 (Nitro server engine)
- Auth: Better Auth (email/password, verificação, reset de senha)
- Database: PostgreSQL + Drizzle ORM (RLS policies para isolamento de tenant)
- Validação: Zod em todos os endpoints
- Testes: Vitest (unit + integração)

## Pré-requisitos

- Node.js 24 (`.nvmrc`)
- Docker + Compose v2 (PostgreSQL roda em container)

## Início rápido

```bash
cp .env.example .env
# edite .env: host "postgres" → "localhost" se Nuxt roda no host
docker compose up -d postgres
npm run db:migrate:full
npm run dev
# → http://localhost:3000
```

**Banco novo do zero**: `npm run db:migrate:full` aplica o journal completo (0000 funções/roles, 0001 schema, 0002 RLS policies/grants) + guarda `scripts/verify-rls.ts` (FORCE em toda tabela RLS).

## Estrutura de pastas (Vertical Slices)

```
server/
├ api/
│   ├ auth/              # 7 endpoints (register, login, logout, email, password)
│   ├ health/            # live.get, ready.get (públicos)
│   └ v1/companies/      # 33 endpoints (tenant no path: members, invitations, orders, print, restaurant)
├ middleware/            # 00-no-store, 01/02-csrf, auth (sessão+rate limit), tenant, pii-audit
├ utils/
│   ├ auth/              # identity, company, invite (vertical slices)
│   ├ order/ print/ restaurant/  # contextos downstream
│   ├ schema/            # Drizzle tables por feature
│   ├ shared/            # errors, security, audit, background, purge, csrf, email, ip, hibp, validate, handler
│   └ db/                # withTenant (RLS), tenant-context.ts
shared/
├ auth.ts                # Better Auth singleton
└ logger.ts
```

## Endpoints principais

| Endpoint                                  | Auth           | Descrição                      |
| ----------------------------------------- | -------------- | ------------------------------ |
| `POST /api/auth/register`                 | Público        | Registro + consentTermsVersion |
| `POST /api/auth/login`                    | Público        | Login + rememberMe             |
| `POST /api/auth/logout`                   | Sessão         | Revoga sessão                  |
| `GET /api/v1/me`                          | Sessão         | Perfil + empresas              |
| `POST /api/v1/companies`                  | Sessão         | Cria empresa (owner)           |
| `POST /api/v1/companies/{id}/invitations` | Sessão (owner) | Cria convite                   |
| `POST /api/v1/me/invitations/accept`      | Sessão         | Aceita convite                 |
| `GET /api/v1/me/data-export`              | Sessão         | LGPD Art. 18                   |
| `GET /api/health/live`                    | Público        | Liveness (sempre 200)          |
| `GET /api/health/ready`                   | Público        | Readiness (DB + auth)          |

Recursos de empresa em `/api/v1/companies/{companyId}/...` — `companyId` vem do path (middleware tenant), nunca do body.

## Segurança

- Rate limit: IP 20/min, email 5/min, user 60/min (sliding window)
- Anti-enumeração: corpo idêntico + piso de tempo em register/forget-password
- Lockout: (email+IP) 10 tentativas + global email 50 → 30min
- CSRF: double-submit (`x-csrf-token`); isentos: auth endpoints + GET
- CORS: origem explícita; `X-CSRF-Token` no preflight
- Cookies: httpOnly, Secure (prod), SameSite=Lax
- RLS: policies FORCE em `drizzle/0002_rls_policies_grants.sql`
- PII audit: acesso a `/me` e `/export` logado (sem PII nos logs)

## Testes

```bash
npm test              # Unit + integração (precisa PostgreSQL)
npm run test:watch    # Watch mode
DB_AVAILABLE=true npm test  # Integração com Postgres local
```

## Comandos úteis

```bash
npm run check         # format:check + lint + typecheck + check:routes
npm run lint          # ESLint
npm run typecheck     # tsc -b --noEmit && tsc -p tsconfig.tests.json
npm run format        # Prettier write
npm run build         # Production build
npx drizzle-kit generate --name <nome>  # Nova migração
npx drizzle-kit studio                # Drizzle Studio
```
