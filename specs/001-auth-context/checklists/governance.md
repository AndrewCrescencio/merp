# Governance Requirements Checklist: Auth Bounded Context

**Purpose**: Validate completeness, clarity, and coverage of multi-tenancy, data privacy, configuration, and testability requirements in the Auth bounded context spec
**Created**: 2026-06-10
**Feature**: specs/001-auth-context/spec.md

## Multi-tenancy & Authorization Requirements

- [x] CHK001 - Are role definitions (super_admin, owner, admin, operator) and their permission boundaries explicitly specified? [Completeness, Spec §Roles, Plan §CompanyMembers]
- [x] CHK002 - Is the tenant identifier strategy (company_id as discriminator) documented as a cross-entity requirement? [Clarity, Plan §Tenant discriminator]
- [x] CHK003 - Are RLS policy requirements specified for every entity (companies, members, invites, future business tables)? [Completeness, Plan §RLS Policies]
- [x] CHK004 - Is the company creation authorization rule specified (which roles can create companies, and under what conditions)? [Clarity, Plan §Endpoints]
- [x] CHK005 - Are role hierarchy and escalation rules documented (who can invite, promote, demote, remove members)? [Completeness, Gap]
- [x] CHK006 - Are requirements defined for the invite expiration and stale-invite cleanup strategy? [Coverage, Plan §CompanyInvites expiresAt]
- [x] CHK007 - Is the company deletion cascade behavior specified (members, invites, linked data)? [Gap, Spec §FR-019]
- [x] CHK008 - Is the member removal flow specified, including permission preconditions and side effects on active sessions? [Gap]
- [x] CHK009 - Are cross-tenant isolation guarantees documented (defense in depth: RLS + app-level checks)? [Completeness, Plan §Constraints]
- [x] CHK010 - Is the super_admin platform role scoped with specific constraints and audit requirements? [Clarity, Gap]
- [x] CHK011 - Are requirements defined for what happens when the last owner of a company is removed? [Edge Case, Gap]
- [x] CHK012 - Is the company-scoped session context mechanism documented (how middleware resolves current company)? [Completeness, Gap]
- [x] CHK013 - Are requirements consistent between the invite flow described in endpoints and the database schema (role enum values, status transitions)? [Consistency, Plan §Endpoints vs Plan §CompanyInvites]

## Data Privacy & Compliance Requirements

- [x] CHK014 - Are data retention and purging requirements defined for user accounts, sessions, and invites? [Gap, Spec §Data Governance & Compliance §Data Retention & Purging]
- [x] CHK015 - Is PII classification documented for stored fields (email, name, CNPJ, razao social)? [Completeness, Spec §Data Governance & Compliance §PII Classification]
- [x] CHK016 - Are account deletion requirements specified, including cascading cleanup of memberships and personal data? [Gap, Spec §Data Governance & Compliance §Data Retention & Purging (hard-deletion)]
- [x] CHK017 - Are requirements defined for export of user data upon request (right to data portability)? [Gap, Spec §FR-020]
- [x] CHK018 - Is consent tracking specified for data processing activities (registration, invite acceptance)? [Gap, Spec §FR-021]
- [x] CHK019 - Are data breach notification requirements (detection, logging, notification timeline) documented? [Gap, Spec §Data Governance & Compliance §Data Breach Notification]
- [x] CHK020 - Is the data minimization principle applied in entity design, and are justifications documented for each PII field collected? [Coverage, Gap]
- [x] CHK021 - Are requirements defined for audit logging of access to PII data (who viewed what, when)? [Gap, Spec §FR-022]
- [x] CHK022 - Are cross-border data transfer implications documented if using US-hosted services (Supabase, Resend) for a Brazilian ERP? [Gap, Spec §Data Governance & Compliance §Cross-Border Data Transfers]

## Configuration & Environment Requirements

- [x] CHK023 - Are all required environment variables documented with their purpose, format, and sensitivity classification? [Completeness, Spec §Assumptions]
- [x] CHK024 - Are default values and fallback behaviors specified for optional configuration parameters? [Gap]
- [x] CHK025 - Is configuration validation at startup specified (fail-fast on missing required variables)? [Gap]
- [x] CHK026 - Are environment-specific configuration requirements documented for dev, staging, and production? [Gap]
- [x] CHK027 - Are secret rotation and management requirements documented (OAuth secrets, Resend API key, database credentials)? [Gap]
- [x] CHK028 - Is the dependency startup sequence documented (DB connection, Better Auth init, middleware registration)? [Clarity, Gap]
- [x] CHK029 - Are feature-flag or toggling requirements documented for auth flows still under development? [Gap]
- [x] CHK030 - Is the configuration interface (typed config object vs env var access) documented for downstream consumers? [Clarity, Gap]

## Testability & Observability Requirements

- [x] CHK031 - Are repository interface contracts designed for mockability explicitly documented as a requirement? [Completeness, Spec §Assumptions]
- [x] CHK032 - Are logging requirements specified for all critical auth events (registration, login success, login failure, logout, rate-limit hit, OAuth callback)? [Gap]
- [x] CHK033 - Are requirements defined for what auth data MUST NOT be logged (passwords, session tokens, OAuth secrets)? [Gap]
- [x] CHK034 - Are monitoring and alerting thresholds defined for auth failure rates and rate-limit events? [Gap, Spec §Threat Model & Security Scope §Monitoring & alerting thresholds]
- [x] CHK035 - Are test fixture and data seed requirements documented for each user story scenario? [Completeness, Gap]
- [x] CHK036 - Is the mocking strategy for Better Auth primitives (BetterAuth instance, session management) documented? [Completeness, Gap]
- [x] CHK037 - Are integration test environment requirements documented (test DB setup, OAuth mock provider)? [Completeness, Gap]
- [x] CHK038 - Are transaction rollback and cleanup requirements specified for tests that modify state? [Coverage, Gap]
- [x] CHK039 - Are requirements defined for observability of session lifecycle (creation, validation, expiry, invalidation) across services? [Gap, Spec §FR-023]
- [x] CHK040 - Are concurrency and race-condition testing requirements defined for the invite acceptance flow? [Coverage, Spec §Infrastructure Dependencies §Concurrency testing]

## Notes

- Check items off as completed: `[x]`
- Add comments or findings inline
- Link to relevant resources or documentation
- Items are numbered sequentially for easy reference
