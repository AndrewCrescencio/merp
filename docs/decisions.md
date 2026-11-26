# Decisões técnicas vigentes

## Fundação e isolamento

- **Nuxt 4 + Nitro:** frontend e API no mesmo projeto, com SSR quando útil.
- **Better Auth:** autenticação é infraestrutura compartilhada e não deve ser
  reimplementada por produto.
- **Drizzle + PostgreSQL com RLS:** toda consulta de dados de tenant executa
  dentro de `withTenant`; o banco é a última barreira de isolamento.
- **Tenant no path:** rotas de domínio usam
  `/api/v1/companies/{companyId}/...`; middleware valida a associação antes
  do handler. O tenant nunca é aceito do body.
- **Fail closed:** ausência de sessão, tenant ou configuração obrigatória
  gera erro explícito, sem fallback permissivo.
- Features comerciais pertencem a aplicações derivadas e são módulos
  verticais; o schema da fundação segue pequeno.
- Identidade e integração Better Auth ficam em `server/utils/auth/identity`;
  repositórios de empresas, membros, convites e locais ficam em
  `server/utils/companies/`.
- Contratos compartilhados entre API e frontend ficam em
  `shared/contracts/<dominio>.ts`; a validação no servidor usa a saída
  normalizada do schema.

## API, validação e autorização

- Rotas usam kebab-case e verbos HTTP explícitos. Handlers de produção sob
  `server/api/v1/` usam `defineAuthHandler(async (event, user) => ...)`, salvo
  exceções explícitas como `server/api/auth/logout.post.ts` e endpoints
  públicos de auth/health.
- `requireTenant(event)` resolve o tenant do path. Papéis são verificados com
  `assertRole` e `ROLES`; os únicos papéis são `owner` e `member`.
- Entrada é validada por contratos compartilhados em
  `shared/contracts/<dominio>.ts` ou, durante a migração, por adaptadores em
  `server/utils/shared/validate.ts` (`validateXxxInput`), nunca por schemas
  definidos no handler. Use a saída normalizada da validação.
- Regras de autorização ficam próximas do caso de uso. IDs deriváveis do path
  ou da sessão não devem ser confiados quando enviados no body.
- Cada mudança de schema acompanha migration e testes.

## Migrations

- Crie migrations com `npx drizzle-kit generate --name <descricao>` ou
  `--custom` para SQL manual. Revise o SQL, aplique com
  `npm run db:migrate:full` e execute a suíte de integração.
- **Migrations compartilhadas são imutáveis.** Não edite ou reaplique arquivos
  deletados em bancos já migrados; crie uma migration nova para corrigir ou
  alterar o schema. Bancos compartilhados já aplicaram o journal, por isso
  reescrever o histórico pode causar divergência entre ambientes.
- `npm run check:migrations` (executado no CI) detecta prefixos duplicados.
  Mantenha prefixos e journal coerentes.

## Testes e dados

- Vitest tem quatro projetos: `unit` (`*.spec.ts`, sem banco, mockado e
  paralelo), `integration` (`*.test.ts`, PostgreSQL real e sequencial), `e2e`
  (`tests/e2e/**/*.e2e.ts`, Nitro real por HTTP) e `app` (`app/**/*.spec.ts`,
  ambiente Nuxt). `npm test` executa todos.
- Testes de integração ficam em `tests/`; `globalSetup` aplica
  `db:migrate:full`. Código que abre pool com
  `createOwnerDbForSetupOnly()` deve fechá-lo no `afterAll`.
- Endpoints de domínio precisam de cobertura de comportamento, autorização e
  isolamento entre tenants.
- Acesso a dados usa repositórios concretos singleton, importados diretamente
  pelos handlers. Testes unitários mockam o módulo do repositório; testes de
  integração usam a instância real contra o banco.
- A suíte completa roda no CI com PostgreSQL 18: migrations como owner e
  testes como `merp_app`. Localmente, unitários podem rodar sem PostgreSQL.

## Retenção

O histórico de membership e convites após soft delete de uma empresa ainda
depende de decisão de produto. Não altere essa semântica destrutiva sem uma
decisão explícita.
