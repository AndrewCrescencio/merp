import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineAuthHandler } from '~~/server/utils/shared/handler'

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

describe('defineAuthHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 quando não há user', async () => {
    const wrapped = defineAuthHandler(async (_event: any, _user: any) => {
      throw new Error('não deve chegar aqui')
    })
    await expect(wrapped({ context: {} } as any)).rejects.toThrow('Authentication required.')
  })

  it('retorna 401 quando não há session', async () => {
    const wrapped = defineAuthHandler(async (_event: any, _user: any) => {
      throw new Error('não deve chegar aqui')
    })
    await expect(
      wrapped({ context: { user: { id: 'u1', email: 'a@b.c', name: null } } } as any),
    ).rejects.toThrow('Authentication required.')
  })

  it('chama o handler com o user quando há user e session', async () => {
    const fn = vi.fn(async (_event: any, user: any) => ({ ok: true, userId: user.id }))
    const wrapped = defineAuthHandler(fn)
    const result = await wrapped({
      context: {
        user: { id: 'u1', email: 'a@b.c', name: null },
        session: { id: 's1' },
      },
    } as any)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0][1]).toEqual({ id: 'u1', email: 'a@b.c', name: null })
    expect(result).toEqual({ ok: true, userId: 'u1' })
  })

  it('formato do 401 é { error: unauthorized, message }', async () => {
    const wrapped = defineAuthHandler(async (_event: any, _user: any) => ({}))
    try {
      await wrapped({ context: {} } as any)
    } catch (e: any) {
      const body = JSON.parse(e.message)
      expect(e.status).toBe(401)
      expect(body).toEqual({ error: 'unauthorized', message: 'Authentication required.' })
    }
  })
})
