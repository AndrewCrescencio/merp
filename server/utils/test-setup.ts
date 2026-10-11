import { execSync } from 'child_process'
import { resolve } from 'path'
import postgres from 'postgres'
import { applyCustomSql } from './apply-custom-sql'

const COMPOSE_FILE = resolve(__dirname, '../../docker-compose.yml')
const ADMIN_URL = process.env.TEST_ADMIN_URL ?? 'postgres://merp:merp@localhost:5432/postgres'
const TEST_DB_URL = process.env.TEST_DB_URL ?? 'postgres://merp:merp@localhost:5432/merp_test'

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim()
}

function isDockerAvailable(): boolean {
  try {
    run('docker info')
    return true
  } catch {
    return false
  }
}

async function canConnect(url: string): Promise<boolean> {
  const sql = postgres(url, { connect_timeout: 3, onnotice: () => {} })
  try {
    await sql`select 1`
    return true
  } catch {
    return false
  } finally {
    await sql.end()
  }
}

// O servidor pode já estar de pé (compose, host ou CI) — nesse caso não há
// nada a iniciar. Só recorre ao compose quando ninguém responde, e um compose
// que falhe não derruba o setup desde que o servidor já responda.
async function ensureServer(): Promise<boolean> {
  if (await canConnect(ADMIN_URL)) {
    console.log('[test-setup] PostgreSQL já está acessível')
    return true
  }

  if (!isDockerAvailable()) {
    console.warn('[test-setup] Docker não disponível e sem PostgreSQL acessível')
    return false
  }

  console.log('[test-setup] A iniciar PostgreSQL...')
  try {
    run(`docker compose -f "${COMPOSE_FILE}" up -d postgres`)
  } catch (error) {
    console.warn(`[test-setup] docker compose up falhou: ${(error as Error).message}`)
    return false
  }

  for (let i = 0; i < 30; i++) {
    if (await canConnect(ADMIN_URL)) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function admin<T>(sql: string): Promise<T[]> {
  const client = postgres(ADMIN_URL, { connect_timeout: 3, onnotice: () => {} })
  try {
    return (await client.unsafe(sql)) as T[]
  } finally {
    await client.end()
  }
}

export async function setup(): Promise<void> {
  if (!(await ensureServer())) {
    console.warn('[test-setup] Sem acesso a PostgreSQL — a saltar setup da base de dados')
    process.env.DB_AVAILABLE = 'false'
    return
  }

  const [dbRow] = await admin<{ exists: boolean }>(
    `SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'merp_test') AS exists`,
  )
  if (!dbRow?.exists) {
    console.log('[test-setup] A criar base de dados merp_test...')
    // CREATE DATABASE não corre dentro de transação — comando isolado.
    await admin('CREATE DATABASE merp_test')
  } else {
    console.log('[test-setup] Base de dados merp_test já existe')
  }

  console.log('[test-setup] A criar função round_half_up...')
  await admin(
    `DROP FUNCTION IF EXISTS round_half_up(numeric) CASCADE;
     CREATE OR REPLACE FUNCTION round_half_up(v numeric) RETURNS numeric(12,2)
       LANGUAGE sql IMMUTABLE AS $$ SELECT floor(v * 100 + 0.5) / 100.0; $$`,
  )

  console.log('[test-setup] A sincronizar schema...')
  // --force: sem TTY o push não pode perguntar; merp_test é descartável.
  run(
    `DATABASE_URL="${TEST_DB_URL}" npx drizzle-kit push --force --config="${resolve(__dirname, '../../drizzle.config.ts')}"`,
  )

  console.log('[test-setup] A aplicar SQL custom (RLS, policies, FORCE)...')
  await applyCustomSql(TEST_DB_URL)

  console.log('[test-setup] A garantir role de app (merp_app) com grants...')
  // AUD-19: a migração 0017 cria a role + grants (idempotente); este passo
  // garante a SENHA de teste (a migração não fixa senha — é segredo de
  // operação em produção). ALTER ROLE torna idempotente.
  await admin(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'merp_app') THEN
         CREATE ROLE merp_app WITH LOGIN PASSWORD 'merp_app';
       ELSE
         ALTER ROLE merp_app WITH LOGIN PASSWORD 'merp_app';
       END IF;
     END $$`,
  )

  process.env.DB_AVAILABLE = 'true'
}

export async function teardown(): Promise<void> {
  // Nothing to clean up — the container stays running for subsequent runs
}
