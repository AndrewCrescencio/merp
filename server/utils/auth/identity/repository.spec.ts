import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGetAuth,
  mockSignInEmail,
  mockSendVerificationEmail,
  mockVerifyEmail,
  mockRequestPasswordReset,
  mockResetPassword,
  mockLimit,
  mockWhereDelete,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockGetAuth: vi.fn(),
  mockSignInEmail: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
  mockVerifyEmail: vi.fn(),
  mockRequestPasswordReset: vi.fn(),
  mockResetPassword: vi.fn(),
  mockLimit: vi.fn(async () => []),
  mockWhereDelete: vi.fn(async () => undefined),
  mockLoggerWarn: vi.fn(),
}))

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

function mockAuthApi() {
  mockGetAuth.mockResolvedValue({
    api: {
      signInEmail: mockSignInEmail,
      sendVerificationEmail: mockSendVerificationEmail,
      verifyEmail: mockVerifyEmail,
      requestPasswordReset: mockRequestPasswordReset,
      resetPassword: mockResetPassword,
    },
  })
}

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
    mockAuthApi()
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

  it('AUD-04: maps 403 email_not_verified from better-auth to the app JSON error shape', async () => {
    mockLimit.mockResolvedValue([mockUserRow()])
    mockSignInEmail.mockRejectedValue(
      Object.assign(new Error('Email not verified'), { statusCode: 403 }),
    )

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(
      repo.signIn({ email: 'existing@example.com', password: 'real-password' }, new Headers()),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('email_not_verified'),
    })
  })
})

describe('IdentityRepository — AUD-04 email verification & password reset flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthApi()
  })

  it('sendVerificationEmail delegates email and wraps in timeout', async () => {
    mockSendVerificationEmail.mockResolvedValue({ status: true })

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.sendVerificationEmail('user@example.com')).resolves.toBeUndefined()
    expect(mockSendVerificationEmail).toHaveBeenCalledWith({ body: { email: 'user@example.com' } })
  })

  it('sendVerificationEmail maps upstream timeout to 503', async () => {
    const { TimeoutError } = await import('../../shared/errors')
    mockSendVerificationEmail.mockRejectedValue(new TimeoutError(5_000))

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.sendVerificationEmail('user@example.com')).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('upstream_timeout'),
    })
  })

  it('verifyEmail delegates token to better-auth', async () => {
    mockVerifyEmail.mockResolvedValue({ status: true, user: null })

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.verifyEmail('signed-jwt')).resolves.toBeUndefined()
    expect(mockVerifyEmail).toHaveBeenCalledWith({ query: { token: 'signed-jwt' } })
  })

  it('verifyEmail maps invalid/expired token (APIError 400/401) to generic 400', async () => {
    mockVerifyEmail.mockRejectedValue(
      Object.assign(new Error('Invalid token'), { statusCode: 401 }),
    )

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.verifyEmail('bogus')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Invalid or expired verification link'),
    })
  })

  it('verifyEmail maps upstream timeout to 503', async () => {
    const { TimeoutError } = await import('../../shared/errors')
    mockVerifyEmail.mockRejectedValue(new TimeoutError(5_000))

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.verifyEmail('signed-jwt')).rejects.toMatchObject({ statusCode: 503 })
  })

  it('requestPasswordReset delegates email with app origin as redirectTo', async () => {
    mockRequestPasswordReset.mockResolvedValue({ status: true })

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.requestPasswordReset('user@example.com')).resolves.toBeUndefined()
    expect(mockRequestPasswordReset).toHaveBeenCalledWith({
      body: { email: 'user@example.com', redirectTo: 'http://localhost:3000' },
    })
  })

  it('resetPassword delegates token and new password', async () => {
    mockResetPassword.mockResolvedValue({ status: true })

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.resetPassword('reset-token', 'new-password-123')).resolves.toBeUndefined()
    expect(mockResetPassword).toHaveBeenCalledWith({
      query: { token: 'reset-token' },
      body: { newPassword: 'new-password-123' },
    })
  })

  it('resetPassword maps invalid/consumed/expired token (400) to generic 400', async () => {
    mockResetPassword.mockRejectedValue(
      Object.assign(new Error('Invalid token'), { statusCode: 400 }),
    )

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.resetPassword('bogus', 'new-password-123')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Invalid or expired reset link'),
    })
  })

  it('validateResetToken resolves true when a fresh reset record exists', async () => {
    mockLimit.mockResolvedValue([{ id: 'verification-id' }])

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.validateResetToken('reset-token')).resolves.toBe(true)
  })

  it('validateResetToken resolves false when the record is missing or expired', async () => {
    mockLimit.mockResolvedValue([])

    const { IdentityRepository } = await import('./repository')
    const repo = new IdentityRepository()

    await expect(repo.validateResetToken('reset-token')).resolves.toBe(false)
  })
})
