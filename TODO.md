# TODO — Backlog Real

## Segurança (alta prioridade)

- [ ] P1 Validar que role `merp_app` não tem BYPASSRLS (query `pg_roles` + `pg_policies`)
- [ ] P1 Auditar funções SECURITY DEFINER e views para vazamento de tenant
- [ ] P1 Decidir RLS em `auth_security_state` / `auth_event` (hoje sem RLS — risco de vazamento cross-tenant)
- [ ] P1 Planejar CHECK constraints monetários/fiscais (ex.: `total_amount >= 0`, `quantity > 0`)

## Qualidade de código (média prioridade)

- [ ] P2 Adicionar índices compostos em queries frequentes (ex.: `order.company_id + status`)
- [ ] P2 Cobrir 100% handlers auth/health com testes de integração (hoje só unit)
- [ ] P2 Remover `app/app.vue`, `app/pages/*` — frontend não existe (manter só se planejar SSR)
- [ ] P2 Revisar `server/utils/shared/purge.ts` — job de purga não agendado

## Primeira feature a implementar

- [ ] P1 **Core Order** — endpoints `POST/GET /api/v1/companies/{companyId}/orders`, transitions (cancel/complete), items, party. Schema já existe em `server/utils/schema/order*.ts`. Repository em `server/utils/order/repository.ts`. Ver specs na tag `pre-reset-limpo`: `specs/000-foundation/rest-api.md`, `specs/002-vertical-slices/architecture.md`, `docs/review/05-core-order.md`.

## Infra/DevEx (baixa prioridade)

- [ ] P3 Documentar variáveis de ambiente obrigatórias no `.env.example` (hoje incompleto)
- [ ] P3 Adicionar script `db:reset` (drop + migrate + seed mínimo para dev)
- [ ] P3 Configurar dependabot / renovate para dependências
