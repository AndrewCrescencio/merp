# Merp Specs — Phase Status

## Phase 0 — Security Gate (RLS Test Suite) ✅ COMPLETE

- [x] 0.1 Roles verified: `merp` (superuser), `merp_app` (non-superuser, NOBYPASSRLS) — captured in `docs/audit/2026-09-22-roles.txt`
- [x] 0.2 Test suite migrated to `merp_app` — all tests pass
- [x] 0.3 RLS Canary test created (`server/utils/00-rls-canary.test.ts`) — fails if suite runs as owner
- [x] 0.4 Concurrency test created (`server/utils/tenant-isolation-concurrent.test.ts`) — 100 iterations, zero leakage
- [x] 0.5 ADR-007 recorded: "Test suite runs as merp_app"

### Phase 0 Gates Status

- [x] **GATE A** — `createOwnerDb` renamed to `createOwnerDbForSetupOnly`, restricted to setup/fixtures, ESLint rule active
- [x] **GATE B** — Canary runs first (`00-rls-canary.test.ts`), vitest `sequence.shuffle: false` + `fileParallelism: false`, CI required check
- [x] **GATE C** — Migration 0020 (DEFAULT PRIVILEGES) applied, `grants-parity.test.ts` passes (4/4), runbook at `docs/05-operations/runbooks/grants.md`
- [x] **GATE D** — `.github/workflows/ci.yml` created: canary job (required) → test job (needs canary) → lint/typecheck; Postgres service container; APP_DATABASE_URL explicit

## Phase 1 — Product Decision (Core + Packs) ✅ COMPLETE

- [x] ADR-001: Vertical strategy (Core + Packs)
- [x] ADR-002: Location scope in RLS
- [x] ADR-008: Vertical slices (package by feature)
- [x] 003–007 movidos para `specs/packs/erp-b2b/` (ADIADO)

## Phase 2 — Foundation Normative (Docs Only) ✅ COMPLETE

- [x] `specs/000-foundation/snapshot.md`
- [x] ADR-003 to ADR-006

_(Os specs `naming.md`, `money.md`, `endpoint-pattern.md`, `rls-pattern.md`, `idempotency.md` foram removidos once the code already implements these concepts — see Fase 3 cleanup decisions)_

## Phase 3 — Close 001 (Auth Context) ✅ COMPLETE

- [x] Fix contradictions F02–F16
- [x] 2FA removed from scope (see ADR-010)
- [x] ADR-011: contrato da camada de identidade (AUD-03/07, FR-017/021) + reparo do RLS 0024

## Phase 4 — Core Order (Unified) 🚧 IN PROGRESS

- [ ] `specs/006-core-order/spec.md` — spec + data-model + contracts exist
- [ ] RLS matrix for order
- [ ] FSM tests
- [ ] Implementation: `order`, `order_item`, `order_dine_in`, `order_takeout` + 4 handlers

## Phase 5 — Restaurant Pack 📋 PLANNED

- [ ] Table/Comanda (`restaurant_table` endpoints)
- [ ] KDS (`kitchen_ticket` trigger/status)
- [ ] Printer (`printer` + `print_job` + task)
- [ ] Cashier shift
- [ ] Delivery/Reserva (fase 2)
- [ ] NFC-e (provedor terceirizado, pós-MVP)

---

**Gate Rule**: No phase starts until previous phase's acceptance criteria are green.

---

## Mapa de numeração (specs 003–005)

Originalmente 003–007 especificavam ERP genérico. Com ADR-001 (núcleo + packs),
foram absorvidas por `specs/packs/erp-b2b/`. **Fase 3 — decisões de limpeza:**
todos os packs foram removidos do repo (plan-only, não implementados);
`sales`, `catalog`, `crm` e `finance` foram **restaurados do histórico em
2026-10-16** — `admin` continua removido (recuperável em
`e7cf53d:specs/packs/erp-b2b/admin/plan.md` ou na tag
`archive/pre-docs-truth-<data>`).

A numeração 003–005 fica reservada (não reutilizar). `006-core-order` e
`007-print` usam a série nova (núcleo unificado + print). Os planos restaurados
apontam para `specs/packs/erp-b2b/<x>/`, não para os caminhos numerados antigos.

---

## Dívidas Conhecidas

- **RLS 0024 precisa ser reexecutado em produção** (ver ADR-011) — a versão antiga referenciava a coluna inexistente `location_id` em `location` e abortava a meio caminho, deixando as policies de `location` pela metade. `scripts/apply-custom-sql.ts` é idempotente e repara por completo; reexecutar no próximo deploy.
- **2FA removido do escopo** (ver ADR-010) — landmine adapter × RLS. Critério para retomar: feature flag `auth.twoFactor` + migration dedicada + testes de RLS com `app.location_id`.
- **3 advisories de cadeia sem correção upstream** (ver ADR-012) — `braces` e `node-forge` estão nas versões mais recentes do npm e ainda são afetadas; `esbuild` só se resolve baixando `drizzle-kit` a `0.18.1`. **Não correr `npm audit fix --force`**: quebra a ferramenta de migração. Nenhuma é alcançável pelo runtime do servidor (verificado contra `.output`).
- **Specs 003–005 absorvidas** por `packs/erp-b2b/*` (ver mapa acima).
- **`006-core-order`** tem spec + data-model + contracts; handlers implementados (5 endpoints em `/api/v1/companies/{companyId}/orders/` — list, create, get, cancel, complete).
- **Packs `erp-b2b/*`** são plan-only, sem `spec.md`/`data-model.md`/`contracts/`; código não referencia esses módulos. Restaurados do histórico em 2026-10-16: `sales`, `catalog`, `crm`, `finance`. Ainda removidos: `admin`.
- **`specs/001-auth-context/` e `specs/002-vertical-slices/` restaurados do histórico (2026-10-16)** ao mesmo tempo que `consolidated-specs.md` existe — são duas fontes para o mesmo conteúdo. ADR-001 manda manter o consolidado como fonte; os arquivos soltos voltaram para sustentar as refs dos planos ERP.
- **`docs/review/`, `docs/audit/` e ADRs antigos** citam paths pré-migração, mas são **históricos** e não devem ser reescritos — mexer neles falsificaria o registro.

> Dívidas pagas (2026-10-12, removidas): `withTenant` suporta `locationId` + `app.location_id`
> (T02); schemas núcleo definidos em `schema.ts` (T03); `line_total` half-up via `round_half_up`
> (T04). Ver ADRs + audit AUD-001.
>
> Dívida paga (2026-10-16): `contracts/auth-api.md` e `quickstart.md` foram reescritos
> linha-a-linha contra os handlers reais (paths `/api/v1`, verbos PATCH/DELETE com id no
> path, token só no body — R6 —, rotas removidas `companies/switch`,
> `reset-password/[token]` e `GET /api/metrics` retiradas, CSRF documentado).
