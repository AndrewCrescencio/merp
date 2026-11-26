import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { defineAuthHandler } from '../../server/utils/shared/handler'
import type { AuthContextUser, TenantContext } from '../../server/utils/shared/auth-context'

const tenantRoute = defineAuthHandler(
  {
    tenant: true,
    role: 'owner',
    body: z.object({ amount: z.string().transform(Number) }),
    audit: (result: { total: number }, { tenant, body }) => {
      expectTypeOf(result).toEqualTypeOf<{ total: number }>()
      expectTypeOf(tenant).toEqualTypeOf<TenantContext>()
      expectTypeOf(body).toEqualTypeOf<{ amount: number }>()
      return 'created'
    },
  },
  async ({ user, tenant, body }) => {
    expectTypeOf(user).toEqualTypeOf<AuthContextUser>()
    expectTypeOf(tenant).toEqualTypeOf<TenantContext>()
    expectTypeOf(body).toEqualTypeOf<{ amount: number }>()
    // @ts-expect-error o callback recebe a saída numérica do schema
    body.amount.trim()
    return { total: body.amount, unit: 'items' }
  },
)
expectTypeOf(tenantRoute).returns.resolves.toEqualTypeOf<{
  total: number
  unit: string
}>()

defineAuthHandler({ body: async (input: unknown) => String(input) }, ({ tenant, body }) => {
  expectTypeOf(tenant).toEqualTypeOf<undefined>()
  expectTypeOf(body).toEqualTypeOf<string>()
})

defineAuthHandler({ tenant: false }, ({ tenant, body }) => {
  expectTypeOf(tenant).toEqualTypeOf<undefined>()
  expectTypeOf(body).toEqualTypeOf<undefined>()
})

// @ts-expect-error a auditoria não recebe um tipo de resultado diferente do handler
defineAuthHandler({ audit: (result: string) => result }, () => 123)

// @ts-expect-error um papel requer tenant: true
defineAuthHandler({ role: 'owner' }, () => null)

// @ts-expect-error role: any ainda requer uma associação ao tenant
defineAuthHandler({ tenant: false, role: 'any' }, () => null)
