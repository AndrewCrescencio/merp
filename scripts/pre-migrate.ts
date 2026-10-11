#!/usr/bin/env tsx
// Passo prévio do `drizzle-kit migrate`.
//
// 0013_round_half_up.sql está FORA do journal (o slot 0013 ficou com
// 0013_noisy_mimic), então o drizzle-kit nunca a aplica. Mas
// 0014_add_order_tables.sql já usa round_half_up(numeric) nas policies de
// order_items — e o drizzle-kit executa as migrações numa transação só, então o
// CREATE POLICY falha, o rollback desfaz TUDO e o erro nunca chega à saída: o
// usuário via só NOTICEs de `DROP POLICY ... skipping` e `exit 1`. Era por isso
// que `db:migrate:full` morria em silêncio em banco novo.
//
// A tentação é embutir a função no topo do próprio 0014. NÃO FAÇA: o drizzle-kit
// grava o hash de cada migração aplicada em __drizzle_migrations e compara na
// próxima execução — alterar o arquivo rejeita todo banco que já o aplicou. Este
// passo não toca em nada já gravado.
//
// Lê o arquivo compartilhado em vez de redefinir o corpo da função.
//
// Também traduz a falha de conexão numa mensagem acionável: o drizzle-kit
// engole a própria exceção, então sem isto o usuário só vê a barra de progresso.
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
