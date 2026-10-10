import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withTenant } from '../../db/tenant-context'
import { restaurantRepository } from './repository'
import type { RestaurantTableSelect, KitchenTicketSelect, CashierShiftSelect } from '../../schema'

// Mock withTenant
vi.mock('../../db/tenant-context', () => ({
  withTenant: vi.fn(),
}))

// Mock schema
vi.mock('../../schema', () => ({
  restaurantTable: {},
  kitchenTicket: {},
  cashierShift: {},
}))

const makeMockTx = () => ({
  query: {
    restaurantTable: { findFirst: vi.fn(), findMany: vi.fn() },
    kitchenTicket: { findFirst: vi.fn(), findMany: vi.fn() },
    cashierShift: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn() })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({ returning: vi.fn() })),
  })),
})

describe('restaurantRepository (unit)', () => {
  let mockTx: ReturnType<typeof makeMockTx>

  beforeEach(() => {
    vi.clearAllMocks()
    mockTx = makeMockTx()
    ;(withTenant as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        _companyId: string,
        _locationId: string,
        _userId: string | null,
        fn: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>,
      ) => {
        return fn(mockTx)
      },
    )
  })

  const companyId = 'c1'
  const locationId = 'l1'
  const userId = 'u1'
  const tableId = 't1'

  describe('openTable', () => {
    it('throws if table not found', async () => {
      mockTx.query.restaurantTable.findFirst.mockResolvedValue(null)

      await expect(
        restaurantRepository.openTable({ companyId, locationId, tableId, userId }),
      ).rejects.toThrow('Table not found')
    })

    it('throws if table not available', async () => {
      mockTx.query.restaurantTable.findFirst.mockResolvedValue({
        id: tableId,
        status: 'occupied',
      } as RestaurantTableSelect)

      await expect(
        restaurantRepository.openTable({ companyId, locationId, tableId, userId }),
      ).rejects.toThrow('Table is not available')
    })

    it('opens table successfully', async () => {
      const updatedTable = {
        id: tableId,
        status: 'occupied',
        currentOrderId: null,
        updatedAt: new Date(),
      } as RestaurantTableSelect

      mockTx.query.restaurantTable.findFirst.mockResolvedValue({
        id: tableId,
        status: 'available',
      } as RestaurantTableSelect)

      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTable]),
          }),
        }),
      })

      const result = await restaurantRepository.openTable({
        companyId,
        locationId,
        tableId,
        userId,
      })

      expect(result).toEqual(updatedTable)
      expect(mockTx.query.restaurantTable.findFirst).toHaveBeenCalled()
      expect(mockTx.update).toHaveBeenCalled()
    })
  })

  describe('closeTable', () => {
    it('throws if table not found', async () => {
      mockTx.query.restaurantTable.findFirst.mockResolvedValue(null)

      await expect(
        restaurantRepository.closeTable({ companyId, locationId, tableId, userId }),
      ).rejects.toThrow('Table not found')
    })

    it('throws if table not occupied', async () => {
      mockTx.query.restaurantTable.findFirst.mockResolvedValue({
        id: tableId,
        status: 'available',
      } as RestaurantTableSelect)

      await expect(
        restaurantRepository.closeTable({ companyId, locationId, tableId, userId }),
      ).rejects.toThrow('Table is not occupied')
    })

    it('closes table successfully', async () => {
      const updatedTable = {
        id: tableId,
        status: 'available',
        currentOrderId: null,
        updatedAt: new Date(),
      } as RestaurantTableSelect

      mockTx.query.restaurantTable.findFirst.mockResolvedValue({
        id: tableId,
        status: 'occupied',
      } as RestaurantTableSelect)

      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTable]),
          }),
        }),
      })

      const result = await restaurantRepository.closeTable({
        companyId,
        locationId,
        tableId,
        userId,
      })

      expect(result).toEqual(updatedTable)
    })
  })

  describe('getTable', () => {
    it('returns table when found', async () => {
      const table = { id: tableId } as RestaurantTableSelect
      mockTx.query.restaurantTable.findFirst.mockResolvedValue(table)

      const result = await restaurantRepository.getTable(companyId, locationId, tableId)

      expect(result).toEqual(table)
    })

    it('returns null when not found', async () => {
      mockTx.query.restaurantTable.findFirst.mockResolvedValue(null)

      const result = await restaurantRepository.getTable(companyId, locationId, tableId)

      expect(result).toBeNull()
    })
  })

  describe('listTables', () => {
    it('returns ordered tables', async () => {
      const tables = [
        { id: 't1', number: 1 } as RestaurantTableSelect,
        { id: 't2', number: 2 } as RestaurantTableSelect,
      ]
      mockTx.query.restaurantTable.findMany.mockResolvedValue(tables)

      const result = await restaurantRepository.listTables(companyId, locationId)

      expect(result).toEqual(tables)
      expect(mockTx.query.restaurantTable.findMany).toHaveBeenCalled()
    })
  })

  describe('createKitchenTicket', () => {
    it('creates kitchen ticket', async () => {
      const ticket = {
        id: 'kt1',
        companyId,
        locationId,
        orderId: 'o1',
        status: 'pending',
        items: [{ productName: 'Pizza', quantity: '2' }],
      } as KitchenTicketSelect

      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([ticket]),
        }),
      })

      const result = await restaurantRepository.createKitchenTicket({
        companyId,
        locationId,
        orderId: 'o1',
        items: [{ productName: 'Pizza', quantity: '2' }],
        userId,
      })

      expect(result).toEqual(ticket)
    })
  })

  describe('updateKitchenTicketStatus', () => {
    it('updates ticket status', async () => {
      const ticket = { id: 'kt1', status: 'ready' } as KitchenTicketSelect
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([ticket]),
          }),
        }),
      })

      const result = await restaurantRepository.updateKitchenTicketStatus({
        companyId,
        locationId,
        ticketId: 'kt1',
        status: 'ready',
        userId,
      })

      expect(result).toEqual(ticket)
    })

    it('returns null if ticket not found', async () => {
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      const result = await restaurantRepository.updateKitchenTicketStatus({
        companyId,
        locationId,
        ticketId: 'kt1',
        status: 'ready',
        userId,
      })

      expect(result).toBeNull()
    })
  })

  describe('getKitchenTicket', () => {
    it('returns ticket when found', async () => {
      const ticket = { id: 'kt1' } as KitchenTicketSelect
      mockTx.query.kitchenTicket.findFirst.mockResolvedValue(ticket)

      const result = await restaurantRepository.getKitchenTicket(companyId, locationId, 'kt1')

      expect(result).toEqual(ticket)
    })
  })

  describe('listKitchenTickets', () => {
    it('returns tickets with optional status filter', async () => {
      const tickets = [{ id: 'kt1', status: 'pending' } as KitchenTicketSelect]
      mockTx.query.kitchenTicket.findMany.mockResolvedValue(tickets)

      const result = await restaurantRepository.listKitchenTickets(companyId, locationId, 'pending')

      expect(result).toEqual(tickets)
    })
  })

  describe('openCashierShift', () => {
    it('throws if user already has open shift', async () => {
      mockTx.query.cashierShift.findFirst.mockResolvedValue({ id: 's1' } as CashierShiftSelect)

      await expect(
        restaurantRepository.openCashierShift({
          companyId,
          locationId,
          userId,
          openingFloat: '100.00',
        }),
      ).rejects.toThrow('User already has an open shift')
    })

    it('opens shift successfully', async () => {
      mockTx.query.cashierShift.findFirst.mockResolvedValue(null)
      const shift = { id: 's1', status: 'open' } as CashierShiftSelect

      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([shift]),
        }),
      })

      const result = await restaurantRepository.openCashierShift({
        companyId,
        locationId,
        userId,
        openingFloat: '100.00',
      })

      expect(result).toEqual(shift)
    })
  })

  describe('closeCashierShift', () => {
    it('throws if shift not found', async () => {
      mockTx.query.cashierShift.findFirst.mockResolvedValue(null)

      await expect(
        restaurantRepository.closeCashierShift({
          companyId,
          locationId,
          shiftId: 's1',
          userId,
          closingFloat: '150.00',
          expectedAmount: '150.00',
          actualAmount: '150.00',
        }),
      ).rejects.toThrow('Shift not found')
    })

    it('throws if shift not open', async () => {
      mockTx.query.cashierShift.findFirst.mockResolvedValue({
        id: 's1',
        status: 'closed',
      } as CashierShiftSelect)

      await expect(
        restaurantRepository.closeCashierShift({
          companyId,
          locationId,
          shiftId: 's1',
          userId,
          closingFloat: '150.00',
          expectedAmount: '150.00',
          actualAmount: '150.00',
        }),
      ).rejects.toThrow('Shift is not open')
    })

    it('closes shift with reconciled status when difference is zero', async () => {
      const shift = { id: 's1', status: 'open' } as CashierShiftSelect
      mockTx.query.cashierShift.findFirst.mockResolvedValue(shift)

      const updatedShift = {
        ...shift,
        status: 'reconciled',
        closedAt: new Date(),
      } as CashierShiftSelect
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedShift]),
          }),
        }),
      })

      const result = await restaurantRepository.closeCashierShift({
        companyId,
        locationId,
        shiftId: 's1',
        userId,
        closingFloat: '150.00',
        expectedAmount: '150.00',
        actualAmount: '150.00',
      })

      expect(result.status).toBe('reconciled')
    })

    it('closes shift with closed status when difference is not zero', async () => {
      const shift = { id: 's1', status: 'open' } as CashierShiftSelect
      mockTx.query.cashierShift.findFirst.mockResolvedValue(shift)

      const updatedShift = {
        ...shift,
        status: 'closed',
        closedAt: new Date(),
      } as CashierShiftSelect
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedShift]),
          }),
        }),
      })

      const result = await restaurantRepository.closeCashierShift({
        companyId,
        locationId,
        shiftId: 's1',
        userId,
        closingFloat: '150.00',
        expectedAmount: '150.00',
        actualAmount: '160.00',
      })

      expect(result.status).toBe('closed')
    })
  })

  describe('getCashierShift', () => {
    it('returns shift when found', async () => {
      const shift = { id: 's1' } as CashierShiftSelect
      mockTx.query.cashierShift.findFirst.mockResolvedValue(shift)

      const result = await restaurantRepository.getCashierShift(companyId, locationId, 's1')

      expect(result).toEqual(shift)
    })
  })

  describe('listCashierShifts', () => {
    it('returns shifts with filters', async () => {
      const shifts = [{ id: 's1', status: 'open' } as CashierShiftSelect]
      mockTx.query.cashierShift.findMany.mockResolvedValue(shifts)

      const result = await restaurantRepository.listCashierShifts(companyId, locationId, {
        status: 'open',
        userId,
        limit: 10,
      })

      expect(result).toEqual(shifts)
    })
  })

  describe('getCurrentUserShift', () => {
    it('returns current open shift for user', async () => {
      const shift = { id: 's1', userId } as CashierShiftSelect
      mockTx.query.cashierShift.findFirst.mockResolvedValue(shift)

      const result = await restaurantRepository.getCurrentUserShift(companyId, locationId, userId)

      expect(result).toEqual(shift)
    })
  })
})
