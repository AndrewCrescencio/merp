import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// `currentLevel` é lido no load do módulo — cada nível exige um import novo.
async function loadLogger(level?: string) {
  vi.resetModules()
  vi.stubEnv('LOG_LEVEL', level ?? '')
  return (await import('./logger')).logger
}

const emitted = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((call) => String(call[0]))

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('sem LOG_LEVEL usa info: emite info e error, esconde debug', async () => {
    const logger = await loadLogger()

    logger.debug('d')
    logger.info('i')
    logger.error('e')

    expect(emitted(console.debug as never)).toHaveLength(0)
    expect(emitted(console.info as never)).toHaveLength(1)
    expect(emitted(console.error as never)).toHaveLength(1)
  })

  it('respeita o nível configurado', async () => {
    const logger = await loadLogger('error')

    logger.info('i')
    logger.warn('w')
    logger.error('e')

    expect(emitted(console.info as never)).toHaveLength(0)
    expect(emitted(console.warn as never)).toHaveLength(0)
    expect(emitted(console.error as never)).toHaveLength(1)
  })

  it('nível inválido cai em info e avisa', async () => {
    const logger = await loadLogger('banana')

    logger.info('i')

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('banana'))
    expect(emitted(console.info as never)).toHaveLength(1)
  })

  it('serializa Error com nome, mensagem e stack (não "{}")', async () => {
    const logger = await loadLogger()

    logger.error('falhou', { error: new Error('boom') })

    const line = emitted(console.error as never)[0]
    expect(line).toContain('boom')
    expect(line).toContain('Error')
    expect(line).toContain('stack')
    expect(line).not.toContain('"error":{}')
  })

  it('não lança com estrutura circular no meta', async () => {
    const logger = await loadLogger()
    const circular: Record<string, unknown> = { label: 'x' }
    circular.self = circular

    expect(() => logger.error('falhou', { circular })).not.toThrow()
    expect(emitted(console.error as never)[0]).toContain('não serializável')
  })

  it('não lança com BigInt no meta', async () => {
    const logger = await loadLogger()

    expect(() => logger.info('id', { big: 42n })).not.toThrow()
    expect(emitted(console.info as never)[0]).toContain('42n')
  })

  it('meta vazio não deixa espaço órfão no fim da linha', async () => {
    const logger = await loadLogger()

    logger.info('limpo', {})
    logger.info('sem meta')

    for (const line of emitted(console.info as never)) {
      expect(line.endsWith(' ')).toBe(false)
    }
  })

  it('inclui timestamp, nível e mensagem', async () => {
    const logger = await loadLogger()

    logger.warn('atenção', { k: 1 })

    expect(emitted(console.warn as never)[0]).toMatch(
      /\[\d{4}-\d{2}-\d{2}T[^\]]+\] \[WARN\] atenção \{"k":1\}/,
    )
  })
})
