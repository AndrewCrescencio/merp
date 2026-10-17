import { describe, it, expect } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createOwnerDbForSetupOnly } from '../db'
import { withTenant } from './tenant-context'
import { resolveLocationId, requireLocationId } from '../shared/location'
import { restaurantTable } from '../schema'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

/**
 * Escopo de location na prática (ADR-002): uma loja não enxerga a outra.
 *
 * Semeia via owner (ignora RLS) e asserta via `withTenant`, que corre como
 * `merp_app` — é o único caminho em que a policy location-scoped é aplicada.
 */
describe.skipIf(!dbAvailable)('location scope — RLS isola lojas dentro da empresa', () => {
  const ownerDb = createOwnerDbForSetupOnly()

  const companyId = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const userId = '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const locA = '33333333-cccc-cccc-cccc-cccccccccccc'
  const locB = '44444444-dddd-dddd-dddd-dddddddddddd'
  const memberUser = '55555555-eeee-eeee-eeee-eeeeeeeeeeee'

  async function seed() {
    await ownerDb.transaction(async (tx) => {
      // Ordem reversa de dependência — o teste é hermético, sem linhas órfãs.
      await tx.execute(sql`DELETE FROM restaurant_table WHERE company_id = ${companyId}`)
      await tx.execute(sql`DELETE FROM company_member WHERE company_id = ${companyId}`)
      await tx.execute(sql`DELETE FROM location WHERE company_id = ${companyId}`)
      await tx.execute(sql`DELETE FROM "user" WHERE id IN (${userId}, ${memberUser})`)
      await tx.execute(sql`DELETE FROM company WHERE id = ${companyId}`)

      await tx.execute(sql`INSERT INTO company (id, name) VALUES (${companyId}, 'Lojas Ltda')`)
      await tx.execute(
        sql`INSERT INTO "user" (id, email, name) VALUES (${userId}, 'owner@lojas.test', 'Owner')`,
      )
      await tx.execute(sql`
        INSERT INTO "user" (id, email, name)
        VALUES (${memberUser}, 'caixa@lojas.test', 'Caixa')
      `)
      await tx.execute(sql`
        INSERT INTO company_member (company_id, user_id, role)
        VALUES (${companyId}, ${userId}, 'owner')
      `)
      await tx.execute(sql`
        INSERT INTO location (id, company_id, name) VALUES (${locA}, ${companyId}, 'Centro')
      `)
      await tx.execute(sql`
        INSERT INTO location (id, company_id, name) VALUES (${locB}, ${companyId}, 'Zona Sul')
      `)
      // O caixa está atribuído à loja A — é isso que deve limitar o que ele vê.
      await tx.execute(sql`
        INSERT INTO company_member (company_id, user_id, role, default_location_id)
        VALUES (${companyId}, ${memberUser}, 'member', ${locA})
      `)
      await tx.execute(sql`
        INSERT INTO restaurant_table (company_id, location_id, number)
        VALUES (${companyId}, ${locA}, 1)
      `)
      await tx.execute(sql`
        INSERT INTO restaurant_table (company_id, location_id, number)
        VALUES (${companyId}, ${locB}, 2)
      `)
    })
  }

  async function readTableNumbers(locationId: string | null) {
    return withTenant(companyId, locationId, memberUser, async (tx) => {
      const rows = await tx
        .select({ number: restaurantTable.number })
        .from(restaurantTable)
        .where(eq(restaurantTable.companyId, companyId))
      return rows.map((r) => r.number).sort()
    })
  }

  it('membro atribuído à loja A vê só as mesas da loja A', async () => {
    await seed()
    expect(await readTableNumbers(locA)).toEqual([1])
  })

  it('a mesma empresa, pedindo a loja B, vê só as mesas da loja B', async () => {
    expect(await readTableNumbers(locB)).toEqual([2])
  })

  it('sem location no escopo (null) cai no escopo company e vê as duas', async () => {
    expect(await readTableNumbers(null)).toEqual([1, 2])
  })

  it('mesmo com company correto, uma location inexistente não devolve nada', async () => {
    const orphan = '99999999-ffff-ffff-ffff-ffffffffffff'
    expect(await readTableNumbers(orphan)).toEqual([])
  })

  it('o banco rejeita insert cru sem location (backstop além do tipo)', async () => {
    // O Drizzle já exige locationId no tipo — testar via SQL cru, que é o
    // caminho que escaparia da checagem de tipos.
    const err = await withTenant(companyId, null, memberUser, async (tx) =>
      tx.execute(sql`INSERT INTO restaurant_table (company_id, number) VALUES (${companyId}, 97)`),
    ).catch((e: unknown) => e)

    let cause = err as { code?: string; cause?: unknown } | null
    while (cause && !cause.code) cause = cause.cause as typeof cause
    expect(cause?.code).toBe('23502') // not_null_violation em location_id
  })

  it('escrever com a location do escopo funciona', async () => {
    const inserted = await withTenant(companyId, locA, memberUser, async (tx) =>
      tx
        .insert(restaurantTable)
        .values({ companyId, locationId: locA, number: 98 })
        .returning({ id: restaurantTable.id }),
    )
    expect(inserted).toHaveLength(1)
  })

  it('resolveLocationId devolve a loja atribuída ao membro', async () => {
    await seed()
    expect(await resolveLocationId(companyId, memberUser)).toBe(locA)
  })

  it('resolveLocationId devolve null quando o membro não tem loja atribuída', async () => {
    // O owner não tem default_location_id: estado legítimo de escopo company.
    expect(await resolveLocationId(companyId, userId)).toBeNull()
  })

  it('requireLocationId lança 400 acionável quando não há loja no escopo', async () => {
    await expect(
      withTenant(companyId, null, memberUser, async () => requireLocationId(companyId, userId)),
    ).rejects.toThrow(/No default location/)
  })
})
