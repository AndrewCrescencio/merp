# Decisões técnicas

## Fundação

- **Nuxt 4 + Nitro:** frontend e API no mesmo projeto, com SSR quando útil.
- **Better Auth:** autenticação não deve ser reimplementada por cada produto.
- **Drizzle + PostgreSQL:** schema tipado e migrations versionadas.
- **RLS obrigatório:** toda consulta de dados de tenant deve executar com
  `withTenant`; o banco é a última barreira de isolamento.
- **Tenant no path:** endpoints de domínio usam
  `/api/v1/companies/{companyId}/...`; o middleware valida a associação do
  usuário antes do handler.
- **Fail closed:** ausência de sessão, tenant ou configuração obrigatória deve
  gerar erro explícito, nunca um fallback permissivo.

## Convenções de features

- Rotas seguem nomes kebab-case e verbos HTTP explícitos.
- Dados de entrada são validados com os contratos existentes em
  `server/utils/shared`.
- Regras de autorização ficam próximas ao caso de uso, não na interface.
- Cada mudança de schema acompanha migration e testes.
- O schema da fundação é pequeno; features não devem ser incluídas antes de
  existir um caso de uso real.

## Migrations

- **Journal vigente:** 0000–0006. `0000` cria a role `merp_app`, `0001` é o
  schema base, `0002` policies e grants de RLS, `0004` o CHECK de papel em
  `company_member`, `0005` a remocao destrutiva de `cnpj`/`razao_social` e
  `0006` a funcao `purge_auth_events`. Nao ha arquivo `0003` (a entrada do
  journal e um residuo de versao anterior; nenhuma migration do banco depende
  dela).
- Novas migrations somam a partir de 0006 via `drizzle-kit generate`. Nunca
  edite migrations ja compartilhadas (sao imutáveis) e nao reaplique arquivos
  deletados em bancos ja migrados — crie uma nova migration em vez de
  reescrever o historico.

## round_half_up (removida)

- A função `round_half_up(numeric)` viveu apenas em `drizzle/0000_functions_and_roles.sql`
  e não era usada por nenhuma tabela ou migration do journal atual (0000–0002).
  Foi removida do 0000; o arquivo agora cria somente a role `merp_app`.
- Bancos já migrados podem manter a função como está ou removi-la à mão com
  `DROP FUNCTION round_half_up(numeric)`. Não há migration para isso porque
  o journal já está aplicado e migrations são imutáveis depois de compartilhadas.

## Convenções de testes

- **Vitest com três projetos:** `unit` (`*.spec.ts`, 100% mockado, sem
  banco, paralelo), `integration` (`*.test.ts`, PostgreSQL real, sequencial,
  o `globalSetup` roda `db:migrate:full` — o mesmo comando da produção/CI)
  e `e2e` (`tests/e2e/**/*.e2e.ts`, Nitro real sobre HTTP).
- Comandos: `npm test` (todos), `npm run test:unit`,
  `npm run test:integration`, `npm run test:e2e`.
- Todo endpoint de domínio precisa de testes de comportamento, autorização
  e isolamento entre tenants.
- A suíte completa (unit, integracao e e2e) roda no CI (`.github/workflows/ci.yml`).

## Repositorios

- O acesso a dados e feito por classes concretas singleton
  (`companyRepository`, `membershipRepository`, `locationRepository`, etc.),
  instanciadas uma vez e importadas diretamente pelos handlers.
- Nao existem interfaces `IXxxRepository` nem outras abstracoes sobre os
  repositorios.
- Os testes de unidade mockam o modulo do repositorio; os testes de
  integracao usam a instancia real contra o banco de dados.

## CNPJ e razaoSocial (removidos)

- As colunas `company.cnpj` e `company.razao_social` e o índice único
  `company_cnpj_idx` foram removidas do schema TS e do banco.
- Motivo: o CNPJ único global fazia o segundo cadastro devolver 409 "already
  exists", o que permitia a qualquer usuário logado testar se um CNPJ já está
  na plataforma (enumeração de CNPJs).
- A remoção é destrutiva: migration `0005_lethal_eternals.sql`
  (`DROP INDEX company_cnpj_idx`, `DROP COLUMN cnpj`, `DROP COLUMN razao_social`).
  Bancos já migrados precisam aplicá-la manualmente; não há como reverter sem
  perder dados.
- `isValidCnpj`, `MAX_CNPJ_LENGTH`, `MAX_RAZAO_SOCIAL_LENGTH` e as validações
  de CNPJ/razaoSocial em `validate.ts` foram removidas junto.

## Padrao de autenticacao dos handlers (item 1)

- Todos os handlers de producao sob `server/api/v1/` usam
  `defineAuthHandler(async (event, user) => ...)`, que garante sessão e user
  (401 caso contrário) e repassa o user autenticado.
- O tenant vem de `requireTenant(event)` (resolvido pelo middleware de tenant
  a partir do path `/api/v1/companies/{companyId}/...`, nunca do body).
- Papéis são verificados com `assertRole(role, ROLES.owner, ...)` usando a
  constante unica em `shared/roles.ts`.
- `server/api/auth/logout.post.ts` fica de fora por proposta: valida apenas a
  sessão e trata `user` como opcional (comentado no arquivo).
- Handlers públicos de `auth/*` e `health/*` não entram no padrão.
- `requireUser` foi removido (sem consumidores); `context.userId` e
  `context.auth` foram removidos do contexto (ninguém os lia).
- `scripts/check-routes.ts` falha se um handler /v1 não usar
  `defineAuthHandler(` ou conter `event.context.user as`.
