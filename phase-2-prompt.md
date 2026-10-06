# Phase 2 Prompt: Simplify CompanyRepository + MembershipRepository

## Objective
Simplify the CompanyRepository by removing duplicated error handling boilerplate (try/catch + isPgConflict patterns in every method). Simplify MembershipRepository by removing the searchCompanies method that can be covered by the simplified CompanyRepository. Keep core multi-tenant domain logic intact.

## Scope
- **Simplify:** `server/utils/auth/company/repository.ts` — remove duplicated error handling, extract to shared helpers
- **Simplify:** `server/utils/auth/company/membership.ts` — remove searchCompanies method, keep essential membership operations
- **Maintain:** All RLS `withTenant()` wrapping (critical for multi-tenant)
- **Maintain:** All public API methods (same names and signatures)

## Specific Tasks

### 1. Simplify CompanyRepository
- Remove try/catch + isPgConflict + createError pattern from all 5 methods:
  - createCompany
  - createCompanyWithOwner
  - findCompanyById
  - softDeleteCompany
  - updateCompany
- Extract centralized error handling helper (optional: in shared/errors.ts or repo-utils)
- Keep: RLS withTenant wrapping, all CRUD methods, soft-delete, CNPJ conflict detection logic
- Result: Each method shrinks from ~40 lines of boilerplate to ~15 lines of core logic

### 2. Simplify MembershipRepository
- Remove: searchCompanies method (can use CompanyRepository after simplification)
- Keep: isCompanyMember, getCompanyMembershipRole, findUserCompanies, removeCompanyMember, setActiveCompany
- Result: MembershipRepository focuses on core membership/role operations without search duplication

## Validation Checklist
- [ ] `POST /api/auth/companies` still creates companies successfully
- [ ] `GET /api/auth/companies/[id]` still finds companies (RLS validated)
- [ ] `POST /api/auth/companies/switch` still sets active company
- [ ] `DELETE /api/auth/companies/[id]` still soft-deletes + purges memberships
- [ ] `isCompanyMember(userId, companyId)` returns correct boolean
- [ ] `getCompanyMembershipRole(userId, companyId)` returns correct role or null
- [ ] `findUserCompanies(userId)` returns user's companies with roles
- [ ] `removeCompanyMember(companyId, executedByUserId, targetUserId)` still works
- [ ] `setActiveCompany(sessionId, companyId, userId)` still works

## Rollback Plan
- Restore original `company.repository.ts` from git
- Restore original `membership.ts` from git
- All method signatures unchanged, so rollback is simply file replacement

## Dependencies
- Phase 1 (auth repos removal) should complete first, as CompanyRepository calls may reference removed patterns