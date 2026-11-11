/* eslint-disable import/first */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('nitropack/runtime', () => ({
  defineTask: (def: any) => def,
}))

vi.mock('~~/server/utils/shared/purge', () => ({
  runPurgeTask: vi.fn().mockResolvedValue({ result: 'success', deletedCount: 1 }),
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
import purgeAuthSecurityState from '~~/server/tasks/purge-auth-security-state'

describe('purge-auth-security-state task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(runPurgeTask as any).mockResolvedValue({ result: 'success', deletedCount: 1 })
  })

  it('chama runPurgeTask com retention de 7 dias', async () => {
    const result = await purgeAuthSecurityState.run({} as any)

    expect(result).toEqual({ result: 'success', deletedCount: 1 })
    expect(runPurgeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        eventPrefix: 'purge_auth_security_state',
      }),
    )
  })
})
