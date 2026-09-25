import { defineEventHandler, getRequestURL, getMethod } from 'h3'
import { isCsrfExempt, sendAuthError, validateCsrf } from '~~/server/utils/shared'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

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
