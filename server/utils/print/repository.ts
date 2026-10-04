import { withTenant } from '../../db/tenant-context'
import { eq, and, desc, lt } from 'drizzle-orm'
import { printer, printJob } from '../../schema'
import type { PrinterSelect, PrintJobSelect } from '../../schema'

export interface RegisterPrinterInput {
  companyId: string
  locationId: string
  name: string
  type: 'receipt' | 'kitchen' | 'label'
  connectionType: 'network' | 'usb' | 'bluetooth'
  connectionConfig: string
  isDefault?: boolean
}

export interface EnqueuePrintJobInput {
  companyId: string
  locationId: string
  printerId?: string
  orderId: string
  template: 'receipt' | 'kitchen-ticket'
  payload: Record<string, unknown>
  priority?: number
}

const _PRINT_JOB_STATUSES = ['pending', 'printing', 'completed', 'failed'] as const
type _PrintJobStatus = (typeof _PRINT_JOB_STATUSES)[number]

export const printRepository = {
  async registerPrinter(input: RegisterPrinterInput): Promise<PrinterSelect> {
    return withTenant(input.companyId, input.locationId, null, async (tx) => {
      if (input.isDefault) {
        await tx
          .update(printer)
          .set({ isDefault: false })
          .where(
            and(eq(printer.companyId, input.companyId), eq(printer.locationId, input.locationId)),
          )
      }

      const [newPrinter] = await tx
        .insert(printer)
        .values({
          companyId: input.companyId,
          locationId: input.locationId,
          name: input.name,
          type: input.type,
          connectionType: input.connectionType,
          connectionConfig: input.connectionConfig,
          isDefault: input.isDefault || false,
          status: 'online',
        })
        .returning()

      return newPrinter
    })
  },

  async getPrinters(companyId: string, locationId: string): Promise<PrinterSelect[]> {
    return withTenant(companyId, locationId, null, async (tx) => {
      return tx.query.printer.findMany({
        where: and(eq(printer.companyId, companyId), eq(printer.locationId, locationId)),
        orderBy: [desc(printer.isDefault), desc(printer.createdAt)],
      })
    })
  },

  async getDefaultPrinter(
    companyId: string,
    locationId: string,
    type?: 'receipt' | 'kitchen' | 'label',
  ): Promise<PrinterSelect | null> {
    return withTenant(companyId, locationId, null, async (tx) => {
      const conditions = [
        eq(printer.companyId, companyId),
        eq(printer.locationId, locationId),
        eq(printer.isDefault, true),
        eq(printer.status, 'online'),
      ]
      if (type) conditions.push(eq(printer.type, type))

      const result = await tx.query.printer.findFirst({ where: and(...conditions) })
      return result || null
    })
  },

  async enqueuePrintJob(input: EnqueuePrintJobInput): Promise<PrintJobSelect> {
    return withTenant(input.companyId, input.locationId, null, async (tx) => {
      let targetPrinterId = input.printerId

      if (!targetPrinterId) {
        const defaultPrinter = await this.getDefaultPrinter(
          input.companyId,
          input.locationId,
          input.template === 'receipt' ? 'receipt' : 'kitchen',
        )
        if (!defaultPrinter) {
          throw new Error('No default printer available for this template type')
        }
        targetPrinterId = defaultPrinter.id
      }

      const [job] = await tx
        .insert(printJob)
        .values({
          companyId: input.companyId,
          locationId: input.locationId,
          printerId: targetPrinterId,
          orderId: input.orderId,
          template: input.template,
          payload: input.payload,
          priority: input.priority || 0,
          status: 'pending',
          attempts: 0,
        })
        .returning()

      return job
    })
  },

  async getPendingJobs(
    companyId: string,
    locationId: string,
    limit = 50,
  ): Promise<PrintJobSelect[]> {
    return withTenant(companyId, locationId, null, async (tx) => {
      return tx.query.printJob.findMany({
        where: and(
          eq(printJob.companyId, companyId),
          eq(printJob.locationId, locationId),
          eq(printJob.status, 'pending'),
        ),
        orderBy: [desc(printJob.priority), printJob.createdAt],
        limit,
      })
    })
  },

  async markJobPrinting(companyId: string, jobId: string): Promise<PrintJobSelect | null> {
    return withTenant(companyId, null, null, async (tx) => {
      const [job] = await tx
        .update(printJob)
        .set({ status: 'printing', attempts: sql`${printJob.attempts} + 1`, startedAt: new Date() })
        .where(
          and(
            eq(printJob.companyId, companyId),
            eq(printJob.id, jobId),
            eq(printJob.status, 'pending'),
          ),
        )
        .returning()

      return job || null
    })
  },

  async completeJob(companyId: string, jobId: string): Promise<PrintJobSelect | null> {
    return withTenant(companyId, null, null, async (tx) => {
      const [job] = await tx
        .update(printJob)
        .set({ status: 'completed', completedAt: new Date() })
        .where(and(eq(printJob.companyId, companyId), eq(printJob.id, jobId)))
        .returning()

      return job || null
    })
  },

  async failJob(companyId: string, jobId: string, error: string): Promise<PrintJobSelect | null> {
    return withTenant(companyId, null, null, async (tx) => {
      const [job] = await tx
        .update(printJob)
        .set({ status: 'failed', lastError: error, completedAt: new Date() })
        .where(and(eq(printJob.companyId, companyId), eq(printJob.id, jobId)))
        .returning()

      return job || null
    })
  },

  async retryJob(companyId: string, jobId: string): Promise<PrintJobSelect | null> {
    return withTenant(companyId, null, null, async (tx) => {
      const [job] = await tx
        .update(printJob)
        .set({ status: 'pending', lastError: null, attempts: 0 })
        .where(and(eq(printJob.companyId, companyId), eq(printJob.id, jobId)))
        .returning()

      return job || null
    })
  },

  async cleanupOldJobs(companyId: string, olderThanDays = 30): Promise<number> {
    return withTenant(companyId, null, null, async (tx) => {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
      const result = await tx
        .delete(printJob)
        .where(
          and(
            eq(printJob.companyId, companyId),
            lt(printJob.createdAt, cutoff),
            sql`${printJob.status} IN ('completed', 'failed')`,
          ),
        )
      return result.rowCount || 0
    })
  },
}

export type PrintRepository = typeof printRepository
