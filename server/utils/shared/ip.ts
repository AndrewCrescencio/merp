import { BlockList, isIP } from 'node:net'
import { getRequestIP, type H3Event } from 'h3'

// ── Por que isto existe ──────────────────────────────────────────────────────
// X-Forwarded-For é o cabeçalho que um proxy escreve para dizer "este é o IP
// real do cliente". Mas ele vem dentro da REQUISIÇÃO: qualquer cliente pode
// mandá-lo forjado. Confiar nele às cegas deixaria um atacante escolher o
// próprio IP — contornando o rate limit por IP e poluindo a auditoria.
//
// Regra (fail-closed): só lemos X-Forwarded-For quando TRUST_PROXY=true E o
// par que abriu a conexão TCP direto connosco (o "peer imediato", o endereço
// do socket) está em TRUSTED_PROXY_CIDRS. Fora da lista, o header é ignorado
// e vale o endereço do socket — degradado, nunca explorável.
//
// ── O que é um CIDR ─────────────────────────────────────────────────────────
// CIDR (Classless Inter-Domain Routing) é a notação de faixa de IP. O número
// depois da barra diz quantos bits do endereço são fixos:
//   172.28.0.0/16  → de 172.28.0.0 a 172.28.255.255 (65 536 endereços)
//   10.0.0.0/8     → a rede 10.x.x.x inteira
//   127.0.0.1/32   → apenas um endereço IPv4 (32 bits fixos = um único IP)
//   ::1/128        → o mesmo, em IPv6
//
// TRUSTED_PROXY_CIDRS aceita VÁRIAS entradas separadas por vírgula (daí o
// plural): TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128
//
// AUD-05: sem a lista, ou com o peer fora dela, o header é ignorado e o
// endereço do socket prevalece — impossibilita IP spoofing de auditoria e de
// rate limit por IP (AUD-02). Descobrir o CIDR certo: runbook de deploy.
const TRUST_PROXY = process.env.TRUST_PROXY === 'true'

/**
 * Converte TRUSTED_PROXY_CIDRS em pares {addr, prefix}.
 *
 * Entrada: lista separada por vírgula, no formato `IP[/bits]` (CIDR). O `/bits`
 * é opcional: sem ele, vira um endereço único (`/32` em IPv4, `/128` em IPv6).
 *
 *   '127.0.0.1/32,::1/128'  → [{addr:'127.0.0.1',prefix:32}, {addr:'::1',prefix:128}]
 *   '10.0.0.0/8'           → [{addr:'10.0.0.0',prefix:8}]
 *
 * Lança em entrada malformada: valor errado aqui silenciaria a proteção de
 * IP spoofing, por isso não é perdoado.
 */
export function parseTrustedProxyCidrs(
  raw: string | undefined,
): Array<{ addr: string; prefix: number }> {
  const out: Array<{ addr: string; prefix: number }> = []
  for (const part of (raw || '').split(',')) {
    const entry = part.trim()
    if (!entry) continue
    const [addr = '', prefixStr] = entry.split('/')
    const prefix = prefixStr === undefined ? (isIP(addr) === 6 ? 128 : 32) : Number(prefixStr)
    if (isIP(addr) === 0 || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
      throw new Error(
        `TRUSTED_PROXY_CIDRS inválido: "${entry}" — use formato IP[/bits] (CIDR), ` +
          `ex.: 10.0.0.0/8 ou 127.0.0.1/32. Várias entradas separadas por vírgula.`,
      )
    }
    out.push({ addr, prefix })
  }
  return out
}

// Cada CIDR da lista vira uma faixa de um BlockList, que depois responde
// "o IP X está dentro dessas faixas?" — é assim que se testa se o peer é
// um proxy de confiança. Ex.: 172.28.0.0/16 aceita 172.28.0.1, 172.28.255.9...
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
