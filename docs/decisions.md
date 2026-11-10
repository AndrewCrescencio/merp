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

- **Squash de migrations:** as migrations 0003 e 0004 (tabelas de domínio
  retiradas do schema TS) foram descartadas; o journal vigente cobre
  0000–0002 (funções e roles, schema base, policies e grants de RLS).
  Novas migrations somam a partir de 0002. Não reaplique arquivos deletados
  em bancos já migrados — crie uma nova migration em vez de reescrever o
  histórico.

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
