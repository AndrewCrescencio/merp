# Merp — ERP Multi-Tenant (restaurante-first)

Sistema ERP multi-tenant (Nuxt 4 / Nitro, Better Auth, Drizzle, PostgreSQL + RLS), com foco no vertical de restaurante (mesa → itens → KDS → conta → impressão → caixa).

**Status:** backend em desenvolvimento. Auth, company/membership/invites e RLS estão maduros; Core Order, Restaurant e Print existem porém parciais; o frontend só tem as telas de auth. Auditoria completa com roadmap priorizado em [`FEATURE_AUDIT_E_ROADMAP.md`](FEATURE_AUDIT_E_ROADMAP.md).

| Contexto                           | Status | Maior lacuna                                             |
| ---------------------------------- | ------ | -------------------------------------------------------- |
| Auth/Identity                      | ✅     | TTL por perfil/2FA adiados                               |
| Company/Membership                 | 🔶     | Sem location (bloqueia todo write operacional)           |
| Invites                            | ✅     | E-mail de convite não enviado (token volta na API)       |
| Core Order                         | 🔶     | Só 2 tipos; FSM/itens incrementais/idempotência/total    |
| Restaurant                         | 🔶     | Kitchen ticket quebrado; sem KDS; sem vínculo mesa↔order |
| Print                              | 🔶     | Sem worker/driver/templates                              |
| Frontend                           | 🔶     | Só auth; nenhuma vertical operacional                    |
| RLS/Infra                          | ✅     | CHECK constraints; testes dos novos contextos            |
| Fiscal/Pagamentos/outras verticais | ❌     | Sem código                                               |

> **Bloqueador de MVP:** criar empresa não cria `location` e não há CRUD de locations — toda empresa nova recebe `400` em qualquer write operacional até uma location ser inserida no banco (ver P0.1 no roadmap).

## Stack

- Framework: Nuxt 4 (Nitro server engine)
- Auth: Better Auth (email/password, verificação, reset de senha)
- Database: PostgreSQL + Drizzle ORM (RLS policies para isolamento de tenant + location)
- Validação: Zod em todos os endpoints
- Testes: Vitest (unit + integração real com Postgres, rodam como role `merp_app`)

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
├ api/                  # 37 handlers (7 auth, 2 health, 27 company-scoped, security.txt)
├ middleware/            # 00-no-store, 01/02-csrf, auth (sessão+rate limit), tenant, pii-audit
├ templates/print/       # .hbs de kitchen ticket e receipt (ainda não referenciados pelo código)
└ utils/
    ├ auth/ company/ invite/ order/ print/ restaurant/  # slices por contexto
    ├ schema/            # Drizzle tables por feature
    ├ shared/            # errors, security, audit, background, purge, csrf, email, ip, hibp, validate, handler
    └ db/                # withTenant (RLS), tenant-context.ts
app/                     # apenas auth pages (login, register, forgot/reset password, verify email)
shared/
├ auth.ts                # Better Auth singleton (TTL 24h / 7d com rememberMe)
└ logger.ts
```

## Endpoints principais

| Endpoint                                   | Auth    | Status | Descrição                                  |
| ------------------------------------------ | ------- | ------ | ------------------------------------------ |
| `POST /api/auth/register`                  | Público | ✅     | Registro + consentTermsVersion             |
| `POST /api/auth/login`                     | Público | ✅     | Login + rememberMe                         |
| `POST /api/auth/logout`                    | Sessão  | ✅     | Revoga sessão                              |
| `GET /api/v1/me`                           | Sessão  | ✅     | Perfil + empresas                          |
| `GET /api/v1/me/data-export`               | Sessão  | ✅     | LGPD Art. 18                               |
| `POST /api/v1/companies`                   | Sessão  | ✅     | Cria empresa (owner) em transação          |
| `PATCH/DELETE /api/v1/companies/{id}`      | Owner   | ✅     | Edita / soft delete                        |
| `POST /api/v1/companies/{id}/invitations`  | Owner   | ✅     | Convite (token 256 bits, TTL 7d)           |
| `POST /api/v1/me/invitations/accept`       | Sessão  | ✅     | Aceite (e-mail da sessão, single-use)      |
| `POST /api/v1/companies/{id}/orders`       | Sessão  | 🔶     | Cria order + itens (dine_in/takeout)       |
| `GET /api/v1/companies/{id}/orders`        | Sessão  | 🔶     | Lista com status/limit/offset              |
| `POST .../orders/{id}/cancel\|complete`    | Sessão  | 🔶     | Transições (sem autorização por papel)     |
| `GET/POST .../restaurant/tables`           | Sessão  | 🔶     | Só listagem + open/close (sem CRUD)        |
| `GET .../restaurant/kitchen-tickets`       | Sessão  | 🔶     | Lista tickets (sem endpoint de status)     |
| `GET/POST .../restaurant/cashier-shifts`   | Sessão  | 🔶     | Turnos de caixa (fechamento manual)        |
| `GET/POST .../print/printers` e `.../jobs` | Sessão  | 🔶     | Cadastro e fila (sem worker: nada imprime) |
| `GET /api/health/live`                     | Público | ✅     | Liveness (sempre 200)                      |
| `GET /api/health/ready`                    | Público | ✅     | Readiness (DB + auth)                      |

Recursos de empresa em `/api/v1/companies/{companyId}/...` — `companyId` vem do path (middleware tenant), nunca do body. Transições usam `POST {recurso}/{id}/{verbo}` com `409` em transição inválida (R4/R8).

## Segurança

- RLS: 17 tabelas com `ENABLE + FORCE` (`drizzle/0002_rls_policies_grants.sql`); role `merp_app` com `NOBYPASSRLS`; guardas `verify-rls.ts`, matriz de RLS e canary cross-tenant
- Rate limit: IP 20/min, email 5/min, user 60/min (sliding window) — concentrado em auth/company/invite
- Anti-enumeração: corpo idêntico + piso de tempo em register/forget-password
- Lockout: (email+IP) 10 tentativas + global email 50 → 30min
- CSRF: double-submit (`x-csrf-token`); isentos: auth endpoints + GET
- CORS: origem explícita; `X-CSRF-Token` no preflight
- Cookies: httpOnly, Secure (prod), SameSite=Lax
- PII audit: acesso a `/me` e `/export` logado (sem PII nos logs)

Riscos residuais conhecidos (detalhes na auditoria): tabelas globais de auth sem RLS, ausência de autorização por papel nos contextos operacionais, sem CHECK constraints monetárias, sem rate limit nas mutações operacionais.

## Testes

```bash
npm test              # Unit + integração (precisa PostgreSQL)
npm run test:unit
npm run test:integration
npm run test:watch
```

49 spec files no server + 1 no app + 15 arquivos de integração. A integração migra como owner e roda como `merp_app`; cobertura forte em auth/company/RLS, fraca em restaurant/print (só unitários).

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

## Roadmap

O plano priorizado está em [`FEATURE_AUDIT_E_ROADMAP.md`](FEATURE_AUDIT_E_ROADMAP.md): **P0** desbloquear location + catálogo + mesas/estações + kitchen ticket + vínculo mesa↔order; **P1** fechar FSM, idempotência, dinheiro, cashier e print MVP; **P2** frontend, hardening e docs; **P3** pagamentos, fiscal (NFC-e/SAT) e demais verticais. Backlog tático em [`TODO.md`](TODO.md).
