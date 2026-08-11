import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetAuth, mockSignInEmail, mockLimit, mockWhereDelete, mockLoggerWarn } = vi.hoisted(
  () => ({
    mockGetAuth: vi.fn(),
    mockSignInEmail: vi.fn(),
    mockLimit: vi.fn(async () => []),
    mockWhereDelete: vi.fn(async () => undefined),
    mockLoggerWarn: vi.fn(),
  }),
)

vi.mock('#shared/auth', () => ({
  getAuth: mockGetAuth,
}))

vi.mock('#shared/logger', () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}))

vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockLimit,
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: mockWhereDelete,
    })),
  },
}))

function mockUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'existing@example.com',
    name: 'Existing User',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    consentWithdrawnAt: null,
    ...overrides,
  }
}

describe('IdentityRepository.signIn — AUD-07 timing pad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuth.mockResolvedValue({
      api: { signInEmail: mockSignInEmail },
    })
  })

  it('pays the better-auth sign-in cost for deactivated accounts before throwing account_deactivated', async () => {
    mockLimit.mockResolvedValue([mockUserRow({ isActive: false })])
    mockSignInEmail.mockRejectedValue(
      Object.assign(new Error('Invalid email or password'), { statusCode: 401 }),
    )

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(
      repo.signIn({ email: 'existing@example.com', password: 'real-password' }, new Headers()),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('account_deactivated'),
    })

    expect(mockSignInEmail).toHaveBeenCalledTimes(1)
    const padBody = mockSignInEmail.mock.calls[0][0].body
    expect(padBody.email).toBe('existing@example.com')
    expect(padBody.password).not.toBe('real-password')
    expect(mockWhereDelete).not.toHaveBeenCalled()
  })

  it('never returns success or leaks a session if the pad unexpectedly resolves', async () => {
    mockLimit.mockResolvedValue([mockUserRow({ isActive: false })])
    mockSignInEmail.mockResolvedValue({ response: { token: 'leaked-token' } })

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(
      repo.signIn({ email: 'existing@example.com', password: 'real-password' }, new Headers()),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('account_deactivated'),
    })

    expect(mockSignInEmail).toHaveBeenCalledTimes(1)
    expect(mockWhereDelete).toHaveBeenCalled()
    expect(mockLoggerWarn).toHaveBeenCalled()
  })

  it('keeps passing the real password for non-existent emails (pad does not contaminate the normal path)', async () => {
    mockLimit.mockResolvedValue([])
    mockSignInEmail.mockRejectedValue(
      Object.assign(new Error('Invalid email or password'), { statusCode: 401 }),
    )

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(
      repo.signIn({ email: 'missing@example.com', password: 'real-password' }, new Headers()),
    ).rejects.toMatchObject({ statusCode: 401 })

    expect(mockSignInEmail).toHaveBeenCalledTimes(1)
    expect(mockSignInEmail.mock.calls[0][0].body.password).toBe('real-password')
    expect(mockSignInEmail.mock.calls[0][0].body.email).toBe('missing@example.com')
  })
})
