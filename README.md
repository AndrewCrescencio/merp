# Merp — ERP Multi-Tenant (Nuxt 4 + Better Auth + Drizzle + PostgreSQL)

Sistema ERP fullstack com autenticação robusta, multi-tenancy (empresas), convites, auditoria LGPD e rate limiting/lockout.

## Stack

- **Framework**: Nuxt 4 (Nitro server engine)
- **Auth**: Better Auth (email/password, email verification, password reset)
- **Database**: PostgreSQL + Drizzle ORM (RLS policies para isolamento de tenant)
- **Email**: Resend (queue assíncrona com retry/backoff)
- **Segurança**: CSRF double-submit, sliding window rate limits, dual-tier lockout, HIBP breach check
- **Deploy**: Docker Compose (prod + dev), Nginx + Certbot, fail-closed env validation

## Módulos implementados (Auth Bounded Context)

- Registro/Login/Logout com sessão (7d fixo, `disableSessionRefresh: true`)
- Verificação de email obrigatória (bloqueia login até confirmado)
- Recuperação de senha (anti-enumeração)
- Multi-tenancy: empresas, membros (owner/member), convites
- Auditoria de eventos auth (login, failed, logout, session lifecycle)
- Exportação de dados pessoais (LGPD Art. 18)
- Retirada de consentimento → desativação imediata
- Soft-delete de usuário e empresa

## Início rápido

```bash
# Caminho curto — faz tudo abaixo de uma vez
make init

# → cria .env apontando para localhost, instala deps, sobe o PostgreSQL
#   (esperando o healthcheck) e aplica as migrações COMPLETAS com policies de RLS
pnpm dev
# → http://localhost:3000
```

Equivalente passo a passo:

```bash
# 1. Copie variáveis de ambiente
cp .env.example .env
# Edite .env: troque o host "postgres" por "localhost" se o Nuxt roda no host,
# e ajuste DB_PASSWORD, BETTER_AUTH_SECRET e CORS_ORIGIN

# 2. Suba infra (PostgreSQL)
docker compose up -d postgres

# 3. Rode migrações completas (Drizzle + RLS policies)
pnpm db:migrate:full

# 4. Dev server
pnpm dev
```

### Banco novo do zero

`pnpm drizzle-kit migrate` sozinho aplica só as migrações do journal
(`drizzle/meta/_journal.json`). As migrações de RLS/políticas (≥ `0010`,
fora do journal — `0014_bootstrap_role_split`, `0016_company_select_membership`,
`0017/0018/0019`, etc.) são aplicadas pelo applier idempotente
`scripts/apply-custom-sql.ts`.

**Use sempre `pnpm db:migrate:full` em banco novo:**

```bash
docker compose up -d postgres
pnpm db:migrate:full
```

> ⚠️ `pnpm drizzle-kit migrate` sozinho NÃO aplica as policies de RLS. Use
> sempre `pnpm db:migrate:full` em banco novo.

## Variáveis de ambiente obrigatórias (produção)

| Variável              | Descrição                                               |
| --------------------- | ------------------------------------------------------- |
| `DATABASE_URL`        | Owner role (migrações) — **não** chega no container app |
| `APP_DATABASE_URL`    | App role (non-superuser) — **obrigatório** em produção  |
| `BETTER_AUTH_SECRET`  | >= 32 chars — boot falha sem ela                        |
| `BETTER_AUTH_URL`     | Domínio público real (links de verificação/reset)       |
| `CORS_ORIGIN`         | Domínio público — baked no build + runtime              |
| `CSRF_SECRET`         | >= 32 chars — assina tokens double-submit               |
| `RESEND_API_KEY`      | `re_...` — emails transacionais                         |
| `RESEND_FROM`         | `no-reply@seu-dominio.com`                              |
| `TRUST_PROXY`         | `true` atrás de nginx/Cloudflare                        |
| `TRUSTED_PROXY_CIDRS` | CIDR do subnet da rede Docker (ex.: `172.28.0.0/16`)    |

## Estrutura de pastos (Vertical Slices)

```
server/
├ api/
│   ├── health.get.ts            # público (sempre 200, status por dependência)
│   ├── metrics.get.ts           # público, Prometheus sem PII
│   ├── .well-known/security.txt.get.ts  # público (RFC 9116)
│   └── auth/                    # 21 handlers (flat — URLs fixas)
├ middleware/            # auth, csrf, no-store, pii-audit
├ tasks/                 # purge-sessions, purge-auth-events, purge-security-state, process-email-queue
├ utils/
│   ├── schema/            # Drizzle tables por feature (identity, company, invite, security, email)
│   ├── shared/            # errors, security (+CNPJ), audit, background, purge, csrf, email, ip, hibp, auth-context
│   └── auth/              # Vertical slices por feature + tenant-context.ts
│       ├── identity/      # Conta + sessão
│       ├── company/       # Tenant/membership
│       └── invite/        # Convites
shared/
├ auth.ts                # Better Auth instance (lazy, 503 se falhar)
└── logger.ts              # Structured logging (PII-safe)
```

## Endpoints principais

| Endpoint                          | Auth                     | Descrição                                                |
| --------------------------------- | ------------------------ | -------------------------------------------------------- |
| `POST /api/auth/register`         | Público                  | Registro com consentTermsVersion (LGPD)                  |
| `POST /api/auth/login`            | Público                  | Login + rememberMe → cookie httpOnly Secure SameSite=Lax |
| `POST /api/auth/logout`           | Sessão                   | Revoga sessão + cookie                                   |
| `GET /api/auth/me`                | Sessão                   | Perfil + empresas + activeCompanyId                      |
| `POST /api/auth/companies`        | Sessão                   | Cria empresa (owner bootstrap)                           |
| `GET /api/auth/companies?q=`      | Sessão                   | Busca empresas onde é membro                             |
| `POST /api/auth/companies/switch` | Sessão                   | Troca activeCompanyId (valida membership)                |
| `POST /api/auth/invite`           | Sessão (owner)           | Cria convite — token retornado **uma vez**               |
| `POST /api/auth/invites/accept`   | Sessão (email = convite) | Aceita convite → cria membership                         |
| `GET /api/auth/export`            | Sessão                   | LGPD Art. 18 — perfil + empresas + sessões + authEvents  |
| `GET /api/health`                 | Público                  | Sempre 200; `auth`/`db` indicam readiness                |
| `GET /api/metrics`                | Público                  | Prometheus (uptime, heap, readiness — sem PII)           |

## Segurança (resumo)

- **Rate limit**: IP 20/min, email 5/min, user 60/min (sliding window)
- **Lockout**: (email+IP) 10 tentativas + global email 50 tentativas → 30min
- **CSRF**: double-submit (`x-csrf-token`); isentos: register, login, forget-password, reset-password, send-verification-email + todos os GET
- **CORS**: origem explícita (sem wildcard); `X-CSRF-Token` liberado no preflight
- **Cookies**: `merp-session_token` — httpOnly, Secure (prod), SameSite=Lax — Lax (não Strict) para permitir links de verificação/reset enviados por email funcionarem cross-site.
- **RLS**: policies em `drizzle/` (journal + custom applier — ver runbook acima)
- **PII audit**: Acesso a `/me` e `/export` logado (sem `name` nos logs)

## Testes

```bash
pnpm test        # Unit + integração (Vitest)
pnpm test:watch  # Watch mode
```

## Comandos úteis

```bash
pnpm lint        # ESLint + Prettier check
pnpm format      # Prettier write
pnpm build       # Production build (falha se CORS_ORIGIN ausente em prod)
pnpm drizzle-kit generate --name <nome>  # Nova migração
pnpm drizzle-kit studio                 # Drizzle Studio
```

## Documentação técnica

- `specs/001-auth-context/spec.md` — Requisitos funcionais, threat model, LGPD, métricas
- `specs/002-vertical-slices/architecture.md` — Arquitetura, migração, governança
- `docs/audit/2026-10-03-simplificacao-auditoria.md` — Auditoria completa
- `docs/audit/2026-10-03-simplificacao-plano.md` — Plano de execução com tarefas priorizadas
