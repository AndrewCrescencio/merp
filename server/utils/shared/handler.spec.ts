import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { createAuthEvent } from './audit'
import { defineAuthHandler } from '~~/server/utils/shared/handler'

const { readBody, setHeader, setResponseStatus, checkIpRateLimit } = vi.hoisted(() => ({
  readBody: vi.fn(),
  setHeader: vi.fn(),
  setResponseStatus: vi.fn(),
  checkIpRateLimit: vi.fn(),
}))

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
  readBody,
  setHeader,
  setResponseStatus,
}))
vi.mock('./security', () => ({ checkIpRateLimit }))
vi.mock('./audit', () => ({ createAuthEvent: vi.fn() }))
vi.mock('./ip', () => ({ getClientIp: () => '127.0.0.1' }))

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
    expect(fn).toHaveBeenCalledWith(expect.anything(), {
      id: 'u1',
      email: 'a@b.c',
      name: null,
    })
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

describe('defineAuthHandler com opções', () => {
  const event = (tenant?: { companyId: string; role: 'owner' | 'member' }) =>
    ({
      context: {
        user: { id: 'u1', email: 'a@b.c', name: null },
        session: { id: 's1' },
        tenant,
      },
    }) as H3Event

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('aplica sessão, limite, tenant e papel antes de ler o body', async () => {
    const handle = vi.fn()
    const wrapped = defineAuthHandler(
      { rateLimit: 'ip', tenant: true, role: 'owner', body: z.string() },
      handle,
    )
    await expect(wrapped({ context: {} } as H3Event)).rejects.toMatchObject({ status: 401 })
    expect(checkIpRateLimit).not.toHaveBeenCalled()

    checkIpRateLimit.mockRejectedValueOnce(new Error('limite'))
    await expect(wrapped(event())).rejects.toThrow('limite')
    await expect(wrapped(event())).rejects.toMatchObject({ status: 500 })
    await expect(wrapped(event({ companyId: 'c1', role: 'member' }))).rejects.toMatchObject({
      status: 403,
    })
    expect(readBody).not.toHaveBeenCalled()
    expect(handle).not.toHaveBeenCalled()
  })

  it('aceita role any para member e rejeita associação ausente', async () => {
    const wrapped = defineAuthHandler(
      { tenant: true, role: 'any' },
      ({ tenant }) => tenant.companyId,
    )
    await expect(wrapped(event())).rejects.toMatchObject({ status: 500 })
    await expect(wrapped(event({ companyId: 'c1', role: 'member' }))).resolves.toBe('c1')
    expect(readBody).not.toHaveBeenCalled()
  })

  it('lê uma vez e aguarda um validador legado assíncrono em rota de sessão', async () => {
    readBody.mockResolvedValue('42')
    const validate = vi.fn(async (input: unknown) => Number(input))
    const wrapped = defineAuthHandler({ body: validate }, ({ body, tenant }) => ({ body, tenant }))

    await expect(wrapped(event())).resolves.toEqual({ body: 42, tenant: undefined })
    expect(readBody).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledExactlyOnceWith('42')
  })

  it('valida Zod, usa a saída transformada e audita antes de configurar a criação', async () => {
    const wrapped = defineAuthHandler(
      {
        body: z.string().transform(async (value) => value.trim().length),
        audit: (result: { id: number }, { body }) => ({
          eventType: 'created',
          metadata: { id: result.id, body },
        }),
        created: ({ id }: { id: number }) => `/api/v1/example/${id}`,
      },
      ({ body }) => ({ id: body }),
    )
    const request = event()
    readBody.mockResolvedValueOnce(17)
    await expect(wrapped(request)).rejects.toMatchObject({ status: 400 })
    expect(createAuthEvent).not.toHaveBeenCalled()
    expect(setHeader).not.toHaveBeenCalled()

    readBody.mockResolvedValueOnce('  abc ')
    await expect(wrapped(request)).resolves.toEqual({ id: 3 })
    expect(createAuthEvent).toHaveBeenCalledExactlyOnceWith({
      userId: 'u1',
      email: 'a@b.c',
      eventType: 'created',
      ipAddress: '127.0.0.1',
      metadata: { id: 3, body: 3 },
    })
    expect(vi.mocked(createAuthEvent).mock.invocationCallOrder[0]).toBeLessThan(
      setResponseStatus.mock.invocationCallOrder[0]!,
    )
    expect(setResponseStatus).toHaveBeenCalledExactlyOnceWith(request, 201)
    expect(setHeader).toHaveBeenCalledExactlyOnceWith(request, 'Location', '/api/v1/example/3')
  })
})
