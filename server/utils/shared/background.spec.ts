import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLoggerWarn = vi.fn()

vi.mock('#shared/logger', () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}))

describe('background', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses event.waitUntil when the runtime provides it', async () => {
    const { background } = await import('./background')
    const waitUntil = vi.fn()
    const event = { waitUntil } as any

    background(event, Promise.resolve('ok'), 'test-task')
    await Promise.resolve()

    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })

  it('falls back to a detached promise without waitUntil', async () => {
    const { background } = await import('./background')

    expect(() => background({} as any, Promise.resolve('ok'), 'test-task')).not.toThrow()
    expect(() => background(undefined, Promise.resolve('ok'), 'test-task')).not.toThrow()
    await Promise.resolve()
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })

  it('logs (never throws) when the task rejects', async () => {
    const { background } = await import('./background')
    const waitUntil = vi.fn()

    background({ waitUntil } as any, Promise.reject(new Error('boom')), 'failing-task')
    background({} as any, Promise.reject(new Error('boom')), 'failing-task')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(mockLoggerWarn).toHaveBeenCalledTimes(2)
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Background task failed',
      expect.objectContaining({ label: 'failing-task' }),
    )
  })
})
