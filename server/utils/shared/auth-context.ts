import { createError } from 'h3'

/**
 * Shared shapes for `event.context` set by `server/middleware/auth.ts`.
 * Import the interfaces in handlers instead of re-declaring inline casts —
 * the `h3` module augmentation below types `event.context` globally, so new
 * code gets autocomplete and drift between handlers becomes a type error.
 */
export interface AuthContextUser {
  id: string
  email: string
  name: string | null
}

export interface AuthContextSession {
  id: string
}

/**
 * Tenant resolved from the path by `server/middleware/tenant.ts`. `companyId`
 * always comes from `/api/v1/companies/{companyId}/...`, never from body or a
 * "active company" session field. `role` is the caller's membership role in
 * that company (used by handlers to gate owner-only actions).
 */
export interface TenantContext {
  companyId: string
  role: string
}

declare module 'h3' {
  interface H3EventContext {
    user?: AuthContextUser
    session?: AuthContextSession
    userId?: string
    tenant?: TenantContext
  }
}

/**
 * Read the tenant set by the tenant middleware. Throws 401 if there is no
 * session (defensive — auth middleware normally guarantees it) and 500 if a
 * business handler somehow runs without the tenant middleware having matched
 * (a bug: every `/api/v1/companies/{companyId}` route must go through it).
 */
export function requireTenant(event: { context: { tenant?: TenantContext } }): TenantContext {
  const tenant = event.context.tenant
  if (!tenant) {
    throw createError({
      status: 500,
      message: JSON.stringify({
        error: 'tenant_context_missing',
        message: 'Tenant context was not resolved for this request.',
      }),
    })
  }
  return tenant
}
