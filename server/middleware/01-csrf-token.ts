import { defineEventHandler, getRequestURL, getMethod, setHeader } from 'h3'
import { getOrCreateCsrfToken, isCsrfExempt } from '~~/server/utils/shared/csrf'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  const method = getMethod(event)

  if (!path.startsWith('/api/')) return
  if (isCsrfExempt(path)) return
  if (!safeMethods.has(method)) return

  const token = getOrCreateCsrfToken(event)
  // Devolve o token no header da resposta para o frontend captar
  // (o cookie é HttpOnly, portanto inacessível via document.cookie).
  setHeader(event, 'x-csrf-token', token)
})
