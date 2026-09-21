import { defineEventHandler, setResponseHeaders } from 'h3'
import { sql } from 'drizzle-orm'
import { db } from '~~/server/utils/db'
import { isAuthAvailable } from '#shared/auth'

// GET /api/metrics — Prometheus text format for the alert thresholds in the
// spec threat model (login failure rate, rate-limit hits, session errors are
// derived from auth_event downstream; here: process + dependency readiness).
// Public by design (scraped without session) and PII-free: only process
// stats and 0/1 readiness gauges — never emails, ids or counts of users.
export default defineEventHandler(async (event) => {
  const [authReady, dbReady] = await Promise.all([
    isAuthAvailable(),
    db
      .execute(sql`SELECT 1`)
      .then(() => true)
      .catch(() => false),
  ])
  const memory = process.memoryUsage()

  setResponseHeaders(event, {
    'content-type': 'text/plain; version=0.0.4; charset=utf-8',
  })

  return [
    '# HELP merp_process_uptime_seconds Process uptime in seconds.',
    '# TYPE merp_process_uptime_seconds gauge',
    `merp_process_uptime_seconds ${Math.floor(process.uptime())}`,
    '# HELP merp_process_heap_used_bytes Node.js heap used in bytes.',
    '# TYPE merp_process_heap_used_bytes gauge',
    `merp_process_heap_used_bytes ${memory.heapUsed}`,
    '# HELP merp_auth_ready Whether the Better Auth instance initialized (1/0).',
    '# TYPE merp_auth_ready gauge',
    `merp_auth_ready ${authReady ? 1 : 0}`,
    '# HELP merp_db_ready Whether the database answered SELECT 1 (1/0).',
    '# TYPE merp_db_ready gauge',
    `merp_db_ready ${dbReady ? 1 : 0}`,
    '',
  ].join('\n')
})
