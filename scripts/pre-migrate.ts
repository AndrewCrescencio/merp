#!/usr/bin/env tsx
// 0013_round_half_up.sql está FORA do journal (só o 0013_noisy_mimic entrou),
// então `drizzle-kit migrate` nunca a aplica. Mas 0014_add_order_tables.sql já
// usa round_half_up(numeric) nas policies de order_items — e como o drizzle-kit
// roda as migrações numa transação, o CREATE POLICY falha, o rollback desfaz
// TUDO e o erro nem chega à saída (só NOTICEs). Resultado: `db:migrate:full`
// nunca funcionava em banco novo.
//
// Este passo aplica o arquivo órfão antes do migrate. É idempotente e lê o
// próprio .sql, sem duplicar a definição da função. Também traduz a falha de
// conexão numa mensagem acionável: o drizzle-kit engole a exceção e devolve
// exit 1 em silêncio, então sem isto o usuário só vê a barra de progresso.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const ORPHAN = '0013_round_half_up.sql'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('✗ DATABASE_URL não definida')
  console.error('  existe um .env válido na raiz? `make init` cria um a partir de .env.example')
  process.exit(1)
}

const sql = postgres(url, { onnotice: () => {}, connect_timeout: 5 })

try {
  await sql`select 1`
} catch (error) {
  const err = error as { code?: string; message: string }
  console.error(`✗ PostgreSQL inacessível com DATABASE_URL (${err.code ?? err.message})`)
  console.error('  o container está de pé? `make db` sobe só o PostgreSQL')
  if (err.code === '28P01') {
    console.error(
      '  senha recusada: POSTGRES_PASSWORD só vale na PRIMEIRA inicialização do volume —',
      'se o pgdata já existe, a senha gravada nele continua valendo e o .env precisa casar',
    )
  }
  if (err.code === 'ENOTFOUND') {
    console.error(
      '  hostname errado: `postgres` só resolve dentro da merp_network; no host use 127.0.0.1',
    )
  }
  await sql.end()
  process.exit(1)
}

try {
  await sql.unsafe(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle', ORPHAN), 'utf-8'),
  )
  console.log(`[pre-migrate] ${ORPHAN} aplicada (round_half_up garantida)`)
} finally {
  await sql.end()
}
