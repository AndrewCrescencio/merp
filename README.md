# Nuxt Tenant Starter

Base inicial para aplicações SaaS multi-tenant com Nuxt 4, Nitro, Better Auth,
Drizzle e PostgreSQL com RLS.

Esta base resolve a infraestrutura comum sem impor um domínio de negócio:

- autenticação por e-mail, sessão, verificação e recuperação de senha;
- usuários, empresas, membros, convites e locais;
- isolamento multi-tenant com PostgreSQL RLS;
- proteção CSRF, headers de segurança, validação de ambiente e auditoria;
- testes unitários/integração, lint, typecheck e convenções de rotas REST;
- Docker Compose para desenvolvimento local.

## Início rápido

```bash
# Desenvolvimento local — valores prontos, sem edição
cp .env.example .env
docker compose up -d postgres
npm run db:migrate:full
npm run dev
```

Aplicação: <http://localhost:3000>

Produção: copie `.env.production.example` para `.env`, troque os placeholders
(`seu-dominio.com`, `change-me`, etc.) e rode `make prod` (migra primeiro e
depois sobe a stack com `docker-compose.prod.yml`).

## Requisitos

- Node >= 24 (`engines` no package.json)
- Docker Compose

## Comandos

```bash
npm test
npm run test:unit
npm run test:integration
npm run lint
npm run typecheck
npm run check
npm run build
```

## Estrutura

```text
app/                         # frontend Nuxt e telas de autenticação
server/api/auth/             # endpoints públicos de autenticação
server/api/v1/me/            # dados e ações do usuário autenticado
server/api/v1/companies/     # empresas, membros, convites e locais
server/middleware/           # auth, tenant, CSRF e auditoria
server/utils/auth/           # identidade, empresa e convites
server/utils/db/             # conexão, contexto tenant e RLS
server/utils/schema/         # schema Drizzle da fundação
server/utils/shared/        # erros, validação, segurança e e-mail
drizzle/                     # histórico de migrations PostgreSQL
```

## Criando uma feature de domínio

1. Defina o caso de uso e as invariantes antes do endpoint.
2. Crie o schema em `server/utils/schema/<feature>.ts` e registre-o no
   `server/utils/schema/index.ts`.
3. Use `withTenant` em toda consulta com dados da empresa.
4. Adicione a rota em
   `server/api/v1/companies/[companyId]/<feature>/`.
5. Escreva testes de handler, autorização e isolamento entre tenants.
6. Gere uma migration com `drizzle-kit` e execute `npm run check`.

O domínio deve entrar como um módulo vertical e não alterar autenticação,
middleware ou infraestrutura sem necessidade.

## Documentação

- [`docs/PROJETO.md`](docs/PROJETO.md): escopo e decisões da base.
- [`docs/decisions.md`](docs/decisions.md): decisões técnicas estáveis.

## Renomeando o projeto

Este starter usa a identidade "merp" em pontos fixos da infraestrutura. Para
derivar um novo produto, mude os valores em [`shared/app.ts`](shared/app.ts)
(`APP_NAME`, `COOKIE_PREFIX`, `SESSION_COOKIE_NAME`, `CSRF_COOKIE_NAME`) e
verifique os lugares que os consomem:

- `shared/auth.ts`: `cookiePrefix`, nome do cookie de sessão e `appName`
  do better-auth (cookies `merp-session_token`, etc.).
- `server/middleware/auth.ts`: leitura do cookie de sessão expirado.
- `server/utils/shared/csrf.ts` e `app/composables/useApiFetch.ts`: nome do
  cookie CSRF (`merp-csrf_token`).
- `server/utils/shared/email.ts`: assunto dos e-mails transacionais.
- `server/utils/shared/hibp.ts`: `User-Agent` da consulta ao Have I Been Pwned.

O que NÃO muda ao renomear: o nome do pacote npm, os papéis
(`owner`, `member`) e os nomes de banco de dados/roles (`merp`, `merp_app`,
`merp_test`) — estes estão fixos em migrations, docker-compose, CI e testes,
e exigiriam um plano de migração separado.
