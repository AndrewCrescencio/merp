import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('Auth event export pages', () => {
  it('keeps microseconds and ID order, scopes by user, and excludes events after the cutoff', async () => {
    const { listUserAuthEventsPage } = await import('./queries')
    const { withTenant } = await import('../../db/tenant-context')
    const { authEvent } = await import('../../schema')
    const userId = randomUUID()
    const otherUser = randomUUID()
    const ids = ['a', 'b', '0', 'newer'].map((suffix) => `${userId}-${suffix}`)
    const firstTime = sql`'2000-01-01T00:00:00.000001Z'::timestamptz`
    const base = { userId, email: 'pagination@example.com', eventType: 'session_created' }
    const runAs = (id: string) => ({ userId: id, companyId: null, locationId: null })

    await withTenant(runAs(userId), (tx) =>
      tx.insert(authEvent).values([
        { ...base, id: ids[1]!, createdAt: firstTime },
        { ...base, id: ids[0]!, createdAt: firstTime },
        { ...base, id: ids[2]!, createdAt: sql`'2000-01-01T00:00:00.000002Z'::timestamptz` },
      ]),
    )
    await withTenant(runAs(otherUser), (tx) =>
      tx.insert(authEvent).values({ ...base, userId: otherUser, createdAt: firstTime }),
    )

    const first = await listUserAuthEventsPage(userId, 1)
    expect(first.events.map(({ id }) => id)).toEqual([ids[0]])
    expect(first.next).toMatchObject({ id: ids[0], createdAt: '2000-01-01T00:00:00.000001Z' })

    await withTenant(runAs(userId), (tx) =>
      tx.insert(authEvent).values({
        ...base,
        id: ids[3]!,
        createdAt: sql`${first.next!.cutoff}::timestamptz + interval '1 microsecond'`,
      }),
    )

    const second = await listUserAuthEventsPage(userId, 1, first.next!)
    expect(second.events.map(({ id }) => id)).toEqual([ids[1]])
    expect(second.next).toMatchObject({ id: ids[1], cutoff: first.next!.cutoff })

    const third = await listUserAuthEventsPage(userId, 1, second.next!)
    expect(third.events.map(({ id }) => id)).toEqual([ids[2]])
    expect(third.next).toBeNull()
  })
})
