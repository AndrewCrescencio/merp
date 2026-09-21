import type { H3Event } from 'h3'
import { logger } from '#shared/logger'

/**
 * Fire-and-forget a promise without delaying the response (FR-023 pattern).
 * Uses `event.waitUntil` when the runtime provides it (workers/edge — keeps
 * the isolate alive until the promise settles); otherwise falls back to a
 * detached `void` promise (safe on long-lived Node processes only).
 * Rejections are always logged — never unhandled.
 */
export function background(
  event: H3Event | undefined,
  promise: Promise<unknown>,
  label: string,
): void {
  const waitUntil =
    event && typeof (event as { waitUntil?: unknown }).waitUntil === 'function'
      ? (event as unknown as { waitUntil: (p: Promise<unknown>) => void }).waitUntil.bind(event)
      : undefined

  // Promise.resolve: tolera valores não-promise (mocks, sync) sem TypeError.
  const guarded = Promise.resolve(promise).catch((error: unknown) => {
    logger.warn('Background task failed', {
      label,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  if (waitUntil) {
    try {
      waitUntil(guarded)
      return
    } catch (error) {
      logger.warn('event.waitUntil failed, falling back to detached promise', {
        label,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  void guarded
}
