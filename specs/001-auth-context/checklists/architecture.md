# Architecture Requirements Checklist: Auth Bounded Context

**Purpose**: Validate completeness, clarity, and coverage of architecture and structure requirements in the Auth bounded context spec
**Created**: 2026-06-10
**Feature**: specs/001-auth-context/spec.md

## Handler + Repository Structure

- [x] CHK001 - Are handler responsibilities explicitly defined (validate input, call repository, return response)? [Clarity, Spec §Architecture]
- [x] CHK002 - Are repository responsibilities defined (all Drizzle queries; no business logic in repositories)? [Clarity, Spec §Architecture]
- [x] CHK003 - Is it specified which layer owns validation (handler = HTTP/request, repository = query constraints)? [Completeness, Spec §Architecture]
- [x] CHK004 - Are cross-cutting concerns (logging, error handling) assigned to middleware or shared helpers? [Completeness, Gap]

## Dependency Flow

- [x] CHK005 - Is it specified that route handlers depend on IRepository interfaces, never on Drizzle directly? [Clarity, Spec §Architecture]
- [x] CHK006 - Are repository interface contracts (IAuthRepository) defined independently of Drizzle? [Clarity, Spec §Architecture]
- [x] CHK007 - Is it specified that DrizzleAuthRepository implements IAuthRepository (not Better Auth primitives directly)? [Clarity, Spec §Architecture]
- [x] CHK008 - Are rules documented for what handlers MUST NOT do (import Drizzle directly, access other contexts' repositories)? [Coverage, Gap]

## Repository Contract Quality

- [x] CHK009 - Are IAuthRepository method signatures (inputs, outputs, async patterns) fully defined in the spec? [Completeness, Spec §Architecture]
- [x] CHK010 - Is the repository interface consistent with the handler needs across all user stories? [Consistency, Spec §Architecture vs Spec §User Stories]
- [x] CHK011 - Is error handling for repository methods specified (throw vs return null vs typed result)? [Completeness, Gap]
- [x] CHK012 - Are transaction boundaries documented for operations spanning multiple repository calls? [Gap]

## Cross-Context Communication

- [x] CHK013 - Are the DTO types exposed to other contexts (SessionInfo) explicitly defined with their fields? [Completeness, Spec §Cross-Context]
- [x] CHK014 - Is the mechanism for other contexts to access auth data (event.context.user) documented with its type contract? [Clarity, Spec §Cross-Context, Spec §Middleware]
- [x] CHK015 - Are the rules documented for what other contexts MUST NOT do (import Auth repository, call Auth repos directly)? [Coverage, Gap]
- [x] CHK016 - Is the auth middleware's contract with downstream handlers specified (guarantee of user object vs possible null)? [Clarity, Spec §Middleware]

## Folder & File Structure

- [x] CHK017 - Is the folder structure documented and mapped to the handler+repository model? [Completeness, Spec §Architecture]
- [x] CHK018 - Are file-naming conventions specified (one endpoint per file, repository.ts, helpers.ts)? [Clarity, Spec §Architecture]
- [x] CHK019 - Does the documented structure align with the constitution's Nuxt 4 Native + Repository Layer principle? [Consistency, Spec §Architecture vs Constitution §II]
- [x] CHK020 - Are shared infrastructure dependencies (shared/auth.ts, shared/db.ts) properly isolated from handler/repository code? [Coverage, Spec §Dependencies]

## Handler Design

- [x] CHK021 - Are handler input/output types specified (e.g. RegisterInput, LoginInput, AuthResult) and mapped to repository inputs? [Completeness, Spec §Endpoints]
- [x] CHK022 - Is handler error handling strategy documented (createError from Nitro, consistent status codes per endpoint)? [Completeness, Gap]
- [x] CHK023 - Is the boundary between Better Auth's session primitives and repository-managed user entities documented? [Clarity, Spec §Architecture]

## Middleware Architecture

- [x] CHK024 - Is the middleware's position in the Nitro request lifecycle documented? [Completeness, Spec §Middleware]
- [x] CHK025 - Are the middleware's public route exclusions justified and consistent with endpoint documentation? [Consistency, Spec §Middleware vs Spec §Endpoints]
- [x] CHK026 - Is the middleware's session lookup failure mode (throw vs redirect vs continue without user) documented? [Clarity, Spec §Middleware]
