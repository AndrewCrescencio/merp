import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Guarda de convenção das rotas REST (R1/R2/R5) — falha o CI se uma rota nova
// quebrar o padrão. Checa só a ÁRVORE de arquivos (forma), não o comportamento:
// R3/R4/R8 (sem efeito colateral em GET, transição=POST verb, status codes) são
// de runtime e vivem nos specs de handler.
const API_ROOT = join(process.cwd(), 'server', 'api')

// Segmento kebab-case: minúsculas + dígitos + hífen. Proíbe snake_case e camelCase.
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
// Param de rota nomeado: [recursoId] — R2 proíbe o genérico [id].
const PARAM = /^\[[a-z][a-zA-Z0-9]*Id\]$/
const METHODS = ['get', 'post', 'patch', 'delete', 'head', 'options']
// Nome de arquivo: <index|ação-kebab>.<método>.ts (ex.: index.get.ts, close.post.ts).
const FILENAME = new RegExp(`^(${KEBAB.source.slice(1, -1)})\\.(${METHODS.join('|')})\\.ts$`)

type Violation = { file: string; rule: string; detail: string }

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

const violations: Violation[] = []

for (const file of walk(API_ROOT)) {
  const segments = relative(API_ROOT, file).split(sep)
  const filename = segments.pop() ?? ''

  if (!FILENAME.test(filename)) {
    violations.push({
      file: segments.concat(filename).join('/'),
      rule: 'R2 arquivo',
      detail: `nome inválido: ${filename} (esperado <index|ação>.<método>.ts)`,
    })
  }

  // R1: prefixo /api/v1 obrigatório para rota nova; auth/ e health/ são as
  // duas exceções (contrato próprio, §9). Sem este check o R5 abaixo é vazio —
  // ele só roda dentro de v1/, então server/api/products/ passaria inteiro.
  if (!['v1', 'auth', 'health'].includes(segments[0] ?? '')) {
    const relPath = segments.concat(filename).join('/')
    violations.push({
      file: relPath,
      rule: 'R1 prefixo',
      detail: `rota fora de /api/v1 (permitidos: v1, auth, health): ${relPath}`,
    })
  }

  for (const seg of segments) {
    if (seg.startsWith('[')) {
      if (!PARAM.test(seg)) {
        violations.push({
          file: relative(API_ROOT, file),
          rule: 'R2 param',
          detail: `param genérico: ${seg} (use [recursoId], ex.: [orderId])`,
        })
      }
    } else if (!KEBAB.test(seg)) {
      violations.push({
        file: relative(API_ROOT, file),
        rule: 'R1 kebab-case',
        detail: `segmento não-kebab: ${seg}`,
      })
    }
  }

  // R2: a chave de getRouterParam(event,'X') precisa casar com o dir [X] da rota.
  // Renomear o dir sem atualizar a chave devolve undefined e falha só em runtime
  // (não quebra import nem typecheck) — guarda estática contra esse bug exato.
  const src = readFileSync(file, 'utf8')
  for (const [, key] of src.matchAll(/getRouterParam\(\s*event\s*,\s*['"]([^'"]+)['"]/g)) {
    if (!segments.includes(`[${key}]`)) {
      violations.push({
        file: relative(API_ROOT, file),
        rule: 'R2 param-key',
        detail: `getRouterParam('${key}') não corresponde a nenhum dir [${key}] da rota`,
      })
    }
  }

  // R5: todo dir de param precisa ser LIDO pelo handler. [companyId] é resolvido
  // pelo middleware tenant (requireTenant); os demais têm de passar por
  // getRouterParam. Sem isso o param fica decorativo e o handler lê o id do
  // body — viola R1/R5 e só quebra em runtime.
  for (const seg of segments) {
    if (!seg.startsWith('[') || seg === '[companyId]') continue
    const key = seg.slice(1, -1)
    if (!new RegExp(`getRouterParam\\(\\s*event\\s*,\\s*['"]${key}['"]`).test(src)) {
      violations.push({
        file: relative(API_ROOT, file),
        rule: 'R5 param lido',
        detail: `dir [${key}] existe mas o handler nunca chama getRouterParam(event, '${key}')`,
      })
    }
  }

  // R5: tudo em /v1 precisa de escopo de tenant no path — companies/{companyId}/…
  // ou o escopo-próprio me/… . Exceção: a raiz da coleção companies (listar as
  // empresas do usuário / criar empresa) é pré-tenant por natureza. auth/ e
  // health/ ficam fora do v1 (§9 constitution).
  if (segments[0] === 'v1') {
    const isCompaniesRoot = segments[1] === 'companies' && segments.length === 2
    const scoped =
      segments[1] === 'me' ||
      isCompaniesRoot ||
      (segments[1] === 'companies' && segments[2] === '[companyId]')
    if (!scoped) {
      violations.push({
        file: relative(API_ROOT, file),
        rule: 'R5 tenant',
        detail: `rota /v1 sem tenant: ${segments.join('/')}`,
      })
    }
  }
}

if (violations.length > 0) {
  console.error(`check-routes: ${violations.length} violação(ões) de convenção REST:`)
  for (const v of violations) console.error(`  [${v.rule}] ${v.file} — ${v.detail}`)
  process.exit(1)
}

console.log(`check-routes: OK — ${walk(API_ROOT).length} rotas seguem R1/R2/R5.`)
