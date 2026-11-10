import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSignInEmail, mockLimit } = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
  mockLimit: vi.fn(async (): Promise<unknown[]> => []),
}))

vi.mock('./client', () => ({
  callBetterAuth: vi.fn(async (fn: (auth: unknown) => unknown) =>
    fn({ api: { signInEmail: mockSignInEmail } }),
  ),
}))

vi.mock('#shared/auth', () => ({ getAuth: vi.fn() }))

vi.mock('../../../utils/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: mockLimit })) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn() })),
  },
}))

function signInResponse() {
  const now = new Date()
  return {
    response: {
      redirect: false,
      token: 'session-token',
      user: {
        id: 'u1',
        email: 'a@b.c',
        name: 'A',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    },
    headers: new Headers(),
    setCookie: [],
  }
}

function userRow(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    id: 'u1',
    email: 'a@b.c',
    name: 'A',
    isActive: true,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('signInUser contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the shape login.post.ts consumes', async () => {
    mockLimit.mockResolvedValue([userRow()])
    mockSignInEmail.mockResolvedValue(signInResponse())

    const { signInUser } = await import('./queries')
    const result = await signInUser({ email: 'a@b.c', password: 'pw' }, new Headers())

    // Would throw "Cannot read properties of undefined" if .response were missing.
    expect(result.response.user.id).toBe('u1')
    expect(result.response.token).toBe('session-token')
    expect(Array.isArray(result.setCookie)).toBe(true)
    expect(mockSignInEmail).toHaveBeenCalledTimes(1)
  })

  // Regression: the isActive gate was dropped in 191917d, letting deactivated
  // and consent-withdrawn users sign back in with a fresh session.
  it('rejects a deactivated account before paying the better-auth cost', async () => {
    mockLimit.mockResolvedValue([userRow({ isActive: false })])
    mockSignInEmail.mockRejectedValue(
      Object.assign(new Error('Invalid email or password'), { statusCode: 401 }),
    )

    const { signInUser } = await import('./queries')

    await expect(
      signInUser({ email: 'a@b.c', password: 'pw' }, new Headers()),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('account_deactivated'),
    })

    // Only the timing pad ran — the real password never reached better-auth.
    expect(mockSignInEmail).toHaveBeenCalledTimes(1)
    expect(mockSignInEmail.mock.calls[0]![0]!.body.password).not.toBe('pw')
  })
})
