import { defineEventHandler, getRequestURL, getMethod } from 'h3'
import { validateCsrf, CSRF_HEADER_NAME_PUBLIC } from '~~/server/utils/shared/csrf'
import { sendAuthError } from '~~/server/utils/shared/errors'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

const csrfExemptPaths = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/verify-email',
  '/api/auth/reset-password',
  '/api/auth/forget-password',
  '/api/health',
])

const csrfExemptPrefixes = ['/api/auth/reset-password/']

function isCsrfExempt(path: string): boolean {
  if (csrfExemptPaths.has(path)) return true
  return csrfExemptPrefixes.some((prefix) => path.startsWith(prefix))
}

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  const method = getMethod(event)

  if (!path.startsWith('/api/')) return
  if (isCsrfExempt(path)) return
  if (safeMethods.has(method)) return

  if (!validateCsrf(event)) {
    sendAuthError(403, 'csrf_invalid', 'Invalid CSRF token. Please refresh the page and try again.')
  }
})
