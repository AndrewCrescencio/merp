# Feature Specification: Auth Bounded Context

**Feature Branch**: `001-auth-context`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "Build the Auth bounded context for Merp."

## Overview

The Auth bounded context handles user identity — registration, login,
logout, and session management. It is a supporting domain that every
other context depends on for authenticated access and multi-tenant
company membership.

**Why this exists**: An ERP manages sensitive fiscal and financial data.
Without authentication, there is no way to know who is accessing the
system, which tenant they belong to, or whether they are authorized.
Auth is the gate — every interaction flows through it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email & Password Registration and Login (Priority: P1)

A new user registers with email and password, then logs in with those
credentials. After login, the system maintains an active session across
requests.

**Why this priority**: Email/password auth is the baseline for any
multi-tenant system. Every feature — fiscal note emission, financial
operations, tenant management — requires an authenticated user.
Without this story, nothing else works.

**Independent Test**: Register with email+password, then login with the
same credentials, then access a protected resource successfully.

**Acceptance Scenarios**:

1. **Given** a new email and password, **When** the user registers,
   **Then** the system creates an account and returns a success response.
2. **Given** an existing account, **When** the user logs in with correct
   credentials, **Then** the system starts an authenticated session.
3. **Given** an existing account, **When** the user logs in with an
   incorrect password, **Then** the system denies access with an error.
4. **Given** a registered email, **When** another user tries to register
   with the same email, **Then** the system rejects with a conflict error.

---

### User Story 2 - Logout and Session Lifecycle (Priority: P2)

An authenticated user can end their session explicitly. Sessions expire
automatically after a period of inactivity.

**Why this priority**: Users must be able to securely end access to the
system. Sessions that never expire are a security risk in a fiscal
environment. P2 because login (P1) must exist first to have something
to log out from.

**Independent Test**: Login, receive a session, logout, then attempt an
authenticated request and receive an access-denied error.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the user logs out,
   **Then** the session is terminated.
2. **Given** no active session, **When** the user accesses a protected
   resource, **Then** the system denies access.
3. **Given** an active session past its expiry, **When** the user makes
   a request, **Then** the system denies access.

---

### User Story 3 - Multi-Tenant Membership (Priority: P3)

A user can belong to one or more companies (tenants). After login, the
system knows which tenant context the user is operating in.

**Why this priority**: Merp serves multiple companies. User identity
without tenant context is incomplete — we need to know *which company*
the user is acting on behalf of. P3 because tenant membership builds on
top of basic auth (P1) and session management (P2).

**Independent Test**: Register a user, assign them to a company, login,
then verify that authenticated requests carry the correct tenant context.

**Acceptance Scenarios**:

1. **Given** a user assigned to a company, **When** the user logs in,
   **Then** the system recognizes their company membership.
2. **Given** a user assigned to multiple companies, **When** the user
   logs in, **Then** they can select which company to operate as.
3. **Given** a user not assigned to any company, **When** they log in,
   **Then** the system returns a success but limited-access status.

---

### Edge Cases

- What happens when a user registers with an already-used email?
- What happens when the session expires mid-operation (e.g., during
  fiscal note emission)?
- How does the system handle concurrent sessions from different devices?
- What happens when the identity store is unreachable during login?
- What happens when repeated failed login attempts occur?
- How does the system behave under high registration volume?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow user registration with email and password.
  Registration creates an account but does not start a session.
- **FR-002**: System MUST validate email format and enforce a minimum
  password length during registration.
- **FR-003**: System MUST reject registration with a duplicate email.
- **FR-004**: System MUST allow login with email and password.
- **FR-005**: System MUST maintain an authenticated session after
  successful login, valid across subsequent requests.
- **FR-006**: System MUST allow logout by terminating the current session.
- **FR-007**: System MUST reject unauthenticated requests to protected
  resources.
- **FR-008**: System MUST protect stored passwords against compromise
  (e.g., hashing).
- **FR-009**: Sessions MUST expire after a reasonable period. Short-lived
  sessions expire sooner; long-lived sessions are available on request.
- **FR-010**: Login attempts MUST be rate-limited to mitigate brute-force
  attacks.
- **FR-011**: System MUST associate each authenticated user with at least
  one company (tenant) for authorization decisions.
- **FR-012**: System MUST support multiple active sessions per user
  (different devices/browsers).

### Key Entities

- **User**: A person who can access the system. Has an email and can
  authenticate. Belongs to one or more companies.
- **Session**: Represents an authenticated user's active access period.
  Created on login, destroyed on logout or expiry.
- **Company**: A tenant in the multi-tenant model. Users are members of
  companies and operate within their scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Registration completes in under 2 seconds (p95).
- **SC-002**: Login completes in under 1 second (p95).
- **SC-003**: Session validation (authenticated request overhead) is
  under 100ms (p95).
- **SC-004**: Duplicate registration returns an error in under 500ms.
- **SC-005**: Unauthenticated requests return an access-denied response
  in under 50ms.
- **SC-006**: Brute-force protection kicks in within 5 login attempts
  per email per minute.

## Assumptions

- Email delivery (verification, password reset, welcome emails) is out
  of scope for the MVP.
- User profile management (name, avatar, preferences) is out of scope
  for the MVP.
- Multi-tenancy scoping (which company a user belongs to) is managed
  at the auth layer — downstream contexts consume the tenant context
  from the authenticated request.
- OAuth / social login is deferred — email+password is sufficient for
  the initial launch.
- Role-based access control (admin, operator, viewer) is deferred —
  the MVP treats all authenticated users within a company as having
  equal access.
- The auth context does not handle fiscal rules, financial transactions,
  or any domain logic outside identity and access.
