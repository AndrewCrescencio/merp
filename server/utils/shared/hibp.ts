const HIBP_API_URL = 'https://api.pwnedpasswords.com/range/'

export async function checkPasswordBreach(password: string): Promise<{
  breached: boolean
  count: number
}> {
  if (!password || password.length < 8) {
    return { breached: false, count: 0 }
  }

  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

  const prefix = hashHex.slice(0, 5)
  const suffix = hashHex.slice(5)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const response = await fetch(`${HIBP_API_URL}${prefix}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'merp-auth-check',
        'Add-Padding': 'true',
      },
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return { breached: false, count: 0 }
    }

    const text = await response.text()
    const lines = text.split('\n')

    for (const line of lines) {
      const [foundSuffix, countStr = ''] = line.split(':')
      if (foundSuffix === suffix) {
        return { breached: true, count: parseInt(countStr, 10) }
      }
    }

    return { breached: false, count: 0 }
  } catch {
    // On network error or timeout, fail open (don't block user)
    // but log for monitoring
    return { breached: false, count: 0 }
  }
}
