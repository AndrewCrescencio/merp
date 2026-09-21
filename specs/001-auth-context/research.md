# Research: Auth Bounded Context

## Technology Decisions

### Better Auth Integration

- **Decision**: Use Better Auth with Drizzle adapter for email/password authentication
- **Rationale**: Constitution mandates Better Auth (technology stack). Drizzle adapter provides native PostgreSQL integration without additional ORM mapping.
- **Implementation**: Initialize Better Auth in `shared/auth.ts` with `better-auth` + drizzle adapter. Configure email/password provider, fixed session TTL (7d, no refresh), and rate limiting.
- **Alternatives considered**: Lucia (deprecated), next-auth (React-focused, Nuxt integration less mature)

### Session Strategy

- **Decision**: Cookie-based sessions with httpOnly, Secure, SameSite=Lax
- **Rationale**: Better Auth natively supports cookie sessions. Nuxt/Nitro handles cookie serialization. No custom JWT management needed.
- **Session validation**: Middleware (`server/middleware/auth.ts`) reads session cookie, calls Better Auth `getSession()`, sets `event.context.user`.
- **Concurrent sessions**: FR-012 allows multiple active sessions per user (different devices).

### Rate Limiting

- **Decision**: Sliding window rate limit (5 req/min per email) with in-memory counter or Drizzle-based tracking
- **Rationale**: Sliding window prevents burst resets (unlike fixed window). Tracked per email address for precision. FR-010 specifies 429 response format with Retry-After, RateLimit-Reset, RateLimit-Remaining headers.
- **Implementation**: Better Auth provides built-in rate limiting or use Nitro's `defineEventHandler` wrapper for custom implementation.

### Error Response Format

- **Decision**: Consistent JSON error body across all endpoints
- **Rationale**: FR-005 (CHK005) mandates consistent error format. FR-010 (429), FR-024/FR-025 (503), FR-026 (500) define slot-specific formats. All follow `{ "error": "snake_case_code", "message": "Human-readable message" }` pattern.
- **Edge case**: 401 for expired mid-request sessions returns `{ "error": "session_expired", "message": "Session expired. Please login again." }`.

### CORS Configuration

- **Decision**: Explicit allowed origin (e.g., `https://app.merp.com.br`) with `Access-Control-Allow-Credentials: true`
- **Rationale**: Cookie-based auth requires explicit origin (wildcard `*` + credentials is invalid per spec). Preflight `OPTIONS` requests handled by Nitro CORS configuration.

### Timeouts

- **Decision**: 5s timeout for Better Auth library calls, 10s for OAuth provider calls
- **Rationale**: Balances against existing p95 targets (SC-001: 2s, SC-002: 1s). Prevents cascading failures without excessive false positives.

### Initialization Failure Handling

- **Decision**: Graceful degradation — return 503 from auth endpoints + health check, log error, keep process alive
- **Rationale**: Process crash prevents ops from accessing health endpoints. 503 allows load balancers to route traffic away.
