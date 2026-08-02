import { execSync } from 'child_process'
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const DRIZZLE_DIR = resolve(__dirname, '../../drizzle')

function toIdempotentSql(raw: string): string {
  return raw
    .replace(/--> statement-breakpoint\s*/g, ';\n')
    .replace(
      /CREATE POLICY (\S+) ON (\S+) FOR/g,
      'DROP POLICY IF EXISTS $1 ON $2;\nCREATE POLICY $1 ON $2 FOR',
    )
    .replace(/CREATE INDEX (\S+) ON/g, 'CREATE INDEX IF NOT EXISTS $1 ON')
}

export function applyCustomSql(dbName: string, composeFile: string): void {
  const files = readdirSync(DRIZZLE_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .filter((f) => Number(f.slice(0, 4)) >= 5)
    .sort()

  const sql = files
    .map((f) => toIdempotentSql(readFileSync(resolve(DRIZZLE_DIR, f), 'utf-8')))
    .join('\n')

  execSync(
    `docker compose -f "${composeFile}" exec -T postgres psql -U merp -d ${dbName} -v ON_ERROR_STOP=1`,
    { input: sql, encoding: 'utf-8', stdio: 'pipe' },
  )
}
