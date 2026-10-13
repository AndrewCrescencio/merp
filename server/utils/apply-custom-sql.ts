import { readdirSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRIZZLE_DIR = resolve(__dirname, '../../drizzle')

function toIdempotentSql(raw: string): string {
  return (
    raw
      .replace(/--> statement-breakpoint\s*/g, ';\n')
      // Âncora ao início da linha e ignora comentários. Sem isto, um rollback
      // comentado (`-- CREATE POLICY x ON y FOR ...;`) é apanhado pela regex e o
      // `;\n` injetado descomenta a segunda metade — executa um CREATE POLICY
      // fantasma (já-existe / política errada). Só afeta linhas `--`.
      .replace(
        /^([ \t]*)(?!-)(CREATE POLICY (\S+) ON (\S+) FOR)/gm,
        '$1DROP POLICY IF EXISTS $3 ON $4;\n$1CREATE POLICY $3 ON $4 FOR',
      )
      .replace(/CREATE INDEX (\S+) ON/g, 'CREATE INDEX IF NOT EXISTS $1 ON')
      .replace(/CREATE TABLE (\S+) \(/g, 'CREATE TABLE IF NOT EXISTS $1 (')
      .replace(/CREATE UNIQUE INDEX (\S+) ON/g, 'CREATE UNIQUE INDEX IF NOT EXISTS $1 ON')
      .replace(
        /ALTER TABLE (\S+) ADD COLUMN (?!IF NOT EXISTS)(\S+)/g,
        'ALTER TABLE $1 ADD COLUMN IF NOT EXISTS $2',
      )
      // shortcut: ADD CONSTRAINT injeta `;\n` tal como CREATE POLICY e tem o mesmo
      // perigo de descomentar um rollback comentado — ainda não foi	triggered porque
      // nenhum rollback comentado usa ADD CONSTRAINT. Se algum usar, aplicar o mesmo
      // enquadramento de linha/comentário da regra CREATE POLICY acima.
      .replace(
        /ALTER TABLE (\S+) ADD CONSTRAINT (\S+) /g,
        'ALTER TABLE $1 DROP CONSTRAINT IF EXISTS $2;\nALTER TABLE $1 ADD CONSTRAINT $2 ',
      )
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
// 0014_add_order_tables.sql já usa round_half_up(numeric). Sem este passo
// prévio a migração 14 falha e o rollback da transação engole o erro; o
// porquê completo está no cabeçalho de scripts/pre-migrate.ts.
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

// Guarda fail-loud: toda tabela com RLS tem de ter FORCE. Sem FORCE o owner
// (role de migrações) ignora RLS — é o que a 0025 existe para evitar. Se o
// aplicador falhar a meio (CLI não-transacional) deixa policies sem FORCE em
// silêncio; este assert impede que isso passe despercebido.
export async function assertRlsForceApplied(client: {
  unsafe: (query: string) => Promise<unknown[]>
}): Promise<void> {
  const rows = (await client.unsafe(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relrowsecurity AND NOT c.relforcerowsecurity
     ORDER BY c.relname`,
  )) as { relname: string }[]
  const missing = rows.map((r) => r.relname)
  if (missing.length > 0) {
    throw new Error(
      `RLS sem FORCE em ${missing.length} tabela(s): ${missing.join(', ')}. ` +
        `Reexecutar apply-custom-sql (a 0025 aplica FORCE) — sem FORCE o owner contorna RLS.`,
    )
  }
}

// Roda por TCP em vez de `docker compose exec psql`: o setup passa a
// funcionar contra qualquer servidor acessível (container, host, CI) e não
// quebra quando o container do compose está preso/ausente.
export async function applyCustomSql(dbUrl: string): Promise<void> {
  const sql = postgres(dbUrl, { onnotice: () => {}, connect_timeout: 5 })
  try {
    await sql.unsafe(buildCustomSql())
    await assertRlsForceApplied(sql)
  } finally {
    await sql.end()
  }
}
