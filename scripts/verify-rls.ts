import { pathToFileURL } from 'node:url'
import postgres from 'postgres'

// Guarda fail-loud: toda tabela com RLS tem de ter FORCE. Sem FORCE a role
// dona das tabelas (owner) ignora RLS e lê tudo. É a última etapa de
// `pnpm run db:migrate:full`, depois das migrações do journal — se a cadeia
// aplicar pela metade, o check falha alto em vez de deixar policies sem FORCE.
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
        `Reexecutar \`pnpm run db:migrate:full\` (a migração 0002_rls_policies_grants aplica FORCE) — sem FORCE o owner contorna RLS.`,
    )
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL não definida — rode via pnpm run db:migrate:full (o --env-file-if-exists=.env carrega o .env).',
    )
  }
  const sql = postgres(dbUrl, { onnotice: () => {}, connect_timeout: 5 })
  try {
    await assertRlsForceApplied(sql)
  } finally {
    await sql.end()
  }
  // Sem isto o passo seria invisível no log do CI — ninguém conseguiria ver que
  // a guarda rodou.
  console.log('✓ verify-rls: nenhuma tabela com RLS sem FORCE.')
}

// Só roda quando invocado como script: o teste unitário importa a guarda sem
// abrir conexão.
const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
