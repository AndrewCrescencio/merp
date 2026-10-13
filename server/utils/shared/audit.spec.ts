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

// RLS-006: createAuthEvent corre dentro de withTenant — é ele que seta
// app.user_id para a policy INSERT de auth_event. O mock espelha o contrato
// (3 IDs + callback), não o SQL.
const mockWithTenant = vi.fn(
  async (
    tenantId: string | null,
    locationId: string | null,
    userId: string | null,
    fn: (tx: { insert: () => { values: typeof mockInsert } }) => Promise<unknown>,
  ) => fn({ insert: () => ({ values: mockInsert }) }),
)

vi.mock('../db/tenant-context', () => ({
  withTenant: mockWithTenant,
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
    // O userId tem de chegar ao withTenant — sem ele a policy INSERT de
    // auth_event (user_id = get_user_id() OR user_id IS NULL) nega a linha.
    expect(mockWithTenant).toHaveBeenCalledWith(null, null, 'user-1', expect.any(Function))
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
