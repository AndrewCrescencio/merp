import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import postgres from 'postgres'
import { TEST_OWNER_URL, TEST_ADMIN_URL } from './test-urls'

const COMPOSE_FILE = resolve(__dirname, '../../docker-compose.yml')
const ROOT = resolve(__dirname, '../..')

function run(cmd: string, env: NodeJS.ProcessEnv = {}): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    stdio: 'pipe',
    cwd: ROOT,
    env: { ...process.env, ...env },
  }).trim()
}

function isDockerAvailable(): boolean {
  try {
    run('docker info')
    return true
  } catch {
    return false
  }
}

// Só o primeiro falhanço é logado: canConnect repete nas tentativas e um mural
// de erros iguais não diz mais nada. O código (28P01, ENOTFOUND, ECONNREFUSED,
// ...) diz logo se é senha, DNS ou servidor em baixo — antes era engolido.
let loggedFailure = false
function logConnectionFailure(url: string, error: unknown): void {
  if (loggedFailure) return
  loggedFailure = true
  const code = (error as { code?: string }).code ?? 'sem código'
  const safe = url.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:***@')
  console.warn(`[test-setup] ${safe} inacessível (${code}).`)
}

async function canConnect(url: string): Promise<boolean> {
  const sql = postgres(url, { connect_timeout: 3, onnotice: () => {} })
  try {
    await sql`select 1`
    return true
  } catch (error) {
    logConnectionFailure(url, error)
    return false
  } finally {
    await sql.end()
  }
}

// O servidor pode já estar de pé (compose, host ou CI) — nesse caso não há
// nada a iniciar. Só recorre ao compose quando ninguém responde, e um compose
// que falhe não derruba o setup desde que o servidor já responda.
async function ensureServer(): Promise<boolean> {
  if (await canConnect(TEST_ADMIN_URL)) {
    console.log('[test-setup] PostgreSQL já está acessível')
    return true
  }

  if (!isDockerAvailable()) {
    console.warn('[test-setup] Docker não disponível e sem PostgreSQL acessível')
    return false
  }

  console.log('[test-setup] A iniciar PostgreSQL...')
  try {
    run(`docker compose -f "${COMPOSE_FILE}" up -d postgres`)
  } catch (error) {
    console.warn(`[test-setup] docker compose up falhou: ${(error as Error).message}`)
    return false
  }

  for (let i = 0; i < 30; i++) {
    if (await canConnect(TEST_ADMIN_URL)) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function admin<T>(sql: string): Promise<T[]> {
  const client = postgres(TEST_ADMIN_URL, { connect_timeout: 3, onnotice: () => {} })
  try {
    return (await client.unsafe(sql)) as T[]
  } finally {
    await client.end()
  }
}

// True quando o journal ATUAL (drizzle/meta/_journal.json) já tem registro no
// banco: a migração guarda `created_at` = o `when` da entrada do journal, então
// a primeira entrada é o sinal estável do baseline — mesmo que migrações novas
// entrem depois. Sem isto um merp_test antigo falharia no migrate com
// "relation already exists".
async function baselineApplied(): Promise<boolean> {
  const journal = JSON.parse(
    readFileSync(resolve(__dirname, '../../drizzle/meta/_journal.json'), 'utf-8'),
  ) as { entries?: { when?: number }[] }
  const firstWhen = Number(journal.entries?.[0]?.when)
  if (!Number.isFinite(firstWhen)) return false

  // Tem de consultar o merp_test: a conexão `admin` aponta para o database
  // `postgres`, onde o drizzle nunca criou a tabela de controle.
  const client = postgres(TEST_OWNER_URL, { connect_timeout: 3, onnotice: () => {} })
  try {
    const [reg] = await client.unsafe(`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`)
    if (!reg?.t) return false

    const [row] = await client.unsafe(
      `SELECT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = ${firstWhen}) AS fresh`,
    )
    return Boolean(row?.fresh)
  } finally {
    await client.end()
  }
}

export async function setup(): Promise<void> {
  if (!(await ensureServer())) {
    console.warn('[test-setup] Sem acesso a PostgreSQL — a saltar setup da base de dados')
    process.env.DB_AVAILABLE = 'false'
    return
  }

  const [dbRow] = await admin<{ exists: boolean }>(
    `SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'merp_test') AS exists`,
  )
  if (!dbRow?.exists) {
    console.log('[test-setup] A criar base de dados merp_test...')
    // CREATE DATABASE não corre dentro de transação — comando isolado.
    await admin('CREATE DATABASE merp_test')
  } else if (!(await baselineApplied())) {
    // merp_test legado: criado antes do squash 0000–0028 → baseline, o journal
    // novo não tem hash nele e o migrate tentaria recriar tabelas que já existem.
    // merp_test é descartável por contrato → recria do zero.
    console.log('[test-setup] merp_test é anterior ao baseline — a recriar...')
    await admin('DROP DATABASE merp_test WITH (FORCE)')
    await admin('CREATE DATABASE merp_test')
  } else {
    console.log('[test-setup] Base de dados merp_test já existe')
  }

  console.log('[test-setup] A aplicar migrações (npm run db:migrate:full)...')
  // O comando é o MESMO da produção/CI: journal completo (funções+role 0000,
  // schema 0001, RLS/policies/grants 0002) mais a guarda scripts/verify-rls.ts
  // no fim. Push foi removido: sincronizava o schema sem as policies e divergia
  // do que db:migrate:full entrega. merp_test é descartável, mas o reset acima é
  // o que garante que o journal é a única fonte.
  run('npm run db:migrate:full', { DATABASE_URL: TEST_OWNER_URL })

  console.log('[test-setup] A definir senha de teste da role merp_app...')
  // AUD-19: a migração 0000 cria a role merp_app SEM senha (credencial é
  // segredo de operação e não pode estar em migração); este passo define a
  // SENHA de teste. A role já existe — a migração acabou de correr.
  await admin(`ALTER ROLE merp_app WITH PASSWORD 'merp_app'`)

  // Verificado empiricamente: o globalSetup corre ANTES dos workers arrancarem
  // e estes herdam o process.env por fork — o DB_AVAILABLE escrito aqui chega aos
  // testes (sem DB_AVAILABLE no shell, os 113 testes de integração correram).
  process.env.DB_AVAILABLE = 'true'
}
