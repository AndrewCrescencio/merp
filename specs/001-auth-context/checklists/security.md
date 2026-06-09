# Security Requirements Checklist: Auth Bounded Context

**Purpose**: Validate completeness, clarity, and coverage of security requirements in the Auth bounded context spec
**Created**: 2026-06-10
**Feature**: specs/001-auth-context/spec.md

## Authentication Requirements

- [ ] CHK001 - Is the password hashing algorithm and cost factor documented in requirements? [Clarity, Spec §FR-009]
- [ ] CHK002 - Are minimum password length requirements specified consistently across all registration paths (email + OAuth)? [Completeness, Spec §FR-002]
- [ ] CHK003 - Are requirements defined for what email validation rejects (missing @, invalid domain, etc.)? [Clarity, Spec §FR-002]
- [ ] CHK004 - Is the OAuth callback URL validation strategy specified (anti-redirect-confusion)? [Gap]
- [ ] CHK005 - Are requirements defined for handling OAuth state parameter validation (CSRF on OAuth flow)? [Gap]
- [ ] CHK006 - Is the account unlinking behavior specified when removing an OAuth provider association? [Gap]

## Session Management Requirements

- [ ] CHK007 - Are session creation requirements specified consistently across login (email) and OAuth flows? [Consistency, Spec §FR-005, Spec §US2]
- [ ] CHK008 - Is the session invalidation behavior on logout defined for all active sessions across devices? [Coverage, Spec §FR-007]
- [ ] CHK009 - Are session cookie flags (httpOnly, Secure, SameSite, Path, Max-Age) fully specified for all environments? [Completeness, Spec §SC-006]
- [ ] CHK010 - Is the "remember me" session TTL of 7 days balanced with a security rationale in requirements? [Clarity, Spec §FR-010]
- [ ] CHK011 - Are requirements defined for session rotation (issuing new session on privilege escalation)? [Gap]
- [ ] CHK012 - Is session fixation prevention addressed in requirements? [Gap]

## Rate Limiting & Abuse Prevention

- [ ] CHK013 - Are rate limit thresholds specified for each auth endpoint category individually (register vs login vs OAuth)? [Completeness, Spec §FR-011]
- [ ] CHK014 - Is the rate limit window type (fixed vs sliding) documented in requirements? [Clarity, Spec §FR-011]
- [ ] CHK015 - Are rate limit response headers (Retry-After, RateLimit-Reset) specified? [Gap]
- [ ] CHK016 - Is the behavior defined when rate limit is reached (which status code, error body)? [Completeness, Gap]

## Credential & Token Protection

- [ ] CHK017 - Are requirements defined for how passwords are transmitted (TLS enforced, not logged)? [Gap]
- [ ] CHK018 - Are requirements specified for preventing credential leakage in error messages (generic vs specific errors)? [Clarity, Gap]
- [ ] CHK019 - Are requirements defined for OAuth client secret storage and rotation? [Gap]
- [ ] CHK020 - Is the use of httpOnly cookies over bearer tokens consistently documented across the spec? [Consistency, Spec §Overview, Spec §SC-006]

## Logging & Audit Requirements

- [ ] CHK021 - Are requirements defined for logging auth events (login success, login failure, registration, logout, rate limit hits)? [Gap]
- [ ] CHK022 - Are requirements specified for what auth data must NOT be logged (passwords, tokens)? [Gap]
- [ ] CHK023 - Is an audit trail requirement defined for account creation and authentication events? [Gap]

## Assumptions & Threat Model

- [ ] CHK024 - Is the assumption that "Better Auth handles password hashing" validated with specific algorithm and cost documentation? [Assumption, Spec §FR-009]
- [ ] CHK025 - Is the multi-tenancy isolation boundary assumption documented in security requirements? [Assumption, Spec §Assumptions]
- [ ] CHK026 - Is a threat model or security review scope documented for the auth context? [Gap]
