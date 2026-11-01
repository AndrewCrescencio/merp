# Bugfix Requirements Document

## Introduction

**Bug**: Company creation via `createCompanyWithOwner` did not bootstrap a default location ("Matriz"), leaving new companies unable to perform operational operations (orders, restaurant tables, print tickets) which all require a location ID via `requireLocationId`.

**Impact**: All write operations for new companies failed with 400 errors because `requireLocationId` returned no location when `company_member.default_location_id` was NULL.

**Fix Status**: ✅ Already Implemented

The fix was implemented in `server/utils/auth/company/repository.ts`:

- `createCompanyWithOwner` now creates a default "Matriz" location in the same transaction
- `company_member.default_location_id` is set to point to the new "Matriz" location
- The operation runs with `app.location_id = NULL` to satisfy the RLS policy that requires `get_location_id() IS NULL` for location creation

## Bug Analysis

### Current Behavior (Defect)

**What was broken before the fix:**

1.1 WHEN a new company is created via `createCompanyWithOwner` THEN no location record is created automatically

1.2 WHEN a new company is created via `createCompanyWithOwner` THEN `company_member.default_location_id` for the owner remains NULL

1.3 WHEN an operational write endpoint (orders, restaurant tables, print tickets) is called for a new company THEN `requireLocationId` returns 400 error "No default location configured for this company"

### Expected Behavior (Correct)

**What should happen after the fix:**

2.1 WHEN a new company is created via `createCompanyWithOwner` THEN a location record with name "Matriz" SHALL be created in the same transaction

2.2 WHEN a new company is created via `createCompanyWithOwner` THEN `company_member.default_location_id` for the owner SHALL point to the new "Matriz" location

2.3 WHEN an operational write endpoint is called for a newly created company THEN `requireLocationId` SHALL successfully resolve the location ID and allow the operation to proceed

### Unchanged Behavior (Regression Prevention)

**Existing behavior that must be preserved:**

3.1 WHEN `createCompanyWithOwner` is called with valid parameters THEN the operation SHALL still complete atomically in a single transaction

3.2 WHEN `createCompanyWithOwner` is called for an existing CNPJ THEN the operation SHALL still return 409 Conflict

3.3 WHEN the location creation fails for any reason (RLS violation, constraint violation) THEN the entire transaction SHALL be rolled back and no company/member SHALL be created

3.4 WHEN the location RLS policy requires `company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL)` THEN the bootstrap operation SHALL continue to work by running with `app.location_id = NULL`

3.5 WHEN a company has multiple locations THEN `requireLocationId` SHALL still use the `company_member.default_location_id` to determine the active location

## Derivation Notes

### Bug Condition Function

The bug condition identifies inputs that trigger the defective behavior:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type CreateCompanyWithOwnerInput
  OUTPUT: boolean

  // Bug occurs when company creation doesn't include location bootstrap
  // BEFORE FIX: location creation was missing entirely
  // AFTER FIX: location creation is present

  // With the fix in place, this function always returns false
  // (the bug is no longer reproducible with current code)
  RETURN false
END FUNCTION
```

### Property Specification

**Property: Fix Checking** - Location is created for new companies:

```pascal
FOR ALL X WHERE X is valid CreateCompanyWithOwnerInput DO
  result ← createCompanyWithOwner'(X)
  location ← resolveLocationId(result.companyId, X.ownerUserId)
  ASSERT location IS NOT NULL
  ASSERT location.name = "Matriz"
  ASSERT location.isActive = true
END FOR
```

**Property: Preservation Checking** - Non-buggy inputs behave identically:

```pascal
FOR ALL X WHERE X has invalid CNPJ DO
  ASSERT createCompanyWithOwner(X) throws 409 Conflict
END FOR

FOR ALL X WHERE X has duplicate CNPJ DO
  ASSERT createCompanyWithOwner(X) throws 409 Conflict
END FOR
```

### RLS Policy Compliance

The location table RLS INSERT policy:

```
company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL)
```

For bootstrap operations, the operation runs with `app.location_id = NULL` to satisfy the policy escape clause.

## Verification Tests

The fix is validated by integration tests in `server/utils/auth/company/location.test.ts`:

1. `createCompanyWithOwner` creates "Matriz" location with `default_location_id` set
2. `requireLocationId` resolves to the "Matriz" location
3. `POST /orders` works without 400 error
4. `POST /restaurant/tables/{id}/open` works without 400 error
5. Location mutators are owner-only (403 for non-owners)
6. Cross-tenant isolation (404 for accessing other company's locations)
7. Multiple locations can be created (policy allows when `get_location_id() IS NULL`)
