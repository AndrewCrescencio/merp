import { createHash } from 'node:crypto'
import { getResponseHeader } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'

// `script-src 'self'` bloqueia os <script> inline que o próprio Nuxt injeta no
// SSR (window.__NUXT__.config e, em dev, as métricas do devtools). O conteúdo
// muda por build/env, então o hash é calculado por resposta e acrescentado ao
// script-src — sem 'unsafe-inline'. Scripts com src e blocos JSON (payload)
// não executam e ficam de fora.
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const HAS_SRC = /\bsrc\s*=/i
const DATA_TYPE = /\btype\s*=\s*["']?application\/(?:ld\+)?json\b/i

export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>()
  for (const [, attrs = '', body = ''] of html.matchAll(SCRIPT_TAG)) {
    if (!body || HAS_SRC.test(attrs) || DATA_TYPE.test(attrs)) continue
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
  }
  return [...hashes]
}

export function addScriptHashes(csp: string, hashes: string[]): string {
  if (hashes.length === 0) return csp
  return csp.replace(
    /(^|;)(\s*script-src\b[^;]*)/i,
    (_, sep: string, directive: string) => `${sep}${directive.trimEnd()} ${hashes.join(' ')}`,
  )
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, { event }) => {
    if (typeof response.body !== 'string') return
    const csp =
      response.headers?.['content-security-policy'] ??
      getResponseHeader(event, 'content-security-policy')
    if (typeof csp !== 'string') return
    const hashes = inlineScriptHashes(response.body)
    if (hashes.length === 0) return
    response.headers ??= {}
    response.headers['content-security-policy'] = addScriptHashes(csp, hashes)
  })
})
