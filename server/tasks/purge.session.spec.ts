/* eslint-disable import/first */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('nitropack/runtime', () => ({
  defineTask: (def: any) => def,
}))

vi.mock('~~/server/utils/shared/purge', () => ({
  runPurgeTask: vi.fn().mockResolvedValue({ result: 'success', deletedCount: 3 }),
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
import purgeSession from '~~/server/tasks/purge.session'

describe('purge-session task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(runPurgeTask as any).mockResolvedValue({ result: 'success', deletedCount: 3 })
  })

  it('chama runPurgeTask com retention de 1 dia', async () => {
    const result = await purgeSession.run({} as any)

    expect(result).toEqual({ result: 'success', deletedCount: 3 })
    expect(runPurgeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        retentionMs: 24 * 60 * 60 * 1000,
        eventPrefix: 'purge_session',
      }),
    )
  })
})
