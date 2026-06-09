# API Requirements Checklist: Auth Bounded Context

**Purpose**: Validate completeness, clarity, and coverage of API requirements in the Auth bounded context spec
**Created**: 2026-06-10
**Feature**: specs/001-auth-context/spec.md

## Endpoint Contract Completeness

- [ ] CHK001 - Are request body schemas (fields, types, constraints) specified for every auth endpoint? [Completeness, Spec §Endpoints]
- [ ] CHK002 - Are response body schemas specified for every auth endpoint? [Completeness, Spec §Endpoints]
- [ ] CHK003 - Are success response status codes documented for each endpoint (201 vs 200 for registration)? [Clarity, Spec §Endpoints]
- [ ] CHK004 - Are error response schemas (status code, error code, message format) defined consistently across all endpoints? [Completeness, Gap]
- [ ] CHK005 - Are request validation rules (required fields, formats, length constraints) specified for each endpoint? [Completeness, Spec §dto.ts]

## Error Response Requirements

- [ ] CHK006 - Is the error response format (JSON structure, field names, error codes) documented consistently? [Completeness, Gap]
- [ ] CHK007 - Are validation error responses specified for malformed requests (missing fields, invalid types)? [Coverage, Gap]
- [ ] CHK008 - Are 401 response details specified consistently between middleware and auth endpoints? [Consistency, Spec §FR-008, Spec §Middleware]
- [ ] CHK009 - Are 429 (rate limit) response details specified (body, headers)? [Completeness, Gap]
- [ ] CHK010 - Are 500 / unexpected error response behaviors defined? [Coverage, Gap]

## Endpoint Behavior Requirements

- [ ] CHK011 - Is the OAuth redirect flow fully specified (initiation URL, callback URL, redirect after success)? [Completeness, Spec §US2]
- [ ] CHK012 - Are the public vs protected route boundaries explicitly documented in endpoint requirements? [Clarity, Spec §Middleware]
- [ ] CHK013 - Are logout requirements defined for both cookie-based and potential API-based invalidation? [Clarity, Spec §FR-007]
- [ ] CHK014 - Is the session cookie set on all auth endpoints that create sessions (login, OAuth callback) consistently? [Consistency, Spec §FR-005]
- [ ] CHK015 - Are cookie-clearing requirements defined for logout? [Gap]

## Middleware Requirements

- [ ] CHK016 - Are middleware exclusion rules documented explicitly (which routes bypass auth check and why)? [Clarity, Spec §Middleware]
- [ ] CHK017 - Is the middleware session lookup failure behavior specified beyond throwing 401? [Completeness, Spec §Middleware]
- [ ] CHK018 - Is the `event.context.user` type/shape documented for downstream consumers? [Clarity, Spec §Cross-Context]

## Endpoint Naming & Structure

- [ ] CHK019 - Are URL path naming conventions consistent across all auth endpoints? [Consistency, Spec §Endpoints]
- [ ] CHK020 - Are HTTP method assignments correct per endpoint semantics (POST for state mutation, GET for read/redirect)? [Consistency, Spec §Endpoints]
- [ ] CHK021 - Is the OAuth callback URL documented as a first-class endpoint with its own requirements? [Completeness, Spec §Endpoints]

## Headers & Transport Requirements

- [ ] CHK022 - Are CORS requirements defined for auth endpoints (allowed origins, credentials)? [Gap]
- [ ] CHK023 - Are Content-Type requirements specified for request and response payloads? [Gap]
- [ ] CHK024 - Are cookie-specific response headers (Set-Cookie attributes) specified in endpoint requirements? [Completeness, Spec §SC-006]
