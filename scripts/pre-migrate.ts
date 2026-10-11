#!/usr/bin/env tsx
// 0013_round_half_up.sql está FORA do journal (só o 0013_noisy_mimic entrou),
// então `drizzle-kit migrate` nunca a aplica. Mas 0014_add_order_tables.sql já
// usa round_half_up(numeric) nas policies de order_items — e como o drizzle-kit
// roda as migrações numa transação, o CREATE POLICY falha, o rollback desfaz
// TUDO e o erro nem chega à saída (só NOTICEs). Resultado: `db:migrate:full`
// nunca funcionava em banco novo.
//
// Este passo aplica o arquivo órfão antes do migrate. É idempotente e lê o
// próprio .sql, sem duplicar a definição da função.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const ORPHAN = '0013_round_half_up.sql'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[pre-migrate] DATABASE_URL não definida')
  process.exit(1)
}

const dir = dirname(fileURLToPath(import.meta.url))
const sql = postgres(url, { onnotice: () => {}, connect_timeout: 5 })
try {
  await sql.unsafe(readFileSync(resolve(dir, '../drizzle', ORPHAN), 'utf-8'))
  console.log(`[pre-migrate] ${ORPHAN} aplicada (round_half_up garantida)`)
} finally {
  await sql.end()
}
