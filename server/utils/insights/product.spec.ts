import { afterEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { recordProductMilestone } from './product'
import { logger } from '#shared/logger'

const execute = vi.hoisted(() => vi.fn<(query: SQL) => Promise<unknown>>())
vi.mock('../db', () => ({ db: { execute } }))
vi.mock('#shared/logger', () => ({ logger: { warn: vi.fn() } }))

describe('recordProductMilestone', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetAllMocks()
  })

  it('skips collection by default', () => {
    vi.stubEnv('NUXT_PUBLIC_PRODUCT_INSIGHTS_ENABLED', undefined)
    const waitUntil = vi.fn()
    recordProductMilestone({ waitUntil } as unknown as H3Event, 'company_created')

    expect(waitUntil).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('passes only the milestone and channel to PostgreSQL', async () => {
    vi.stubEnv('NUXT_PUBLIC_PRODUCT_INSIGHTS_ENABLED', 'true')
    execute.mockResolvedValue(undefined)
    const waitUntil = vi.fn<(work: Promise<void>) => void>()
    const event = { waitUntil, context: { user: { id: 'identity' } } } as unknown as H3Event
    recordProductMilestone(event, 'signup_completed', 'referral')
    expect(waitUntil).toHaveBeenCalledTimes(1)
    await waitUntil.mock.calls[0]![0]

    expect(execute).toHaveBeenCalledTimes(1)
    expect(new PgDialect().sqlToQuery(execute.mock.calls[0]![0])).toMatchObject({
      sql: 'SELECT public.record_product_milestone($1, $2)',
      params: ['signup_completed', 'referral'],
    })
  })

  it('reports a failed write without leaking query data or rethrowing', async () => {
    vi.stubEnv('NUXT_PUBLIC_PRODUCT_INSIGHTS_ENABLED', 'true')
    execute.mockRejectedValue(new Error('private data'))
    const waitUntil = vi.fn<(work: Promise<void>) => void>()
    recordProductMilestone({ waitUntil } as unknown as H3Event, 'invite_accepted')

    await expect(waitUntil.mock.calls[0]![0]).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith('product_insight_write_failed', {
      milestone: 'invite_accepted',
    })
  })
})
