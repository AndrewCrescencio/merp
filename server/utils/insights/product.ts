import type { H3Event } from 'h3'
import { sql } from 'drizzle-orm'
import { logger } from '#shared/logger'
import type { AcquisitionChannel } from '~~/shared/contracts/acquisition'
import { background } from '../shared/background'

type ProductMilestone = 'company_created' | 'location_created' | 'invite_accepted'

export function recordProductMilestone(
  event: H3Event,
  ...[name, channel]: [ProductMilestone] | ['signup_completed', AcquisitionChannel?]
): void {
  if (process.env.NUXT_PUBLIC_PRODUCT_INSIGHTS_ENABLED !== 'true') return

  background(
    event,
    (async () => {
      try {
        const { db } = await import('../db')
        await db.execute(sql`SELECT public.record_product_milestone(${name}, ${channel ?? null})`)
      } catch {
        logger.warn('product_insight_write_failed', { milestone: name })
      }
    })(),
    'product-insight',
  )
}
