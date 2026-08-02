# 15 — Verificação final dos prompts 09–14

## Contexto

Os prompts 09–14 corrigem os 6 problemas do review de multi-tenancy
(`docs/multi-tenancy/withtenant-rls-review.md`). Este prompt roda a verificação
final ponta a ponta. **Executar apenas depois de concluir todos os anteriores.**

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
pnpm test
pnpm build
pnpm lint
pnpm format:check
```

> **Nota de ambiente:** para `pnpm test` com integração real, o Postgres deve estar
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

- [ ] `company` e `company_member` com `FORCE ROW LEVEL SECURITY`
- [ ] `APP_DATABASE_URL` suportado em `server/utils/db.ts` + infra documentada
- [ ] `cm_insert_policy` bloqueia cross-tenant; `cm_update_policy` bloqueia
      auto-promoção
- [ ] `assertCompanyRole` em todos os endpoints tenant-scoped (delete → owner)
- [ ] Erros RLS → 403 (nunca 503)
- [ ] Teste de isolamento cross-tenant passando
- [ ] `createCompanyWithOwner` atômico e endpoint refatorado
- [ ] `docs/multi-tenancy/withtenant-rls-review.md` atualizado (seções P1–P6 com
      status concluído)
- [ ] `docs/pendencies.md` refletindo as correções (se houver pendências
      relacionadas, marcar como resolvidas)

## 5. Commits sugeridos (um por prompt, na ordem)

Se for commitar: um commit por prompt 09–14, com a convenção da AGENTS.md
(corpo com `Model:` e `Agent:`).

## 6. Antes de começar (próxima conversa)

- **Commitar/guardar o trabalho atual** (fluxo de convites + correções de erro:
  `invite` schema/migration/endpoints/repo, `getCompanyMembershipRole`,
  `getPostgresErrorCode`, `vitest.config`, remoção do join) — está tudo sem commit.
- Prompt 11: pular as partes já feitas (marcadas com ✅); prompts 13: rodar só
  depois de 09+10.
