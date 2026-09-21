import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('#shared/logger', () => ({
  logger: { info: mockLoggerInfo, error: mockLoggerError, warn: vi.fn() },
}))

describe('runPurgeTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes rows older than the retention window and reports the count', async () => {
    const { runPurgeTask } = await import('./purge')
    const remove = vi.fn().mockResolvedValue(7)

    const result = await runPurgeTask({
      retentionMs: 1_000,
      eventPrefix: 'test_purge',
      startLog: 'test_start',
      completeLog: 'test_complete',
      errorLog: 'test_error',
      remove,
    })

    expect(result).toEqual({ result: 'success', deletedCount: 7 })
    const cutoff: Date = remove.mock.calls[0][0]
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(1_000)
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'test_start',
      expect.objectContaining({ event: 'test_purge_start' }),
    )
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'test_complete',
      expect.objectContaining({ event: 'test_purge_complete', deletedCount: 7 }),
    )
  })

  it('returns error (never throws) when removal fails, keeping event names', async () => {
    const { runPurgeTask } = await import('./purge')

    const result = await runPurgeTask({
      retentionMs: 1_000,
      eventPrefix: 'test_purge',
      startLog: 'test_start',
      completeLog: 'test_complete',
      errorLog: 'test_error',
      remove: () => Promise.reject(new Error('db down')),
    })

    expect(result).toEqual({ result: 'error', error: 'Error: db down' })
    expect(mockLoggerError).toHaveBeenCalledWith(
      'test_error',
      expect.objectContaining({ event: 'test_purge_error' }),
    )
  })
})
