import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import postgres from 'postgres'
import { applyPreMigrateSql, buildCustomSql } from './apply-custom-sql'

// Regressão do ordering 0015/0017: banco limpo quebrava em 0015
// (GRANT ... TO merp_app antes da role existir na 0017). A 0014_app_role_ensure
// garante a role cedo no stream; estes testes provam (a) migrations-só,
// (b) bootstrap-primeiro, (c) reaplicação e (d) RLS funcional pós-fix.
const dbAvailable = process.env.DB_AVAILABLE === 'true'

const OWNER_URL = 'postgres://merp:merp@localhost:5432/postgres'
const APP_PASSWORD = 'test-merp-app-pw'
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`
const dbA = `merp_reg_a_${stamp}`
const dbB = `merp_reg_b_${stamp}`

interface RoleAttrs {
  login: boolean
  bypassrls: boolean
  inherit: boolean
  hasPassword: boolean
}

// Divide o SQL concatenado em statements, respeitando dollar-quoting ($$),
// aspas e comentários — espelha o psql -v ON_ERROR_STOP=1 (fail-fast por
// statement, sem máscara de erro).
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
      // '--' fora de cast '::' — comentário de linha (casts não ocorrem aqui
      // colados em statement, mas a guarda evita falso-positivo barato)
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
  // Descarta chunks só de comentários/espaço (psql os ignoraria).
  return out.filter((s) => s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim())
}

async function freshDb(name: string): Promise<void> {
  const admin = postgres(OWNER_URL)
  try {
    await admin.unsafe(`CREATE DATABASE ${name} OWNER merp`)
  } finally {
    await admin.end()
  }
}

async function dropDb(name: string): Promise<void> {
  const admin = postgres(OWNER_URL)
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}

function pushSchema(dbUrl: string): void {
  try {
    execSync(`npx drizzle-kit push --config="${resolve(repoRoot, 'drizzle.config.ts')}"`, {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: dbUrl },
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 240_000,
    })
  } catch (error) {
    // stdio pipe engole a saída — anexa para o flake ser diagnosticável.
    const err = error as { stdout?: string; stderr?: string; message?: string }
    const out = [err.stdout, err.stderr].filter(Boolean).join('\n')
    throw new Error(
      `drizzle-kit push falhou: ${err.message ?? String(err)}${out ? `\n${out}` : ''}`,
      { cause: error },
    )
  }
}

// Aplica o custom SQL statement a statement (fail-fast como ON_ERROR_STOP).
async function applyCustom(dbUrl: string): Promise<void> {
  const sql = postgres(dbUrl)
  try {
    for (const stmt of splitStatements(buildCustomSql())) {
      await sql.unsafe(stmt)
    }
  } finally {
    await sql.end()
  }
}

async function roleAttrs(): Promise<RoleAttrs | null> {
  const admin = postgres(OWNER_URL)
  try {
    const rows = await admin.unsafe(
      `SELECT rolcanlogin, rolbypassrls, rolinherit, rolpassword IS NOT NULL AS has_password FROM pg_roles WHERE rolname = 'merp_app'`,
    )
    if (rows.length === 0) return null
    const r = rows[0] as any
    return {
      login: r.rolcanlogin,
      bypassrls: r.rolbypassrls,
      inherit: r.rolinherit,
      hasPassword: r.has_password,
    }
  } finally {
    await admin.end()
  }
}

// Garante existência SEM tocar em credencial: roles são cluster-globais e os
// demais arquivos de integração autenticam como merp_app/'merp_app' em
// paralelo — um ALTER ROLE ... PASSWORD aqui causaria flake na suíte.
// A parte de existência é o que importa para o ordering (o bug era
// 'role does not exist'); a cláusula PASSWORD do ensureAppRole já é exercida
// pelo próprio globalSetup em CI.
async function ensureRoleExists(): Promise<void> {
  const admin = postgres(OWNER_URL)
  try {
    await admin.unsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'merp_app') THEN CREATE ROLE merp_app WITH LOGIN; END IF; END $$;`,
    )
  } finally {
    await admin.end()
  }
}

async function rolePreExists(): Promise<boolean> {
  const admin = postgres(OWNER_URL)
  try {
    const rows = await admin.unsafe(`SELECT 1 FROM pg_roles WHERE rolname = 'merp_app'`)
    return rows.length > 0
  } finally {
    await admin.end()
  }
}

const urlFor = (db: string, user = 'merp', pw = 'merp') =>
  `postgres://${user}:${pw}@localhost:5432/${db}`

describe.skipIf(!dbAvailable)('migration ordering 0015/0017 (integration)', () => {
  let attrsA: RoleAttrs | null = null
  let preExisted = false

  beforeAll(async () => {
    preExisted = await rolePreExists()
    // (a) banco limpo, migrations-só, sem criar a role manualmente.
    // applyPreMigrateSql: 0013_round_half_up.sql está fora do journal, logo o
    // push não a cria — e order_item.line_total (coluna gerada) depende dela.
    // Sem este passo o CREATE TABLE "order_item" do push falha com
    // "function round_half_up(numeric) does not exist" (o drizzle-kit engole o
    // erro e sai com 0, por isso nunca quebrava o teste). Mesmo passo de
    // test-setup.ts:94; não toca no ordering 0015/0017 que este teste cobre.
    await freshDb(dbA)
    await applyPreMigrateSql(urlFor(dbA))
    pushSchema(urlFor(dbA))
    await applyCustom(urlFor(dbA))
    attrsA = await roleAttrs()

    // (b) banco limpo, bootstrap (existência) primeiro.
    await freshDb(dbB)
    await applyPreMigrateSql(urlFor(dbB))
    await ensureRoleExists()
    pushSchema(urlFor(dbB))
    await applyCustom(urlFor(dbB))
  }, 300_000)

  afterAll(async () => {
    await dropDb(dbA).catch(() => {})
    await dropDb(dbB).catch(() => {})
  })

  it('(a) migrations-só passam e criam merp_app com atributos RLS-safe', () => {
    // Se a 0014_app_role_ensure regredir, o applyCustom acima lança
    // 'role "merp_app" does not exist' e este teste falha no beforeAll.
    expect(attrsA).toMatchObject({ login: true, bypassrls: false, inherit: true })
    // Em cluster 100% limpo a migration cria a role sem senha (credencial é
    // da operação/bootstrap). Com globalSetup ativo a role já existe — aí a
    // não-interferência é coberta por (c).
    if (!preExisted) expect(attrsA?.hasPassword).toBe(false)
  })

  it('(c) reaplicar em banco migrado passa e não altera a role', async () => {
    const before = await roleAttrs()
    await applyCustom(urlFor(dbA))
    expect(await roleAttrs()).toEqual(before)
  })

  it('(b) bootstrap-primeiro resulta nos mesmos atributos de (a)', async () => {
    const attrsB = await roleAttrs()
    expect(attrsB).not.toBeNull()
    // Existência + atributos idênticos independente de quem criou primeiro.
    expect({
      login: attrsB?.login,
      bypassrls: attrsB?.bypassrls,
      inherit: attrsB?.inherit,
    }).toEqual({ login: attrsA?.login, bypassrls: attrsA?.bypassrls, inherit: attrsA?.inherit })
  })

  describe('(d) RLS funcional pós-fix', () => {
    const OWNER = 'rls-u-owner'
    const OUTSIDER = 'rls-u-out'
    const CO_A = 'rls-c-a'
    const CO_B = 'rls-c-b'
    // Role descartável membro de merp_app: herda os mesmos grants (INHERIT),
    // mas continua NOBYPASSRLS (bypass não se herda) — exerce exatamente as
    // mesmas policies, sem mutar a credencial global de merp_app (paralelismo).
    const PROBE = `rls_probe_${stamp}`

    // Conexão dedicada como probe com GUCs de tenant/user (como withTenant).
    async function asApp<T>(
      tenant: string | null,
      user: string,
      fn: (sql: any) => Promise<T>,
    ): Promise<T> {
      const sql = postgres(urlFor(dbA, PROBE, APP_PASSWORD))
      try {
        await sql.unsafe(`SET app.tenant_id = '${tenant ?? ''}'`)
        await sql.unsafe(`SET app.user_id = '${user}'`)
        return await fn(sql)
      } finally {
        await sql.end()
      }
    }

    beforeAll(async () => {
      const admin = postgres(OWNER_URL)
      try {
        await admin.unsafe(`CREATE ROLE ${PROBE} WITH LOGIN PASSWORD '${APP_PASSWORD}'`)
        await admin.unsafe(`GRANT merp_app TO ${PROBE}`)
      } finally {
        await admin.end()
      }
      // Seed como owner (superuser bypassa RLS).
      const owner = postgres(urlFor(dbA))
      try {
        await owner.unsafe(
          `INSERT INTO "user" (id, name, email) VALUES ('${OWNER}', 'Owner', 'rls-owner@example.com'), ('${OUTSIDER}', 'Outsider', 'rls-outsider@example.com') ON CONFLICT (id) DO NOTHING`,
        )
        await owner.unsafe(
          `INSERT INTO company (id, name) VALUES ('${CO_A}', 'RLS Co A'), ('${CO_B}', 'RLS Co B') ON CONFLICT (id) DO NOTHING`,
        )
        await owner.unsafe(
          `INSERT INTO company_member (company_id, user_id, role) VALUES ('${CO_A}', '${OWNER}', 'owner') ON CONFLICT DO NOTHING`,
        )
      } finally {
        await owner.end()
      }
    }, 60_000)

    afterAll(async () => {
      const admin = postgres(OWNER_URL)
      try {
        await admin.unsafe(`DROP ROLE IF EXISTS ${PROBE}`)
      } finally {
        await admin.end().catch(() => {})
      }
    })

    it('só enxerga rows do tenant corrente (policy ativa)', async () => {
      const rows = await asApp<postgres.Row[]>(CO_A, OWNER, (sql) =>
        sql.unsafe(`SELECT id FROM company ORDER BY id`),
      )
      expect(rows.map((r: any) => r.id)).toEqual([CO_A])
    })

    it('sem contexto o outsider não vê nada (fail-closed)', async () => {
      const rows = await asApp(null, OUTSIDER, (sql) => sql.unsafe(`SELECT * FROM company_member`))
      expect(rows).toHaveLength(0)
    })

    it('self-insert de outsider em outro tenant é negado (42501)', async () => {
      await expect(
        asApp(CO_B, OUTSIDER, (sql) =>
          sql.unsafe(
            `INSERT INTO company_member (company_id, user_id, role) VALUES ('${CO_B}', '${OUTSIDER}', 'member')`,
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' })
    })

    it('role de migration continua enxergando tudo', async () => {
      const owner = postgres(urlFor(dbA))
      try {
        const companies = await owner.unsafe(`SELECT id FROM company ORDER BY id`)
        expect(companies.map((r: any) => r.id)).toEqual([CO_A, CO_B])
        const members = await owner.unsafe(`SELECT * FROM company_member`)
        expect(members).toHaveLength(1)
      } finally {
        await owner.end()
      }
    })
  })
})
