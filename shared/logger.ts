const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const

type LogLevel = keyof typeof LOG_LEVELS

function isLogLevel(value: string): value is LogLevel {
  return Object.prototype.hasOwnProperty.call(LOG_LEVELS, value)
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (!value?.trim()) {
    return 'info'
  }

  const level = value.trim().toLowerCase()

  if (isLogLevel(level)) {
    return level
  }

  console.warn(
    `[LOGGER] Invalid LOG_LEVEL "${value}". Using "info". Expected: ${Object.keys(LOG_LEVELS).join(', ')}`,
  )

  return 'info'
}

const currentLevel = parseLogLevel(process.env.LOG_LEVEL)

// O logger corre dentro do error-handler do Nitro (server/error-handler.ts) e
// do middleware de auth. Se lançar, o erro original se perde e a resposta
// quebra — por isso a serialização inteira é protegida: logar nunca falha.
function serialize(meta: Record<string, unknown>): string {
  try {
    return (
      JSON.stringify(meta, (_key, value: unknown) => {
        // JSON.stringify(new Error('x')) devolve '{}'. Sem este ramo, um erro
        // loggado perdia mensagem e stack — exatamente no debug de erro.
        // É por isso que 7 call sites faziam `error instanceof Error ?
        // error.message : String(error)` à mão.
        if (value instanceof Error) {
          return { name: value.name, message: value.message, stack: value.stack }
        }
        // BigInt não é serializável: JSON.stringify lançaria TypeError.
        if (typeof value === 'bigint') {
          return `${value}n`
        }
        return value
      }) ?? String(meta)
    )
  } catch {
    // Estrutura circular: degrada para o que dá a ler, nunca propaga.
    return '[não serializável: estrutura circular]'
  }
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return

  // `meta &&` cobre undefined; o cheio cobre `{}`, que é truthy e imprimia um
  // espaço órfão no fim da linha.
  const suffix = meta && Object.keys(meta).length > 0 ? ` ${serialize(meta)}` : ''
  console[level](`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${suffix}`)
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
}
