# Phase 4 Prompt: Maintain Domain Repositories (No Changes Required)

## Objective
Confirm that four repositories already contain genuine domain logic and should remain unchanged in the refactoring. These are not redundant pass-throughs and simplifying them would lose business functionality.

## Scope - No Changes Required

### 1. OrderRepository (MAINTAIN)
- **File:** `server/utils/order/repository.ts`
- **Why maintain:** Contains real business logic not found in CRUD:
  - Idempotency key handling (prevents duplicate order creation)
  - Item enrichment with product details, taxes, BOM snapshots
  - Total amount calculation with discount application
  - Status flow: open → completed/cancelled with validation
  - Dine-in table assignment vs takeout pickup info
- **Methods to keep as-is:** create, getById, complete, cancel, list
- **Test impact:** 45+ existing test cases remain valid, no changes needed

### 2. RestaurantRepository (MAINTAIN)
- **File:** `server/utils/restaurant/repository.ts`
- **Why maintain:** Complex state machines for restaurant operations:
  - Table occupancy state machine (available → occupied → available)
  - Kitchen ticket progression (pending → in_progress → ready → served)
  - Cashier shift management with float reconciliation
  - Notes, expected vs actual amount tracking for shift closing
- **Methods to keep as-is:** openTable, closeTable, getTable, listTables, createKitchenTicket, updateKitchenTicketStatus, openCashierShift, closeCashierShift, getCurrentUserShift, listCashierShifts
- **Test impact:** 38 existing test cases remain valid, no changes needed

### 3. InviteRepository (MAINTAIN)
- **File:** `server/utils/auth/invite/repository.ts`
- **Why maintain:** Unique business logic not in Better Auth:
  - 256-bit token entropy generation (cryptographically secure)
  - SHA-256 hashing of tokens (never store plaintext in DB)
  - Single-use, race-safe claim via conditional UPDATE
  - 7-day TTL enforcement with expiration checks
  - Member creation only after successful token claim
- **Methods to keep as-is:** createInvite, findPendingInvite, listCompanyInvites, acceptInvite
- **Test impact:** 15 existing test cases remain valid, no changes needed

### 4. MembershipRepository (MAINTAIN)
- **File:** `server/utils/auth/company/membership.ts`
- **Why maintain:** Core multi-tenant domain operations:
  - Role-based membership (owner vs member)
  - Company search with user scoping (RLS-aware)
  - Member removal with session detachment
  - Active company assignment with membership validation
  - TOCTOU-safe setActiveCompany with membership check
- **Methods to keep as-is:** createCompanyMember, searchCompanies, findUserCompanies, isCompanyMember, getCompanyMembershipRole, removeCompanyMember, setActiveCompany, getActiveCompany
- **Note:** searchCompanies kept (distinct from CompanyRepository search which may be simplified in Phase 2, but this method has its own LIKE-based search logic)
- **Test impact:** 8+ existing test cases remain valid, no changes needed

## Validation Checklist (Confirm No Breakage)

### Order Flow
- [ ] `POST /api/orders` creates order with items and total
- [ ] `GET /api/orders/[id]` returns order with enriched items
- [ ] `POST /api/orders/[id]/complete` completes order (fails if not open)
- [ ] `POST /api/orders/[id]/cancel` cancels order (fails if not open)
- [ ] `GET /api/orders` lists orders with pagination/filtering

### Restaurant Flow
- [ ] `POST /api/restaurant/tables/open` opens table (available → occupied)
- [ ] `POST /api/restaurant/tables/close` closes table (occupied → available)
- [ ] `GET /api/restaurant/tables` lists tables for company/location
- [ ] `POST /api/restaurant/kitchen/tickets` creates kitchen ticket
- [ ] `PATCH /api/restaurant/kitchen/tickets/[id]/status` updates ticket status
- [ ] `POST /api/restaurant/cashier/shifts` opens shift
- [ ] `POST /api/restaurant/cashier/shifts/[id]/close` closes shift with reconciliation

### Invite Flow
- [ ] `POST /api/auth/invites` creates invite with 7d TTL
- [ ] `POST /api/auth/invites/accept` accepts invite, creates membership
- [ ] Invite token single-use, expired/invalid → 404
- [ ] User already member → 409 (token not consumed)

### Membership Flow
- [ ] `POST /api/auth/companies/[id]/members` adds member (role: member)
- [ ] `GET /api/auth/companies` searches companies user belongs to
- [ ] `GET /api/auth/companies/[id]/members` lists user's companies with roles
- [ ] `DELETE /api/auth/companies/[id]/members` removes member
- [ ] `POST /api/auth/companies/switch` sets active company for session

## Why These 4 Are Different from Removed Repos

| Criteria | Removed (User/Session/Identity) | Maintained (Order/Restaurant/Invite/Membership) |
|----------|--------------------------------|-----------------------------------------------|
| **Better Auth coverage** | Already handles user/session persistence | Does NOT handle order/restaurant/invite/membership logic |
| **1:1 pass-through** | Yes — just forwards to DB/Better Auth | No — contains business rules, validation, computation |
| **Domain rules** | None — infrastructure only | Yes — idempotency, state machines, crypto, role-based access |
| **CRUD vs logic** | Pure CRUD/infrastructure | Complex domain logic mixed with CRUD |
| **Test uniqueness** | Can be replaced by Better Auth tests | Tests exercise unique business scenarios |

## Phase 4 Tasks (Process, Not Code Changes)

### 1. Verification
- Run existing test suites for all 4 repositories
- Confirm all API endpoints still return expected data
- Verify RLS still applies to all queries (withTenant preserved)

### 2. Documentation
- Update any internal docs that reference these repos as "simplified" or "changed"
- Confirm no code comments need updating since repo code is unchanged

### 3. TypeScript Check
- `npx tsc --noEmit` should pass without errors for these files
- Types remain identical since no code changes

### 4. Final Integration
- Run full test suite (`pnpm test` or `npm test`)
- Confirm all 4 repository test suites pass
- Verify end-to-end flows: create order → complete → list; open table → close; create invite → accept; add member → set active company

## Rollback Plan
- **Trivial:** No code changes means rollback is "do nothing" — the status quo is maintained
- **If issues discovered:** Simply revert any Phase 1-3 changes; Phase 4 was always "no change"
- **Risk:** Effectively zero for this phase

## Phase Execution Order
- Phase 4 can run **concurrently** with any other phase since it involves no code modifications
- It serves as a **validation anchor** — ensure Phases 1-3 don't break the maintained repositories
- Run Phase 4 validation after each preceding phase to catch integration issues early