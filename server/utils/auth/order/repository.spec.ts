import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockTx = {
  insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  query: {
    order: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    orderItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    orderDineIn: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    orderTakeout: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}

const mockWithTenant = vi.fn(
  async (
    tenantId: string | null,
    locationId: string | null,
    userId: string | null,
    fn: any,
    existingTx?: any,
  ) => {
    return fn(existingTx || mockTx)
  },
)

vi.mock('../db', () => ({
  db: {},
  withTenant: mockWithTenant,
}))

vi.mock('../../schema', () => ({
  order: { id: 'id', companyId: 'company_id' },
  orderItem: {},
  orderDineIn: {},
  orderTakeout: {},
  sql: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('../tenant-context', () => ({
  withTenant: mockWithTenant,
}))

describe('orderRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset default mocks
    mockTx.query.order.findFirst.mockResolvedValue(null)
    mockTx.query.order.findMany.mockResolvedValue([])
    mockTx.query.orderItem.findMany.mockResolvedValue([])
    mockTx.query.orderDineIn.findFirst.mockResolvedValue(null)
    mockTx.query.orderTakeout.findFirst.mockResolvedValue(null)
    mockTx.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    })
    mockTx.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    })
  })

  it.skip('create: inserts order with items and returns order with items', async () => {
    const mockOrder = {
      id: 'order-1',
      companyId: 'company-1',
      status: 'open',
      totalAmount: '0',
      orderType: 'dine_in',
    }
    const mockItems = [
      { id: 'item-1', orderId: 'order-1', productName: 'Test', lineTotal: '10.00' },
    ]
    const mockDineIn = {
      orderId: 'order-1',
      tableId: 'table-1',
      coverCount: 2,
      waiterId: null,
      openedAt: new Date(),
    }

    let findFirstCallCount = 0
    mockTx.query.order.findFirst.mockImplementation(async () => {
      findFirstCallCount++
      if (findFirstCallCount === 1) return null // idempotency check
      if (findFirstCallCount === 2) return { ...mockOrder, orderType: 'dine_in' } // getById
      return null
    })

    mockTx.insert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockOrder]),
        }),
      })
      .mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      })

    mockTx.query.orderItem.findMany.mockResolvedValue(mockItems)
    mockTx.query.orderDineIn.findFirst.mockResolvedValue(mockDineIn)

    const { orderRepository } = await import('./repository')

    const result = await orderRepository.create({
      companyId: 'company-1',
      locationId: 'location-1',
      orderType: 'dine_in',
      createdBy: 'user-1',
      items: [
        {
          productName: 'Test',
          unitPrice: '10.00',
          quantity: '1',
          taxSnapshot: '{}',
          bomSnapshot: '{}',
        },
      ],
      dineIn: { tableId: 'table-1', coverCount: 2 },
    })

    expect(result).toBeDefined()
    expect(result.id).toBe('order-1')
    expect(result.items).toHaveLength(1)
    expect(result.dineIn?.tableId).toBe('table-1')
  })

  it('getById: returns order with items', async () => {
    mockTx.query.order.findFirst.mockResolvedValue({
      id: 'order-1',
      companyId: 'company-1',
      status: 'open',
      orderType: 'takeout',
    })

    mockTx.query.orderItem.findMany.mockResolvedValue([{ id: 'item-1' }])

    const { orderRepository } = await import('./repository')
    const result = await orderRepository.getById('company-1', 'order-1')

    expect(result).toBeDefined()
    expect(result?.id).toBe('order-1')
    expect(result?.items).toHaveLength(1)
  })

  it('complete: transitions open -> completed', async () => {
    let findFirstCallCount = 0
    mockTx.query.order.findFirst.mockImplementation(async () => {
      findFirstCallCount++
      if (findFirstCallCount === 1) return { id: 'order-1', status: 'open', orderType: 'dine_in' }
      if (findFirstCallCount === 2)
        return { id: 'order-1', status: 'completed', orderType: 'dine_in' }
      return null
    })

    const { orderRepository } = await import('./repository')
    const result = await orderRepository.complete('company-1', 'order-1')

    expect(result?.status).toBe('completed')
  })

  it('complete: throws if status not open', async () => {
    mockTx.query.order.findFirst.mockResolvedValue({ id: 'order-1', status: 'completed' })

    const { orderRepository } = await import('./repository')

    await expect(orderRepository.complete('company-1', 'order-1')).rejects.toThrow(
      'Cannot complete',
    )
  })

  it('cancel: transitions open -> cancelled', async () => {
    let findFirstCallCount = 0
    mockTx.query.order.findFirst.mockImplementation(async () => {
      findFirstCallCount++
      if (findFirstCallCount === 1) return { id: 'order-1', status: 'open', orderType: 'takeout' }
      if (findFirstCallCount === 2)
        return { id: 'order-1', status: 'cancelled', orderType: 'takeout' }
      return null
    })

    const { orderRepository } = await import('./repository')
    const result = await orderRepository.cancel('company-1', 'order-1')

    expect(result?.status).toBe('cancelled')
  })

  it('cancel: throws if status not open', async () => {
    mockTx.query.order.findFirst.mockResolvedValue({ id: 'order-1', status: 'completed' })

    const { orderRepository } = await import('./repository')

    await expect(orderRepository.cancel('company-1', 'order-1')).rejects.toThrow('Cannot cancel')
  })

  it('list: returns paginated orders', async () => {
    mockTx.query.order.findMany.mockResolvedValue([
      { id: 'order-1', status: 'open', orderType: 'dine_in' },
      { id: 'order-2', status: 'completed', orderType: 'takeout' },
    ])

    const { orderRepository } = await import('./repository')
    const result = await orderRepository.list('company-1', { limit: 10 })

    expect(result).toHaveLength(2)
  })
})
