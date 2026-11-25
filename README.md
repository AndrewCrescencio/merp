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
npm run check:routes
npm run check:migrations
npm run format:check
npm run build
```

`npm test` executa os projetos unit, integração, e2e e app. Integração e e2e
precisam do PostgreSQL configurado como no CI; o CI aplica migrations como
owner e executa a suíte como `merp_app`. `npm run check` reúne format, lint,
typecheck, rotas e migrations.

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

## Receita de feature

Esta fundação fornece autenticação, usuários, empresas, membros, convites,
locais, isolamento multi-tenant com RLS, segurança HTTP e infraestrutura de
deploy. Pedidos, produtos, estoque, financeiro, impressão, cozinha, vendas e
outros domínios comerciais pertencem a aplicações derivadas; mantenha-os fora
da fundação. Uma feature deve incluir schema, migration, acesso a dados,
validação, autorização e testes de comportamento e isolamento entre tenants.

1. Defina o caso de uso e suas invariantes. Crie o schema em
   `server/utils/schema/<feature>.ts`, registre-o em
   `server/utils/schema/index.ts` e implemente a validação no contrato
   compartilhado, não no handler.
2. Adicione o endpoint em `server/api/v1/companies/[companyId]/<feature>/`.
   Exemplo real: `server/api/v1/companies/[companyId]/locations/index.get.ts`
   lista locais para a empresa do path e o usuário autenticado:

   ```ts
   import { locationRepository } from '~~/server/utils/auth/company/location-repository'
   import { defineAuthHandler, requireTenant } from '~~/server/utils/shared'

   export default defineAuthHandler(async (event, user) => {
     const { companyId } = requireTenant(event)
     const locations = await locationRepository.listLocations(companyId, user.id)
     return { locations }
   })
   ```

   `defineAuthHandler(async (event, user) => ...)` exige sessão; o tenant vem
   de `requireTenant(event)` a partir do path, nunca do body. Use `withTenant`
   em toda consulta da feature e `assertRole(role, ROLES.owner, ...)` quando a
   operação exigir owner. Os únicos papéis são `owner` e `member`.

3. Gere uma migration nova com
   `npx drizzle-kit generate --name <descricao>` (ou `--custom` para SQL
   escrito à mão), revise o SQL e nunca edite migration já compartilhada.
   Toda mudança de schema acompanha migration e testes.
4. Cubra comportamento, autorização e isolamento entre tenants; rode
   `npm run db:migrate:full`, `npm run test:integration` e `npm run check`.
   Mudanças em auth, tenant, RLS ou segurança também exigem testes de regressão.

## Decisões técnicas

Veja [`docs/decisions.md`](docs/decisions.md) para as decisões vigentes de
arquitetura, migrations e testes.

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
