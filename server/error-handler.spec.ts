import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSetResponseStatus = vi.fn()
const mockSend = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('h3', () => ({
  setResponseStatus: mockSetResponseStatus,
  send: mockSend,
}))

vi.mock('nitropack/runtime', () => ({
  defineNitroErrorHandler: (fn: any) => fn,
}))

vi.mock('#shared/logger', () => ({
  logger: { error: mockLoggerError },
}))

describe('error-handler (FR-026)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes through contract JSON errors with status < 500', async () => {
    const error = {
      statusCode: 401,
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    }
    const event = {} as any

    const handler = await import('~~/server/error-handler').then((m) => m.default)
    await handler(error, event)

    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 401)
    expect(mockSend).toHaveBeenCalledWith(
      event,
      JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    )
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  it('turns generic 500 errors into internal_error without leaking the message', async () => {
    const error = new Error('database connection refused')
    ;(error as any).statusCode = 500
    const event = {} as any

    const handler = await import('~~/server/error-handler').then((m) => m.default)
    await handler(error, event)

    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 500)
    expect(mockSend).toHaveBeenCalledWith(
      event,
      JSON.stringify({ error: 'internal_error', message: 'Internal server error' }),
    )

    const body = mockSend.mock.calls[0][1]
    expect(body).not.toContain('database connection refused')
    expect(body).not.toContain(error.stack)

    expect(mockLoggerError).toHaveBeenCalledWith(
      'Unhandled server error',
      expect.objectContaining({ message: 'database connection refused' }),
    )
  })

  it('does not pass through contract payloads with status >= 500', async () => {
    const error = {
      statusCode: 500,
      message: JSON.stringify({
        error: 'db',
        message: 'postgres://user:secret@internal-host:5432',
      }),
    }
    const event = {} as any

    const handler = await import('~~/server/error-handler').then((m) => m.default)
    await handler(error, event)

    expect(mockSend).toHaveBeenCalledWith(
      event,
      JSON.stringify({ error: 'internal_error', message: 'Internal server error' }),
    )
  })

  it('turns non-JSON messages into internal_error without leaking the raw message', async () => {
    const error = new Error("TypeError: cannot read properties of undefined (reading 'x')")
    ;(error as any).statusCode = 400
    const event = {} as any

    const handler = await import('~~/server/error-handler').then((m) => m.default)
    await handler(error, event)

    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 500)
    expect(mockSend).toHaveBeenCalledWith(
      event,
      JSON.stringify({ error: 'internal_error', message: 'Internal server error' }),
    )
  })
})
