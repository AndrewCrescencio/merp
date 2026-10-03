# Merp Specs — Phase Status

## Phase 0 — Security Gate (RLS Test Suite) ✅ COMPLETE

- [x] 0.1 Roles verified: `merp` (superuser), `merp_app` (non-superuser, NOBYPASSRLS) — captured in `docs/audit/2026-09-22-roles.txt`
- [x] 0.2 Test suite migrated to `merp_app` — all tests pass
- [x] 0.3 RLS Canary test created (`server/utils/rls-canary.test.ts`) — fails if suite runs as owner
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

- [x] `specs/000-foundation/rls-pattern.md`
- [x] `specs/000-foundation/money.md`
- [x] `specs/000-foundation/idempotency.md`
- [x] `specs/000-foundation/endpoint-pattern.md`
- [x] `specs/000-foundation/naming.md`
- [x] `specs/000-foundation/snapshot.md`
- [x] ADR-003 to ADR-006

## Phase 3 — Close 001 (Auth Context) ✅ COMPLETE

- [x] Fix contradictions F02–F16
- [x] 2FA removed from scope (see ADR-010)

## Phase 4 — Core Order (Unified) ⏳ PENDING

- [ ] `specs/006-core-order/spec.md`
- [ ] RLS matrix for order
- [ ] FSM tests

## Phase 5 — Restaurant Pack ⏳ PENDING

- [ ] Table/Comanda
- [ ] KDS
- [ ] Printer
- [ ] Cashier shift
- [ ] Delivery/Reserva
- [ ] NFC-e (last)

---

**Gate Rule**: No phase starts until previous phase's acceptance criteria are green.

---

## Mapa de numeração (specs 003–005)

Originalmente 003–007 especificavam ERP genérico. Com ADR-001 (núcleo + packs),
foram absorvidas por `specs/packs/erp-b2b/`:

| Nº antigo | Conteúdo           | Local atual                     |
| --------- | ------------------ | ------------------------------- |
| 003       | Catálogo + Estoque | `packs/erp-b2b/catalog/plan.md` |
| 004       | Vendas + Compras   | `packs/erp-b2b/sales/plan.md`   |
| 005       | Financeiro         | `packs/erp-b2b/finance/plan.md` |
| 006       | CRM                | `packs/erp-b2b/crm/plan.md`     |
| 007       | Relatórios + Admin | `packs/erp-b2b/admin/plan.md`   |

A numeração 003–005 fica reservada (não reutilizar). `006-core-order` e
`007-print` usam a série nova (núcleo unificado + print).

---

## Dívidas Conhecidas

- **2FA removido do escopo** (ver ADR-010) — landmine adapter × RLS. Critério para retomar: feature flag `auth.twoFactor` + migration dedicada + testes de RLS com `app.location_id`.
- **Specs 003–005 absorvidas** por `packs/erp-b2b/*` (ver mapa acima).
- **`006-core-order`** tem spec + data-model + contracts, mas falta
  `plan.md`/`tasks.md`/`research.md`/`quickstart.md` (ADIADO).
- **`packs/erp-b2b/*`** têm apenas `plan.md`; falta spec/data-model/contracts
  por módulo (ADIADO — ver ADR-001).
