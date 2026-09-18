import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getCookie, getRequestHeader, setCookie, type H3Event } from 'h3'

const CSRF_COOKIE_NAME = 'merp-csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_SECRET = process.env.CSRF_SECRET || 'dev-csrf-secret-change-in-production'
const CSRF_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

function signToken(token: string): string {
  const hmac = createHmac('sha256', CSRF_SECRET)
  hmac.update(token)
  return hmac.digest('base64url')
}

function verifyToken(token: string, signature: string): boolean {
  const expected = signToken(token)
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

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

export function getCsrfToken(event: H3Event): string | null {
  const cookie = getCookie(event, CSRF_COOKIE_NAME)
  if (!cookie) return null
  const [token, signature] = cookie.split('.')
  if (!token || !signature) return null
  if (!verifyToken(token, signature)) return null
  return token
}

export function validateCsrf(event: H3Event): boolean {
  const cookieToken = getCsrfToken(event)
  if (!cookieToken) return false

  const headerToken = getRequestHeader(event, CSRF_HEADER_NAME)
  if (!headerToken) return false

  return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
}

const csrfExemptPaths = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/verify-email',
  '/api/auth/reset-password',
  '/api/auth/forget-password',
  '/api/health',
])

const csrfExemptPrefixes = ['/api/auth/reset-password/']

export function isCsrfExempt(path: string): boolean {
  if (csrfExemptPaths.has(path)) return true
  return csrfExemptPrefixes.some((prefix) => path.startsWith(prefix))
}

export function getOrCreateCsrfToken(event: H3Event): string {
  let token = getCsrfToken(event)
  if (!token) {
    token = generateToken()
    setCsrfCookie(event, token)
  }
  return token
}
