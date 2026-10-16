import { withTenant } from '../db/tenant-context'
import { eq, and, desc, sql } from 'drizzle-orm'
import { printer, printJob } from '../schema'
import type { PrinterSelect, PrintJobSelect } from '../schema'

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

      if (!newPrinter) {
        throw new Error('Printer not created')
      }

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
          // Schema tipa payload como text, mas a coluna é jsonb: o objeto vai
          // como parâmetro bind, exatamente como antes.
          payload: sql`${input.payload}`,
          priority: input.priority || 0,
          status: 'pending',
        })
        .returning()

      if (!job) {
        throw new Error('Print job not created')
      }

      return job
    })
  },

  // Job lifecycle: só o endpoint de retry existe (server/api/v1/companies/[companyId]/print/jobs/[jobId]/retry.post.ts).
  // Os métodos de worker (markJobPrinting/completeJob/failJob/getPendingJobs) morreram com
  // server/tasks/process-print-queue.ts (RLS-004) — recriar junto com o worker que os chamar.
  async retryJob(companyId: string, jobId: string): Promise<PrintJobSelect | null> {
    return withTenant(companyId, null, null, async (tx) => {
      const [job] = await tx
        .update(printJob)
        // Reset completo: sem isto `lastError` fica stale e visível na API
        // (listJobs/getJobById devolvem a linha inteira) e `attempts` herda
        // o orçamento gasto da tentativa anterior.
        .set({ status: 'pending', attempts: 0, lastError: null })
        .where(and(eq(printJob.companyId, companyId), eq(printJob.id, jobId)))
        .returning()

      return job || null
    })
  },

  async getJobById(
    companyId: string,
    locationId: string,
    jobId: string,
  ): Promise<PrintJobSelect | null> {
    return withTenant(companyId, locationId, null, async (tx) => {
      const job = await tx.query.printJob.findFirst({
        where: and(
          eq(printJob.companyId, companyId),
          eq(printJob.locationId, locationId),
          eq(printJob.id, jobId),
        ),
      })
      return job ?? null
    })
  },

  async listJobs(
    companyId: string,
    locationId: string,
    opts?: { status?: string; limit?: number; offset?: number },
  ): Promise<PrintJobSelect[]> {
    return withTenant(companyId, locationId, null, async (tx) => {
      const conditions = [eq(printJob.companyId, companyId), eq(printJob.locationId, locationId)]
      if (opts?.status) conditions.push(eq(printJob.status, opts.status))

      return tx.query.printJob.findMany({
        where: and(...conditions),
        orderBy: [desc(printJob.priority), desc(printJob.createdAt)],
        limit: opts?.limit || 50,
        offset: opts?.offset || 0,
      })
    })
  },
}

export type PrintRepository = typeof printRepository
