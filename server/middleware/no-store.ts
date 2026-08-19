import { defineEventHandler, getRequestURL, setResponseHeaders } from 'h3'

// AUD-17: PII nunca pode ser cacheada (proxies, CDNs, back-forward cache).
// Aplica a TODA rota /api/ — inclui health (inofensivo) e dispensa os
// handlers (me/export/invites.get) de repetir o header.
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname

  if (path.startsWith('/api/')) {
    setResponseHeaders(event, { 'cache-control': 'no-store, no-cache, must-revalidate' })
  }
})
