import { logger } from '#shared/logger'

export interface PurgeTaskOptions {
  /** e.g. 24 * 60 * 60 * 1000 — rows older than now - retentionMs are removed. */
  retentionMs: number
  /** e.g. 'session_purge' — logged as `<prefix>_start|_complete|_error` in `event`. */
  eventPrefix: string
  startLog: string
  completeLog: string
  errorLog: string
  /** Executes the delete for rows older than cutoff; resolves the deleted count. */
  remove: (cutoff: Date) => Promise<number>
}

/**
 * Shared body for retention purge tasks (FR data-retention policy).
 * Log messages and event names are caller-provided so existing log-based
 * monitoring keeps matching — unifying the tasks must not rename events.
 */
export async function runPurgeTask(
  options: PurgeTaskOptions,
): Promise<{ result: 'success'; deletedCount: number } | { result: 'error'; error: string }> {
  const cutoff = new Date(Date.now() - options.retentionMs)

  logger.info(options.startLog, {
    event: `${options.eventPrefix}_start`,
    cutoff: cutoff.toISOString(),
  })

  try {
    const deletedCount = await options.remove(cutoff)

    logger.info(options.completeLog, {
      event: `${options.eventPrefix}_complete`,
      deletedCount,
      cutoff: cutoff.toISOString(),
    })

    return { result: 'success', deletedCount }
  } catch (error) {
    logger.error(options.errorLog, {
      event: `${options.eventPrefix}_error`,
      error: error instanceof Error ? error.message : String(error),
    })

    return { result: 'error', error: String(error) }
  }
}
