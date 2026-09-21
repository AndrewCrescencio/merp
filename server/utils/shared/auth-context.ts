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
  activeCompanyId?: string | null
}

declare module 'h3' {
  interface H3EventContext {
    user?: AuthContextUser
    session?: AuthContextSession
    tenantId?: string | null
    userId?: string
    activeCompanyId?: string | null
  }
}
