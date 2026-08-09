import { getRequestIP, type H3Event } from 'h3'

// X-Forwarded-For is only trusted when the app runs behind a reverse proxy
// that overwrites the header (TRUST_PROXY=true). Otherwise the raw socket
// address is used, preventing IP spoofing of audit events and rate limits.
const TRUST_PROXY = process.env.TRUST_PROXY === 'true'

export function getClientIp(event: H3Event): string | null | undefined {
  return getRequestIP(event, { xForwardedFor: TRUST_PROXY })
}
