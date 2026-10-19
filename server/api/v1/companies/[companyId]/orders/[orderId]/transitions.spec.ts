import { describe, it, expect, vi, beforeEach } from 'vitest'

// R8: transição inválida = 409 (conflito com o estado atual); recurso
// inexistente = 404. Antes da migração REST os dois respondiam 400.
const mockCancel = vi.fn()
const mockComplete = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRouterParam: () => 'order-1',
  createError: (opts: any) => {
    const err = new Error(opts.message)
    // send*Error passa `status`; createError cru passa `statusCode`.
    ;(err as any).statusCode = opts.statusCode ?? opts.status
    throw err
  },
}))
vi.mock('~~/server/utils/shared/auth-context', () => ({
  requireTenant: () => ({ companyId: 'company-1', role: 'owner' }),
}))
vi.mock('~~/server/utils/order/repository', () => ({
  orderRepository: { cancel: mockCancel, complete: mockComplete },
}))

const ev = {
  context: { auth: { user: { id: 'user-1', email: 'user@example.com' } } },
} as any

const loadCancel = () =>
  import('~~/server/api/v1/companies/[companyId]/orders/[orderId]/cancel.post').then(
    (m) => m.default,
  )
const loadComplete = () =>
  import('~~/server/api/v1/companies/[companyId]/orders/[orderId]/complete.post').then(
    (m) => m.default,
  )

describe('R8 — transições de pedido (409/404, não 400)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cancel bloqueado pelo estado do pedido → 409', async () => {
    mockCancel.mockRejectedValue(new Error('Cannot cancel order with status completed'))
    const handler = await loadCancel()
    await expect(handler(ev)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('complete bloqueado pelo estado do pedido → 409', async () => {
    mockComplete.mockRejectedValue(new Error('Cannot complete order with status cancelled'))
    const handler = await loadComplete()
    await expect(handler(ev)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('cancel de pedido inexistente (repo devolve null) → 404', async () => {
    mockCancel.mockResolvedValue(null)
    const handler = await loadCancel()
    await expect(handler(ev)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('cancel válido devolve o pedido atualizado', async () => {
    const order = { id: 'order-1', status: 'cancelled' }
    mockCancel.mockResolvedValue(order)
    const handler = await loadCancel()
    await expect(handler(ev)).resolves.toEqual(order)
  })
})
