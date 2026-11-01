# Implementation Plan

## Overview

This task list follows the exploratory bugfix workflow for the company bootstrap location bug. The fix ensures that `createCompanyWithOwner` creates a default "Matriz" location and sets the owner's `default_location_id` to enable operational write operations.

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Company Bootstrap Missing Default Location
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test implementation details from Bug Condition in design:
    - Call `createCompanyWithOwner({ name: 'Test Co', cnpj: '12.345.678/0001-90' }, ownerUserId)`
    - Verify no location record is created for the company
    - Verify `company_member.default_location_id` is NULL for owner
  - The test assertions should match the Expected Behavior Properties from design
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause:
    - Example: `createCompanyWithOwner({ name: 'Test Co' }, 'user-123')` creates company but no location
    - Example: `company_member.default_location_id` is NULL instead of pointing to "Matriz"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Company Creation Transaction Atomicity and Validation
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: `createCompanyWithOwner` with valid CNPJ creates company atomically
    - Observe: `createCompanyWithOwner` with duplicate CNPJ returns 409 Conflict
    - Observe: `createCompanyWithOwner` with invalid CNPJ format returns 400
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - Property: For all valid company creation inputs, the operation completes atomically
    - Property: For all duplicate CNPJ inputs, the operation returns 409 Conflict
    - Property: For all invalid CNPJ format inputs, the operation returns 400
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Fix for Company Bootstrap Missing Default Location

  - [ ] 3.1 Implement the fix
    - Create default "Matriz" location in same transaction as company creation
    - Set `company_member.default_location_id` to point to the new "Matriz" location
    - Ensure operation runs with `app.location_id = NULL` to satisfy RLS policy
    - _Bug_Condition: isBugCondition(input) where company creation doesn't include location bootstrap_
    - _Expected_Behavior: expectedBehavior(result) from design - "Matriz" location created, default_location_id set_
    - _Preservation: Preservation Requirements from design - atomicity, CNPJ validation, RLS compliance_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Company Bootstrap Creates Default Location
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Company Creation Transaction Atomicity and Validation
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- The bug is already fixed in `server/utils/auth/company/repository.ts`
- The fix creates "Matriz" location and sets `default_location_id` in the same transaction
- The operation runs with `app.location_id = NULL` to satisfy the RLS INSERT policy escape clause
- Integration tests in `server/utils/auth/company/location.test.ts` validate the fix
