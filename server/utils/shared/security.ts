import type { H3Event } from 'h3'
import { createError, setResponseHeaders } from 'h3'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { authSecurityState } from '../schema'
import { logger } from '#shared/logger'
import { sendAuthError } from './errors'
import type { ApiError } from './errors'
import { getClientIp } from './ip'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// AUD-14: tetos de tamanho de input — sem eles, emails gigantes viram chaves
// `rate:`/`lockout:` no auth_security_state (PK text; índice btree quebra em
// ~2704 bytes → 54000 → 503) e name/consent/password viram colunas de PII
// gigantes ou custo de scrypt desproporcional. Valores do RFC 5321 (email) e
// OWASP (password ≤ 128, name ≤ 120).
export const MAX_EMAIL_LENGTH = 254
export const MAX_PASSWORD_LENGTH = 128
export const MAX_NAME_LENGTH = 120
export const MAX_CONSENT_VERSION_LENGTH = 50
export const MAX_SEARCH_QUERY_LENGTH = 100
// AUD-21: tetos de empresa — PII corporativa não vira coluna desproporcional
// (CNPJ é identificador fixo de 14 dígitos; teto 30 cobre formatos com máscara).
export const MAX_COMPANY_NAME_LENGTH = 200
export const MAX_CNPJ_LENGTH = 30
export const MAX_RAZAO_SOCIAL_LENGTH = 200

// AUD-22: validação mínima de formato — o antigo email.includes('@') aceitava
// 'a@b' e 'a@' como válidos. Este regex não é RFC 5321 completo (de propósito);
// é a linha de frente barata antes do costoso check do better-auth.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Validação de CNPJ pelos dígitos verificadores (Receita Federal).
// Aceita com ou sem máscara; exige 14 dígitos, rejeita sequências repetidas
// ('00000000000000') e confere os dois dígitos pelo módulo 11.
export function isValidCnpj(input: string): boolean {
  const digits = input.replace(/\D/g, '')
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false

  const checkDigit = (base: string, weights: number[]): number => {
    let sum = 0
    for (let i = 0; i < weights.length; i++) sum += Number(base[i]) * weights[i]
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  return (
    checkDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[12]) &&
    checkDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[13])
  )
}

// OWASP Authentication Cheat Sheet / NIST SP 800-63B: senhas NOVAS são
// comparadas contra valores comuns/comprometidos (deny-list top de leaks).
// Aplicada só em register/reset-password — login nunca rejeita (conta
// existente com senha fraca não pode ser bloqueada sem DB de breaches).
export const WEAK_PASSWORD_LIST = new Set([
  'password',
  '12345678',
  '123456789',
  'qwerty',
  'abc123',
  'password1',
  'password123',
  'iloveyou',
  'admin',
  'welcome',
  'monkey',
  'letmein',
  '123123',
  'dragon',
  'football',
])

export function isWeakPassword(password: string): boolean {
  return WEAK_PASSWORD_LIST.has(password.toLowerCase())
}

const RATE_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_EMAIL = 5
const MAX_REQUESTS_PER_IP = 20
// AUD-16: teto por usuário nas rotas autenticadas — o nginx limita por IP
// (camada grossa), mas é contornável com IPs rotativos; esta camada trava
// o martelar de endpoints protegidos mesmo com N contas/IPs.
export const MAX_REQUESTS_PER_USER = 60
// AUD-02: lockout em duas camadas — por (email+IP) no limiar da FR-016 (10) e
// global por email em 50: brute-force distribuído (rotação de IPs) continua
// travado, e o DoS custa 50 tentativas (≥10min a 5 req/min da FR-010) por lock.
const MAX_FAILED_ATTEMPTS = 10
const MAX_GLOBAL_FAILED_ATTEMPTS = 50
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
  maxAttempts: number = MAX_FAILED_ATTEMPTS,
): LockoutDecision {
  const nowMs = now.getTime()

  if (lockedUntil && lockedUntil.getTime() > nowMs) {
    return { locked: true, nextAttempts: failedAttempts, nextLockedUntil: lockedUntil }
  }

  if (lockedUntil && lockedUntil.getTime() <= nowMs) {
    return { locked: false, nextAttempts: 1, nextLockedUntil: null }
  }

  const nextAttempts = failedAttempts + 1
  const nextLockedUntil = nextAttempts >= maxAttempts ? new Date(nowMs + LOCKOUT_DURATION_MS) : null

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

// FR-010 + hardening: sliding window per IP (20/min). Roda ANTES do
// readBody nas rotas públicas: bloqueia corpos grandes sem parseá-los.
/** Sliding-window rate limit per IP (20/min). No-op without a socket IP. Throws 429 with `Retry-After` headers. */
export async function checkIpRateLimit(event: H3Event): Promise<void> {
  let ip: string | null
  try {
    ip = getClientIp(event)
  } catch {
    // Sem socket (ex.: eventos de teste) — sem limite por IP.
    ip = null
  }

  if (ip) {
    await checkRateLimitKey(event, `rate:ip:${ip}`, MAX_REQUESTS_PER_IP)
  }
}

// FR-010: sliding window per email (5/min), so brute force rotating emails
// from one IP is also throttled (em conjunto com checkIpRateLimit).
/** Sliding-window rate limit per email (5/min). Throws 429. Call after size caps (AUD-14). */
export async function checkEmailRateLimit(event: H3Event, email: string): Promise<void> {
  await checkRateLimitKey(event, `rate:${email}`, MAX_REQUESTS_PER_EMAIL)
}

// AUD-16: sliding window per user (60/min) nas rotas autenticadas — cobre o
// que o rate limit por IP do nginx/app não vê (IPs rotativos, NAT).
/** Sliding-window rate limit per authenticated user (60/min). Throws 429. */
export async function checkUserRateLimit(event: H3Event, userId: string): Promise<void> {
  await checkRateLimitKey(event, `rate:user:${userId}`, MAX_REQUESTS_PER_USER)
}

// AUD-02: chave por (email + IP) — 10 falhas de um IP não bloqueiam a vítima
// (IP diferente) — e chave global por email com limiar maior (50) para
// brute-force distribuído com rotação de IPs.
function pairLockoutKey(email: string, ip?: string | null): string | null {
  return ip ? `lockout:${email}:${ip}` : null
}

async function readLockout(key: string, now: Date): Promise<LockoutDecision> {
  // FOR UPDATE + transação: evita TOCTOU entre duas requisições concorrentes
  // que poderiam ambas ler a contagem antes do lockout ser atingido.
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ count: authSecurityState.count, lockedUntil: authSecurityState.lockedUntil })
      .from(authSecurityState)
      .where(eq(authSecurityState.key, key))
      .for('update')
      .limit(1)

    return evaluateLockout(row?.count ?? 0, row?.lockedUntil ?? null, now)
  })
}

async function incrementLockout(
  key: string,
  now: Date,
  maxAttempts: number,
): Promise<LockoutDecision> {
  return db.transaction(async (tx) => {
    await tx.insert(authSecurityState).values({ key }).onConflictDoNothing()

    const [row] = await tx
      .select({ count: authSecurityState.count, lockedUntil: authSecurityState.lockedUntil })
      .from(authSecurityState)
      .where(eq(authSecurityState.key, key))
      .for('update')

    const result = evaluateLockout(row?.count ?? 0, row?.lockedUntil ?? null, now, maxAttempts)

    await tx
      .update(authSecurityState)
      .set({ count: result.nextAttempts, lockedUntil: result.nextLockedUntil, updatedAt: now })
      .where(eq(authSecurityState.key, key))

    return result
  })
}

/** Throws generic 401 `account_locked` when the (email) or (email+IP) lockout is active. */
export async function checkAccountLockout(email: string, ip?: string | null): Promise<void> {
  const now = new Date()
  const keys = [`lockout:${email}`]
  const pairKey = pairLockoutKey(email, ip)
  if (pairKey) keys.push(pairKey)

  for (const key of keys) {
    const decision = await readLockout(key, now)
    if (decision.locked) {
      sendAuthError(
        401,
        'account_locked',
        'Account locked due to too many failed attempts. Please try again later.',
      )
    }
  }
}

/** Records a failed login on both lockout tiers (global 50 + pair 10). Call only for `invalid_credentials`. */
export async function recordFailedAttempt(email: string, ip?: string | null): Promise<void> {
  const now = new Date()

  const globalDecision = await incrementLockout(`lockout:${email}`, now, MAX_GLOBAL_FAILED_ATTEMPTS)
  if (globalDecision.nextLockedUntil) {
    logger.warn('Account locked for all IPs (global tier)', { email })
  }

  const pairKey = pairLockoutKey(email, ip)
  if (pairKey) {
    const pairDecision = await incrementLockout(pairKey, now, MAX_FAILED_ATTEMPTS)
    if (pairDecision.nextLockedUntil) {
      logger.warn('Account locked for IP (pair tier)', { email, ip })
    }
  }
}

/** Clears both lockout tiers after a successful login (best-effort — callers must not fail the login on error). */
export async function resetFailedAttempts(email: string, ip?: string | null): Promise<void> {
  const keys = [`lockout:${email}`]
  const pairKey = pairLockoutKey(email, ip)
  if (pairKey) keys.push(pairKey)

  await db.delete(authSecurityState).where(inArray(authSecurityState.key, keys))
}
