import { createHash } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'

import { addScriptHashes, inlineScriptHashes } from './csp-inline-scripts'

vi.mock('nitropack/runtime', () => ({
  defineNitroPlugin: (fn: any) => fn,
}))

const sha = (body: string) =>
  `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`

describe('inlineScriptHashes', () => {
  it('hashes only executable inline scripts', () => {
    const config = 'window.__NUXT__={};window.__NUXT__.config={public:{}}'
    const html = [
      '<script type="module" src="/_nuxt/entry.js" crossorigin></script>',
      `<script>${config}</script>`,
      '<script type="application/json" id="__NUXT_DATA__">[1]</script>',
      '<script></script>',
    ].join('')
    expect(inlineScriptHashes(html)).toEqual([sha(config)])
  })

  it('uses the CSP hash format (base64 sha256 of the exact script text)', () => {
    expect(inlineScriptHashes('<script>alert(1)</script>')).toEqual([
      "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='",
    ])
  })

  it('dedupes identical scripts', () => {
    expect(inlineScriptHashes('<script>a()</script><script>a()</script>')).toHaveLength(1)
  })
})

describe('addScriptHashes', () => {
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"

  it('appends hashes to script-src only', () => {
    expect(addScriptHashes(csp, ["'sha256-a'", "'sha256-b'"])).toBe(
      "default-src 'self'; script-src 'self' 'sha256-a' 'sha256-b'; style-src 'self' 'unsafe-inline';",
    )
  })

  it('keeps the policy untouched without hashes or script-src', () => {
    expect(addScriptHashes(csp, [])).toBe(csp)
    expect(addScriptHashes("default-src 'self'", ["'sha256-a'"])).toBe("default-src 'self'")
  })
})
