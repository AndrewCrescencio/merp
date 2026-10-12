import { describe, it, expect } from 'vitest'
import { db, createOwnerDbForSetupOnly } from './db'
import { sql } from 'drizzle-orm'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

type Row = Record<string, unknown>
const rows = (r: unknown): Row[] => (r ?? []) as Row[]

/**
 * Guarda estrutural do RLS (CI): falha se
 *  (a) a role que a aplicação usa for superuser / BYPASSRLS / dona das tabelas,
 *  (b) uma tabela com coluna de tenant ficar sem RLS ou sem FORCE,
 *  (c) aparecer uma função SECURITY DEFINER em `public` sem `search_path` fixado.
 *
 * O canary (00-rls-canary.test.ts) prova que o isolamento funciona; este teste
 * prova que as PREMISSAS do canary continuam verdadeiras. Corre com a MESMA role
 * não privilegiada da aplicação — `db` liga em APP_DATABASE_URL.
 */
describe.skipIf(!dbAvailable)('RLS guard (CI)', () => {
  const ownerDb = createOwnerDbForSetupOnly()

  it('a role da aplicação não é superuser, não tem BYPASSRLS e não é dona das tabelas', async () => {
    const role = rows(
      await db.execute(sql`
        SELECT current_user AS role,
               rolsuper,
               rolbypassrls,
               (SELECT count(*)::int AS owned
                  FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind = 'r'
                   AND pg_get_userbyid(c.relowner) = current_user) AS owned
          FROM pg_roles WHERE rolname = current_user`),
    )[0]
    expect(role, 'sem linha de role').toBeDefined()
    if (!role) return

    expect(role.rolsuper, `role ${String(role.role)} é superuser`).toBe(false)
    expect(role.rolbypassrls, `role ${String(role.role)} tem BYPASSRLS`).toBe(false)
    // Dona não é proibido por si só (FORCE cobre o owner), mas aqui indica que
    // a suite deixou de correr como a role da aplicação.
    expect(role.owned, `role ${String(role.role)} é dona de tabelas de negócio`).toBe(0)
  })

  it('toda tabela com coluna de tenant tem RLS + FORCE', async () => {
    const missing = rows(
      await ownerDb.execute(sql`
        SELECT c.relname AS tabela,
               c.relrowsecurity AS rls,
               c.relforcerowsecurity AS force
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND a.attname IN ('company_id', 'tenant_id')
         GROUP BY c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
        HAVING NOT c.relrowsecurity OR NOT c.relforcerowsecurity
         ORDER BY 1`),
    )

    expect(
      missing.map((m) => ({ tabela: m.tabela, rls: m.rls, force: m.force })),
      'tabelas com coluna de tenant sem RLS ou sem FORCE',
    ).toEqual([])
  })

  it('toda tabela com RLS activa também tem FORCE', async () => {
    const withoutForce = rows(
      await ownerDb.execute(sql`
        SELECT c.relname AS tabela
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND c.relrowsecurity AND NOT c.relforcerowsecurity
         ORDER BY 1`),
    )

    expect(
      withoutForce.map((r) => r.tabela),
      'tabelas com RLS mas sem FORCE (o owner contorna o RLS)',
    ).toEqual([])
  })

  it('nenhuma função SECURITY DEFINER em public sem search_path fixado', async () => {
    const unsafe = rows(
      await ownerDb.execute(sql`
        SELECT p.proname
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prosecdef
           AND NOT (p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp'])
         ORDER BY 1`),
    )

    expect(
      unsafe.map((r) => r.proname),
      'SECURITY DEFINER sem search_path fixado (pode contornar RLS)',
    ).toEqual([])
  })

  it('merp_app não está na lista de roles com BYPASSRLS', async () => {
    const bypass = rows(
      await ownerDb.execute(sql`
        SELECT rolname FROM pg_roles
         WHERE rolbypassrls AND rolname NOT LIKE 'pg\_%'
         ORDER BY 1`),
    ).map((r) => r.rolname)
    // `merp` (DATABASE_URL, DDL/migrações) é a única esperada. Se aparecer
    // `merp_app` aqui a aplicação contorna o RLS em qualquer ambiente.
    expect(bypass).toEqual(['merp'])
  })
})
