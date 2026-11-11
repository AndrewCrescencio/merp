/* eslint-disable import/first */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('nitropack/runtime', () => ({
  defineTask: (def: any) => def,
}))

vi.mock('~~/server/utils/shared/purge', () => ({
  runPurgeTask: vi.fn().mockResolvedValue({ result: 'success', deletedCount: 5 }),
}))

vi.mock('~~/server/utils/db', () => ({
  db: {
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
  },
}))

import { runPurgeTask } from '~~/server/utils/shared/purge'
import purgeAuthEvent from '~~/server/tasks/purge-auth-event'

describe('purge-auth-event task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(runPurgeTask as any).mockResolvedValue({ result: 'success', deletedCount: 5 })
  })

  afterEach(() => {
    delete process.env.AUTH_EVENT_RETENTION_DAYS
  })

  it('usa default de 90 dias e remove 5 eventos', async () => {
    const result = await purgeAuthEvent.run({} as any)

    expect(result).toEqual({ result: 'success', deletedCount: 5 })
    expect(runPurgeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        retentionMs: 90 * 24 * 60 * 60 * 1000,
        eventPrefix: 'purge_auth_event',
      }),
    )
  })

  it('respeita AUTH_EVENT_RETENTION_DAYS=60', async () => {
    process.env.AUTH_EVENT_RETENTION_DAYS = '60'
    await purgeAuthEvent.run({} as any)

    expect(runPurgeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        retentionMs: 60 * 24 * 60 * 60 * 1000,
      }),
    )
  })

  it('aplica piso de 30 dias quando abaixo do mínimo', async () => {
    process.env.AUTH_EVENT_RETENTION_DAYS = '10'
    await purgeAuthEvent.run({} as any)

    expect(runPurgeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        retentionMs: 30 * 24 * 60 * 60 * 1000,
      }),
    )
  })
})
