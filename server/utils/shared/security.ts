import type { H3Event } from 'h3'
import { createError, setResponseHeaders } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { authSecurityState } from '../schema'
import { logger } from '#shared/logger'
import { sendAuthError } from './errors'
import type { ApiError } from './errors'
import { getClientIp } from './ip'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const RATE_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_EMAIL = 5
const MAX_REQUESTS_PER_IP = 20
const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_DURATION_MS = 30 * 60 * 1000

export interface RateLimitEntry {
  window: string[] | null
}

export interface RateLimitDecision {
  allowed: boolean
  retryAfter?: number
  nextWindow: string[]
}

// FR-010: janela deslizante — contam apenas requests dentro de
// RATE_WINDOW_MS; sem o salto de janela do fixed-window (burst no fim +
// início de janelas adjacentes).
export function evaluateRateLimit(
  entry: RateLimitEntry | null,
  now: Date,
  maxRequests: number = MAX_REQUESTS_PER_EMAIL,
): RateLimitDecision {
  const nowMs = now.getTime()
  const windowStartMs = nowMs - RATE_WINDOW_MS

  const recent = (entry?.window ?? []).filter((hit) => Date.parse(hit) > windowStartMs)

  if (recent.length >= maxRequests) {
    const oldest = recent[0]
    return {
      allowed: false,
      retryAfter: Math.ceil((Date.parse(oldest) + RATE_WINDOW_MS - nowMs) / 1000),
      nextWindow: recent,
    }
  }

  return { allowed: true, nextWindow: [...recent, now.toISOString()] }
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

async function checkRateLimitKey(event: H3Event, key: string, maxRequests: number): Promise<void> {
  const now = new Date()

  const decision = await db.transaction(async (tx) => {
    await tx.insert(authSecurityState).values({ key }).onConflictDoNothing()

    const [row] = await tx
      .select({ window: authSecurityState.window })
      .from(authSecurityState)
      .where(eq(authSecurityState.key, key))
      .for('update')

    const result = evaluateRateLimit(row ?? null, now, maxRequests)

    await tx
      .update(authSecurityState)
      .set({ window: result.nextWindow, updatedAt: now })
      .where(eq(authSecurityState.key, key))

    return result
  })

  if (decision.allowed) {
    return
  }

  setResponseHeaders(event, {
    'Retry-After': String(decision.retryAfter),
    'RateLimit-Reset': String(
      Math.ceil((Date.parse(decision.nextWindow[0]) + RATE_WINDOW_MS) / 1000),
    ),
    'RateLimit-Remaining': '0',
  })

  throw createError({
    status: 429,
    statusText: '429',
    message: JSON.stringify({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Try again later.',
      retryAfter: decision.retryAfter,
    } satisfies ApiError & { retryAfter: number }),
  })
}

// FR-010 + hardening: sliding window per email (5/min) AND per IP (20/min),
// so brute force rotating emails from one IP is also throttled.
export async function checkRateLimit(event: H3Event, email: string): Promise<void> {
  await checkRateLimitKey(event, `rate:${email}`, MAX_REQUESTS_PER_EMAIL)

  let ip: string | null = null
  try {
    ip = getClientIp(event)
  } catch {
    // Sem socket (ex.: eventos de teste) — sem limite por IP, apenas por email.
    ip = null
  }

  if (ip) {
    await checkRateLimitKey(event, `rate:ip:${ip}`, MAX_REQUESTS_PER_IP)
  }
}

export async function checkAccountLockout(email: string): Promise<void> {
  const key = `lockout:${email}`
  const now = new Date()

  // FOR UPDATE + transação: evita TOCTOU entre duas requisições concorrentes
  // que poderiam ambas ler a contagem antes do lockout ser atingido.
  const decision = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ count: authSecurityState.count, lockedUntil: authSecurityState.lockedUntil })
      .from(authSecurityState)
      .where(eq(authSecurityState.key, key))
      .for('update')
      .limit(1)

    return evaluateLockout(row?.count ?? 0, row?.lockedUntil ?? null, now)
  })

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
