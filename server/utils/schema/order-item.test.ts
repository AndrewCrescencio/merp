import { describe, it, expect } from 'vitest'
import { db, createOwnerDbForSetupOnly } from '../db'
import { sql } from 'drizzle-orm'
import { orderItem } from './order-item'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('round_half_up function', () => {
  const ownerDb = createOwnerDbForSetupOnly()

  it('rounds half-up to 2 decimal places', async () => {
    const tests = [
      { input: '10.004', expected: 10.0 },
      { input: '10.005', expected: 10.01 },
      { input: '10.014', expected: 10.01 },
      { input: '10.015', expected: 10.02 },
      { input: '10.00', expected: 10.0 },
      { input: '10.995', expected: 11.0 },
      { input: '10.994', expected: 10.99 },
      { input: '0.005', expected: 0.01 },
      { input: '0.004', expected: 0.0 },
      { input: '100.005', expected: 100.01 },
    ]

    for (const { input, expected } of tests) {
      const [row] = await ownerDb.execute(sql`SELECT round_half_up(${input}::numeric) as result`)
      expect(Number(row?.result)).toBe(expected)
    }
  })

  it('applies rounding in generated column line_total', async () => {
    const companyId = '11111111-1111-1111-1111-111111111111'
    const locationId = '22222222-2222-2222-2222-222222222222'
    const orderId = '33333333-3333-3333-3333-333333333333'

    await ownerDb.transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${companyId}, 'Test Co') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO location (id, company_id, name) VALUES (${locationId}, ${companyId}, 'Test Loc') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO "order" (id, company_id, location_id, order_type, status, created_by) VALUES (${orderId}, ${companyId}, ${locationId}, 'dine_in', 'open', 'user-1') ON CONFLICT DO NOTHING`,
      )
    })

    const insertTests = [
      { unitPrice: '10.00', quantity: '1', discount: '0', expected: 10.0 },
      { unitPrice: '10.01', quantity: '1', discount: '0', expected: 10.01 },
      { unitPrice: '3.34', quantity: '3', discount: '0', expected: 10.02 },
      { unitPrice: '10.00', quantity: '2', discount: '0.01', expected: 19.99 },
    ]

    for (const { unitPrice, quantity, discount, expected } of insertTests) {
      const [row] = await ownerDb.execute(sql`
        INSERT INTO order_item (company_id, location_id, order_id, product_name, unit_price, quantity, tax_snapshot, bom_snapshot, discount_applied)
        VALUES (${companyId}, ${locationId}, ${orderId}, 'Test', ${unitPrice}, ${quantity}, '{}', '{}', ${discount})
        RETURNING line_total
      `)
      expect(Number(row?.line_total)).toBe(expected)
    }
  })
})
