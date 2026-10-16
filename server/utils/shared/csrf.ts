import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getCookie, getRequestHeader, setCookie, type H3Event } from 'h3'

const CSRF_COOKIE_NAME = 'merp-csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

function getCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET
  if (process.env.NODE_ENV === 'production') {
    // A mensagem já prometia >= 32 mas só a presença era checada: um segredo
    // curto era aceito em silêncio e passava a assinar tokens CSRF. Agora a
    // regra é a mesma de BETTER_AUTH_SECRET (validate-env.ts, AUD-24).
    if (!secret || secret.length < 32) {
      throw new Error('CSRF_SECRET é obrigatório em produção. Gere um valor de >= 32 caracteres.')
    }
    return secret
  }
  return secret || 'test-secret-do-not-use-in-production'
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
  '/api/auth/email/verification/confirm',
  '/api/auth/password/reset',
  '/api/auth/password/forgot',
  // FR-029: reenvio é público (sem sessão) — CSRF aqui não protege nada
  // (o atacante pode chamar direto); rate limit por IP/email é a defesa.
  '/api/auth/email/verification',
  '/api/health/live',
  '/api/health/ready',
])

export function isCsrfExempt(path: string): boolean {
  return csrfExemptPaths.has(path)
}

export function getOrCreateCsrfToken(event: H3Event): string {
  let token = getCsrfToken(event)
  if (!token) {
    token = generateToken()
    setCsrfCookie(event, token)
  }
  return token
}
