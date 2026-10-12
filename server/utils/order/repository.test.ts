import { describe, it, expect, beforeAll } from 'vitest'
import { createOwnerDbForSetupOnly } from '../db'
import { sql } from 'drizzle-orm'
import { orderRepository } from './repository'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('orderRepository RLS', () => {
  const ownerDb = createOwnerDbForSetupOnly()

  const companyA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const companyB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const locationA = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  const locationB = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  const userA = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

  beforeAll(async () => {
    await ownerDb.transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${companyA}, 'Company A') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${companyB}, 'Company B') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO location (id, company_id, name) VALUES (${locationA}, ${companyA}, 'Location A') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO location (id, company_id, name) VALUES (${locationB}, ${companyB}, 'Location B') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO "user" (id, email, name) VALUES (${userA}, 'userA@test.com', 'User A') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(sql`
        INSERT INTO company_member (company_id, user_id, role)
        VALUES (${companyA}, ${userA}, 'member')
        ON CONFLICT DO NOTHING
      `)
      // Create restaurant tables for dine_in orders
      await tx.execute(
        sql`INSERT INTO restaurant_table (id, company_id, location_id, number, capacity, status) VALUES ('11111111-1111-1111-1111-111111111111', ${companyA}, ${locationA}, 1, 4, 'available') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO restaurant_table (id, company_id, location_id, number, capacity, status) VALUES ('22222222-2222-2222-2222-222222222222', ${companyB}, ${locationB}, 1, 4, 'available') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO restaurant_table (id, company_id, location_id, number, capacity, status) VALUES ('33333333-3333-3333-3333-333333333333', ${companyA}, ${locationA}, 2, 4, 'available') ON CONFLICT DO NOTHING`,
      )
    })
  })

  it('company A can create and read their own orders', async () => {
    const order = await orderRepository.create({
      companyId: companyA,
      locationId: locationA,
      orderType: 'dine_in',
      createdBy: userA,
      items: [
        {
          productName: 'Coffee',
          unitPrice: '5.00',
          quantity: '2',
          taxSnapshot: '{}',
          bomSnapshot: '{}',
        },
      ],
      dineIn: { tableId: '11111111-1111-1111-1111-111111111111', coverCount: 2 },
    })

    expect(order).toBeDefined()
    expect(order.companyId).toBe(companyA)
    expect(order.items).toHaveLength(1)
    expect(order.dineIn?.coverCount).toBe(2)

    const fetched = await orderRepository.getById(companyA, order.id)
    expect(fetched).toBeDefined()
    expect(fetched?.id).toBe(order.id)
  })

  it('company A cannot read company B orders', async () => {
    const orderB = await orderRepository.create({
      companyId: companyB,
      locationId: locationB,
      orderType: 'takeout',
      createdBy: userA,
      items: [
        {
          productName: 'Burger',
          unitPrice: '15.00',
          quantity: '1',
          taxSnapshot: '{}',
          bomSnapshot: '{}',
        },
      ],
      takeout: { pickupName: 'John' },
    })

    const fetched = await orderRepository.getById(companyA, orderB.id)
    expect(fetched).toBeNull()
  })

  it('company A cannot complete company B orders', async () => {
    const orderB = await orderRepository.create({
      companyId: companyB,
      locationId: locationB,
      orderType: 'dine_in',
      createdBy: userA,
      items: [
        {
          productName: 'Pizza',
          unitPrice: '20.00',
          quantity: '1',
          taxSnapshot: '{}',
          bomSnapshot: '{}',
        },
      ],
      dineIn: { tableId: '22222222-2222-2222-2222-222222222222' },
    })

    await expect(orderRepository.complete(companyA, orderB.id)).rejects.toThrow()
  })

  it('company A cannot cancel company B orders', async () => {
    const orderB = await orderRepository.create({
      companyId: companyB,
      locationId: locationB,
      orderType: 'takeout',
      createdBy: userA,
      items: [
        {
          productName: 'Salad',
          unitPrice: '12.00',
          quantity: '1',
          taxSnapshot: '{}',
          bomSnapshot: '{}',
        },
      ],
      takeout: { pickupName: 'Jane' },
    })

    await expect(orderRepository.cancel(companyA, orderB.id)).rejects.toThrow()
  })

  it('company A list only returns their orders', async () => {
    const listA = await orderRepository.list(companyA)
    const listB = await orderRepository.list(companyB)

    const aIds = listA.map((o) => o.id)
    const bIds = listB.map((o) => o.id)

    expect(aIds.length).toBeGreaterThan(0)
    expect(bIds.length).toBeGreaterThan(0)
    expect(aIds.some((id) => bIds.includes(id))).toBe(false)
  })

  it('FSM: open -> completed is valid', async () => {
    const order = await orderRepository.create({
      companyId: companyA,
      locationId: locationA,
      orderType: 'dine_in',
      createdBy: userA,
      items: [
        {
          productName: 'Tea',
          unitPrice: '3.00',
          quantity: '1',
          taxSnapshot: '{}',
          bomSnapshot: '{}',
        },
      ],
      dineIn: { tableId: '33333333-3333-3333-3333-333333333333' },
    })

    const completed = await orderRepository.complete(companyA, order.id)
    expect(completed?.status).toBe('completed')

    await expect(orderRepository.complete(companyA, order.id)).rejects.toThrow('Cannot complete')
    await expect(orderRepository.cancel(companyA, order.id)).rejects.toThrow('Cannot cancel')
  })

  it('FSM: open -> cancelled is valid', async () => {
    const order = await orderRepository.create({
      companyId: companyA,
      locationId: locationA,
      orderType: 'takeout',
      createdBy: userA,
      items: [
        {
          productName: 'Juice',
          unitPrice: '4.00',
          quantity: '1',
          taxSnapshot: '{}',
          bomSnapshot: '{}',
        },
      ],
      takeout: { pickupName: 'Bob' },
    })

    const cancelled = await orderRepository.cancel(companyA, order.id)
    expect(cancelled?.status).toBe('cancelled')

    await expect(orderRepository.complete(companyA, order.id)).rejects.toThrow('Cannot complete')
    await expect(orderRepository.cancel(companyA, order.id)).rejects.toThrow('Cannot cancel')
  })
})
