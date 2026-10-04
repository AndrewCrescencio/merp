import { defineTask } from 'nitropack'
import { printRepository } from '#utils/print/repository'
import { db } from '#utils/db'
import { company, location } from '#utils/schema'
import { eq } from 'drizzle-orm'

// This task runs every 30 minutes to process pending print jobs
// Configured via cron: */30 * * * *
export default defineTask({
  meta: {
    name: 'process-print-queue',
    description: 'Process pending print jobs and send to printers',
  },
  async run() {
    console.log('[process-print-queue] Starting print queue processing')

    const companies = await db.query.company.findMany({
      where: eq(company.isDeleted, false),
      limit: 100,
    })

    let totalProcessed = 0
    let totalFailed = 0

    for (const comp of companies) {
      const locations = await db.query.location.findMany({
        where: eq(location.companyId, comp.id),
      })

      for (const loc of locations) {
        try {
          const result = await processLocationPrintQueue(comp.id, loc.id)
          totalProcessed += result.processed
          totalFailed += result.failed
        } catch (error) {
          console.error(`[process-print-queue] Error processing ${comp.id}/${loc.id}:`, error)
          totalFailed++
        }
      }
    }

    console.log(
      `[process-print-queue] Completed: ${totalProcessed} processed, ${totalFailed} failed`,
    )
    return { processed: totalProcessed, failed: totalFailed }
  },
})

async function processLocationPrintQueue(companyId: string, locationId: string) {
  const pendingJobs = await printRepository.getPendingJobs(companyId, locationId, 50)

  let processed = 0
  let failed = 0

  for (const job of pendingJobs) {
    const printingJob = await printRepository.markJobPrinting(companyId, job.id)
    if (!printingJob) continue

    try {
      await sendToPrinter(printingJob)
      await printRepository.completeJob(companyId, job.id)
      processed++
    } catch (error: any) {
      await printRepository.failJob(companyId, job.id, error.message)
      failed++
    }
  }

  return { processed, failed }
}

async function sendToPrinter(job: any): Promise<void> {
  console.log(`[process-print-queue] Sending job ${job.id} to printer ${job.printerId}`)
  console.log(`  Template: ${job.template}`)
  console.log(`  Payload: ${JSON.stringify(job.payload).substring(0, 100)}...`)

  await new Promise((resolve) => setTimeout(resolve, 100))

  if (Math.random() < 0.01) {
    throw new Error('Printer communication failed')
  }
}
