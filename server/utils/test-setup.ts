import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { applyCustomSql } from './apply-custom-sql'

const COMPOSE_FILE = resolve(__dirname, '../../docker-compose.yml')
const TEST_DB_URL = 'postgres://merp:merp@localhost:5432/merp_test'

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim()
}

function isContainerRunning(): boolean {
  try {
    const out = run('docker ps --filter name=merp-postgres --format "{{.Names}}"')
    return out.includes('merp-postgres')
  } catch {
    return false
  }
}

function isDockerAvailable(): boolean {
  try {
    run('docker info')
    return true
  } catch {
    return false
  }
}

function databaseExists(): boolean {
  try {
    const out = run(
      `docker compose exec -T postgres psql -U merp -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='merp_test'"`,
    )
    return out === '1'
  } catch {
    return false
  }
}

export async function setup(): Promise<void> {
  if (!isDockerAvailable()) {
    console.warn('[test-setup] Docker não disponível — a saltar setup da base de dados')
    process.env.DB_AVAILABLE = 'false'
    return
  }

  if (!isContainerRunning()) {
    console.log('[test-setup] A iniciar PostgreSQL...')
    run(`docker compose -f "${COMPOSE_FILE}" up -d postgres`)
    console.log('[test-setup] A aguardar PostgreSQL ficar saudável...')
    run(
      `docker compose -f "${COMPOSE_FILE}" exec -T postgres bash -c 'until pg_isready -U merp; do sleep 1; done'`,
    )
  } else {
    console.log('[test-setup] PostgreSQL já está em execução')
  }

  if (!databaseExists()) {
    console.log('[test-setup] A criar base de dados merp_test...')
    run(
      `docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U merp -c "CREATE DATABASE merp_test"`,
    )
  } else {
    console.log('[test-setup] Base de dados merp_test já existe')
  }

  console.log('[test-setup] A sincronizar schema...')
  run(
    `DATABASE_URL="${TEST_DB_URL}" npx drizzle-kit push --config="${resolve(__dirname, '../../drizzle.config.ts')}"`,
  )
  console.log('[test-setup] A aplicar SQL custom (RLS, policies, FORCE)...')
  applyCustomSql('merp_test', COMPOSE_FILE)
  console.log('[test-setup] A garantir role de app (merp_app) com grants...')
  ensureAppRole()

  process.env.DB_AVAILABLE = 'true'
}

function ensureAppRole(): void {
  // AUD-19: a migração 0017 cria a role + grants (idempotente); este passo
  // garante a SENHA de teste (a migração não fixa senha — é segredo de
  // operação em produção). ALTER ROLE torna idempotente.
  run(
    `docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U merp -d merp_test -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'merp_app') THEN
    CREATE ROLE merp_app WITH LOGIN PASSWORD 'merp_app';
  ELSE
    ALTER ROLE merp_app WITH LOGIN PASSWORD 'merp_app';
  END IF;
END $$;
SQL`,
  )
}

export async function teardown(): Promise<void> {
  // Nothing to clean up — the container stays running for subsequent runs
}
