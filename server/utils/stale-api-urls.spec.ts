import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// URLs de API que saíram do backend na migração REST (R1/R5) e não podem
// reaparecer. Um literal antigo é só string — não quebra import nem typecheck,
// só runtime (foi exatamente o bug do publicRoutes), então um teste é a única
// barreira automática. O lookahead (?![\w/.]) ignora paths de arquivo
// (server/api/orders/…) e casa só literais de rota ('/api/orders').
const STALE = [
  '/api/auth/me',
  '/api/auth/deactivate',
  '/api/auth/consent',
  '/api/auth/export',
  '/api/auth/companies',
  '/api/auth/invite',
  '/api/auth/invites',
  '/api/auth/verify-email',
  '/api/auth/reset-password',
  '/api/auth/forget-password',
  '/api/auth/send-verification-email',
  '/api/orders',
  '/api/print',
  '/api/restaurant',
  '/api/metrics',
  // health foi dividido em /live e /ready; o '/' seguinte já afasta o falso
  // positivo sobre os paths novos.
  '/api/health',
]

const SELF = fileURLToPath(import.meta.url)
// app/ fica de fora até a migração do front landar (trilha separada): o front
// commitado ainda chama os paths antigos e o teste falharia no próprio commit.
// Re-incluir 'app' junto com a migração de app/ — é ela que passa a garantir
// "CI verde só com o front chamando paths que existem".
const ROOTS = ['server', 'shared'].map((d) => join(process.cwd(), d))

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.vue')) out.push(full)
  }
  return out
}

describe('nenhuma URL de API antiga (migração REST)', () => {
  it('server/ e shared/ não referenciam nenhum path migrado ou removido', () => {
    const files = ROOTS.filter((r) => existsSync(r)).flatMap((r) => walk(r))
    const hits: string[] = []

    for (const file of files) {
      if (file === SELF) continue
      const src = readFileSync(file, 'utf8')
      for (const url of STALE) {
        const re = new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w/.])', 'g')
        if (re.test(src)) hits.push(`${file.replace(process.cwd() + sep, '')} → ${url}`)
      }
    }

    expect(hits).toEqual([])
  })
})
