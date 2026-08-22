import { logger } from '#shared/logger'
import { processEmailQueue } from '~~/server/utils/shared/email'

export default defineTask({
  meta: {
    name: 'process-email-queue',
    description: 'Process pending emails in the queue with retry logic',
  },
  async run({ payload }) {
    logger.info('processing_email_queue', {
      event: 'email_queue_process_start',
    })

    try {
      await processEmailQueue(50)

      logger.info('email_queue_processed', {
        event: 'email_queue_process_complete',
      })

      return { result: 'success' }
    } catch (error) {
      logger.error('email_queue_process_failed', {
        event: 'email_queue_process_error',
        error: error instanceof Error ? error.message : String(error),
      })

      return { result: 'error', error: String(error) }
    }
  },
})
