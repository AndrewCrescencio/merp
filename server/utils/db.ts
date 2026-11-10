import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { Pool } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from './schema'

/**
 * Tipo comum aos dois drivers. Repositórios, withTenant e better-auth
 * tipam contra isto — ninguém depende do driver concreto.
 */
// o HKT de resultado é driver-specific; este tipo o abstracta (postgres-js vs neon-serverless).
export type Db = PgDatabase<any, typeof schema> // eslint-disable-line @typescript-eslint/no-explicit-any

export type DbDriver = 'postgres-js' | 'neon-serverless'

const SUPPORTED_DRIVERS: DbDriver[] = ['postgres-js', 'neon-serverless']
const DEFAULT_DRIVER: DbDriver = 'postgres-js'

// Neon via PgBouncer (modo transação) e serverless via WebSocket.
// Ambos são dependências diretas (item de revisão #3): importados estaticamente
// para que o Nitro os rastreie e os inclua no .output (um import() com
// especificador em variável não era rastreado e ficava como external quebrado).

/**
 * Único ponto de leitura de DB_DRIVER. Valor inválido lança erro claro no boot;
 * default é postgres-js.
 */
export function parseDbDriver(value: string | undefined): DbDriver {
  const driver = (value ?? DEFAULT_DRIVER) as DbDriver
  if (!SUPPORTED_DRIVERS.includes(driver)) {
    throw new Error(
      `DB_DRIVER inválida "${driver}". Valores suportados: ${SUPPORTED_DRIVERS.join(', ')}.`,
    )
  }
  return driver
}

// em produção sslmode=require, respeitando sslmode já fixo na URL.
// Dev local (postgres docker sem TLS) fica inalterado.
// (postgres-js mapeia sslmode p/ a opção ssl.)
const SslUpgrade = new Set(['disable', 'no', 'allow', 'prefer'])

export function withRequiredSsl(url: string): string {
  if (process.env.NODE_ENV !== 'production') return url
  const parsed = new URL(url)
  const current = parsed.searchParams.get('sslmode')
  if (current === null || SslUpgrade.has(current)) {
    parsed.searchParams.set('sslmode', 'require')
  }
  return parsed.toString()
}

// Parâmetros que o Neon às vezes envia na URL e o postgres-js não entende.
// Removidos silenciosamente: a URL nunca é logada nem passa por aqui crua.
const UnsupportedUrlParams = new Set(['channel_binding'])

function stripUnsupportedUrlParams(url: string): { url: string; stripped: string[] } {
  const parsed = new URL(url)
  const stripped: string[] = []
  for (const param of UnsupportedUrlParams) {
    if (parsed.searchParams.has(param)) {
      parsed.searchParams.delete(param)
      stripped.push(param)
    }
  }
  return { url: parsed.toString(), stripped }
}

function isPooledUrl(url: string): boolean {
  return new URL(url).hostname.includes('-pooler')
}

function sslActive(url: string): boolean {
  return new URL(url).searchParams.get('sslmode') === 'require'
}

async function createPostgresJsDb(url: string): Promise<Db> {
  const resolvedUrl = withRequiredSsl(url)
  const { url: cleanUrl, stripped } = stripUnsupportedUrlParams(resolvedUrl)

  const config: Parameters<typeof postgres>[1] = {}
  if (isPooledUrl(cleanUrl)) {
    // PgBouncer em modo transação: prepared statements não sobrevivem ao fim
    // da transação — desligar prepare é obrigatório para conexões pooled.
    config.prepare = false
  }

  const sql = postgres(cleanUrl, config)
  const database = drizzle(sql, { schema })
  console.info(
    `[db] inicializado (postgres-js) ssl=${sslActive(cleanUrl)} pooled=${isPooledUrl(cleanUrl)}${
      stripped.length > 0 ? ` parametrosIgnorados=${stripped.join(', ')}` : ''
    }`,
  )
  return database as Db
}

async function createNeonServerlessDb(url: string): Promise<Db> {
  const resolvedUrl = withRequiredSsl(url)
  const { url: cleanUrl, stripped } = stripUnsupportedUrlParams(resolvedUrl)

  // Node 21+ tem WebSocket global, então não é preciso ligar `ws` via
  // neonConfig.webSocketConstructor (ver item de revisão #3-a).
  const pool = new Pool({ connectionString: cleanUrl })
  const database = drizzleNeon(pool, { schema })
  console.info(
    `[db] inicializado (neon-serverless) ssl=${sslActive(cleanUrl)} pooled=${isPooledUrl(cleanUrl)}${
      stripped.length > 0 ? ` parametrosIgnorados=${stripped.join(', ')}` : ''
    }`,
  )
  return database as Db
}

/**
 * Cria a instância Drizzle para o driver informado. A conexão é preguiçosa:
 * nada é aberto até a primeira query, portanto a fábrica é testável sem banco real.
 *
 * Conecta SEMPRE via APP_DATABASE_URL (role merp_app, RLS ativa). DATABASE_URL
 * (role owner) é só de migração/CI — nunca é lida aqui e nunca entra no
 * container/função da app.
 */
export async function createDb(driver: string): Promise<Db> {
  const d = parseDbDriver(driver)

  const url = process.env.APP_DATABASE_URL
  if (!url) {
    throw new Error(
      'APP_DATABASE_URL não definida — defina a URL da role merp_app antes de iniciar o app.',
    )
  }
  // Sem fallback para DATABASE_URL: ela pertence à role owner (migrações).

  return d === 'postgres-js' ? createPostgresJsDb(url) : createNeonServerlessDb(url)
}

// Driver lido em um único ponto (parseDbDriver); default postgres-js.
const driver = parseDbDriver(process.env.DB_DRIVER)

export const db = await createDb(driver)

// createOwnerDbForSetupOnly agora vive em tests/support/owner-db.ts (só
// testes/scripts). db.ts mantém apenas a instância `db` da role merp_app.
