import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.fn()
const mockLoggerWarn = vi.fn()

vi.mock('../db', () => ({
  db: {
    insert: () => ({
      values: mockInsert,
    }),
  },
}))

vi.mock('#shared/logger', () => ({
  logger: { warn: mockLoggerWarn },
}))

describe('createAuthEvent (FR-023)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records the auth event', async () => {
    mockInsert.mockResolvedValue(undefined)

    const { createAuthEvent } = await import('./audit')

    await createAuthEvent({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'login',
      ipAddress: '127.0.0.1',
    })

    expect(mockInsert).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'login',
      ipAddress: '127.0.0.1',
      metadata: null,
    })
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })

  it('AUD-14: never throws on audit failure — warns and resolves', async () => {
    mockInsert.mockRejectedValue(new Error('permission denied'))

    const { createAuthEvent } = await import('./audit')

    await expect(
      createAuthEvent({
        email: 'user@example.com',
        eventType: 'registration',
      }),
    ).resolves.toBeUndefined()
    expect(mockLoggerWarn).toHaveBeenCalledWith('Failed to record auth event', {
      eventType: 'registration',
      error: 'permission denied',
    })
  })
})
