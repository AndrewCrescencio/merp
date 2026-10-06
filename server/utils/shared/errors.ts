import { createError } from 'h3'
import { logger } from '#shared/logger'

export interface ApiError {
  error: string
  message: string
}

export function sendAuthError(status: number, error: string, message: string): never {
  throw createError({
    status,
    statusText: status.toString(),
    message: JSON.stringify({ error, message } satisfies ApiError),
  })
}

export function sendValidationError(message: string): never {
  sendAuthError(400, 'validation_error', message)
}

export function sendConflictError(message: string): never {
  sendAuthError(409, 'conflict', message)
}

export function sendUnauthorizedError(message: string): never {
  sendAuthError(401, 'unauthorized', message)
}

// FR-025: falha de inicialização do Better Auth → 503 auth_unavailable.
export function sendAuthUnavailableError(): never {
  sendAuthError(503, 'auth_unavailable', 'Authentication service is starting. Please try again.')
}

export function sendNotFoundError(message: string): never {
  sendAuthError(404, 'not_found', message)
}

export function sendForbiddenError(message: string): never {
  sendAuthError(403, 'forbidden', message)
}

export function sendForbiddenError(message: string): never {
  sendAuthError(403, 'forbidden', message)
}

export function sendForbiddenError(message: string): never {
  sendAuthError(403, 'forbidden', message)
}

function companyConflictError(
  error: unknown,
  onConflict: () => never
): boolean {
  if (isPgConflict(error)) {
    onConflict()
    return true
  }
  return false
}

function pgConflictOrGuard(error: unknown, guard: (error: unknown) => boolean, onConflict: () => never): never {
  if (isPgConflict(error)) {
    onConflict()
  } else if (guard(error)) {
    // guard passed — fall through to handleDatabaseError below
  } else {
    return handleDatabaseError(error)
  }
}

export async function assertCompanyRole(
  role: string | null | undefined,
  requiredRole: string | null,
  notMemberMessage: string,
  wrongRoleMessage?: string,
): Promise<void> {
  if (!role) {
    sendForbiddenError(notMemberMessage)
  }
  if (requiredRole && role !== requiredRole) {
    sendForbiddenError(wrongRoleMessage ?? notMemberMessage)
  }
}

export function getPostgresErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; cause?: unknown }
    if (typeof candidate.code === 'string') {
      return candidate.code
    }
    if (candidate.cause && typeof candidate.cause === 'object') {
      const cause = candidate.cause as { code?: unknown }
      if (typeof cause.code === 'string') {
        return cause.code
      }
    }
  }
  return undefined
}

export function isPgConflict(error: unknown): boolean {
  return getPostgresErrorCode(error) === '23505'
}

const RLS_ERROR_CODES = new Set(['42501', 'P0001'])

export function classifyDatabaseError(error: unknown): {
  status: number
  error: string
  message: string
} {
  const code = getPostgresErrorCode(error)

  if (code && RLS_ERROR_CODES.has(code)) {
    return {
      status: 403,
      error: 'forbidden',
      message: 'You do not have permission to access this resource',
    }
  }

  return {
    status: 503,
    error: 'service_unavailable',
    message: 'Service temporarily unavailable. Please try again later.',
  }
}

export function handleDatabaseError(error: unknown): never {
  const classification = classifyDatabaseError(error)

  logger[classification.status === 403 ? 'warn' : 'error']('Database error', {
    code: getPostgresErrorCode(error),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })

  sendAuthError(classification.status, classification.error, classification.message)
}

export function handleUpstreamTimeout(): never {
  sendAuthError(503, 'upstream_timeout', 'Authentication service timed out. Please try again.')
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}
