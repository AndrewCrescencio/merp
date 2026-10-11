#!/usr/bin/env tsx
// Passo prévio do `drizzle-kit migrate`. Aplica 0013_round_half_up.sql, que
// está fora do journal e portanto nunca é aplicada pelo drizzle-kit — ver
// ADR-012. Lê do arquivo compartilhado para não redefinir a função.
//
// Também traduz a falha de conexão numa mensagem acionável: o drizzle-kit
// engole a exceção e devolve exit 1 em silêncio, então sem isto o usuário só
// vê a barra de progresso.
import postgres from 'postgres'
import { PRE_MIGRATE_FILE, preMigrateSql } from '../server/utils/apply-custom-sql'

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
  await sql.unsafe(preMigrateSql())
  console.log(`[pre-migrate] ${PRE_MIGRATE_FILE} aplicada (round_half_up garantida)`)
} finally {
  await sql.end()
}
