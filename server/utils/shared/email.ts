import { logger } from '#shared/logger'

export function appVerificationLink(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('callbackURL')
    return parsed.toString()
  } catch {
    return url.split('&callbackURL=')[0]
  }
}

export async function sendDeactivationNotice(email: string): Promise<void> {
  logger.info('deactivation notice (no-op: email queue removed)', { email })
}