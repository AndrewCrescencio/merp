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

## Pré-requisitos (Ubuntu)

| Ferramenta          | Versão        | Instalação                                       |
| ------------------- | ------------- | ------------------------------------------------ |
| Docker + Compose v2 | qualquer      | `sudo apt install docker.io docker-compose-v2`   |
| Node.js             | 24 (`.nvmrc`) | `nvm install && nvm use` (ou nodeSource)         |
| npm                 | ≥ 11          | vem com o Node.js                                |
| Make                | qualquer      | `sudo apt install make`                          |
| OpenSSL             | opcional      | `sudo apt install openssl` (gerar segredos prod) |

- Seu usuário precisa acessar o Docker: `sudo usermod -aG docker $USER` e logue de novo
  (ou use `sudo` em tudo).
- O PostgreSQL **não** precisa estar instalado na máquina — roda em container.

## Início rápido

```bash
# Caminho curto — faz tudo abaixo de uma vez
make init

# → cria .env apontando para localhost, instala deps, sobe o PostgreSQL
#   (esperando o healthcheck) e aplica as migrações COMPLETAS com policies de RLS
npm run dev
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
npm run db:migrate:full

# 4. Dev server
npm run dev
```

### Banco novo do zero

`npx drizzle-kit migrate` sozinho aplica só as migrações do journal
(`drizzle/meta/_journal.json`). As migrações de RLS/políticas (≥ `0010`,
fora do journal — `0014_bootstrap_role_split`, `0016_company_select_membership`,
`0017/0018/0019`, etc.) são aplicadas pelo applier idempotente
`scripts/apply-custom-sql.ts`.

**Use sempre `npm run db:migrate:full` em banco novo:**

```bash
docker compose up -d postgres
npm run db:migrate:full
```

> ⚠️ `npx drizzle-kit migrate` sozinho NÃO aplica as policies de RLS. Use
> sempre `npm run db:migrate:full` em banco novo.

## Containers (Docker)

| Arquivo                       | Papel                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| `docker-compose.yml`          | Base: PostgreSQL 18 (porta do host só em `127.0.0.1:${DB_PORT:-5432}`) |
| `docker-compose.override.yml` | Dev (auto-load no `docker compose up`): Adminer + Mailpit              |
| `docker-compose.prod.yml`     | Produção: app (Dockerfile) + nginx + certbot + serviço `migrate`       |

`make help` lista todos os alvos do Makefile.

### Dev — só infra (o Nuxt roda no host com `npm run dev`)

```bash
make dev       # foreground (docker compose up)
make dev-d     # background
make dev-down  # para a stack
make studio    # Drizzle Studio no host
```

- Adminer: http://localhost:8080 (servidor `postgres`, usuário/senha do `.env`)
- Mailpit (captura de emails dev): UI http://localhost:8025, SMTP `127.0.0.1:1025`
- Terminal no banco: `docker compose exec postgres psql -U merp -d merp`

### Produção (app + PostgreSQL + nginx + certbot)

Exige `.env` completo (copie de `.env.example` e troque os `change-me` — segredos via
`openssl rand -base64 48`). O override (Adminer/Mailpit) **não** entra: ao passar `-f`,
o auto-load do override é desativado.

```bash
make prod          # build + up (docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d)
make prod-logs     # logs -f
make prod-down     # para a stack
make migrate-prod  # migrações COMPLETAS (journal + RLS policies) no container
```

Shell nos containers de produção:

```bash
# app (Alpine, processo roda como usuário `node`)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec app sh

# banco
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U merp -d merp
```

TLS (Let's Encrypt — 1ª emissão; renovação e cron de host comentados no `docker-compose.prod.yml`):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot -d ${DOMAIN} -m ${CERTBOT_EMAIL} --agree-tos --no-eff-email
```

## Deploy — caminho grátis (Vercel + Neon)

O Vercel **não usa Docker**: ele detecta o framework do `package.json` e roda
`npm ci` + `npm run build`. `vercel.json` fixa isso (`framework: nuxtjs`) para
não depender da detecção automática. O Nitro escolhe o preset `vercel` sozinho
quando `VERCEL=1` — por isso `nuxt.config.ts` **não** fixa preset: o mesmo repo
também roda em Docker, que copia `.output/server/index.mjs`.

| Item      | Valor no caminho grátis                                           |
| --------- | ----------------------------------------------------------------- |
| Runtime   | Node 24 (padrão do Vercel; casa com `engines` e `.nvmrc`)         |
| Banco     | Neon free (0.5 GB) — `sslmode=require` já é o default em produção |
| Processo  | Nenhum gerenciador (sem PM2): o serverless do Vercel é o processo |
| Migrações | Rodar `npm run db:migrate:full` localmente contra o Neon          |

Variáveis de ambiente a configurar no dashboard do Vercel (todas também em
Build & Development, exceto onde marcado):

| Variável                              | Observação                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CORS_ORIGIN`                         | **Obrigatória em build** — `nuxt.config.ts` falha sem ela em produção                                                                               |
| `BETTER_AUTH_SECRET`                  | >= 32 chars                                                                                                                                         |
| `BETTER_AUTH_URL`                     | URL pública do deploy                                                                                                                               |
| `CSRF_SECRET`                         | >= 32 chars                                                                                                                                         |
| `APP_DATABASE_URL`                    | String do Neon (owner role `DATABASE_URL` só na migração)                                                                                           |
| `RESEND_API_KEY` / `RESEND_FROM`      | **Obrigatórias** — sem elas o email de verificação não sai, a conta nasce não-verificada e o login trava em 403 (o boot recusa)                     |
| `TRUST_PROXY` / `TRUSTED_PROXY_CIDRS` | `true` + CIDR do peer **observado** em `auth_event.ip_address` (não existe "subnet do Vercel" — ver runbook `05-operations/security/deploy-secure`) |

**Limite do plano grátis**: o Hobby é para uso não-comercial — um ERP de
produto precisa revisar os termos antes de vender em cima dele.

**E-mail de desativação é best-effort no Vercel**: verificação e reset são
awaitados pelo Better Auth (envio garantido), mas o aviso de desativação roda
via `background()` em fire-and-forget para não desequilibrar o timing do login
(AUD-07) — no preset Node do Vercel não há `waitUntil` de plataforma para
segurar a promise depois da resposta. Em Docker (processo longo) ela conclui.

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
│   ├── .well-known/security.txt.get.ts  # público (RFC 9116)
│   ├── orders/ print/ restaurant/       # contextos downstream
│   └── auth/                    # 21 handlers (flat — URLs fixas)
├ middleware/            # auth, csrf, no-store, pii-audit
├ utils/
│   ├── db/              # withTenant (RLS) + tenant-context.ts
│   ├── schema/          # Drizzle tables por feature
│   ├── shared/          # errors, security (+CNPJ), audit, background, purge, csrf, email, ip, hibp, auth-context
│   ├── order/ print/ restaurant/  # contextos downstream
│   └── auth/            # Vertical slices
│       ├── identity/    # Conta + sessão
│       ├── company/     # Tenant/membership
│       └── invite/      # Convites
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

## Segurança (resumo)

- **Rate limit**: IP 20/min, email 5/min, user 60/min (sliding window)
- **Anti-enumeração**: corpo idêntico **e** piso de tempo (`enforceMinimumTime`) em `register`/`forget-password` — o relógio também vaza existência de conta. O Better Auth aplica hash dummy no sign-in e piso de 500ms na verificação de email
- **Lockout**: (email+IP) 10 tentativas + global email 50 tentativas → 30min
- **CSRF**: double-submit (`x-csrf-token`); isentos: register, login, forget-password, reset-password, send-verification-email + todos os GET
- **CORS**: origem explícita (sem wildcard); `X-CSRF-Token` liberado no preflight
- **Cookies**: `merp-session_token` — httpOnly, Secure (prod), SameSite=Lax — Lax (não Strict) para permitir links de verificação/reset enviados por email funcionarem cross-site.
- **RLS**: policies em `drizzle/` (journal + custom applier — ver runbook acima)
- **PII audit**: Acesso a `/me` e `/export` logado (sem `name` nos logs)

## Testes

```bash
npm test        # Unit + integração (Vitest)
npm run test:watch  # Watch mode
```

## Comandos úteis

```bash
npm run check       # Portão rápido de pré-commit: format:check + lint + typecheck
npm run lint        # ESLint
npm run format      # Prettier write
npm run build       # Production build (falha se CORS_ORIGIN ausente em prod)
npx drizzle-kit generate --name <nome>  # Nova migração
npx drizzle-kit studio                 # Drizzle Studio
```

## Documentação técnica

- `specs/consolidated-specs.md` — Specs consolidadas (auth context, threat model, LGPD)
- `specs/README.md` — Índice e phase tracker
- `specs/decisions/` — ADRs
- `docs/audit/2026-10-03-simplificacao-auditoria.md` — Auditoria completa
- `docs/audit/2026-10-03-simplificacao-plano.md` — Plano de execução com tarefas priorizadas
