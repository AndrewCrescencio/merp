import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getCookie, getRequestHeader, setCookie, type H3Event } from 'h3'
import { CSRF_COOKIE_NAME } from '#shared/app'

const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

function getCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('CSRF_SECRET é obrigatório em produção. Gere um valor de >= 32 caracteres.')
    }
    return secret
  }
  return secret || 'test-secret-do-not-use-in-production'
}

// Ensures the returned buffer has the same length as the expected one,
// preventing timingSafeEqual from receiving mismatched-length buffers.
function safeTimingEqual(expected: Buffer, actual: Buffer): boolean {
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

function signToken(token: string): string {
  const hmac = createHmac('sha256', getCsrfSecret())
  hmac.update(token)
  return hmac.digest('base64url')
}

function verifyToken(token: string, signature: string): boolean {
  const expected = signToken(token)
  return safeTimingEqual(Buffer.from(expected), Buffer.from(signature))
}

/**
 * Sets the CSRF cookie with the given token.
 * The cookie is HttpOnly to prevent JavaScript read access via document.cookie.
 * The actual token value should be fetched by the frontend via the
 * dedicated `GET /api/csrf-token` endpoint (see middleware 01-csrf-token).
 */
export function setCsrfCookie(event: H3Event, token: string): void {
  const signature = signToken(token)
  const value = `${token}.${signature}`
  setCookie(event, CSRF_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: CSRF_COOKIE_MAX_AGE,
    path: '/',
  })
}

function getCsrfToken(event: H3Event): string | null {
  const cookie = getCookie(event, CSRF_COOKIE_NAME)
  if (!cookie) return null
  const [token, signature] = cookie.split('.')
  if (!token || !signature) return null
  if (!verifyToken(token, signature)) return null
  return token
}

/**
 * Validates CSRF by comparing the cookie token (base64url HMAC-signed)
 * with the token sent in the `x-csrf-token` request header.
 * Both tokens must have the same length for constant-time comparison.
 */
export function validateCsrf(event: H3Event): boolean {
  const cookieToken = getCsrfToken(event)
  if (!cookieToken) return false

  const headerToken = getRequestHeader(event, CSRF_HEADER_NAME)
  if (!headerToken) return false

  return safeTimingEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
}

const csrfExemptPaths = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/email/verification/confirm',
  '/api/auth/password/reset',
  '/api/auth/password/forgot',
  // reenvio é público (sem sessão) — CSRF aqui não protege nada
  // (o atacante pode chamar direto); rate limit por IP/email é a defesa.
  '/api/auth/email/verification',
  '/api/health/live',
  '/api/health/ready',
])

export function isCsrfExempt(path: string): boolean {
  return csrfExemptPaths.has(path)
}

/**
 * Ensures a CSRF token exists for the current request (reads cookie,
 * generates one if absent) and returns it in the response body so the
 * frontend can capture it and send it back in `x-csrf-token` headers.
 * Called by the 01-csrf-token middleware for safe methods.
 */
export function getOrCreateCsrfToken(event: H3Event): string {
  let token = getCsrfToken(event)
  if (!token) {
    token = generateToken()
    setCsrfCookie(event, token)
  }
  return token
}
