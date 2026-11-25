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
- Dados de entrada são validados com os contratos de
  `server/utils/shared/validate.ts` (`validateXxxInput`), nunca com schemas
  declarados no handler. A implementação interna do contrato pode usar zod.
- Regras de autorização ficam próximas ao caso de uso, não na interface.
- Cada mudança de schema acompanha migration e testes.
- O schema da fundação é pequeno; features não devem ser incluídas antes de
  existir um caso de uso real.

## Migrations

- **Journal vigente:** 0000–0007 (`drizzle/meta/_journal.json`). `0000` cria
  a role `merp_app`, `0001` é o schema base, `0002` policies e grants de RLS,
  `0003` o CHECK de papel em `company_member`, `0004` a remoção destrutiva de
  `cnpj`/`razao_social`, `0005` a função `purge_auth_events`, `0006` fixa o
  `search_path` dessa função como atributo (o `SET` no corpo vazava para a
  sessão do pool) e `0007` remove índices sem uso e indexa `invite.invited_by`.
- Os arquivos `0003`–`0005` se chamavam `0004`–`0006` (havia um buraco no
  prefixo, sem entrada no journal). Foram renomeados junto com snapshots e
  `tag`s do journal; o SQL não mudou. Isso é seguro em bancos já migrados
  porque o migrator do Drizzle decide o que aplicar pelo `when` do journal,
  não pelo nome do arquivo.
- **Procedimento para nova migration:** alterar o schema TS e rodar
  `npx drizzle-kit generate --name <descricao>` (ou `--custom` para SQL
  escrito à mão); revisar o SQL; rodar `npm run db:migrate:full` e a suíte de
  integração. `npm run check:migrations` (também no CI) falha se dois arquivos
  repetirem o prefixo.
- Nunca edite migrations já compartilhadas (são imutáveis) e não reaplique
  arquivos deletados em bancos já migrados — crie uma nova migration em vez de
  reescrever o histórico. A única exceção registrada é a do `round_half_up`
  abaixo.

## round_half_up (removida)

- A função `round_half_up(numeric)` viveu apenas em `drizzle/0000_functions_and_roles.sql`
  e não era usada por nenhuma tabela ou migration do journal.
  Foi removida editando o 0000 — **exceção única** à regra de imutabilidade,
  aceita porque nada dependia da função; não é precedente. O arquivo agora
  cria somente a role `merp_app`.
- Bancos já migrados podem manter a função como está ou removi-la à mão com
  `DROP FUNCTION round_half_up(numeric)`. Não há migration para isso porque
  o journal já está aplicado e migrations são imutáveis depois de compartilhadas.

## Convenções de testes

- **Vitest com quatro projetos:** `unit` (`server/**` e `shared/**`
  `*.spec.ts`, 100% mockado, sem banco, paralelo), `integration` (`*.test.ts`,
  PostgreSQL real, sequencial, o `globalSetup` roda `db:migrate:full` — o
  mesmo comando da produção/CI), `e2e` (`tests/e2e/**/*.e2e.ts`, Nitro real
  sobre HTTP) e `app` (`app/**/*.spec.ts`, ambiente Nuxt, definido em
  `vitest.app.config.ts`).
- Comandos: `npm test` (todos), `npm run test:unit`,
  `npm run test:integration`, `npm run test:e2e`, `npx vitest run --project app`.
- Testes de integração ficam em `tests/` (não em `server/`); quem abre pool
  com `createOwnerDbForSetupOnly()` fecha com `close()` no `afterAll`.
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
- A remoção é destrutiva: migration `0004_lethal_eternals.sql`
  (`DROP INDEX company_cnpj_idx`, `DROP COLUMN cnpj`, `DROP COLUMN razao_social`).
  Está no journal, então `npm run db:migrate:full` a aplica; não há como
  reverter sem perder dados.
- `isValidCnpj`, `MAX_CNPJ_LENGTH`, `MAX_RAZAO_SOCIAL_LENGTH` e as validações
  de CNPJ/razaoSocial em `validate.ts` foram removidas junto.

## Padrao de autenticacao dos handlers (item 1)

- Todos os handlers de producao sob `server/api/v1/` usam
  `defineAuthHandler(async (event, user) => ...)`, que garante sessão e user
  (401 caso contrário) e repassa o user autenticado.
- O tenant vem de `requireTenant(event)` (resolvido pelo middleware de tenant
  a partir do path `/api/v1/companies/{companyId}/...`, nunca do body).
- Papéis são verificados com `assertRole(role, ROLES.owner, ...)` usando a
  constante única em `server/utils/shared/roles.ts`.
- `server/api/auth/logout.post.ts` fica de fora por proposta: valida apenas a
  sessão e trata `user` como opcional (comentado no arquivo).
- Handlers públicos de `auth/*` e `health/*` não entram no padrão.
- `requireUser` foi removido (sem consumidores); `context.userId` e
  `context.auth` foram removidos do contexto (ninguém os lia).
- `scripts/check-routes.ts` falha se um handler /v1 não usar

## Fase 1.1 — contrato de erros e invariantes verificadas

- **Envelope HTTP:** clientes recebem `{ error, message }` em JSON, com
  `Content-Type: application/json`; status <500 preserva o código e as
  mensagens públicas, enquanto falhas inesperadas e status >=500 viram
  `500 { error: "internal_error", message: "Internal server error" }`.
  `useApiFetch` lê `data.error` e `data.message`. Decisão: produtores passam a
  usar `H3Error.data` estruturado e `message` humano; `normalizeError` aceita
  também o JSON legado em `message` durante a migração. Respostas seguem com
  `Location` apenas nos endpoints de criação e o middleware global mantém
  `Cache-Control: no-store` (o normalizador define content-type, sem remover
  headers já enviados).
- **Entrada nullish:** validação esperada deve resultar em 400 e mensagem de
  validação, nunca `TypeError`. A inspeção encontrou acessos diretos nos
  validadores de objeto/query. Decisão: normalizar `null`/`undefined` como
  objeto vazio antes de validar; os campos ausentes acionam as mensagens já
  existentes.
- **Local inativo:** documentação de `setMemberDefaultLocation` diz que só
  locais ativos podem ser associados, mas a query anterior ignorava
  `is_active`; além disso, desativar um local deixava referências padrão
  apontando para ele. Decisão: rejeitar reassociação a local inativo com 404 e
  limpar referências no mesmo contexto transacional quando um local é
  desativado.
- **Bootstrap e concorrência:** criação da empresa, local Principal e
  associação owner ocorre na mesma transação (`createCompanyWithOwner`), com
  `app.allow_founder_bootstrap`; testes de tenant exercitam carga concorrente
  e isolamento com GUCs transacionais. Não foi encontrada evidência de
  violação que justifique mudança adicional nesta fase.
- **Falha de inicialização do auth:** `getAuth` mantinha uma Promise rejeitada
  em cache, tornando falhas síncronas de inicialização permanentes no processo.
  Decisão: limpar o cache apenas se a Promise que falhou ainda for a atual,
  permitindo nova tentativa sem apagar uma inicialização posterior.
- **Cadastro com e-mail existente:** `registerUser` retorna `null` para
  duplicata, e `register.post.ts` devolve o mesmo status/campos genéricos e
  aplica piso temporal de 700 ms; cadastro novo também espera o envio. Decisão:
  manter essa resposta anti-enumeração e seu piso temporal.
- **Histórico de empresa:** `softDeleteCompany` marca a empresa como deletada e
  apaga associações; convites têm FK `ON DELETE CASCADE` apenas no hard delete,
  e o esquema não registra histórico de membership. A retenção exigida para
  histórico de associação/convites após soft delete não está decidida. Pendente
  de decisão de produto; não alterar semântica destrutiva nesta fase.
  `defineAuthHandler(` ou conter `event.context.user as`.
