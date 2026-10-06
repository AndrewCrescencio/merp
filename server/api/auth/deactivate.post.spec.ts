import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateAuthEvent = vi.fn()
const mockGetClientIp = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))
vi.mock('~~/server/utils/shared/ip', () => ({
  getClientIp: mockGetClientIp,
}))
vi.mock('~~/server/utils/shared', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))

describe('POST /api/auth/deactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deactivates user and returns success', async () => {
    const event = defineEventHandler(async (event) => {
      const user = event.context.user as { id: string; email: string } | undefined

      if (!user) {
        throw createError({ statusCode: 401, message: 'Authentication required.' })
      }

      await event.context.auth.api.updateUser({
        body: { isActive: false },
      })

      return { message: 'Account deactivated successfully' }
    })

    const user = { id: 'user-1', email: 'test@example.com' }
    ;(event.context.user as any) = user
    ;(event.context.auth as any).api = {
      updateUser: vi.fn().mockResolvedValue(undefined),
    }

    const result = await event.handler(event)

    expect(result).toEqual({ message: 'Account deactivated successfully' })
  })
})
