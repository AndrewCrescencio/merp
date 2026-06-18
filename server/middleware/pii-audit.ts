import { defineEventHandler, getRequestURL } from 'h3'
import { logger } from '#shared/logger'

const piiEndpoints = ['/api/auth/me', '/api/auth/export']

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (!piiEndpoints.includes(path)) {
    return
  }

  const user = event.context.user as { id: string; email: string; name?: string | null } | undefined

  if (user) {
    logger.info('pii_access', {
      event: 'pii_access',
      userId: user.id,
      email: user.email,
      name: user.name || null,
      path,
      purpose: path === '/api/auth/export' ? 'data_export' : 'session_check',
      timestamp: new Date().toISOString(),
    })
  }
})
