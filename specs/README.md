# Merp Specs — Phase Status

## Phase 0 — Security Gate (RLS Test Suite) ✅ COMPLETE

- [x] 0.1 Roles verified: `merp` (superuser), `merp_app` (non-superuser, NOBYPASSRLS) — captured in `docs/audit/2026-09-22-roles.txt`
- [x] 0.2 Test suite migrated to `merp_app` — all 368 tests pass
- [x] 0.3 RLS Canary test created (`server/utils/rls-canary.test.ts`) — fails if suite runs as owner
- [x] 0.4 Concurrency test created (`server/utils/tenant-isolation-concurrent.test.ts`) — 100 iterations, zero leakage
- [x] 0.5 ADR-007 recorded: "Test suite runs as merp_app"

### Phase 0 Gates Status

- [x] **GATE A** — `createOwnerDb` renamed to `createOwnerDbForSetupOnly`, restricted to setup/fixtures, ESLint rule active
- [x] **GATE B** — Canary runs first (`00-rls-canary.test.ts`), vitest `sequence.shuffle: false` + `fileParallelism: false`, CI required check
- [ ] **GATE C** — DEFAULT PRIVILEGES migration applied, grants parity test passes in CI
- [ ] **GATE D** — CI exports APP_DATABASE_URL, runs integration with Docker, canary is required check

## Phase 1 — Product Decision (Core + Packs) ⏳ PENDING

- [ ] ADR-001: Vertical strategy (Core + Packs)
- [ ] ADR-002: Location scope in RLS
- [ ] Update specs: 003–007 marked as "packs/erp-b2b"

## Phase 2 — Foundation Normative (Docs Only) ⏳ PENDING

- [ ] `specs/000-foundation/rls-pattern.md`
- [ ] `specs/000-foundation/money.md`
- [ ] `specs/000-foundation/idempotency.md`
- [ ] `specs/000-foundation/endpoint-pattern.md`
- [ ] `specs/000-foundation/naming.md`
- [ ] `specs/000-foundation/snapshot.md`
- [ ] ADR-003 to ADR-006

## Phase 3 — Close 001 (Auth Context) ⏳ PENDING

- [ ] Fix contradictions F02–F16
- [ ] ADR-008: 2FA deferred

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
