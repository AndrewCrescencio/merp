import { describe, it, expect, beforeAll } from 'vitest'
import { db, createOwnerDbForSetupOnly } from './db'
import { sql } from 'drizzle-orm'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

/**
 * Matriz de isolamento cross-tenant, CATÁLOGO-DRIVEN: cobre todas as tabelas
 * com RLS (hoje 16), não só as 13 da migração 0025 — uma tabela nova com RLS
 * tem de entrar em COVERED, senão o primeiro teste falha.
 *
 * Para cada tabela, para os tenants A e B, verifica que A:
 *   - não LÊ a linha de B         (SELECT → 0, com e sem GUC de tenant)
 *   - não INSERE em nome de B     (WITH CHECK → 42501)
 *   - não ATUALIZA a linha de B   (USING → 0 linhas)
 *   - não APAGA a linha de B      (USING → 0 linhas)
 * e que B continua a ver a SUA linha (senão o teste era vacuo).
 */

interface Tenant {
  key: string
  companyId: string
  locationId: string
  userId: string
}

const A: Tenant = {
  key: 'a',
  companyId: 'rlsmx_company_a',
  locationId: 'rlsmx_location_a',
  userId: 'rlsmx_user_a',
}
const B: Tenant = {
  key: 'b',
  companyId: 'rlsmx_company_b',
  locationId: 'rlsmx_location_b',
  userId: 'rlsmx_user_b',
}
const TENANTS: Tenant[] = [A, B]

const COVERED = [
  'cashier_shift',
  'company',
  'company_member',
  'invite',
  'kitchen_station',
  'kitchen_ticket',
  'location',
  'order',
  'order_dine_in',
  'order_item',
  'order_takeout',
  'party',
  'print_job',
  'printer',
  'product',
  'restaurant_table',
]

// Todos os literais vêm das constantes deste ficheiro ou do catálogo — nunca
// de input externo — por isso é seguro interpolá-los no SQL de teste.
const lit = (v: unknown): string =>
  typeof v === 'string'
    ? `'${v.replace(/'/g, "''")}'`
    : typeof v === 'boolean'
      ? v
        ? 'true'
        : 'false'
      : v instanceof Date
        ? `'${v.toISOString()}'`
        : String(v)

interface Col {
  name: string
  notnull: boolean
  hasDefault: boolean
  dataType: string
  generated: boolean
  fkTable: string | null
}

interface Table {
  name: string
  pk: string[]
  cols: Col[]
  deps: string[]
}

type RowId = Record<string, Record<string, string>>

async function loadTables(): Promise<Table[]> {
  const tables = (await db.execute(sql`
    SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
     ORDER BY 1`)) as unknown as { name: string }[]

  const out: Table[] = []
  for (const t of tables) {
    const pk = (await db.execute(sql`
      SELECT a.attname AS name
        FROM pg_constraint pc
        JOIN pg_attribute a ON a.attrelid = pc.conrelid AND a.attnum = ANY (pc.conkey)
       WHERE pc.conrelid = ${t.name}::regclass AND pc.contype = 'p'
       ORDER BY a.attnum`)) as unknown as { name: string }[]

    const cols = (await db.execute(sql`
      SELECT a.attname AS name,
             a.attnotnull AS notnull,
             col.column_default IS NOT NULL AS hasdefault,
             col.data_type AS datatype,
             col.is_generated <> 'NEVER' AS generated,
             (SELECT conf.relname
                FROM pg_constraint pc
                JOIN pg_class conf ON conf.oid = pc.confrelid
               WHERE pc.conrelid = c.oid AND pc.contype = 'f'
                 AND pc.conkey = ARRAY[a.attnum]::smallint[]) AS fktable
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        JOIN information_schema.columns col
          ON col.table_schema = 'public'
         AND col.table_name = c.relname
         AND col.column_name = a.attname
       WHERE n.nspname = 'public' AND c.relname = ${t.name}
       ORDER BY a.attnum`)) as unknown as Record<string, unknown>[]

    out.push({
      name: t.name,
      pk: pk.map((r) => r.name),
      cols: cols.map((r) => ({
        name: r.name as string,
        notnull: r.notnull as boolean,
        hasDefault: r.hasdefault as boolean,
        dataType: r.datatype as string,
        generated: r.generated as boolean,
        fkTable: (r.fktable as string | null) ?? null,
      })),
      deps: [],
    })
  }

  const names = new Set(out.map((t) => t.name))
  for (const t of out) {
    t.deps = [
      ...new Set(
        t.cols.filter((c) => c.notnull && c.fkTable && names.has(c.fkTable)).map((c) => c.fkTable!),
      ),
    ]
  }
  return topoSort(out)
}

function topoSort(tables: Table[]): Table[] {
  const sorted: Table[] = []
  const state = new Map<string, 'visit' | 'done'>()
  const visit = (t: Table): void => {
    const s = state.get(t.name)
    if (s === 'done') return
    if (s === 'visit') throw new Error(`dependência cíclica de FK em ${t.name}`)
    state.set(t.name, 'visit')
    for (const dep of t.deps) {
      const d = tables.find((x) => x.name === dep)
      if (d) visit(d)
    }
    state.set(t.name, 'done')
    sorted.push(t)
  }
  tables.forEach(visit)
  return sorted
}

/** Linha mínima que satisfaz NOT NULL/FK de `t` para o tenant dado. */
function buildRow(t: Table, tenant: Tenant, ids: RowId, suffix = ''): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const c of t.cols) {
    if (c.generated) continue
    if (c.name === 'id') {
      row.id = `${t.name}_mx_${tenant.key}${suffix}`
      continue
    }
    if (!c.notnull) continue // nullable → NULL
    if (c.fkTable === 'user') {
      row[c.name] = tenant.userId
      continue
    }
    if (c.fkTable === 'company') {
      row[c.name] = tenant.companyId
      continue
    }
    if (c.fkTable === 'location') {
      row[c.name] = tenant.locationId
      continue
    }
    if (c.fkTable) {
      const v = ids[c.fkTable]?.[tenant.key]
      if (!v) throw new Error(`FK ${t.name}.${c.name} -> ${c.fkTable} não semeada`)
      row[c.name] = v
      continue
    }
    if (c.name === 'company_id') {
      row[c.name] = tenant.companyId
      continue
    }
    if (c.name === 'location_id') {
      row[c.name] = tenant.locationId
      continue
    }
    if (c.hasDefault) continue // deixa o DEFAULT do schema
    row[c.name] = filler(c)
  }
  return row
}

function filler(c: Col): unknown {
  switch (c.dataType) {
    case 'text':
    case 'character varying':
      return `rlsmx_${c.name}`
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
      return 0
    case 'boolean':
      return false
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return new Date('2026-01-01T00:00:00.000Z')
    case 'jsonb':
    case 'json':
      return '{}'
    default:
      throw new Error(`sem filler para ${c.name}: ${c.dataType}`)
  }
}

function insertSql(table: string, row: Record<string, unknown>): string {
  const cols = Object.keys(row)
  return `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols
    .map((c) => lit(row[c]))
    .join(', ')}) ON CONFLICT DO NOTHING`
}

describe.skipIf(!dbAvailable)('RLS matrix — cross-tenant em todas as tabelas com RLS', () => {
  const ownerDb = createOwnerDbForSetupOnly()
  const tables: Table[] = []
  const ids: RowId = {}

  // `order` extra por tenant: alvo de INSERT cross-tenant em order_dine_in e
  // order_takeout, cujo PK é a própria FK para `order`.
  const freshOrder: Record<string, string> = {}

  beforeAll(async () => {
    // Raízes de FK (user/company/location/order) semeadas como owner — o
    // caminho já usado pelos testes de isolamento existentes.
    for (const t of TENANTS) {
      await ownerDb.execute(sql`
        INSERT INTO "user" (id, email, name)
        VALUES (${t.userId}, ${`${t.userId}@rlsmx.test`}, 'RLS matrix')
        ON CONFLICT DO NOTHING`)
      await ownerDb.execute(sql`
        INSERT INTO company (id, name, is_deleted)
        VALUES (${t.companyId}, ${`RLS matrix ${t.key}`}, false)
        ON CONFLICT DO NOTHING`)
      await ownerDb.execute(sql`
        INSERT INTO location (id, company_id, name, is_active)
        VALUES (${t.locationId}, ${t.companyId}, 'RLS matrix', true)
        ON CONFLICT DO NOTHING`)
      freshOrder[t.key] = `rlsmx_order_fresh_${t.key}`
      await ownerDb.execute(sql`
        INSERT INTO "order" (id, company_id, location_id, order_type, status, total_amount, created_by)
        VALUES (${freshOrder[t.key]}, ${t.companyId}, ${t.locationId}, 'dine_in', 'open', 0, ${t.userId})
        ON CONFLICT DO NOTHING`)
    }

    const loaded = await loadTables()
    tables.push(...loaded)

    for (const t of loaded) {
      const map: Record<string, string> = {}
      ids[t.name] = map
      for (const tenant of TENANTS) {
        if (t.name === 'company' || t.name === 'location') {
          map[tenant.key] = t.name === 'company' ? tenant.companyId : tenant.locationId
          continue
        }
        const row = buildRow(t, tenant, ids)
        await ownerDb.execute(sql.raw(insertSql(t.name, row)))
        const pkCol = t.pk[0]
        if (!pkCol) throw new Error(`tabela ${t.name} sem PK de uma coluna`)
        map[tenant.key] = String(row[pkCol])
      }
    }
  })

  it('a lista coberta é exactamente a lista de tabelas com RLS no catálogo', () => {
    const inCatalog = tables.map((t) => t.name).sort()
    expect(inCatalog, 'tabela com RLS sem cobertura cross-tenant').toEqual([...COVERED].sort())
  })

  for (const tableName of COVERED) {
    describe(tableName, () => {
      it('B vê a própria linha; A não lê, não insere, não atualiza e não apaga', async () => {
        const t = tables.find((x) => x.name === tableName)
        expect(t, `tabela ${tableName} sem RLS no catálogo`).toBeTruthy()
        if (!t) return

        const pk = t.pk[0]
        const bId = ids[tableName]?.[B.key]
        expect(bId, `linha de B não semeada em ${tableName}`).toBeTruthy()

        const setCtx = async (
          tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
          tenant: Tenant | null,
        ): Promise<void> => {
          await tx.execute(
            sql`SELECT set_config('app.tenant_id', ${tenant?.companyId ?? ''}, true)`,
          )
          await tx.execute(sql`SELECT set_config('app.location_id', '', true)`)
          await tx.execute(sql`SELECT set_config('app.user_id', ${tenant?.userId ?? ''}, true)`)
        }

        const runAs = async <T>(
          tenant: Tenant | null,
          fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
        ): Promise<T> =>
          db.transaction(async (tx) => {
            await setCtx(tx, tenant)
            return fn(tx)
          })

        const countAs = async (tenant: Tenant | null, id: string): Promise<number> => {
          const [row] = await runAs(tenant, (tx) =>
            tx.execute(
              sql.raw(`SELECT count(*)::int AS n FROM "${tableName}" WHERE "${pk}" = ${lit(id)}`),
            ),
          )
          return (row as unknown as { n: number }).n
        }

        // B vê a própria linha → as asserções seguintes não são vacuas.
        expect(await countAs(B, bId!), `${tableName}: B não vê a própria linha`).toBe(1)
        // A não lê a linha de B.
        expect(await countAs(A, bId!), `${tableName}: A leu a linha de B`).toBe(0)
        // Sem GUC de tenant nenhum → zero linhas (fail-closed).
        expect(await countAs(null, bId!), `${tableName}: sem GUC devolveu linhas`).toBe(0)

        // UPDATE: USING tem de filtrar a linha de B.
        const updated = (await runAs(A, (tx) =>
          tx.execute(
            sql.raw(
              `UPDATE "${tableName}" SET "${pk}" = "${pk}" WHERE "${pk}" = ${lit(bId!)} RETURNING "${pk}"`,
            ),
          ),
        )) as unknown[]
        expect(updated.length, `${tableName}: A atualizou a linha de B`).toBe(0)

        // DELETE: idem.
        const deleted = (await runAs(A, (tx) =>
          tx.execute(
            sql.raw(`DELETE FROM "${tableName}" WHERE "${pk}" = ${lit(bId!)} RETURNING "${pk}"`),
          ),
        )) as unknown[]
        expect(deleted.length, `${tableName}: A apagou a linha de B`).toBe(0)
        expect(await countAs(B, bId!), `${tableName}: a linha de B desapareceu`).toBe(1)

        // INSERT em nome de B: WITH CHECK tem de recusar.
        const crossRow = buildRow(t, B, ids, '_hack')
        if (tableName === 'order_dine_in' || tableName === 'order_takeout') {
          crossRow.order_id = freshOrder[B.key]
        }

        if (tableName === 'company') {
          // company_insert_policy: WITH CHECK (get_user_id() IS NOT NULL) — RLS-005.
          // Com contexto de utilizador (runAs seta app.user_id) o INSERT de bootstrap
          // de empresa é permitido (self-service FR-014); sem user → 42501 (ver
          // repository.test.ts: createCompany sem user é negado, fail-closed).
          await runAs(A, (tx) => tx.execute(sql.raw(insertSql(tableName, crossRow))))
          await ownerDb.execute(
            sql.raw(`DELETE FROM "company" WHERE id = ${lit(String(crossRow.id))}`),
          )
        } else {
          let code: string | null = null
          let message = ''
          try {
            await runAs(A, (tx) => tx.execute(sql.raw(insertSql(tableName, crossRow))))
          } catch (error) {
            // drizzle embrulha o PostgresError (DrizzleQueryError.cause).
            let e = error as { code?: unknown; message?: unknown; cause?: unknown } | undefined
            while (e) {
              if (typeof e.code === 'string' && !code) code = e.code
              if (typeof e.message === 'string' && !message) message = e.message
              e = e.cause as typeof e
            }
          }
          expect(code, `${tableName}: INSERT cross-tenant não recusado (${message})`).toBe('42501')
        }
      })
    })
  }
})
