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
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm run db:migrate:full
pnpm run dev
```

Aplicação: <http://localhost:3000>

Produção: `.env.production.example` é apenas um template. Copie-o para `.env`,
troque os placeholders (`seu-dominio.com`, `change-me`, etc.) e rode
`make prod`. Os comandos de produção usam exclusivamente `.env` e falham com
uma mensagem clara se ele não existir; o template nunca é usado como fallback.
`make prod` aplica as migrations antes de subir a stack com
`docker-compose.prod.yml`.

## Requisitos

- Node.js 26 LTS (`nvm install` usa a versão da linha definida em `.nvmrc`)
- pnpm 12.23.0
- Docker Compose

## Comandos

```bash
pnpm test
pnpm run test:unit
pnpm run test:integration
pnpm run lint
pnpm run typecheck
pnpm run check:routes
pnpm run check:migrations
pnpm run format:check
pnpm run build
```

`pnpm test` executa os projetos unit, integração, e2e e app. Integração e e2e
precisam do PostgreSQL configurado como no CI; o CI aplica migrations como
owner e executa a suíte como `merp_app`. `pnpm run check` reúne format, lint,
typecheck, rotas e migrations.

## Exportação paginada do próprio histórico

Para limitar o histórico por resposta, chame `GET /api/v1/me/data-export?limit=500`.
Enquanto `authEventsPagination.nextCursor` estiver preenchido, faça a próxima
chamada com `cursor` e o mesmo `limit`. Cada página inclui o perfil e as
empresas. A primeira consulta fixa um corte para os eventos, e a retenção
continua a se aplicar durante a leitura. Requisições sem parâmetros continuam
no formato anterior.

## Estrutura

```text
app/                         # frontend Nuxt e telas de autenticação
server/api/auth/             # endpoints públicos de autenticação
server/api/v1/me/            # dados e ações do usuário autenticado
server/api/v1/companies/     # empresas, membros, convites e locais
server/middleware/           # auth, tenant, CSRF e auditoria
server/utils/auth/           # identidade e integração Better Auth
server/utils/companies/      # empresas, membros, convites e locais
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
   import { locationRepository } from '~~/server/utils/companies/company/location-repository'
   import { defineAuthHandler } from '~~/server/utils/shared'

   export default defineAuthHandler({ tenant: true, role: 'any' }, async ({ tenant, user }) => {
     const { companyId } = tenant
     const locations = await locationRepository.listLocations(companyId, user.id)
     return { locations }
   })
   ```

   `defineAuthHandler(options, handler)` exige sessão. Com `tenant: true`, o
   middleware resolve a empresa pelo path e o wrapper entrega `tenant` ao
   callback. Use `role: 'any'` para qualquer membro ou `role: 'owner'` para
   operações de owner. Rotas de sessão, como `/me`, omitem tenant e role.
   Use `withTenant` nas consultas de tenant.

   Em escritas, configure `body` com um validador ou schema Zod. O callback
   recebe a saída da validação após a verificação de papel. Configure
   `rateLimit: 'ip'` nas rotas com essa cota adicional, `audit` para registrar
   eventos informativos após sucesso e `created` para responder `201` com o
   `Location` do recurso. Se a auditoria for obrigatória para o negócio,
   grave na mesma transação da operação ou use entrega durável.

3. Gere uma migration nova com
   `pnpm exec drizzle-kit generate --name <descricao>` (ou `--custom` para SQL
   escrito à mão), revise o SQL e nunca edite migration já compartilhada.
   Toda mudança de schema acompanha migration e testes.
4. Cubra comportamento, autorização e isolamento entre tenants; rode
   `pnpm run db:migrate:full`, `pnpm run test:integration` e `pnpm run check`.
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
