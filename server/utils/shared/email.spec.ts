import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }

vi.mock('#shared/logger', () => ({ logger: mockLogger }))

const fetchMock = vi.fn()

describe('email transacional (Resend)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', 'Merp <no-reply@merp.test>')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('pula o envio (sem fetch, sem throw) quando falta API key ou from', async () => {
    const { sendPasswordResetNotice } = await import('./email')

    vi.stubEnv('RESEND_API_KEY', '')
    await expect(sendPasswordResetNotice('a@b.c', 'http://localhost/reset/1')).resolves.toBe(
      undefined,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalled()

    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', '')
    await expect(sendPasswordResetNotice('a@b.c', 'http://localhost/reset/1')).resolves.toBe(
      undefined,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('envia POST ao Resend com from/to/subject/html esperados', async () => {
    const { sendPasswordResetNotice } = await import('./email')

    await sendPasswordResetNotice('user@x.io', 'http://localhost:3000/reset/abc?callbackURL=%2F')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_test_key')

    const body = JSON.parse(init.body)
    expect(body.from).toBe('Merp <no-reply@merp.test>')
    expect(body.to).toEqual(['user@x.io'])
    expect(body.subject).toContain('Redefinir sua senha')
    expect(body.html).toContain('http://localhost:3000/reset/abc')
  })

  it('nunca lança quando a rede falha (oráculo de enumeração AUD-04)', async () => {
    const { sendVerificationNotice, sendDeactivationNotice } = await import('./email')

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    await expect(
      sendVerificationNotice('user@x.io', 'http://localhost:3000/verify-email?token=t'),
    ).resolves.toBeUndefined()
    expect(mockLogger.error).toHaveBeenCalled()

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    await expect(sendDeactivationNotice('user@x.io')).resolves.toBeUndefined()
  })

  it('nunca lança quando o Resend recusa (4xx/5xx)', async () => {
    const { sendPasswordResetNotice } = await import('./email')

    fetchMock.mockResolvedValueOnce({ ok: false, status: 422 })
    await expect(
      sendPasswordResetNotice('user@x.io', 'http://localhost:3000/reset/abc'),
    ).resolves.toBeUndefined()
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('aborta em ~450ms quando o Resend não responde (segura os pisos de tempo)', async () => {
    const { sendPasswordResetNotice } = await import('./email')

    // Só rejeita quando o AbortController disparar: sem o limite, um envio
    // pendurado seguraria a resposta e o caminho com email ficaria mais lento
    // que o sem email — abrindo justamente a furação que os pisos fecham.
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )

    const started = Date.now()
    await expect(
      sendPasswordResetNotice('user@x.io', 'http://localhost:3000/reset/abc'),
    ).resolves.toBeUndefined()
    const elapsed = Date.now() - started

    expect(elapsed).toBeGreaterThanOrEqual(400) // o limite é quem dispara
    expect(elapsed).toBeLessThan(1_500) // e não pendura para sempre
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('escapa HTML/atributo na URL do link (anti-injection no email)', async () => {
    const { sendPasswordResetNotice } = await import('./email')

    const evil = 'http://localhost/reset/t?x="><img src=x onerror=alert(1)>'
    await sendPasswordResetNotice('user@x.io', evil)

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? '{}')
    expect(body.html).not.toContain('<img src=x')
    expect(body.html).toContain('&lt;img')
    expect(body.html).toContain('&quot;')
  })

  it('appVerificationLink remove callbackURL e mantém token', async () => {
    const { appVerificationLink } = await import('./email')

    expect(
      appVerificationLink('http://localhost:3000/verify-email?token=abc&callbackURL=%2F'),
    ).toBe('http://localhost:3000/verify-email?token=abc')
    // URL inválida: cai no fallback sem lançar
    expect(appVerificationLink('not-a-url')).toBe('not-a-url')
  })
})
