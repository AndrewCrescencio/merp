#!/usr/bin/env tsx
// O drizzle-kit migrate sai com código 1 sem imprimir o motivo — a progress
// bar ANSI engole a exceção. Este pré-checagem roda antes e traduz a falha de
// conexão numa mensagem acionável, que é o erro real na maioria dos casos.
import postgres from 'postgres'

function fail(message: string, hints: string[]): never {
  console.error(`✗ ${message}`)
  for (const hint of hints) console.error(`  ${hint}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    fail('DATABASE_URL não definida', [
      'existe um .env válido na raiz? `make init` cria um a partir de .env.example',
    ])
  }

  const sql = postgres(url as string, { connect_timeout: 5, onnotice: () => {} })
  try {
    await sql`select 1`
    console.log('✓ PostgreSQL acessível com DATABASE_URL')
  } catch (error) {
    const err = error as { code?: string; message: string }
    fail(`PostgreSQL inacessível com DATABASE_URL (${err.code ?? err.message})`, [
      'o container está de pé? `make db` sobe só o PostgreSQL',
      'senha recusada (28P01): POSTGRES_PASSWORD só vale na primeira',
      'inicialização do volume — se o pgdata já existe, a senha gravada nele',
      'continua valendo e o .env precisa casar com ela',
      'hostname errado (ENOTFOUND): `postgres` só resolve dentro da merp_network;',
      'no host use 127.0.0.1',
    ])
  } finally {
    await sql.end()
  }
}

main()
