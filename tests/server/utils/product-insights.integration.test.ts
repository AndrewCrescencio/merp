import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../../../server/utils/db'
import { withTenant } from '../../../server/utils/db/tenant-context'
import { getPostgresErrorCode } from '../../../server/utils/shared/errors'
import { createOwnerDbForSetupOnly } from '../../support/owner-db'

const dbAvailable = process.env.DB_AVAILABLE === 'true'
const utcDay = sql`(transaction_timestamp() AT TIME ZONE 'UTC')::date`
const statementUtcDay = sql`(statement_timestamp() AT TIME ZONE 'UTC')::date`
const record = (event: string | null, channel: string | null) =>
  sql`SELECT public.record_product_milestone(${event}::text, ${channel}::text)`

function hasPostgresCode(code: string) {
  return (error: unknown) => getPostgresErrorCode(error) === code
}

describe.skipIf(!dbAvailable)('product insights counters (PostgreSQL)', () => {
  const { db: ownerDb, close: closeOwnerDb } = createOwnerDbForSetupOnly()
  afterAll(() => closeOwnerDb())

  it('records only the selected milestone and channel on the UTC day', async () => {
    const channels = ['search', 'social', 'referral', 'advertising', 'event', 'other']
    const milestones = ['company_created', 'location_created', 'invite_accepted']
    const rollback = new Error('roll back counter fixtures')

    await expect(
      ownerDb.transaction(async (tx) => {
        // Choose an offset that places the session on a different date from UTC.
        await tx.execute(sql`
          SELECT set_config('TimeZone', CASE
            WHEN (transaction_timestamp() AT TIME ZONE 'UTC')::time >= time '10:00'
            THEN 'Pacific/Kiritimati' ELSE 'Pacific/Honolulu' END, true)
        `)
        const [dateCheck] = await tx.execute<{ utc: string; local: string }>(sql`
          SELECT ${utcDay}::text AS utc, current_date::text AS local
        `)
        expect(dateCheck!.utc).not.toBe(dateCheck!.local)

        const counts = sql`
          SELECT day::text, event_name, acquisition_channel, event_count::text
          FROM product_insights.daily_event_counts
          WHERE day IN (${utcDay}, current_date)
        `
        type Counter = {
          day: string
          event_name: string
          acquisition_channel: string | null
          event_count: string
        }
        const before = await tx.execute<Counter>(counts)
        await tx.execute(sql`SET LOCAL ROLE merp_app`)
        for (const channel of [null, ...channels]) {
          await tx.execute(record('signup_completed', channel))
        }
        for (const milestone of milestones) {
          await tx.execute(record(milestone, null))
        }
        await tx.execute(sql`RESET ROLE`)
        const after = await tx.execute<Counter>(counts)
        const getCount = (rows: Counter[], day: string, event: string, channel?: string) =>
          rows
            .filter(
              (r) =>
                r.day === day &&
                r.event_name === event &&
                (channel === undefined || r.acquisition_channel === channel),
            )
            .reduce((sum, row) => sum + BigInt(row.event_count), 0n)

        for (const channel of ['not_reported', ...channels]) {
          expect(getCount(after, dateCheck!.utc, 'signup_completed', channel)).toBe(
            getCount(before, dateCheck!.utc, 'signup_completed', channel) + 1n,
          )
        }
        for (const event of milestones) {
          expect(getCount(after, dateCheck!.utc, event, 'not_reported')).toBe(
            getCount(before, dateCheck!.utc, event, 'not_reported') + 1n,
          )
        }
        expect(after.filter((row) => row.day === dateCheck!.local)).toEqual(
          before.filter((row) => row.day === dateCheck!.local),
        )
        throw rollback
      }),
    ).rejects.toBe(rollback)
  })

  it('keeps all increments when multiple app sessions write the same counter', async () => {
    const counts = sql`
      SELECT day::text, event_count::text FROM product_insights.daily_event_counts
      WHERE event_name = 'signup_completed' AND acquisition_channel = 'advertising'
    `
    const readCounts = async () =>
      new Map(
        (await ownerDb.execute<{ day: string; event_count: string }>(counts)).map((row) => [
          row.day,
          BigInt(row.event_count),
        ]),
      )
    const before = await readCounts()
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        db
          .execute<{ day: string }>(
            sql`
            SELECT ${statementUtcDay}::text AS day,
              public.record_product_milestone('signup_completed', 'advertising')
          `,
          )
          .then(([row]) => row!.day),
      ),
    )
    const increments = new Map<string, bigint>()
    for (const attempt of attempts) {
      if (attempt.status === 'fulfilled') {
        increments.set(attempt.value, (increments.get(attempt.value) ?? 0n) + 1n)
      }
    }

    try {
      for (const attempt of attempts) {
        if (attempt.status === 'rejected') throw attempt.reason
      }
      const after = await readCounts()
      for (const [day, added] of increments) {
        expect(after.get(day)).toBe((before.get(day) ?? 0n) + added)
      }
    } finally {
      await ownerDb.transaction(async (tx) => {
        for (const [day, added] of increments) {
          const key = sql`day = ${day}::date AND event_name = 'signup_completed' AND acquisition_channel = 'advertising'`
          await tx.execute(sql`
            DELETE FROM product_insights.daily_event_counts WHERE ${key} AND event_count = ${added}
          `)
          await tx.execute(sql`
            UPDATE product_insights.daily_event_counts SET event_count = event_count - ${added}
            WHERE ${key} AND event_count > ${added}
          `)
        }
      })
    }
  })

  it.each([
    [null, null, '23502'],
    ['session_validated', null, '23514'],
    ['signup_completed', 'person@example.test', '23514'],
    ['company_created', 'search', '23514'],
  ] as const)(
    'rejects milestone %j with channel %j outside the allowlist',
    async (event, channel, code) => {
      await expect(db.execute(record(event, channel))).rejects.toSatisfy(hasPostgresCode(code))
    },
  )

  it('gives merp_app function execution without schema usage or table permissions', async () => {
    const [access] = await ownerDb.execute(sql`
      SELECT
        has_function_privilege('merp_app', 'public.record_product_milestone(text,text)', 'EXECUTE') AS app_execute,
        has_schema_privilege('merp_app', 'product_insights', 'USAGE,CREATE') AS app_schema,
        has_table_privilege('merp_app', 'product_insights.daily_event_counts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS app_table,
        EXISTS (
          SELECT 1 FROM pg_proc fn
          CROSS JOIN LATERAL aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) AS acl
          WHERE fn.oid = 'public.record_product_milestone(text,text)'::regprocedure
            AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        ) AS public_execute
    `)
    expect(access).toMatchObject({
      app_execute: true,
      app_schema: false,
      app_table: false,
      public_execute: false,
    })

    const scopes = { companyId: 'test-company', locationId: 'test-location', userId: 'test-user' }
    await expect(
      withTenant(scopes, (tx) =>
        tx.execute(sql`SELECT event_count FROM product_insights.daily_event_counts`),
      ),
    ).rejects.toSatisfy(hasPostgresCode('42501'))
    await expect(
      withTenant(scopes, (tx) =>
        tx.execute(sql`UPDATE product_insights.daily_event_counts SET event_count = 1`),
      ),
    ).rejects.toSatisfy(hasPostgresCode('42501'))
  })
})
