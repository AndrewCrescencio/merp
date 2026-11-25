import { defineNitroErrorHandler } from 'nitropack/runtime'
import { send, setResponseHeaders, setResponseStatus } from 'h3'
import { logger } from '#shared/logger'
import type { ApiError } from './utils/shared/errors'

export interface NormalizedError {
  status: number
  body: ApiError
}

// decisão pura e testável — erros do contrato ({ error, message } em
// JSON) com status < 500 são repassados intactos; qualquer outro erro (500 ou
// inesperado) vira internal_error sem vazar detalhes internos.
export function normalizeError(error: unknown): NormalizedError {
  const candidate =
    typeof error === 'object' && error !== null
      ? (error as { statusCode?: number; status?: number; message?: string; data?: unknown })
      : undefined

  const status = candidate?.statusCode ?? candidate?.status ?? 500
  const rawMessage = typeof candidate?.message === 'string' ? candidate.message : ''

  if (status < 500 && candidate?.data) {
    const data = candidate.data
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as ApiError).error === 'string' &&
      typeof (data as ApiError).message === 'string'
    ) {
      return {
        status,
        body: { error: (data as ApiError).error, message: (data as ApiError).message },
      }
    }
  }

  // Compatibilidade transitória com erros H3 produzidos antes de `data`.
  if (status < 500 && rawMessage) {
    try {
      const parsed = JSON.parse(rawMessage) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as ApiError).error === 'string' &&
        typeof (parsed as ApiError).message === 'string'
      ) {
        return {
          status,
          body: { error: (parsed as ApiError).error, message: (parsed as ApiError).message },
        }
      }
    } catch {
      // message não é JSON do contrato — trata como erro interno abaixo
    }
  }

  return { status: 500, body: { error: 'internal_error', message: 'Internal server error' } }
}

export default defineNitroErrorHandler((error, event) => {
  const normalized = normalizeError(error)

  if (normalized.status >= 500) {
    const detail = error instanceof Error ? error : new Error(String(error))
    logger.error('Unhandled server error', {
      message: detail.message,
      stack: detail.stack,
    })
  }

  setResponseStatus(event, normalized.status)
  // resposta de erro sempre JSON do contrato — sem Content-Type,
  // clientes/proxies podem tratar o corpo como texto (sniffing).
  setResponseHeaders(event, { 'content-type': 'application/json' })
  return send(event, JSON.stringify(normalized.body))
})
