import { BlockList, isIP } from 'node:net'
import { getRequestIP, type H3Event } from 'h3'

// AUD-05: X-Forwarded-For só é confiado em modo fail-closed — TRUST_PROXY=true
// E o peer imediato (socket) dentro de TRUSTED_PROXY_CIDRS. Sem CIDRs, ou com
// peer fora da lista, o header é ignorado e o socket address prevalece —
// impossibilita IP spoofing de auditoria e rate limit por IP (AUD-02).
const TRUST_PROXY = process.env.TRUST_PROXY === 'true'

export function parseTrustedProxyCidrs(
  raw: string | undefined,
): Array<{ addr: string; prefix: number }> {
  const out: Array<{ addr: string; prefix: number }> = []
  for (const part of (raw || '').split(',')) {
    const entry = part.trim()
    if (!entry) continue
    const [addr, prefixStr] = entry.split('/')
    const prefix = prefixStr === undefined ? (isIP(addr) === 6 ? 128 : 32) : Number(prefixStr)
    if (isIP(addr) === 0 || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
      throw new Error(`TRUSTED_PROXY_CIDRS inválido: "${entry}" — use CIDR (ex.: 10.0.0.0/8)`)
    }
    out.push({ addr, prefix })
  }
  return out
}

const trustedPeers = parseTrustedProxyCidrs(process.env.TRUSTED_PROXY_CIDRS)

const trustedBlockList = new BlockList()
for (const { addr, prefix } of trustedPeers) {
  trustedBlockList.addSubnet(addr, prefix)
}

// socket.remoteAddress pode vir como IPv4-mapped ('::ffff:10.0.0.5') quando o
// servidor escuta em dual-stack; BlockList não casa mapped — normaliza.
function normalizePeer(peer: string): string {
  return peer.startsWith('::ffff:') ? peer.slice(7) : peer
}

export function isTrustedPeer(peer: string | undefined): boolean {
  if (!peer || trustedPeers.length === 0) return false
  return trustedBlockList.check(normalizePeer(peer))
}

export function getClientIp(event: H3Event): string | null | undefined {
  // AUD-14: fail-closed — evento sem node (ex.: eventos de teste/web) não
  // pode derrubar handlers com TypeError de `event.node.req` (o getRequestIP
  // do h3 não usa optional chaining). Retorna undefined: rate limit por IP e
  // auditoria apenas ficam sem IP, nunca 500.
  try {
    const peer = event.node?.req?.socket?.remoteAddress
    return getRequestIP(event, { xForwardedFor: TRUST_PROXY && isTrustedPeer(peer) })
  } catch {
    return undefined
  }
}
