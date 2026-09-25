import { getAuth } from '#shared/auth'
import type { AuthInstance } from '#shared/auth'
import { logger } from '#shared/logger'
import { H3Error } from 'h3'
import {
  TimeoutError,
  withTimeout,
  handleUpstreamTimeout,
  handleDatabaseError,
  sendAuthUnavailableError,
} from '../../shared/errors'
import { createError } from 'h3'

const BETTER_AUTH_TIMEOUT = 5_000

async function resolveAuth(): Promise<AuthInstance> {
  try {
    return await getAuth()
  } catch (error) {
    logger.error('Failed to resolve Better Auth instance', { error: String(error) })
    sendAuthUnavailableError()
  }
}

type BetterAuthCall<T> = (auth: AuthInstance) => Promise<T>

function isBetterAuthError(error: unknown): error is { statusCode: number; message: string } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  )
}

function rethrowBetterAuthError(error: { statusCode: number; message: string }): never {
  const statusCode = error.statusCode
  const message = error.message
  throw createError({
    status: statusCode,
    statusText: String(statusCode),
    message: JSON.stringify({
      error:
        statusCode === 400 ? 'validation_error' : statusCode === 401 ? 'unauthorized' : 'error',
      message,
    }),
  })
}

export async function callBetterAuth<T>(
  fn: BetterAuthCall<T>,
  options?: { timeout?: number; onTimeout?: () => T },
): Promise<T> {
  const authInstance = await resolveAuth()
  const timeout = options?.timeout ?? BETTER_AUTH_TIMEOUT

  try {
    return await withTimeout(fn(authInstance), timeout)
  } catch (error: any) {
    if (error instanceof TimeoutError) {
      if (options?.onTimeout) return options.onTimeout()
      return handleUpstreamTimeout()
    }
    if (error instanceof H3Error) {
      throw error
    }
    if (isBetterAuthError(error)) {
      return rethrowBetterAuthError(error)
    }
    return handleDatabaseError(error)
  }
}

export async function callBetterAuthSilent<T>(
  fn: BetterAuthCall<T>,
  options?: { timeout?: number },
): Promise<T | null> {
  const authInstance = await resolveAuth()
  const timeout = options?.timeout ?? BETTER_AUTH_TIMEOUT

  try {
    return await withTimeout(fn(authInstance), timeout)
  } catch (error: any) {
    if (error instanceof TimeoutError) {
      return handleUpstreamTimeout()
    }
    if (error instanceof H3Error) {
      throw error
    }
    if (isBetterAuthError(error)) {
      return rethrowBetterAuthError(error)
    }
    return handleDatabaseError(error)
  }
}
