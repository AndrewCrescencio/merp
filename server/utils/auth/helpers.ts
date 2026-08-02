import type { H3Event } from 'h3'
import { createError, setResponseHeaders } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { authSecurityState } from '../schema'
import { logger } from '#shared/logger'

export interface ApiError {
  error: string
  message: string
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

export function sendNotFoundError(message: string): never {
  sendAuthError(404, 'not_found', message)
}

export function sendForbiddenError(message: string): never {
  sendAuthError(403, 'forbidden', message)
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

const RATE_WINDOW_MS = 60_000
const MAX_REQUESTS = 5
const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_DURATION_MS = 30 * 60 * 1000

export interface RateLimitEntry {
  count: number
  resetAt: Date | null
}

export interface RateLimitDecision {
  allowed: boolean
  retryAfter?: number
  nextCount: number
  nextResetAt: Date
}

export function evaluateRateLimit(entry: RateLimitEntry | null, now: Date): RateLimitDecision {
  const nowMs = now.getTime()
  const resetAtMs = entry?.resetAt ? entry.resetAt.getTime() : 0

  if (!entry || resetAtMs <= nowMs) {
    return { allowed: true, nextCount: 1, nextResetAt: new Date(nowMs + RATE_WINDOW_MS) }
  }

  if (entry.count < MAX_REQUESTS) {
    return { allowed: true, nextCount: entry.count + 1, nextResetAt: entry.resetAt! }
  }

  return {
    allowed: false,
    retryAfter: Math.ceil((resetAtMs - nowMs) / 1000),
    nextCount: entry.count,
    nextResetAt: entry.resetAt!,
  }
}

export interface LockoutDecision {
  locked: boolean
  nextAttempts: number
  nextLockedUntil: Date | null
}

export function evaluateLockout(
  failedAttempts: number,
  lockedUntil: Date | null,
  now: Date,
): LockoutDecision {
  const nowMs = now.getTime()

  if (lockedUntil && lockedUntil.getTime() > nowMs) {
    return { locked: true, nextAttempts: failedAttempts, nextLockedUntil: lockedUntil }
  }

  if (lockedUntil && lockedUntil.getTime() <= nowMs) {
    return { locked: false, nextAttempts: 1, nextLockedUntil: null }
  }

  const nextAttempts = failedAttempts + 1
  const nextLockedUntil =
    nextAttempts >= MAX_FAILED_ATTEMPTS ? new Date(nowMs + LOCKOUT_DURATION_MS) : null

  return { locked: false, nextAttempts, nextLockedUntil }
}

export async function checkRateLimit(event: H3Event, email: string): Promise<void> {
  const key = `rate:${email}`
  const now = new Date()

  const decision = await db.transaction(async (tx) => {
    await tx.insert(authSecurityState).values({ key }).onConflictDoNothing()

    const [row] = await tx
      .select({ count: authSecurityState.count, resetAt: authSecurityState.resetAt })
      .from(authSecurityState)
      .where(eq(authSecurityState.key, key))
      .for('update')

    const result = evaluateRateLimit(row ?? null, now)

    await tx
      .update(authSecurityState)
      .set({ count: result.nextCount, resetAt: result.nextResetAt, updatedAt: now })
      .where(eq(authSecurityState.key, key))

    return result
  })

  if (decision.allowed) {
    return
  }

  setResponseHeaders(event, {
    'Retry-After': String(decision.retryAfter),
    'RateLimit-Reset': String(Math.ceil(decision.nextResetAt.getTime() / 1000)),
    'RateLimit-Remaining': '0',
  })

  throw createError({
    status: 429,
    statusText: '429',
    message: JSON.stringify({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please try again later.',
    } satisfies ApiError),
  })
}

export async function checkAccountLockout(email: string): Promise<void> {
  const key = `lockout:${email}`

  const [row] = await db
    .select({ count: authSecurityState.count, lockedUntil: authSecurityState.lockedUntil })
    .from(authSecurityState)
    .where(eq(authSecurityState.key, key))
    .limit(1)

  if (!row) {
    return
  }

  const decision = evaluateLockout(row.count, row.lockedUntil, new Date())

  if (decision.locked) {
    sendAuthError(
      401,
      'account_locked',
      'Account locked due to too many failed attempts. Please try again later.',
    )
  }
}

export async function recordFailedAttempt(email: string): Promise<void> {
  const key = `lockout:${email}`
  const now = new Date()

  const decision = await db.transaction(async (tx) => {
    await tx.insert(authSecurityState).values({ key }).onConflictDoNothing()

    const [row] = await tx
      .select({ count: authSecurityState.count, lockedUntil: authSecurityState.lockedUntil })
      .from(authSecurityState)
      .where(eq(authSecurityState.key, key))
      .for('update')

    const result = evaluateLockout(row?.count ?? 0, row?.lockedUntil ?? null, now)

    await tx
      .update(authSecurityState)
      .set({ count: result.nextAttempts, lockedUntil: result.nextLockedUntil, updatedAt: now })
      .where(eq(authSecurityState.key, key))

    return result
  })

  if (decision.nextLockedUntil) {
    logger.warn('Account locked due to failed attempts', { email })
  }
}

export async function resetFailedAttempts(email: string): Promise<void> {
  const key = `lockout:${email}`
  await db.delete(authSecurityState).where(eq(authSecurityState.key, key))
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
