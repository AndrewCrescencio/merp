import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { createEvent as h3CreateEvent, type H3Event } from 'h3'
import { companyMember } from '~~/server/utils/schema'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('P0.3 CRUD (integration, RLS real)', () => {
  let companyRepository: typeof import('~~/server/utils/auth/company/repository').companyRepository
  let membershipRepo: typeof import('~~/server/utils/auth/company/membership').membershipRepository
  let locationRepository: typeof import('~~/server/utils/auth/company/location-repository').locationRepository
  let restaurantTableRepo: typeof import('~~/server/utils/auth/company/restaurant-table-repository').restaurantTableRepository
  let kitchenStationRepo: typeof import('~~/server/utils/auth/company/kitchen-station-repository').kitchenStationRepository
  let withTenant: typeof import('~~/server/utils/db/tenant-context').withTenant
  let registerUserFn: typeof import('~~/server/utils/auth/identity/queries').registerUser
  let tenantMiddleware: (event: H3Event) => Promise<void>

  let tablesGet: (event: H3Event) => Promise<unknown>
  let tablesPost: (event: H3Event) => Promise<unknown>
  let tablesPatch: (event: H3Event) => Promise<unknown>
  let tablesDelete: (event: H3Event) => Promise<unknown>

  let stationsGet: (event: H3Event) => Promise<unknown>
  let stationsPost: (event: H3Event) => Promise<unknown>
  let stationsPatch: (event: H3Event) => Promise<unknown>
  let stationsDelete: (event: H3Event) => Promise<unknown>

  let membersGet: (event: H3Event) => Promise<unknown>

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL

    const repoMod = await import('~~/server/utils/auth/company/repository')
    companyRepository = repoMod.companyRepository
    locationRepository = (await import('~~/server/utils/auth/company/location-repository'))
      .locationRepository
    membershipRepo = (await import('~~/server/utils/auth/company/membership')).membershipRepository
    restaurantTableRepo = (await import('~~/server/utils/auth/company/restaurant-table-repository'))
      .restaurantTableRepository
    kitchenStationRepo = (await import('~~/server/utils/auth/company/kitchen-station-repository'))
      .kitchenStationRepository
    withTenant = (await import('~~/server/utils/db/tenant-context')).withTenant
    registerUserFn = (await import('~~/server/utils/auth/identity/queries')).registerUser

    tenantMiddleware = (await import('~~/server/middleware/tenant')).default

    tablesGet = (await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/index.get'))
      .default as (event: H3Event) => Promise<unknown>
    tablesPost = (
      await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/index.post')
    ).default as (event: H3Event) => Promise<unknown>
    tablesPatch = (
      await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/[tableId]/index.patch')
    ).default as (event: H3Event) => Promise<unknown>
    tablesDelete = (
      await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/[tableId]/index.delete')
    ).default as (event: H3Event) => Promise<unknown>

    stationsGet = (
      await import('~~/server/api/v1/companies/[companyId]/kitchen/stations/index.get')
    ).default as (event: H3Event) => Promise<unknown>
    stationsPost = (
      await import('~~/server/api/v1/companies/[companyId]/kitchen/stations/index.post')
    ).default as (event: H3Event) => Promise<unknown>
    stationsPatch = (
      await import('~~/server/api/v1/companies/[companyId]/kitchen/stations/[stationId]/index.patch')
    ).default as (event: H3Event) => Promise<unknown>
    stationsDelete = (
      await import('~~/server/api/v1/companies/[companyId]/kitchen/stations/[stationId]/index.delete')
    ).default as (event: H3Event) => Promise<unknown>

    membersGet = (await import('~~/server/api/v1/companies/[companyId]/members/index.get'))
      .default as (event: H3Event) => Promise<unknown>
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
  // 1) Duas locations da mesma empresa podem ter mesa número 1
  // ---------------------------------------------------------------------------
  it('duas locations da mesma empresa podem ter mesa número 1 (unique constraint corrigido)', async () => {
    const owner = await registerUser(`p03-loc-${Date.now()}@example.com`, 'Location Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Location Co ${Date.now()}` },
      owner.id,
    )

    // Cria segunda location
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

    // Mesa número 1 na location "Matriz"
    const table1Event = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 1,
        name: 'Mesa 1 - Matriz',
        capacity: 4,
        locationId: mat.id,
      },
    })
    const table1Result = await runHandler(tablesPost, table1Event)
    expect(table1Result.status).toBe(201)

    // Mesa número 1 na location "Filial" - deve ser permitido
    const table2Event = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 1,
        name: 'Mesa 1 - Filial',
        capacity: 6,
        locationId: loc2.id,
      },
    })
    const table2Result = await runHandler(tablesPost, table2Event)
    expect(table2Result.status).toBe(201)

    // Verifica que ambas as mesas foram criadas
    const allTables = await restaurantTableRepo.listTables(created.id, owner.id)
    expect(allTables).toHaveLength(2)
  })

  // ---------------------------------------------------------------------------
  // 2) Owner cria mesa e estação; waiter tentando criar → 403
  // ---------------------------------------------------------------------------
  it('owner cria mesa e estação; waiter tentando criar → 403', async () => {
    const owner = await registerUser(`p03-waiter-${Date.now()}@example.com`, 'Waiter Owner')
    const waiter = await registerUser(`p03-waiter-w-${Date.now()}@example.com`, 'Waiter User')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Waiter Co ${Date.now()}` },
      owner.id,
    )
    // createCompanyMember só aceita 'member' (bootstrap); roles atribuem-se
    // diretamente, como o teste 4 faz para 'kitchen'.
    await withTenant(created.id, null, owner.id, async (tx) =>
      tx.insert(companyMember).values({ companyId: created.id, userId: waiter.id, role: 'waiter' }),
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Owner cria mesa
    const tableEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 2,
        name: 'Mesa Owner',
        capacity: 4,
        locationId: mat.id,
      },
    })
    const tableResult = await runHandler(tablesPost, tableEvent)
    expect(tableResult.status).toBe(201)

    // Waiter tenta criar mesa → 403
    const waiterTableEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: waiter.id },
      method: 'POST',
      body: {
        number: 3,
        name: 'Mesa Waiter',
        capacity: 4,
        locationId: mat.id,
      },
    })
    const waiterTableCode = await getStatus(runHandler(tablesPost, waiterTableEvent))
    expect(waiterTableCode).toBe(403)

    // Owner cria estação
    const stationEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/kitchen/stations`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        name: 'Cozinha',
        displayOrder: 1,
        locationId: mat.id,
      },
    })
    const stationResult = await runHandler(stationsPost, stationEvent)
    expect(stationResult.status).toBe(201)

    // Waiter tenta criar estação → 403
    const waiterStationEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/kitchen/stations`,
      user: { id: waiter.id },
      method: 'POST',
      body: {
        name: 'Cozinha Waiter',
        displayOrder: 2,
        locationId: mat.id,
      },
    })
    const waiterStationCode = await getStatus(runHandler(stationsPost, waiterStationEvent))
    expect(waiterStationCode).toBe(403)
  })

  // ---------------------------------------------------------------------------
  // 3) Lista de membros mostra role e default_location corretamente
  // ---------------------------------------------------------------------------
  it('lista de membros mostra role e default_location corretamente', async () => {
    const owner = await registerUser(`p03-memb-${Date.now()}@example.com`, 'Member Owner')
    const waiter = await registerUser(`p03-memb-w-${Date.now()}@example.com`, 'Member Waiter')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Member Co ${Date.now()}` },
      owner.id,
    )
    // Ver comentário do teste 2: roles fora de 'member' não passam pelo
    // createCompanyMember (guarda de bootstrap).
    await withTenant(created.id, null, owner.id, async (tx) =>
      tx.insert(companyMember).values({ companyId: created.id, userId: waiter.id, role: 'waiter' }),
    )

    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!
    await membershipRepo.setMemberDefaultLocation(created.id, owner.id, waiter.id, mat.id)

    // Owner lista membros
    const membersEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/members`,
      user: { id: owner.id },
    })
    const membersResult = await runHandler(membersGet, membersEvent)
    expect(membersResult.status).toBe(200)

    const members = membersResult.body as {
      members: Array<{ userId: string; role: string; defaultLocationId: string | null }>
    }

    // Owner aparece com role 'owner'
    const ownerMember = members.members.find((m: any) => m.userId === owner.id)!
    expect(ownerMember).toBeDefined()
    expect(ownerMember.role).toBe('owner')

    // Waiter aparece com role 'waiter' e default_location_id setado
    const waiterMember = members.members.find((m: any) => m.userId === waiter.id)!
    expect(waiterMember).toBeDefined()
    expect(waiterMember.role).toBe('waiter')
    expect(waiterMember.defaultLocationId).toBe(mat.id)
  })

  // ---------------------------------------------------------------------------
  // 4) Atribuir novo role (ex. "kitchen") e confirmar que persiste
  // ---------------------------------------------------------------------------
  it('atribuir role "kitchen" a membro e confirmar persistência', async () => {
    const owner = await registerUser(`p03-role-${Date.now()}@example.com`, 'Role Owner')
    const kitchenUser = await registerUser(`p03-role-k-${Date.now()}@example.com`, 'Role Kitchen')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Role Co ${Date.now()}` },
      owner.id,
    )

    // Cria membro com role 'kitchen' usando withTenant diretamente
    const [createdMember] = await withTenant(created.id, null, owner.id, async (tx) =>
      tx
        .insert(companyMember)
        .values({
          companyId: created.id,
          userId: kitchenUser.id,
          role: 'kitchen',
        })
        .returning(),
    )
    expect(createdMember).toBeDefined()
    expect(createdMember!.role).toBe('kitchen')

    // Verifica que o role 'kitchen' foi persistido
    const [foundMember] = await withTenant(created.id, null, owner.id, async (tx) =>
      tx
        .select({ role: companyMember.role })
        .from(companyMember)
        .where(eq(companyMember.userId, kitchenUser.id))
        .limit(1),
    )
    expect(foundMember?.role).toBe('kitchen')
  })

  // ---------------------------------------------------------------------------
  // 5) Kitchen station CRUD
  // ---------------------------------------------------------------------------
  it('kitchen station CRUD (create, read, update, delete)', async () => {
    const owner = await registerUser(`p03-station-${Date.now()}@example.com`, 'Station Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Station Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Criar estação
    const createEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/kitchen/stations`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        name: 'Grelhador',
        displayOrder: 2,
        locationId: mat.id,
      },
    })
    const createResult = await runHandler(stationsPost, createEvent)
    expect(createResult.status).toBe(201)
    const createdStation = createResult.body as { id: string; name: string; displayOrder: number }

    // Listar estações
    const listEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/kitchen/stations`,
      user: { id: owner.id },
    })
    const listResult = await runHandler(stationsGet, listEvent)
    expect(listResult.status).toBe(200)
    const stations = listResult.body as { stations: Array<{ name: string }> }
    expect(stations.stations).toHaveLength(1)
    expect(stations.stations[0]?.name).toBe('Grelhador')

    // Atualizar estação
    const updateEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/kitchen/stations/${createdStation.id}`,
      user: { id: owner.id },
      method: 'PATCH',
      body: { name: 'Grelhador Atualizado', displayOrder: 1 },
      params: { stationId: createdStation.id },
    })
    const updateResult = await runHandler(stationsPatch, updateEvent)
    expect(updateResult.status).toBe(200)
    expect((updateResult.body as { name: string }).name).toBe('Grelhador Atualizado')

    // Deletar estação
    const deleteEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/kitchen/stations/${createdStation.id}`,
      user: { id: owner.id },
      method: 'DELETE',
      params: { stationId: createdStation.id },
    })
    const deleteResult = await runHandler(stationsDelete, deleteEvent)
    expect(deleteResult.status).toBe(204)

    // Verifica que a estação foi removida
    const afterList = await kitchenStationRepo.listStations(created.id, owner.id)
    expect(afterList).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // 6) Restaurant table CRUD
  // ---------------------------------------------------------------------------
  it('restaurant table CRUD (create, read, update, delete)', async () => {
    const owner = await registerUser(`p03-table-${Date.now()}@example.com`, 'Table Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Table Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Criar mesa
    const createEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        number: 5,
        name: 'Mesa Janela',
        capacity: 6,
        locationId: mat.id,
      },
    })
    const createResult = await runHandler(tablesPost, createEvent)
    expect(createResult.status).toBe(201)
    const createdTable = createResult.body as { id: string; number: number; name: string }

    // Listar mesas
    const listEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables`,
      user: { id: owner.id },
    })
    const listResult = await runHandler(tablesGet, listEvent)
    expect(listResult.status).toBe(200)
    const tables = listResult.body as { tables: Array<{ number: number }> }
    expect(tables.tables).toHaveLength(1)
    expect(tables.tables[0]?.number).toBe(5)

    // Atualizar mesa
    const updateEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${createdTable.id}`,
      user: { id: owner.id },
      method: 'PATCH',
      body: { name: 'Mesa Janela Atualizada', capacity: 8 },
      params: { tableId: createdTable.id },
    })
    const updateResult = await runHandler(tablesPatch, updateEvent)
    expect(updateResult.status).toBe(200)
    expect((updateResult.body as { name: string }).name).toBe('Mesa Janela Atualizada')

    // Deletar mesa
    const deleteEvent = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${createdTable.id}`,
      user: { id: owner.id },
      method: 'DELETE',
      params: { tableId: createdTable.id },
    })
    const deleteResult = await runHandler(tablesDelete, deleteEvent)
    expect(deleteResult.status).toBe(204)

    // Verifica que a mesa foi removida
    const afterList = await restaurantTableRepo.listTables(created.id, owner.id)
    expect(afterList).toHaveLength(0)
  })
})
