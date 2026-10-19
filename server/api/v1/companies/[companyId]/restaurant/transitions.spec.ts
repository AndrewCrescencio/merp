import { describe, it, expect, vi, beforeEach } from 'vitest'

// R8: transição inválida = 409; recurso inexistente = 404 (antes: 400 para
// os dois). Cobre os quatro branches de catch alterados em restaurant.
const mockOpenTable = vi.fn()
const mockCloseTable = vi.fn()
const mockOpenCashierShift = vi.fn()
const mockCloseCashierShift = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRouterParam: () => 'resource-1',
  readBody: async () => ({
    openingFloat: 100,
    closingFloat: 100,
    expectedAmount: 200,
    actualAmount: 200,
  }),
  setResponseStatus: () => {},
  setHeader: () => {},
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
vi.mock('~~/server/utils/shared/location', () => ({
  requireLocationId: async () => 'location-1',
}))
vi.mock('~~/server/utils/restaurant/repository', () => ({
  restaurantRepository: {
    openTable: mockOpenTable,
    closeTable: mockCloseTable,
    openCashierShift: mockOpenCashierShift,
    closeCashierShift: mockCloseCashierShift,
  },
}))

const ev = {
  context: { auth: { user: { id: 'user-1', email: 'user@example.com' } } },
} as any

const load = (path: string) => import(path).then((m) => m.default)

describe('R8 — transições de restaurante (409/404, não 400)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('abrir mesa ocupada → 409', async () => {
    mockOpenTable.mockRejectedValue(new Error('Table is not available (current status: occupied)'))
    const handler = await load(
      '~~/server/api/v1/companies/[companyId]/restaurant/tables/[tableId]/open.post',
    )
    await expect(handler(ev)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('abrir mesa inexistente → 404', async () => {
    mockOpenTable.mockRejectedValue(new Error('Table not found'))
    const handler = await load(
      '~~/server/api/v1/companies/[companyId]/restaurant/tables/[tableId]/open.post',
    )
    await expect(handler(ev)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('fechar mesa não ocupada → 409', async () => {
    mockCloseTable.mockRejectedValue(new Error('Table is not occupied (current status: available)'))
    const handler = await load(
      '~~/server/api/v1/companies/[companyId]/restaurant/tables/[tableId]/close.post',
    )
    await expect(handler(ev)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('abrir turno com outro turno aberto → 409', async () => {
    mockOpenCashierShift.mockRejectedValue(new Error('User already has an open shift'))
    const handler = await load(
      '~~/server/api/v1/companies/[companyId]/restaurant/cashier-shifts/index.post',
    )
    await expect(handler(ev)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('fechar turno inexistente → 404', async () => {
    mockCloseCashierShift.mockRejectedValue(new Error('Shift not found'))
    const handler = await load(
      '~~/server/api/v1/companies/[companyId]/restaurant/cashier-shifts/[shiftId]/close.post',
    )
    await expect(handler(ev)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('fechar turno já fechado → 409', async () => {
    mockCloseCashierShift.mockRejectedValue(new Error('Shift is not open (current status: closed)'))
    const handler = await load(
      '~~/server/api/v1/companies/[companyId]/restaurant/cashier-shifts/[shiftId]/close.post',
    )
    await expect(handler(ev)).rejects.toMatchObject({ statusCode: 409 })
  })
})
