import { defineEventHandler, getRequestURL, setResponseHeaders } from 'h3'

// AUD-17: PII nunca pode ser cacheada (proxies, CDNs, back-forward cache).
// Aplica a TODA rota /api/ — inclui health (inofensivo) e dispensa os
// handlers (me/export/invites.get) de repetir o header.
// AUD-26: o prefixo "00-" garante que este middleware roda ANTES do auth.ts
// (ordem alfabética do Nitro) — 401/429 lançados pelo auth não escapam do
// no-store (nenhum PII nesses corpos hoje, mas a regra fica universal).
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname

  if (path.startsWith('/api/')) {
    setResponseHeaders(event, { 'cache-control': 'no-store, no-cache, must-revalidate' })
  }
})
