# Feature Specification: Auth Bounded Context

**Feature Branch**: `001-auth-context`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Build the Auth bounded context for Merp."

## Overview

The Auth bounded context handles user registration, login, logout, and
session management. It is a supporting domain that other contexts depend
on for authenticated access and multi-tenant company membership.
Better Auth provides the underlying auth primitives.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email & Password Registration and Login (Priority: P1)

A new user registers with email and password, then logs in with those
credentials. After login, the system maintains an active session across
requests.

**Why this priority**: Registration and login with email/password is the
most basic auth flow required for any multi-tenant ERP. Every other feature
depends on the user being authenticated.

**Independent Test**: Can be fully tested by calling the register endpoint
with email+password, then calling login with the same credentials, and
verifying a session token is returned.

**Acceptance Scenarios**:

1. **Given** a new email and password, **When** the user registers,
   **Then** the system creates an account and returns a success response.
2. **Given** an existing account, **When** the user logs in with correct
   credentials, **Then** the system returns a valid session.
3. **Given** an existing account, **When** the user logs in with an
   incorrect password, **Then** the system returns an authentication error.

---

### User Story 2 - Google OAuth Login and Registration (Priority: P2)

A user logs in or registers using their Google account via OAuth. The system
creates an account if one does not exist, or links to an existing one.

**Why this priority**: OAuth reduces friction for new users and is a common
expectation for SaaS applications. P2 because email/password is the
mandatory baseline.

**Independent Test**: Can be fully tested by initiating the OAuth flow
and verifying the callback creates/authenticates a session.

**Acceptance Scenarios**:

1. **Given** a new Google account, **When** the user authenticates via
   Google OAuth, **Then** the system creates an account and returns a
   session.
2. **Given** an existing Google-linked account, **When** the user
   authenticates via Google OAuth again, **Then** the system returns a
   session for the same account.

---

### User Story 3 - Logout and Session Management (Priority: P3)

An authenticated user logs out, which invalidates their session. Session
lifecycle is managed transparently.

**Why this priority**: Logout is essential but depends on the session
infrastructure built in P1. P3 reflects that sessions are implicitly tested
in P1/P2.

**Independent Test**: Can be fully tested by logging in, then logging out,
then attempting an authenticated request and receiving an unauthorized error.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the user logs out,
   **Then** the session is invalidated and subsequent requests are rejected.
2. **Given** no active session, **When** the user accesses a protected
   endpoint, **Then** the system returns an unauthorized error.

---

### Edge Cases

- What happens when a user registers with an already-used email?
- What happens when the OAuth provider returns an invalid token?
- What happens when the session expires mid-request?
- How does the system handle concurrent sessions from different devices?
- What happens when the database is unreachable during login?
- What happens when the rate limit is exceeded?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow user registration with email and password.
  Registration creates an account but does NOT start a session.
- **FR-002**: System MUST validate email format and minimum password length
  (8 characters) during registration.
- **FR-003**: System MUST reject registration with a duplicate email.
- **FR-004**: System MUST allow login with email and password.
- **FR-005**: System MUST set an httpOnly session cookie on successful login.
- **FR-006**: System MUST support Google OAuth login and registration.
- **FR-007**: System MUST allow logout by invalidating the current session.
- **FR-008**: System MUST reject unauthenticated requests to protected
  endpoints with a 401 Unauthorized response.
- **FR-009**: System MUST hash passwords before storage.
- **FR-010**: Session MUST expire after 24 hours by default, or 7 days when
  "remember me" is selected at login.
- **FR-011**: Auth endpoints MUST rate-limit to 5 attempts per minute per
  IP+email combination.

### Key Entities

- **Session**: Represents an authenticated user session with expiry.
  Linked to a user account.
- **Account**: Represents a user's authentication method (email/password
  or OAuth provider). A user may have multiple accounts linked.
- **User**: The domain identity. Created upon first registration and shared
  across all authentication methods.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Registration completes in under 2 seconds (p95).
- **SC-002**: Login completes in under 1 second (p95).
- **SC-003**: Session validation completes in under 100ms (p95).
- **SC-004**: Registration with duplicate email returns an error in under
  500ms.
- **SC-005**: Unauthenticated requests return 401 in under 50ms.
- **SC-006**: Session cookie MUST use `httpOnly`, `Secure`, and
  `SameSite=Lax` flags.

## Clarifications

### Session 2026-06-10

- Q: How are session tokens transported? → A: httpOnly cookies (secure,
  SameSite). No bearer tokens.
- Q: What is the session TTL? → A: 24 hours default, 7 days with
  remember-me flag.
- Q: What rate limiting for auth endpoints? → A: 5 attempts/min per
  IP+email combination. OWASP baseline.
- Q: Password complexity beyond 8-char minimum? → A: 8 chars minimum only.
  No additional complexity for MVP.
- Q: Does registration auto-login? → A: No. Registration creates account
  only; user must explicitly log in.

## Assumptions

- Better Auth is already configured and available at `shared/auth.ts`.
- Email delivery (verification, password reset) is out of scope for MVP.
- Multi-tenancy scoping (which tenant a user belongs to) is handled at a
  higher layer — Auth only manages identity.
- Google OAuth credentials are configured via environment variables.
- Data access is abstracted via a repository layer (`IAuthRepository` in
  `server/utils/auth/repository.ts`). Route handlers never import Drizzle
  directly. This enables unit testing with mocked repositories.
