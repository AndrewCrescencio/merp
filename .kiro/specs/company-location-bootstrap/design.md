# Company Location Bootstrap Bugfix Design

## Overview

This bugfix addresses a critical bootstrap issue in `createCompanyWithOwner` where new companies were created without a default "Matriz" location. Without this location, all operational write endpoints (orders, restaurant tables, print tickets) fail with 400 errors because `requireLocationId` cannot resolve a valid location ID from `company_member.default_location_id`, which remains NULL.

**Bug Impact**: New companies created via `createCompanyWithOwner` cannot perform any operational write operations until manually adding a location.

**Fix Approach**: Modify `createCompanyWithOwner` to create a default "Matriz" location in the same transaction and set the owner's `default_location_id` to point to this new location. The bootstrap operation runs with `app.location_id = NULL` to satisfy the location RLS policy that requires `get_location_id() IS NULL` for INSERT operations.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - company creation without default location bootstrap, leaving `company_member.default_location_id` as NULL
- **Property (P)**: The desired behavior - `createCompanyWithOwner` creates "Matriz" location and sets owner's `default_location_id` to point to it
- **Preservation**: Existing company creation behavior that must remain unchanged (atomic transaction, CNPJ uniqueness, 409 on duplicate)
- **`createCompanyWithOwner`**: Function in `server/utils/auth/company/repository.ts` that creates company, owner membership, and default location in one transaction
- **`requireLocationId`**: Function in `server/utils/shared/location.ts` that resolves `company_member.default_location_id` for write operations; returns 400 if NULL
- **`location`**: Table storing company locations with RLS policy requiring `company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL)`
- **`app.location_id`**: GUC (PostgreSQL configuration) used by RLS policies; `NULL` = escopo company, non-NULL = specific location scope
- **`company_member.default_location_id`**: Foreign key to `location.id` that determines which location is active for the user's session

## Bug Details

### Bug Condition

The bug manifests when a new company is created via `createCompanyWithOwner`. The function creates the company row and owner membership but fails to create the required default "Matriz" location, leaving `company_member.default_location_id` as NULL. This causes all operational write endpoints that call `requireLocationId` to fail with 400 "No default location configured for this company".

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type CreateCompanyWithOwnerInput { name, cnpj, ownerUserId }
  OUTPUT: boolean

  // Bug occurs when:
  // 1. Company is created successfully
  // 2. Owner membership is created with role='owner'
  // 3. NO location record is created
  // 4. company_member.default_location_id remains NULL

  createdCompany ← createCompany(input.name, input.cnpj)
  createdMember ← createCompanyMember(createdCompany.id, input.ownerUserId, 'owner', defaultLocationId=NULL)

  // Check if location was created (should be 0 locations)
  locationCount ← COUNT(location WHERE company_id = createdCompany.id)

  RETURN locationCount = 0
END FUNCTION
```

### Examples

**Example 1 - Company Creation Without Location:**

- **Input**: `createCompanyWithOwner({ name: 'New Co', cnpj: '12.345.678/0001-90' }, 'user-123')`
- **Expected**: New company created, "Matriz" location created, `default_location_id` set
- **Actual (before fix)**: New company created, NO location created, `default_location_id` = NULL
- **Result**: `POST /api/v1/companies/{id}/orders` returns 400

**Example 2 - Require Location ID for New Company:**

- **Input**: `requireLocationId('new-company-id', 'owner-user-id')`
- **Expected**: Returns location ID of "Matriz" location
- **Actual (before fix)**: Returns 400 "No default location configured for this company"
- **Result**: All operational write endpoints fail

**Example 3 - Post-Bootstrap Location Resolution:**

- **Input**: After bootstrap fix, `requireLocationId('new-company-id', 'owner-user-id')`
- **Expected**: Returns valid location ID, operations succeed
- **Result**: `POST /api/v1/companies/{id}/orders` succeeds

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- `createCompanyWithOwner` must still create the company and owner membership atomically in a single transaction
- CNPJ uniqueness validation must still return 409 Conflict when duplicate
- RLS policies must still enforce tenant isolation (users can only access their company's data)
- Company soft-delete, update, and other CRUD operations must remain unchanged

**Scope:**
All inputs that do NOT involve company bootstrap (company creation with owner) should be completely unaffected by this fix. This includes:

- Company listing, detail, and update operations
- Location CRUD operations (already implemented in `location-repository.ts`)
- Member management operations (add member, remove member, etc.)
- All existing integration endpoints (orders, tables, print jobs, etc.)

## Hypothesized Root Cause

Based on the bug description and code review, the root cause is:

1. **Missing Location Creation**: The `createCompanyWithOwner` function creates the company and owner membership but does not include location creation in the same transaction. This is an incomplete bootstrap implementation - the function was designed to create only the company and membership, assuming location creation would happen separately, but operational endpoints require a location from the start.

2. **Missing default_location_id Setting**: Even if a location were created, the `company_member.default_location_id` field was not being set to point to the bootstrap location, leaving no active location for the owner.

3. **RLS Policy Escape Clause**: The location table RLS INSERT policy (`company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL)`) requires `get_location_id() IS NULL` for bootstrap operations to pass. The original code did not account for this requirement and did not run the bootstrap with `app.location_id = NULL`.

## Correctness Properties

Property 1: Bug Condition - Company Bootstrap Creates Default Location

_For any_ company creation input where a new company and owner are created via `createCompanyWithOwner`, the fixed function SHALL create a location record with name "Matriz" in the same transaction and set the owner's `company_member.default_location_id` to point to this new location.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Company Creation Transaction Atomicity

_For any_ company creation input where the input is valid (unique CNPJ, non-empty name), the fixed function SHALL maintain the existing atomic transaction behavior - if the company is created successfully, the owner membership is created, and if any part fails, the entire transaction is rolled back. The bootstrap location creation is part of this atomic operation.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 3: Preservation - RLS Policy Compliance

_For any_ location creation during bootstrap, the fixed function SHALL run with `app.location_id = NULL` to satisfy the RLS INSERT policy (`company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL)`), ensuring the bootstrap location can be created without requiring a specific location ID in the GUC.

**Validates: Requirements 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `server/utils/auth/company/repository.ts`

**Function**: `CompanyRepository.createCompanyWithOwner`

**Specific Changes**:

1. **Create "Matriz" Location in Same Transaction**:
   - Add location INSERT after company creation
   - Use the same transaction context (`ctxTx`) as company and membership creation
   - Set `isActive = true` (default for bootstrap)

2. **Set Owner's default_location_id**:
   - Capture the created location's ID
   - Include `defaultLocationId` parameter in companyMember INSERT
   - Point to the newly created "Matriz" location

3. **Run with app.location_id = NULL**:
   - The `withTenant` call already passes `null` for locationId (3rd parameter)
   - This satisfies the RLS policy escape clause `OR get_location_id() IS NULL`
   - No additional GUC manipulation required beyond existing `withTenant` call

4. **Update location-repository.ts (already exists)**:
   - `listLocations`: GET /api/v1/companies/{companyId}/locations - list active locations (any member)
   - `createLocation`: POST /api/v1/companies/{companyId}/locations - create new location (owner-only)
   - `updateLocation`: PATCH /api/v1/companies/{companyId}/locations/{locationId} - update location (owner-only)
   - `softDeleteLocation`: DELETE /api/v1/companies/{companyId}/locations/{locationId} - soft delete (owner-only)

5. **Add API Endpoints**:
   - `GET /api/v1/companies/{companyId}/locations` - list locations handler
   - `POST /api/v1/companies/{companyId}/locations` - create location handler
   - `PATCH /api/v1/companies/{companyId}/locations/{locationId}` - update location handler
   - `DELETE /api/v1/companies/{companyId}/locations/{locationId}` - soft delete location handler
   - `GET /api/v1/companies/{companyId}` - company detail handler (already may exist)

### Implementation Details

**Before (buggy):**

```typescript
async createCompanyWithOwner(
  data: CreateCompanyInput,
  ownerUserId: string,
): Promise<CompanyResult> {
  try {
    return await db.transaction(async (tx) => {
      const companyId = randomUUID()
      const created = await withTenant(
        companyId,
        null,  // locationId = null (this part was already correct)
        ownerUserId,
        async (ctxTx) => {
          await ctxTx.execute(sql`SELECT set_config('app.allow_founder_bootstrap', 'true', true)`)
          const [row] = await ctxTx
            .insert(company)
            .values({ id: companyId, name: data.name, ... })
            .returning()

          // BUG: Missing location creation here
          // BUG: Missing defaultLocationId in companyMember insert

          await ctxTx.insert(companyMember).values({
            companyId,
            userId: ownerUserId,
            role: 'owner',
            // defaultLocationId was missing!
          })
          return row!
        },
        tx,
      )
      return created
    })
  } catch (error) {
    rethrowCompanyError(error)
  }
}
```

**After (fixed):**

```typescript
async createCompanyWithOwner(
  data: CreateCompanyInput,
  ownerUserId: string,
): Promise<CompanyResult> {
  try {
    return await db.transaction(async (tx) => {
      const companyId = randomUUID()
      const created = await withTenant(
        companyId,
        null,  // locationId = NULL (escape clause for RLS)
        ownerUserId,
        async (ctxTx) => {
          await ctxTx.execute(sql`SELECT set_config('app.allow_founder_bootstrap', 'true', true)`)
          const [row] = await ctxTx
            .insert(company)
            .values({ id: companyId, name: data.name, ... })
            .returning()

          // FIX: Create default "Matriz" location
          const [defaultLocation] = await ctxTx
            .insert(location)
            .values({
              companyId,
              name: 'Matriz',
              isActive: true,
            })
            .returning()

          // FIX: Set default_location_id to point to new location
          await ctxTx.insert(companyMember).values({
            companyId,
            userId: ownerUserId,
            role: 'owner',
            defaultLocationId: defaultLocation!.id,  // NEW: set to Matriz location
          })
          return row!
        },
        tx,
      )
      return created
    })
  } catch (error) {
    rethrowCompanyError(error)
  }
}
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach:

1. **Exploratory Bug Condition Checking**: Verify the bug exists on unfixed code by testing that new companies have NULL `default_location_id`
2. **Fix Checking**: Verify the fix resolves the bug for all valid company creation inputs
3. **Preservation Checking**: Verify existing company creation behavior (atomicity, CNPJ validation) is unchanged

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that create a company and verify the location and `default_location_id` are correctly set. Run these tests on the UNFIXED code to observe the bug (NULL `default_location_id`, no "Matriz" location).

**Test Cases**:

1. **Location Creation Test**: Call `createCompanyWithOwner`, verify "Matriz" location exists (will fail on unfixed code)
2. **Default Location ID Test**: Call `createCompanyWithOwner`, verify `company_member.default_location_id` is set (will fail on unfixed code)
3. **Location Resolution Test**: Call `requireLocationId` for new company, verify it resolves (will fail with 400 on unfixed code)
4. **Order Creation Test**: Call `POST /orders` for new company, verify it succeeds (will fail with 400 on unfixed code)

**Expected Counterexamples**:

- No location record created for new company
- `company_member.default_location_id` is NULL for owner
- `requireLocationId` returns 400 for new company
- Operational write endpoints fail with 400

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE input is valid CreateCompanyWithOwnerInput DO
  result := createCompanyWithOwner_fixed(input)
  location ← resolveLocation(result.companyId, input.ownerUserId)
  ASSERT location IS NOT NULL
  ASSERT location.name = "Matriz"
  ASSERT location.isActive = true
  ASSERT location.companyId = result.companyId
  ASSERT location.id = company_member.default_location_id
  // Verify write operations succeed
  orderResult ← POST /orders with location
  ASSERT orderResult.status = 201
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (invalid CNPJ, duplicate CNPJ), the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE input has duplicate CNPJ DO
  ASSERT createCompanyWithOwner(input) throws 409 Conflict
END FOR

FOR ALL input WHERE input has invalid CNPJ format DO
  ASSERT createCompanyWithOwner(input) throws 400 Validation Error
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for CNPJ validation and duplicate handling, then write tests to verify this continues after fix.

**Test Cases**:

1. **CNPJ Validation Preservation**: Verify invalid CNPJ format returns 400
2. **Duplicate CNPJ Preservation**: Verify duplicate CNPJ returns 409
3. **Transaction Rollback Preservation**: Verify if location creation fails, no company is created
4. **Cross-Tenant Isolation Preservation**: Verify location from one company is not visible to another

### Unit Tests

- Test `createCompanyWithOwner` creates "Matriz" location with correct properties
- Test `createCompanyWithOwner` sets `default_location_id` correctly
- Test `resolveLocationId` returns the "Matriz" location for new companies
- Test `requireLocationId` resolves without 400 for new companies
- Test location RLS policy compliance with `app.location_id = NULL`

### Property-Based Tests

- Generate random company names and verify bootstrap creates "Matriz" location
- Generate random CNPJ values (valid and invalid) and verify validation behavior
- Generate random company IDs and verify `requireLocationId` behavior for existing vs new companies

### Integration Tests

1. **Full Bootstrap Flow**: Create company → verify "Matriz" location → verify `default_location_id` → verify `requireLocationId` → verify `POST /orders` succeeds
2. **Location List Flow**: Create company → `GET /api/v1/companies/{id}/locations` → verify "Matriz" in list
3. **Location Update Flow**: Create company → `PATCH /api/v1/companies/{id}/locations/{locId}` → verify owner can rename "Matriz"
4. **Cross-Tenant Isolation**: Create two companies → owner A cannot access company B's locations → expect 404
5. **Non-Owner Access**: Create company with member → member cannot create/update/delete locations → expect 403
6. **Multiple Locations**: Create company → create second location → verify owner can have multiple locations → verify policy allows when `get_location_id() IS NULL`
