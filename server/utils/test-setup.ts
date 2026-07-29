import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

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

  process.env.DB_AVAILABLE = 'true'
}

export async function teardown(): Promise<void> {
  // Nothing to clean up — the container stays running for subsequent runs
}
