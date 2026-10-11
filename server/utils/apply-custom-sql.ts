import { readdirSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRIZZLE_DIR = resolve(__dirname, '../../drizzle')

function toIdempotentSql(raw: string): string {
  return raw
    .replace(/--> statement-breakpoint\s*/g, ';\n')
    .replace(
      /CREATE POLICY (\S+) ON (\S+) FOR/g,
      'DROP POLICY IF EXISTS $1 ON $2;\nCREATE POLICY $1 ON $2 FOR',
    )
    .replace(/CREATE INDEX (\S+) ON/g, 'CREATE INDEX IF NOT EXISTS $1 ON')
    .replace(/CREATE TABLE (\S+) \(/g, 'CREATE TABLE IF NOT EXISTS $1 (')
    .replace(/CREATE UNIQUE INDEX (\S+) ON/g, 'CREATE UNIQUE INDEX IF NOT EXISTS $1 ON')
    .replace(
      /ALTER TABLE (\S+) ADD COLUMN (?!IF NOT EXISTS)(\S+)/g,
      'ALTER TABLE $1 ADD COLUMN IF NOT EXISTS $2',
    )
    .replace(
      /ALTER TABLE (\S+) ADD CONSTRAINT (\S+) /g,
      'ALTER TABLE $1 DROP CONSTRAINT IF EXISTS $2;\nALTER TABLE $1 ADD CONSTRAINT $2 ',
    )
}

export function customSqlFiles(): string[] {
  return readdirSync(DRIZZLE_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .filter((f) => Number(f.slice(0, 4)) >= 5)
    .sort()
}

// 0013_round_half_up.sql está FORA do journal (o slot 0013 ficou com
// 0013_noisy_mimic), então o `drizzle-kit migrate` nunca a aplica — mas
// 0014_add_order_tables.sql já usa round_half_up(numeric). Como o drizzle-kit
// migra numa transação, sem isto o rollback desfaz tudo e o erro nem chega à
// saída. Ver ADR-012.
//
// Este arquivo é a ÚNICA definição da função: o passo prévio do migrate e o
// setup de testes leem daqui, nenhum dos dois reescreve o corpo.
export const PRE_MIGRATE_FILE = '0013_round_half_up.sql'

export function preMigrateSql(): string {
  return readFileSync(resolve(DRIZZLE_DIR, PRE_MIGRATE_FILE), 'utf-8')
}

export async function applyPreMigrateSql(dbUrl: string): Promise<void> {
  const sql = postgres(dbUrl, { onnotice: () => {}, connect_timeout: 5 })
  try {
    await sql.unsafe(preMigrateSql())
  } finally {
    await sql.end()
  }
}

// SQL idempotente concatenado, sem depender de docker — os testes de
// regressão de ordering aplicam o mesmo conteúdo via driver pg.
export function buildCustomSql(): string {
  return customSqlFiles()
    .map((f) => toIdempotentSql(readFileSync(resolve(DRIZZLE_DIR, f), 'utf-8')))
    .join('\n')
}

// Roda por TCP em vez de `docker compose exec psql`: o setup passa a
// funcionar contra qualquer servidor acessível (container, host, CI) e não
// quebra quando o container do compose está preso/ausente.
export async function applyCustomSql(dbUrl: string): Promise<void> {
  const sql = postgres(dbUrl, { onnotice: () => {}, connect_timeout: 5 })
  try {
    await sql.unsafe(buildCustomSql())
  } finally {
    await sql.end()
  }
}
