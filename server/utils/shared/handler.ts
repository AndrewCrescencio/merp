import { defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import type { ZodType } from 'zod'
import { createAuthEvent, type CreateAuthEventInput } from './audit'
import { requireTenant, type AuthContextUser, type TenantContext } from './auth-context'
import { assertRole, sendUnauthorizedError, sendValidationError } from './errors'
import { getClientIp } from './ip'
import type { Role } from './roles'
import { checkIpRateLimit } from './security'

type Scope =
  | { tenant: true; role?: Role | 'any'; forbiddenMessage?: string }
  | { tenant?: false; role?: never; forbiddenMessage?: never }

type BodyValidator<B> = ((input: unknown) => B | Promise<B>) | ZodType<B>
type AuditEntry = string | Pick<CreateAuthEventInput, 'eventType' | 'metadata' | 'ipAddress'>

type AuthRequestContext<T extends boolean, B> = {
  event: H3Event
  user: AuthContextUser
  session: NonNullable<H3Event['context']['session']>
  tenant: T extends true ? TenantContext : undefined
  body: B
}

type AuthHandlerOptions<T extends boolean, B, R> = Scope & {
  tenant?: T
  rateLimit?: 'ip'
  body?: BodyValidator<B>
  audit?: AuditEntry | ((result: R, context: AuthRequestContext<T, B>) => AuditEntry | AuditEntry[])
  created?: (result: R, context: AuthRequestContext<T, B>) => string
}

type LegacyHandler<R> = (event: H3Event, user: AuthContextUser) => R | Promise<R>
type AuthHandler<T extends boolean, B, R> = (context: AuthRequestContext<T, B>) => R | Promise<R>

async function validateBody<B>(event: H3Event, validator: BodyValidator<B>): Promise<B> {
  const input: unknown = await readBody(event)
  if (typeof validator === 'function') return validator(input)

  const result = await validator.safeParseAsync(input)
  if (!result.success) {
    sendValidationError(result.error.issues[0]?.message ?? 'Invalid request body')
  }
  return result.data
}

/** O middleware já entrega a sessão, aplica a cota comum e resolve o tenant pelo path. */
export function defineAuthHandler<R>(
  handler: LegacyHandler<R>,
): EventHandler<EventHandlerRequest, Promise<R>>
export function defineAuthHandler<
  T extends boolean = false,
  B = undefined,
  ResultForOptions = unknown,
  R extends ResultForOptions = ResultForOptions,
>(
  options: AuthHandlerOptions<T, B, ResultForOptions>,
  handler: AuthHandler<NoInfer<T>, NoInfer<B>, R>,
): EventHandler<EventHandlerRequest, Promise<R>>
export function defineAuthHandler<T extends boolean, B, R>(
  options: AuthHandlerOptions<T, B, R> | LegacyHandler<R>,
  handler?: AuthHandler<T, B, R>,
): EventHandler<EventHandlerRequest, Promise<R>> {
  return defineEventHandler(async (event) => {
    const { user, session } = event.context
    if (!user || !session) sendUnauthorizedError('Authentication required.')
    if (typeof options === 'function') return options(event, user)

    if (options.rateLimit === 'ip') await checkIpRateLimit(event)

    const tenant = options.tenant ? requireTenant(event) : undefined
    if (options.role) {
      assertRole(
        tenant?.role,
        options.role === 'any' ? null : options.role,
        'You are not a member of this company',
        options.forbiddenMessage,
      )
    }

    const body = options.body ? await validateBody(event, options.body) : undefined
    // O discriminante e o validador determinam os tipos expostos ao callback.
    const context = { event, user, session, tenant, body } as AuthRequestContext<T, B>
    const result = await handler!(context)

    if (options.audit) {
      const audit =
        typeof options.audit === 'function' ? options.audit(result, context) : options.audit
      for (const entry of Array.isArray(audit) ? audit : [audit]) {
        const actor = { userId: user.id, email: user.email }
        if (typeof entry === 'string') {
          await createAuthEvent({ ...actor, eventType: entry })
        } else {
          await createAuthEvent({
            ...actor,
            ipAddress: getClientIp(event) || null,
            ...entry,
          })
        }
      }
    }

    if (options.created) {
      const location = options.created(result, context)
      setResponseStatus(event, 201)
      setHeader(event, 'Location', location)
    }
    return result
  })
}
