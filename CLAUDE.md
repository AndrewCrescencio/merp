# Guia de contribuição

## Contexto

Este é um starter SaaS multi-tenant. A fundação fornece autenticação,
empresas, membros, convites, locais, RLS e infraestrutura de segurança. Não
adicione funcionalidades de um domínio específico aqui.

## Regras

- Use TypeScript estrito e os padrões já existentes.
- Identidade e Better Auth ficam em `server/utils/auth/identity`; empresas,
  membros, convites e locais ficam em `server/utils/companies/`.
- Contratos compartilhados entre API e frontend ficam em
  `shared/contracts/<dominio>.ts`; handlers validam o payload recebido e usam
  a saída normalizada do schema.
- Toda rota de domínio fica sob
  `server/api/v1/companies/[companyId]/<feature>/`.
- Toda consulta de tenant usa `withTenant`.
- Valide entrada e autorização no servidor.
- Não confie em IDs enviados no body quando eles podem ser derivados do path
  ou da sessão.
- Handlers de produção sob `server/api/v1/` usam
  `defineAuthHandler(options, handler)` e exigem sessão. Com `tenant: true`,
  o wrapper entrega o tenant resolvido pelo middleware a partir do path.
  Configure `role: 'any'` para qualquer associado ou `role: 'owner'` para
  ações de owner. Regras de papel condicionais ficam no handler. O logout
  em `server/api/auth/logout.post.ts` aceita user opcional.
- Migrations são imutáveis depois de compartilhadas.
- Mudanças em auth, tenant, RLS ou segurança exigem testes de regressão.
- Para adicionar uma feature de domínio, siga a [receita de feature do README](README.md#receita-de-feature).

## Escolha dos casos de teste por operação

Para cada operação HTTP, selecione os casos que realmente se aplicam e cubra-os no contrato público: sessão ausente (401), papel sem permissão (403), outro tenant (404 sem vazamento), e caminho feliz (status, corpo, headers e efeito persistido). Escritas também devem cobrir validação de entrada e CSRF quando aplicável. Uma chamada a função mockada não prova autorização; mantenha esse comportamento coberto por HTTP e, para isolamento, por PostgreSQL como `merp_app`.

Use `*.spec.ts` para lógica pura e unidades isoladas sem banco; `*.test.ts` para repositórios, RLS, atomicidade e persistência real em PostgreSQL; e `*.e2e.ts` para o contrato HTTP real. Mantenha testes focados do wrapper para ordem de execução, audit, tipos e propagação de erros. Separe arquivos `.spec` e `.test` somente quando exercitarem responsabilidades distintas; confirme os padrões de descoberta em `vitest.config.ts` antes de renomear ou remover testes. Para a receita completa de uma feature, consulte [README](README.md#receita-de-feature).

## Convenção de nomes de teste (vitest.config.ts)

| Sufixo      | Projeto       | Onde roda                          | Requisito                                                                                 |
| ----------- | ------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `*.spec.ts` | `unit`        | `vitest run --project unit`        | Lógica pura ou unidade isolada, sem banco, paralelo, sem `globalSetup`                    |
| `*.test.ts` | `integration` | `vitest run --project integration` | PostgreSQL real (`DB_AVAILABLE=true`), sequencial, `globalSetup` aplica `db:migrate:full` |
| `*.e2e.ts`  | `e2e`         | `vitest run --project e2e`         | servidor Nitro real sobre HTTP (`tests/e2e/`)                                             |
| `app/**`    | `app`         | `npm test` (`vitest run`)          | componentes/paginas Vue via `vitest.app.config.ts` (projeto `app`, incluso em `npm test`) |

Componentes/paginas Vue usam `vitest.app.config.ts` (projeto `app`, incluso em `npm test`).

Não misture no mesmo arquivo testes de lógica pura e integração de banco. Não crie arquivos `.spec.ts` e `.test.ts` para a mesma responsabilidade; a separação só é apropriada quando há responsabilidades distintas, como algoritmo puro e persistência real. Renomeie apenas o que destoar e verifique que os padrões de descoberta continuam incluindo os testes.

## Antes de concluir

```bash
npm run format:check
npm run lint
npm run typecheck
npm run check:routes
npm test   # roda unit + integracao + e2e + o projeto app (vitest.app.config.ts)
```

A suíte completa (unit, integracao, e2e e app) roda no CI; localmente o
minimo e `npm run test:unit` (integracao precisa de PostgreSQL).
