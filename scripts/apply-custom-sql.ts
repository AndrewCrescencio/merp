#!/usr/bin/env tsx
import postgres from 'postgres'
import { buildCustomSql, assertRlsForceApplied } from '../server/utils/apply-custom-sql'

function splitStatements(sql: string): string[] {
  const out: string[] = []
  let cur = ''
  let i = 0
  let quote: string | null = null
  let dollar: string | null = null
  let lineComment = false
  let blockComment = false
  while (i < sql.length) {
    const c = sql[i]
    const two = sql.slice(i, i + 2)
    if (lineComment) {
      cur += c
      if (c === '\n') lineComment = false
      i++
      continue
    }
    if (blockComment) {
      cur += c
      if (two === '*/') {
        cur += sql[i + 1]
        i += 2
        blockComment = false
        continue
      }
      i++
      continue
    }
    if (quote) {
      cur += c
      if (c === quote && sql[i - 1] !== '\\') quote = null
      i++
      continue
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        cur += dollar
        i += dollar.length
        dollar = null
        continue
      }
      cur += c
      i++
      continue
    }
    if (two === '--' && !cur.endsWith(':')) {
      lineComment = true
      cur += c
      i++
      continue
    }
    if (two === '/*') {
      blockComment = true
      cur += two
      i += 2
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      cur += c
      i++
      continue
    }
    const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i))
    if (m) {
      dollar = m[0]
      cur += dollar
      i += dollar.length
      continue
    }
    if (c === ';') {
      cur += c
      out.push(cur)
      cur = ''
      i++
      continue
    }
    cur += c
    i++
  }
  if (cur.trim()) out.push(cur)
  return out.filter((s) => s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim())
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL não definido')
    process.exit(1)
  }

  const sql = buildCustomSql()
  const statements = splitStatements(sql)

  console.log(`Aplicando ${statements.length} statements...`)

  const client = postgres(databaseUrl)
  try {
    // Transacional: ou aplicam-se os 856 statements (incl. o FORCE da 0025) ou
    // nenhum. Sem isto, falhar a meio deixava policies sem FORCE — o owner
    // contorna RLS em silêncio (o evento que motivou esta guarda).
    await client.begin(async (tx) => {
      for (const stmt of statements) {
        await tx.unsafe(stmt)
      }
    })
    // Backstop: confirma que nenhuma tabela ficou com RLS sem FORCE.
    await assertRlsForceApplied(client)
    console.log(`✓ ${statements.length} statements aplicados (transacional) + RLS/FORCE verificado`)
  } catch (error: unknown) {
    console.error(
      'Erro ao aplicar custom SQL:',
      error instanceof Error ? error.message : String(error),
    )
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
