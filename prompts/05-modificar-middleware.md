Modifique o arquivo `server/middleware/auth.ts` para expor `tenantId` e `userId` no context.

Adicione estas 2 linhas após `event.context.session = session.session`:

```typescript
event.context.tenantId = (session.session as any)?.activeCompanyId ?? null
event.context.userId = session.user.id
```

O arquivo final deve ficar assim:

```typescript
import { defineEventHandler, getCookie, getRequestURL } from 'h3'
import { auth } from '#shared/auth'
import { logger } from '#shared/logger'
import { sendAuthError } from '~~/server/utils/auth/helpers'

const publicRoutes = ['/api/auth/register', '/api/auth/login', '/']

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (publicRoutes.includes(path)) {
    return
  }

  const session = await auth.api.getSession({ headers: event.headers })

  if (!session) {
    const sessionToken = getCookie(event, 'merp-session_token')

    if (sessionToken) {
      logger.warn('session_expired', {
        event: 'session_expired',
        path,
        timestamp: new Date().toISOString(),
      })

      sendAuthError(401, 'session_expired', 'Session expired. Please login again.')
    }

    sendAuthError(401, 'unauthorized', 'Authentication required.')
  }

  event.context.user = session.user
  event.context.session = session.session
  event.context.tenantId = (session.session as any)?.activeCompanyId ?? null
  event.context.userId = session.user.id
})
```
