# Guia de contribuição

## Contexto

Este é um starter SaaS multi-tenant. A fundação fornece autenticação,
empresas, membros, convites, locais, RLS e infraestrutura de segurança. Não
adicione funcionalidades de um domínio específico aqui.

## Regras

- Use TypeScript estrito e os padrões já existentes.
- Toda rota de domínio fica sob
  `server/api/v1/companies/[companyId]/<feature>/`.
- Toda consulta de tenant usa `withTenant`.
- Valide entrada e autorização no servidor.
- Não confie em IDs enviados no body quando eles podem ser derivados do path
  ou da sessão.
- Handlers de produção sob `server/api/v1/` usam
  `defineAuthHandler(async (event, user) => ...)` (sessão obrigatória, 401
  caso contrário); o tenant vem de `requireTenant(event)` (path, nunca o
  body) e papéis de `assertRole(role, ROLES.owner, ...)` — só `owner` e
  `member` existem. `server/api/auth/logout.post.ts` fica de fora por
  proposta (user opcional).
- Migrations são imutáveis depois de compartilhadas.
- Mudanças em auth, tenant, RLS ou segurança exigem testes de regressão.

## Convenção de nomes de teste (vitest.config.ts)

| Sufixo      | Projeto       | Onde roda                          | Requisito                                                                                 |
| ----------- | ------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `*.spec.ts` | `unit`        | `vitest run --project unit`        | 100% mockado, sem banco, paralelo, sem `globalSetup`                                      |
| `*.test.ts` | `integration` | `vitest run --project integration` | PostgreSQL real (`DB_AVAILABLE=true`), sequencial, `globalSetup` aplica `db:migrate:full` |
| `*.e2e.ts`  | `e2e`         | `vitest run --project e2e`         | servidor Nitro real sobre HTTP (`tests/e2e/`)                                             |
| `app/**`    | `app`         | `npm test` (`vitest run`)          | componentes/paginas Vue via `vitest.app.config.ts` (projeto `app`, incluso em `npm test`) |

Componentes/paginas Vue usam `vitest.app.config.ts` (projeto `app`, incluso em `npm test`).

Não mescle `*.spec.ts` com `*.test.ts` de um mesmo módulo: se o teste toca banco, é `.test.ts`; se é puro/mockado, é `.spec.ts`. Renomeie apenas o que destoar e verifique que os testes continuam rodando.

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
