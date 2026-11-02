import { describe, it, expect, beforeAll } from 'vitest'
import { eq, sql, and } from 'drizzle-orm'
import { createEvent as h3CreateEvent, type H3Event } from 'h3'
import { order as orderSchema, orderItem, restaurantTable } from '~~/server/utils/schema'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('P0.5 Table Order (integration, RLS real)', () => {
  let companyRepository: typeof import('~~/server/utils/auth/company/repository').companyRepository
  let locationRepository: typeof import('~~/server/utils/auth/company/location-repository').locationRepository
  let withTenant: typeof import('~~/server/utils/db/tenant-context').withTenant
  let registerUserFn: typeof import('~~/server/utils/auth/identity/queries').registerUser
  let tenantMiddleware: (event: H3Event) => Promise<void>

  let openTableHandler: (event: H3Event) => Promise<unknown>
  let closeTableHandler: (event: H3Event) => Promise<unknown>
  let addItemHandler: (event: H3Event) => Promise<unknown>
  let removeItemHandler: (event: H3Event) => Promise<unknown>

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL

    const repoMod = await import('~~/server/utils/auth/company/repository')
    companyRepository = repoMod.companyRepository
    locationRepository = (await import('~~/server/utils/auth/company/location-repository'))
      .locationRepository
    withTenant = (await import('~~/server/utils/db/tenant-context')).withTenant
    registerUserFn = (await import('~~/server/utils/auth/identity/queries')).registerUser

    tenantMiddleware = (await import('~~/server/middleware/tenant')).default

    openTableHandler = (
      await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/[tableId]/open.post')
    ).default as (event: H3Event) => Promise<unknown>
    closeTableHandler = (
      await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/[tableId]/close.post')
    ).default as (event: H3Event) => Promise<unknown>
    addItemHandler = (
      await import('~~/server/api/v1/companies/[companyId]/orders/[orderId]/items/index.post')
    ).default as (event: H3Event) => Promise<unknown>
    removeItemHandler = (
      await import('~~/server/api/v1/companies/[companyId]/orders/[orderId]/items/[itemId]/index.delete')
    ).default as (event: H3Event) => Promise<unknown>
  })

  const registerUser = async (email: string, name: string) => {
    const result = await registerUserFn({
      email,
      password: 'password123',
      name,
      consentTermsVersion: 'v1',
    })
    if (!result) {
      throw new Error(`registerUser falhou para ${email}`)
    }
    return result
  }

  function mkEvent(opts: {
    path: string
    user: { id: string }
    method?: string
    body?: unknown
    params?: Record<string, string>
  }): H3Event {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      removeHeader: (name: string) => {
        res.headers[name.toLowerCase()] = ''
      },
      setHeader: (name: string, value: string) => {
        res.headers[name.toLowerCase()] = value
      },
      writeHead: (code: number) => {
        res.statusCode = code
      },
      end: () => {},
    }
    const req = {
      method: opts.method ?? 'GET',
      url: opts.path,
      headers: { host: 'localhost', connection: 'close' },
      ...(opts.body !== undefined ? { rawBody: JSON.stringify(opts.body) } : {}),
    }
    const event = h3CreateEvent(req as never, res as never)
    event.context.user = { ...opts.user, email: 'test@example.com', name: 'Test' }
    event.context.auth = {
      user: event.context.user,
      session: { id: 'integration-test-session' },
    }
    if (opts.params) {
      event.context.params = opts.params
    }
    return event
  }

  async function runHandler(
    handler: (event: H3Event) => Promise<unknown>,
    event: H3Event,
  ): Promise<{ status: number; body?: unknown }> {
    await tenantMiddleware(event)
    const result = await handler(event)
    return { status: event.node.res.statusCode, body: result }
  }

  async function getStatus(promise: Promise<unknown>): Promise<number> {
    try {
      await promise
      return 200
    } catch (error) {
      const err = error as { statusCode?: number; status?: number }
      return err.statusCode ?? err.status ?? 500
    }
  }

  // ---------------------------------------------------------------------------
  // 1) Abrir mesa cria order e seta current_order_id
  // ---------------------------------------------------------------------------
  it('Abrir mesa cria order e seta current_order_id', async () => {
    const owner = await registerUser(`p05-open-${Date.now()}@example.com`, 'Open Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Open Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Criar mesa
    const tableEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 1,
        capacity: 4,
        locationId: mat.id,
      },
    })
    const tableResult = await runHandler(
      (await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/index.post')).default,
      tableEvent,
    )
    expect(tableResult.status).toBe(201)
    const table = tableResult.body as { id: string }

    // Abrir mesa
    const openEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${table.id}/open`,
      user: { id: owner.id },
      method: 'POST',
      body: { coverCount: 2 },
      params: { tableId: table.id },
    })
    const openResult = await runHandler(openTableHandler, openEvent)
    expect(openResult.status).toBe(201)
    const order = openResult.body as { id: string; status: string; orderType: string }
    expect(order.status).toBe('open')
    expect(order.orderType).toBe('dine_in')

    // Verificar current_order_id na mesa
    const [updatedTable] = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .select({ currentOrderId: restaurantTable.currentOrderId })
        .from(restaurantTable)
        .where(eq(restaurantTable.id, table.id))
        .limit(1),
    )
    expect(updatedTable?.currentOrderId).toBe(order.id)
  })

  // ---------------------------------------------------------------------------
  // 2) Lançar dois itens via POST .../items atualiza o total da order
  // ---------------------------------------------------------------------------
  it('Lançar dois itens via POST .../items atualiza o total da order', async () => {
    const owner = await registerUser(`p05-items-${Date.now()}@example.com`, 'Items Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Items Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Criar mesa e abrir
    const tableEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 2,
        capacity: 4,
        locationId: mat.id,
      },
    })
    const tableResult = await runHandler(
      (await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/index.post')).default,
      tableEvent,
    )
    expect(tableResult.status).toBe(201)
    const table = tableResult.body as { id: string }

    const openEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${table.id}/open`,
      user: { id: owner.id },
      method: 'POST',
      params: { tableId: table.id },
    })
    const openResult = await runHandler(openTableHandler, openEvent)
    expect(openResult.status).toBe(201)
    const order = openResult.body as { id: string }

    // Adicionar primeiro item
    const item1Event = mkEvent({
      path: `/api/v1/companies/${created.id}/orders/${order.id}/items`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        productName: 'X-Bacon',
        unitPrice: '29.90',
        quantity: '1',
        taxSnapshot: '{"rate": 0.18}',
        bomSnapshot: '{}',
      },
    })
    const item1Result = await runHandler(addItemHandler, item1Event)
    expect(item1Result.status).toBe(201)

    // Adicionar segundo item
    const item2Event = mkEvent({
      path: `/api/v1/companies/${created.id}/orders/${order.id}/items`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        productName: 'Coca-Cola',
        unitPrice: '6.00',
        quantity: '2',
        taxSnapshot: '{"rate": 0.18}',
        bomSnapshot: '{}',
      },
    })
    const item2Result = await runHandler(addItemHandler, item2Event)
    expect(item2Result.status).toBe(201)

    // Verificar total da order (29.90 + 12.00 = 41.90)
    const [updatedOrder] = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .select({ totalAmount: orderSchema.totalAmount })
        .from(orderSchema)
        .where(eq(orderSchema.id, order.id))
        .limit(1),
    )
    expect(Number(updatedOrder?.totalAmount)).toBeCloseTo(41.9, 0)
  })

  // ---------------------------------------------------------------------------
  // 3) Fechar mesa completa a order e libera current_order_id
  // ---------------------------------------------------------------------------
  it('Fechar mesa completa a order e libera current_order_id', async () => {
    const owner = await registerUser(`p05-close-${Date.now()}@example.com`, 'Close Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Close Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Criar mesa, abrir e adicionar item
    const tableEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 3,
        capacity: 4,
        locationId: mat.id,
      },
    })
    const tableResult = await runHandler(
      (await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/index.post')).default,
      tableEvent,
    )
    expect(tableResult.status).toBe(201)
    const table = tableResult.body as { id: string }

    const openEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${table.id}/open`,
      user: { id: owner.id },
      method: 'POST',
      params: { tableId: table.id },
    })
    const openResult = await runHandler(openTableHandler, openEvent)
    expect(openResult.status).toBe(201)
    const order = openResult.body as { id: string }

    // Adicionar item
    const itemEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/orders/${order.id}/items`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        productName: 'X-Egg',
        unitPrice: '15.00',
        quantity: '1',
        taxSnapshot: '{"rate": 0.18}',
        bomSnapshot: '{}',
      },
    })
    await runHandler(addItemHandler, itemEvent)

    // Fechar mesa
    const closeEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${table.id}/close`,
      user: { id: owner.id },
      method: 'POST',
      params: { tableId: table.id },
    })
    const closeResult = await runHandler(closeTableHandler, closeEvent)
    expect(closeResult.status).toBe(204)

    // Verificar que a order foi completada
    const [completedOrder] = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .select({ status: orderSchema.status })
        .from(orderSchema)
        .where(eq(orderSchema.id, order.id))
        .limit(1),
    )
    expect(completedOrder?.status).toBe('completed')

    // Verificar que current_order_id foi liberado
    const [updatedTable] = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .select({ currentOrderId: restaurantTable.currentOrderId })
        .from(restaurantTable)
        .where(eq(restaurantTable.id, table.id))
        .limit(1),
    )
    expect(updatedTable?.currentOrderId).toBeNull()

    // Verificar que a mesa está disponível
    const [tableStatus] = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .select({ status: restaurantTable.status })
        .from(restaurantTable)
        .where(eq(restaurantTable.id, table.id))
        .limit(1),
    )
    expect(tableStatus?.status).toBe('available')
  })

  // ---------------------------------------------------------------------------
  // 4) Duas chamadas concorrentes de open na mesma mesa → só uma order é criada
  // ---------------------------------------------------------------------------
  it('Duas chamadas concorrentes de open na mesma mesa → só uma order é criada', async () => {
    const owner = await registerUser(`p05-concurrent-${Date.now()}@example.com`, 'Concurrent Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Concurrent Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Criar mesa
    const tableEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 4,
        capacity: 4,
        locationId: mat.id,
      },
    })
    const tableResult = await runHandler(
      (await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/index.post')).default,
      tableEvent,
    )
    expect(tableResult.status).toBe(201)
    const table = tableResult.body as { id: string }

    // Executar duas chamadas concorrentes
    const openEvent1 = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${table.id}/open`,
      user: { id: owner.id },
      method: 'POST',
      params: { tableId: table.id },
    })
    const openEvent2 = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${table.id}/open`,
      user: { id: owner.id },
      method: 'POST',
      params: { tableId: table.id },
    })

    const [result1, result2] = await Promise.all([
      runHandler(openTableHandler, openEvent1),
      runHandler(openTableHandler, openEvent2),
    ])

    // A primeira deve succeed (201), a segunda deve falhar (400 ou 409)
    expect([result1.status, result2.status].sort()).toEqual([201, expect.any(Number)])
    const statuses = [result1.status, result2.status]
    expect(statuses).toContain(201)
    expect(statuses).toContain(expect.any((n: number) => n !== 201 && n !== 200))

    // Verificar que só uma order foi criada
    const orders = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .select({ id: orderSchema.id })
        .from(orderSchema)
        .where(and(eq(orderSchema.companyId, created.id), eq(orderSchema.status, 'open'))),
    )
    expect(orders).toHaveLength(1)
  })

  // ---------------------------------------------------------------------------
  // 5) Item de produto de outra location → rejeitado
  // ---------------------------------------------------------------------------
  it('Item de produto de outra location → rejeitado (400)', async () => {
    const owner = await registerUser(`p05-loc-${Date.now()}@example.com`, 'Location Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Location Co ${Date.now()}` },
      owner.id,
    )

    // Criar duas locations
    const loc2Event = mkEvent({
      path: `/api/v1/companies/${created.id}/locations`,
      user: { id: owner.id },
      method: 'POST',
      body: { name: 'Filial' },
    })
    const loc2Result = await runHandler(
      (await import('~~/server/api/v1/companies/[companyId]/locations/index.post')).default,
      loc2Event,
    )
    const loc2 = loc2Result.body as { id: string; name: string }

    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Criar mesa na Matriz
    const tableEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 5,
        capacity: 4,
        locationId: mat.id,
      },
    })
    const tableResult = await runHandler(
      (await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/index.post')).default,
      tableEvent,
    )
    expect(tableResult.status).toBe(201)
    const table = tableResult.body as { id: string }

    // Abrir mesa
    const openEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${table.id}/open`,
      user: { id: owner.id },
      method: 'POST',
      params: { tableId: table.id },
    })
    const openResult = await runHandler(openTableHandler, openEvent)
    expect(openResult.status).toBe(201)
    const order = openResult.body as { id: string }

    // Criar produto na Filial
    const productEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/products`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        name: 'Produto Filial',
        sku: 'LOC-TEST',
        unitPrice: '10.00',
        locationId: loc2.id,
      },
    })
    const productResult = await runHandler(
      (await import('~~/server/api/v1/companies/[companyId]/products/index.post')).default,
      productEvent,
    )
    expect(productResult.status).toBe(201)
    const product = productResult.body as { id: string }

    // Tentar adicionar produto da Filial na order da Matriz → 400
    const addItemEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/orders/${order.id}/items`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        productId: product.id,
        productName: 'Produto Filial',
        unitPrice: '10.00',
        quantity: '1',
        taxSnapshot: '{"rate": 0.18}',
        bomSnapshot: '{}',
      },
    })
    const addItemCode = await getStatus(runHandler(addItemHandler, addItemEvent))
    expect(addItemCode).toBe(400)
  })

  // ---------------------------------------------------------------------------
  // 6) Remover item da order
  // ---------------------------------------------------------------------------
  it('Remover item da order funciona corretamente', async () => {
    const owner = await registerUser(`p05-remove-${Date.now()}@example.com`, 'Remove Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Remove Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Criar mesa, abrir e adicionar item
    const tableEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 6,
        capacity: 4,
        locationId: mat.id,
      },
    })
    const tableResult = await runHandler(
      (await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/index.post')).default,
      tableEvent,
    )
    expect(tableResult.status).toBe(201)
    const table = tableResult.body as { id: string }

    const openEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${table.id}/open`,
      user: { id: owner.id },
      method: 'POST',
      params: { tableId: table.id },
    })
    const openResult = await runHandler(openTableHandler, openEvent)
    expect(openResult.status).toBe(201)
    const order = openResult.body as { id: string }

    // Adicionar item
    const addItemEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/orders/${order.id}/items`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        productName: 'X-Bacon',
        unitPrice: '29.90',
        quantity: '1',
        taxSnapshot: '{"rate": 0.18}',
        bomSnapshot: '{}',
      },
    })
    const addItemResult = await runHandler(addItemHandler, addItemEvent)
    expect(addItemResult.status).toBe(201)

    // Remover item
    const [item] = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .select({ id: orderItem.id })
        .from(orderItem)
        .where(eq(orderItem.orderId, order.id))
        .limit(1),
    )
    expect(item).toBeDefined()

    const removeEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/orders/${order.id}/items/${item!.id}`,
      user: { id: owner.id },
      method: 'DELETE',
      params: { itemId: item!.id },
    })
    const removeResult = await runHandler(removeItemHandler, removeEvent)
    expect(removeResult.status).toBe(204)

    // Verificar que o item foi removido
    const [itemsCount] = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .select({ count: sql<number>`count(*)` })
        .from(orderItem)
        .where(eq(orderItem.orderId, order.id)),
    )
    expect(Number(itemsCount?.count)).toBe(0)
  })
})
