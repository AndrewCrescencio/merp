import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockTx = {
  insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue({ rowCount: 5 }) })),
  query: {
    printer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    printJob: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    company: {
      findMany: vi.fn(),
    },
    location: {
      findMany: vi.fn(),
    },
  },
}

type MockTx = typeof mockTx

const mockWithTenant = vi.fn(
  async (
    tenantId: string | null,
    locationId: string | null,
    userId: string | null,
    fn: (tx: MockTx) => Promise<unknown>,
    existingTx?: MockTx,
  ) => {
    return fn(existingTx || mockTx)
  },
)

vi.mock('../db', () => ({
  db: mockTx,
}))

vi.mock('../../db/tenant-context', () => ({
  withTenant: mockWithTenant,
}))

vi.mock('../../schema', () => ({
  printer: {},
  printJob: {},
  company: { isDeleted: 'is_deleted' },
  location: { companyId: 'company_id' },
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(),
}))

describe('printRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registerPrinter: inserts printer and unsets other defaults', async () => {
    const mockPrinter = { id: 'printer-1', name: 'Receipt Printer', isDefault: true }
    mockTx.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockPrinter]),
      }),
    })

    const { printRepository } = await import('./repository')
    const result = await printRepository.registerPrinter({
      companyId: 'company-1',
      locationId: 'location-1',
      name: 'Receipt Printer',
      type: 'receipt',
      connectionType: 'network',
      connectionConfig: '{"host": "192.168.1.100", "port": 9100}',
      isDefault: true,
    })

    expect(result).toBeDefined()
    expect(result.name).toBe('Receipt Printer')
    expect(result.isDefault).toBe(true)
    // Verify update was called to unset other defaults
    expect(mockTx.update).toHaveBeenCalled()
  })

  it('getPrinters: returns printers for location', async () => {
    mockTx.query.printer.findMany.mockResolvedValue([
      { id: 'printer-1', name: 'Receipt Printer', isDefault: true },
      { id: 'printer-2', name: 'Kitchen Printer', isDefault: false },
    ])

    const { printRepository } = await import('./repository')
    const result = await printRepository.getPrinters('company-1', 'location-1')

    expect(result).toHaveLength(2)
  })

  it('getDefaultPrinter: returns default printer for type', async () => {
    mockTx.query.printer.findFirst.mockResolvedValue({
      id: 'printer-1',
      name: 'Receipt Printer',
      type: 'receipt',
      isDefault: true,
      status: 'online',
    })

    const { printRepository } = await import('./repository')
    const result = await printRepository.getDefaultPrinter('company-1', 'location-1', 'receipt')

    expect(result).toBeDefined()
    expect(result?.type).toBe('receipt')
    expect(result?.isDefault).toBe(true)
  })

  it('enqueuePrintJob: uses provided printer or finds default', async () => {
    const mockJob = { id: 'job-1', status: 'pending' }
    mockTx.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockJob]),
      }),
    })

    const { printRepository } = await import('./repository')
    const result = await printRepository.enqueuePrintJob({
      companyId: 'company-1',
      locationId: 'location-1',
      printerId: 'printer-1',
      orderId: 'order-1',
      template: 'receipt',
      payload: { items: [] },
    })

    expect(result).toBeDefined()
    expect(result.id).toBe('job-1')
  })

  it('enqueuePrintJob: throws if no default printer', async () => {
    mockTx.query.printer.findFirst.mockResolvedValue(null)

    const { printRepository } = await import('./repository')

    await expect(
      printRepository.enqueuePrintJob({
        companyId: 'company-1',
        locationId: 'location-1',
        orderId: 'order-1',
        template: 'receipt',
        payload: {},
      }),
    ).rejects.toThrow('No default printer available')
  })

  it('getPendingJobs: returns pending jobs ordered by priority', async () => {
    mockTx.query.printJob.findMany.mockResolvedValue([
      { id: 'job-1', priority: 10 },
      { id: 'job-2', priority: 5 },
    ])

    const { printRepository } = await import('./repository')
    const result = await printRepository.getPendingJobs('company-1', 'location-1')

    expect(result).toHaveLength(2)
  })

  it('markJobPrinting: updates status and increments attempts', async () => {
    mockTx.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'job-1', status: 'printing', attempts: 1 }]),
        }),
      }),
    })

    const { printRepository } = await import('./repository')
    const result = await printRepository.markJobPrinting('company-1', 'job-1')

    expect(result).toBeDefined()
    expect(result?.status).toBe('printing')
  })

  it('completeJob: marks job as completed', async () => {
    mockTx.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'job-1', status: 'completed' }]),
        }),
      }),
    })

    const { printRepository } = await import('./repository')
    const result = await printRepository.completeJob('company-1', 'job-1')

    expect(result?.status).toBe('completed')
  })

  it('failJob: marks job as failed with error', async () => {
    mockTx.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: 'job-1', status: 'failed', lastError: 'Error' }]),
        }),
      }),
    })

    const { printRepository } = await import('./repository')
    const result = await printRepository.failJob('company-1', 'job-1', 'Error')

    expect(result?.status).toBe('failed')
    expect(result?.lastError).toBe('Error')
  })

  it('retryJob: resets job to pending', async () => {
    mockTx.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'job-1', status: 'pending', attempts: 0 }]),
        }),
      }),
    })

    const { printRepository } = await import('./repository')
    const result = await printRepository.retryJob('company-1', 'job-1')

    expect(result?.status).toBe('pending')
    expect(result?.attempts).toBe(0)
  })

  it('cleanupOldJobs: deletes old completed/failed jobs', async () => {
    const { printRepository } = await import('./repository')
    const result = await printRepository.cleanupOldJobs('company-1', 30)

    expect(result).toBe(5)
    expect(mockTx.delete).toHaveBeenCalled()
  })
})
