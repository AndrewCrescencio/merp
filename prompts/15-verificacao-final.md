# 15 — Verificação final dos prompts 09–14

> **ESTADO (2026-08-02):** ✅ executado (código: commits `f098081`, `7de9974`,
> `43d6796`; este prompt = commit `(ver 15)`).
> Build, testes (123), lint e format passando; FORCE RLS confirmado em
> `company`/`company_member`/`invite`; `is_company_owner` e policies confirmados
> no banco dev; review doc atualizado com status de todos os problemas.

## Contexto

Os prompts 09–14 corrigem os 6 problemas do review de multi-tenancy
(`docs/multi-tenancy/withtenant-rls-review.md`). Este prompt roda a verificação
final ponta a ponta. **Executar apenas depois de concluir todos os anteriores.**

> **Nota (2026-08-02):** o repo usa **npm** (não pnpm) — os comandos abaixo
> foram corrigidos de `pnpm` para `npm`. O review doc não tem "seções P1–P6"
> como títulos; o status foi adicionado à tabela da seção 5.

## 1. Ordem de execução

| Prompt | Problema                | Depois de                        |
| ------ | ----------------------- | -------------------------------- |
| 09     | FORCE RLS + role de app | —                                |
| 10     | Policy de INSERT/UPDATE | 09 (depende do FORCE para teste) |
| 11     | Guards de ownership     | —                                |
| 12     | Erros RLS → 403         | —                                |
| 13     | Teste de isolamento     | 09, 10                           |
| 14     | `withTenant` aninhável  | 11 (usa guards no fluxo)         |

## 2. Verificação de build e testes

```bash
npm test
npm run build
npm run lint
npm run format:check
```

> **Nota de ambiente:** para `npm test` com integração real, o Postgres deve estar
> up (`docker compose up -d postgres`; o CLI do Docker usa o contexto `default`,
> não o Docker Desktop). `vitest.config.ts` já injeta `DATABASE_URL`
> (`merp_test@localhost`) e o setup cria/sincroniza o banco automaticamente.

Cobertura obrigatória (todos devem existir e passar):

- `server/utils/auth/helpers.spec.ts` — `classifyDatabaseError` (42501/P0001 → 403;
  conexão → 503); `assertCompanyRole`.
- `server/utils/auth/tenant-context.spec.ts` — contexto transacional + `existingTx`.
- `server/utils/auth/repository.test.ts` — `getCompanyMembershipRole` (✅ já existe),
  `createCompanyWithOwner`, bloco `RLS isolation` (cross-tenant SELECT/INSERT/
  UPDATE bloqueados).
- `server/api/auth/companies.post.spec.ts` e `companies.delete.post.spec.ts` —
  guards de owner.

## 3. Verificação no banco

```bash
# Aplicar migrations novas (ver nota em 09: 0000 ausente — usar push + psql para o SQL custom)
docker compose ps
docker compose exec -T postgres psql -U merp -d merp -c "\d+ company"
# "Row security: forced"
docker compose exec -T postgres psql -U merp -d merp -c "\df is_company_owner"
docker compose exec -T postgres psql -U merp -d merp -c "\dp company_member"
```

## 4. Checklist final

- [x] `company` e `company_member` com `FORCE ROW LEVEL SECURITY`
- [x] `APP_DATABASE_URL` suportado em `server/utils/db.ts` + infra documentada
- [x] `cm_insert_policy` bloqueia cross-tenant; `cm_update_policy` bloqueia
      auto-promoção
- [x] `assertCompanyRole` em todos os endpoints tenant-scoped (delete → owner)
- [x] Erros RLS → 403 (nunca 503)
- [x] Teste de isolamento cross-tenant passando
- [x] `createCompanyWithOwner` atômico e endpoint refatorado
- [x] `docs/multi-tenancy/withtenant-rls-review.md` atualizado (status de todos
      os problemas na tabela da seção 5 — o doc não tem títulos P1–P6)
- [x] `docs/pendencies.md` refletindo as correções (pendência 3 — ownership no
      soft delete — marcada como resolvida)

## 5. Commits sugeridos (um por prompt, na ordem)

Se for commitar: um commit por prompt 09–14, com a convenção da AGENTS.md
(corpo com `Model:` e `Agent:`).

## 6. Antes de começar (próxima conversa)

- **Commitar/guardar o trabalho atual** (fluxo de convites + correções de erro:
  `invite` schema/migration/endpoints/repo, `getCompanyMembershipRole`,
  `getPostgresErrorCode`, `vitest.config`, remoção do join) — está tudo sem commit.
- Prompt 11: pular as partes já feitas (marcadas com ✅); prompts 13: rodar só
  depois de 09+10.
