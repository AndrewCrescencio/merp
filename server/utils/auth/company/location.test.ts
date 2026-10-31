import { describe, it, expect, beforeAll } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createEvent as h3CreateEvent, type H3Event } from 'h3'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('Location bootstrap + endpoints (integration, RLS real)', () => {
  let companyRepository: typeof import('~~/server/utils/auth/company/repository').companyRepository
  let locationRepository: typeof import('~~/server/utils/auth/company/location-repository').locationRepository
  let membershipRepo: typeof import('~~/server/utils/auth/company/membership').membershipRepository
  let withTenant: typeof import('~~/server/utils/db/tenant-context').withTenant
  let companyMember: typeof import('~~/server/utils/schema').companyMember
  let registerUserFn: typeof import('~~/server/utils/auth/identity/queries').registerUser
  let tenantMiddleware: (event: H3Event) => Promise<void>
  let ordersHandler: (event: H3Event) => Promise<unknown>
  let openTableHandler: (event: H3Event) => Promise<unknown>

  let locationsGet: (event: H3Event) => Promise<unknown>
  let locationsPost: (event: H3Event) => Promise<unknown>
  let locationsPatch: (event: H3Event) => Promise<unknown>
  let locationsDelete: (event: H3Event) => Promise<unknown>

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL

    const schema = await import('~~/server/utils/schema')
    companyMember = schema.companyMember

    const repoMod = await import('~~/server/utils/auth/company/repository')
    companyRepository = repoMod.companyRepository
    locationRepository = (await import('~~/server/utils/auth/company/location-repository'))
      .locationRepository
    membershipRepo = (await import('~~/server/utils/auth/company/membership')).membershipRepository
    withTenant = (await import('~~/server/utils/db/tenant-context')).withTenant
    registerUserFn = (await import('~~/server/utils/auth/identity/queries')).registerUser

    tenantMiddleware = (await import('~~/server/middleware/tenant')).default
    ordersHandler = (await import('~~/server/api/v1/companies/[companyId]/orders/index.post'))
      .default as (event: H3Event) => Promise<unknown>
    openTableHandler = (
      await import('~~/server/api/v1/companies/[companyId]/restaurant/tables/[tableId]/open.post')
    ).default as (event: H3Event) => Promise<unknown>

    locationsGet = (await import('~~/server/api/v1/companies/[companyId]/locations/index.get'))
      .default as (event: H3Event) => Promise<unknown>
    locationsPost = (await import('~~/server/api/v1/companies/[companyId]/locations/index.post'))
      .default as (event: H3Event) => Promise<unknown>
    locationsPatch = (
      await import('~~/server/api/v1/companies/[companyId]/locations/[locationId]/index.patch')
    ).default as (event: H3Event) => Promise<unknown>
    locationsDelete = (
      await import('~~/server/api/v1/companies/[companyId]/locations/[locationId]/index.delete')
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

  interface FakeRes {
    statusCode: number
    headers: Record<string, string>
    removeHeader: (name: string) => void
    setHeader: (name: string, value: string) => void
    writeHead: (code: number, headers?: Record<string, string>) => void
    end: () => void
  }

  /**
   * Evento h3 REAL (createEvent do próprio h3, zero mocks do h3): os getters
   * `method`/`path`/`headers` funcionam, readBody lê `req.rawBody`,
   * getRouterParam lê `context.params` (Nitro seta na rota real), sendNoContent
   * usa `res` fake. O mesmo chain middleware→handler roda igual ao servidor.
   */
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
      // Fonte do corpo que o readRawBody do h3 lê antes do stream do socket.
      ...(opts.body !== undefined ? { rawBody: JSON.stringify(opts.body) } : {}),
    }
    const event = h3CreateEvent(req as never, res as never)
    event.context.user = { ...opts.user, email: 'test@example.com', name: 'Test' }
    event.context.auth = {
      user: event.context.user,
      session: { id: 'integration-test-session' },
    }
    // Nitro seta context.params no roteamento; aqui fabrica-se para o mesmo
    // contrato. context.user/context.auth replica o middleware auth.
    if (opts.params) {
      event.context.params = opts.params
    }
    return event
  }

  /** Roda o middleware tenant real (membership via banco, RLS) e depois o handler real. */
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
      return 200 // sem throw — resolveu
    } catch (error) {
      const err = error as { statusCode?: number; status?: number }
      return err.statusCode ?? err.status ?? 500
    }
  }

  // ---------------------------------------------------------------------------
  // 1) Bootstrap: createCompanyWithOwner cria "Matriz" + default_location_id
  // ---------------------------------------------------------------------------
  it('createCompanyWithOwner cria location "Matriz" e seta default_location_id do owner (com GUC location NULL validado explicitamente)', async () => {
    const owner = await registerUser(`lc-owner-${Date.now()}@example.com`, 'Location Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Bootstrap Co ${Date.now()}` },
      owner.id,
    )

    // A policy location_insert_policy exige (id = get_location_id() OR
    // get_location_id() IS NULL): com id != get_location_id(), o INSERT só
    // passa se o GUC estava NULL. Valida o mecanismo do withTenant diretamente.
    const [gucRow] = await withTenant(created.id, null, owner.id, async (tx) =>
      tx.execute<{ is_null: boolean }>(sql`SELECT public.get_location_id() IS NULL AS is_null`),
    )
    expect(gucRow?.is_null).toBe(true)

    // "Matriz" existe e é ativa.
    const locations = await locationRepository.listLocations(created.id, owner.id)
    expect(locations).toHaveLength(1)
    expect(locations[0]?.name).toBe('Matriz')
    expect(locations[0]?.isActive).toBe(true)

    // O owner aponta para ela.
    const [member] = await withTenant(created.id, null, owner.id, async (tx) =>
      tx
        .select({ defaultLocationId: companyMember.defaultLocationId })
        .from(companyMember)
        .where(eq(companyMember.userId, owner.id))
        .limit(1),
    )
    expect(member?.defaultLocationId).toBe(locations[0]?.id)

    // findCompanyWithLocations devolve a company + locations (200 shape).
    const detail = await companyRepository.findCompanyWithLocations(created.id, owner.id)
    expect(detail?.locations.map((l) => l.name)).toEqual(['Matriz'])
  })

  it('requireLocationId resolve para a "Matriz" da empresa recém-criada (400 de location eliminado)', async () => {
    const owner = await registerUser(`lc-req-${Date.now()}@example.com`, 'Req Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Require Co ${Date.now()}` },
      owner.id,
    )

    const { requireLocationId } = await import('~~/server/utils/shared/location')
    const locationId = await requireLocationId(created.id, owner.id)
    const locations = await locationRepository.listLocations(created.id, owner.id)
    expect(locationId).toBe(locations[0]?.id)
  })

  // ---------------------------------------------------------------------------
  // 2) POST /orders deixa de retornar 400 para a empresa recém-criada
  // ---------------------------------------------------------------------------
  it('POST /orders cria pedido para a empresa recém-criada (sem 400 de location)', async () => {
    const owner = await registerUser(`lc-order-${Date.now()}@example.com`, 'Order Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Order Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // Mesa necessária para order dine_in (RLS: INSERT com tenant+location na GUC).
    const { restaurantTable } = await import('~~/server/utils/schema')
    const [table] = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .insert(restaurantTable)
        .values({ companyId: created.id, locationId: mat.id, number: 1 })
        .returning({ id: restaurantTable.id }),
    )

    const event = mkEvent({
      path: `/api/v1/companies/${created.id}/orders`,
      user: { id: owner.id },
      method: 'POST',
      body: {
        orderType: 'dine_in',
        items: [
          {
            productName: 'X-Bacon',
            unitPrice: '29.90',
            quantity: '1',
            taxSnapshot: '0.00',
          },
        ],
        dineIn: { tableId: table!.id, coverCount: 2 },
      },
    })

    const { status, body } = await runHandler(ordersHandler, event)
    expect(status).toBe(201)
    const order = body as { id: string; locationId?: string }
    expect(order.id).toBeTruthy()

    // Order gravada com a location reservada (Matriz) — RLS INSERT passou.
    const [row] = await withTenant(created.id, null, owner.id, async (tx) =>
      tx.execute<{ location_id: string }>(
        sql`SELECT location_id FROM "order" WHERE id = ${order.id}`,
      ),
    )
    expect(row?.location_id).toBe(mat.id)
  })

  // ---------------------------------------------------------------------------
  // 3) POST /restaurant/tables/{id}/open deixa de retornar 400
  // ---------------------------------------------------------------------------
  it('POST /restaurant/tables/{id}/open abre a mesa da empresa recém-criada (RLS location-scoped)', async () => {
    const owner = await registerUser(`lc-open-${Date.now()}@example.com`, 'Open Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Open Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    const { restaurantTable } = await import('~~/server/utils/schema')
    const [table] = await withTenant(created.id, mat.id, owner.id, async (tx) =>
      tx
        .insert(restaurantTable)
        .values({ companyId: created.id, locationId: mat.id, number: 2 })
        .returning({ id: restaurantTable.id }),
    )

    const event = mkEvent({
      path: `/api/v1/companies/${created.id}/restaurant/tables/${table!.id}/open`,
      user: { id: owner.id },
      method: 'POST',
      body: { coverCount: 4 },
      params: { tableId: table!.id },
    })

    const { status, body } = await runHandler(openTableHandler, event)
    expect(status).toBe(200)
    const tableOut = body as { id: string; status: string }
    expect(tableOut.id).toBe(table!.id)
    expect(tableOut.status).toBe('occupied')
  })

  // ---------------------------------------------------------------------------
  // 4) Mutações de location são owner-only (403 para não-owner, via assertCompanyRole)
  // ---------------------------------------------------------------------------
  it('não-owner tentando POST location → 403; GET → 200 para qualquer membro', async () => {
    const owner = await registerUser(`lc-mut-${Date.now()}@example.com`, 'Mut Owner')
    const member = await registerUser(`lc-mut-m-${Date.now()}@example.com`, 'Mut Member')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Mut Co ${Date.now()}` },
      owner.id,
    )
    await membershipRepo.createCompanyMember(created.id, member.id, 'member')

    // GET: qualquer membro vê.
    const memberGet = mkEvent({
      path: `/api/v1/companies/${created.id}/locations`,
      user: { id: member.id },
    })
    const getOut = await runHandler(locationsGet, memberGet)
    expect(getOut.status).toBe(200)
    const locations = (getOut.body as { locations: Array<{ name: string }> }).locations
    expect(locations.map((l) => l.name)).toEqual(['Matriz'])

    // POST: não-owner → 403 (antes de tocar o banco).
    const memberPost = mkEvent({
      path: `/api/v1/companies/${created.id}/locations`,
      user: { id: member.id },
      method: 'POST',
      body: { name: 'Hijacked' },
    })
    const postCode = await getStatus(runHandler(locationsPost, memberPost))
    expect(postCode).toBe(403)

    // Nada foi criado no banco.
    const after = await locationRepository.listLocations(created.id, owner.id)
    expect(after).toHaveLength(1)
  })

  it('não-owner tentando PATCH/DELETE location → 403', async () => {
    const owner = await registerUser(`lc-mut2-${Date.now()}@example.com`, 'Mut2 Owner')
    const member = await registerUser(`lc-mut2-m-${Date.now()}@example.com`, 'Mut2 Member')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Mut2 Co ${Date.now()}` },
      owner.id,
    )
    await membershipRepo.createCompanyMember(created.id, member.id, 'member')
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    const patchCode = await getStatus(
      runHandler(
        locationsPatch,
        mkEvent({
          path: `/api/v1/companies/${created.id}/locations/${mat.id}`,
          user: { id: member.id },
          method: 'PATCH',
          body: { name: 'Hijacked' },
          params: { locationId: mat.id },
        }),
      ),
    )
    expect(patchCode).toBe(403)

    const deleteCode = await getStatus(
      runHandler(
        locationsDelete,
        mkEvent({
          path: `/api/v1/companies/${created.id}/locations/${mat.id}`,
          user: { id: member.id },
          method: 'DELETE',
          params: { locationId: mat.id },
        }),
      ),
    )
    expect(deleteCode).toBe(403)

    // Intacta.
    const after = await locationRepository.listLocations(created.id, owner.id)
    expect(after[0]?.name).toBe('Matriz')
    expect(after[0]?.isActive).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // 5) Cross-tenant: location de outra empresa → 404 (não vaza existência)
  // ---------------------------------------------------------------------------
  it('owner A tentando GET/PATCH/DELETE location da company B → 404 (tenant middleware)', async () => {
    const ownerA = await registerUser(`lc-xt-a-${Date.now()}@example.com`, 'XT Owner A')
    const ownerB = await registerUser(`lc-xt-b-${Date.now()}@example.com`, 'XT Owner B')
    // Company A só existe para provar que o gate é membership (A tem empresa
    // própria e MESMO ASSIM não vê B).
    await companyRepository.createCompanyWithOwner({ name: `XT A ${Date.now()}` }, ownerA.id)
    const companyB = await companyRepository.createCompanyWithOwner(
      { name: `XT B ${Date.now()}` },
      ownerB.id,
    )
    const locB = (await locationRepository.listLocations(companyB.id, ownerB.id))[0]!

    // GET de locations de B pelo owner A → 404 no middleware.
    const getCode = await getStatus(
      runHandler(
        locationsGet,
        mkEvent({ path: `/api/v1/companies/${companyB.id}/locations`, user: { id: ownerA.id } }),
      ),
    )
    expect(getCode).toBe(404)

    // PATCH de location de B pelo owner A → 404 no middleware.
    const patchCode = await getStatus(
      runHandler(
        locationsPatch,
        mkEvent({
          path: `/api/v1/companies/${companyB.id}/locations/${locB.id}`,
          user: { id: ownerA.id },
          method: 'PATCH',
          body: { name: 'Hacked' },
          params: { locationId: locB.id },
        }),
      ),
    )
    expect(patchCode).toBe(404)

    // DELETE de location de B pelo owner A → 404 no middleware.
    const deleteCode = await getStatus(
      runHandler(
        locationsDelete,
        mkEvent({
          path: `/api/v1/companies/${companyB.id}/locations/${locB.id}`,
          user: { id: ownerA.id },
          method: 'DELETE',
          params: { locationId: locB.id },
        }),
      ),
    )
    expect(deleteCode).toBe(404)

    // Location intacta para o dono real.
    const intact = (await locationRepository.listLocations(companyB.id, ownerB.id))[0]!
    expect(intact.name).toBe('Matriz')
    expect(intact.isActive).toBe(true)

    // E o detalhe da empresa B não vaza para A (AUD-20: membership é o gate).
    expect(await companyRepository.findCompanyWithLocations(companyB.id, ownerA.id)).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // 6) Owner cria outra location mesmo com "Matriz" existente (policy INSERT)
  // ---------------------------------------------------------------------------
  it('owner cria segunda location via endpoint; policy INSERT permite (GUC NULL no escape)', async () => {
    const owner = await registerUser(`lc-two-${Date.now()}@example.com`, 'Two Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Two Co ${Date.now()}` },
      owner.id,
    )

    const event = mkEvent({
      path: `/api/v1/companies/${created.id}/locations`,
      user: { id: owner.id },
      method: 'POST',
      body: { name: 'Filial Zona Sul' },
    })
    const { status, body } = await runHandler(locationsPost, event)
    expect(status).toBe(201)
    const createdLocation = body as { id: string; name: string; isActive: boolean }
    expect(createdLocation.name).toBe('Filial Zona Sul')
    expect(createdLocation.isActive).toBe(true)

    // Duas locations visíveis — "Matriz" + a nova.
    const all = await locationRepository.listLocations(created.id, owner.id)
    expect(all.map((l) => l.name).sort()).toEqual(['Filial Zona Sul', 'Matriz'])

    // E o header Location aponta para o recurso criado (R8).
    const locHeader = (event.node.res as unknown as FakeRes).headers['location']
    expect(locHeader).toContain(createdLocation.id)
  })

  // ---------------------------------------------------------------------------
  // 7) PATCH renomeia; DELETE é soft (isActive=false), não físico
  // ---------------------------------------------------------------------------
  it('owner PATCH renomeia; owner DELETE faz soft delete (is_active=false, linha continua)', async () => {
    const owner = await registerUser(`lc-soft-${Date.now()}@example.com`, 'Soft Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Soft Co ${Date.now()}` },
      owner.id,
    )
    const mat = (await locationRepository.listLocations(created.id, owner.id))[0]!

    // PATCH renomeia.
    const patchOut = await runHandler(
      locationsPatch,
      mkEvent({
        path: `/api/v1/companies/${created.id}/locations/${mat.id}`,
        user: { id: owner.id },
        method: 'PATCH',
        body: { name: 'Matriz Renomeada' },
        params: { locationId: mat.id },
      }),
    )
    expect(patchOut.status).toBe(200)
    expect((patchOut.body as { name: string }).name).toBe('Matriz Renomeada')

    // DELETE soft → 204 sem corpo.
    const event = mkEvent({
      path: `/api/v1/companies/${created.id}/locations/${mat.id}`,
      user: { id: owner.id },
      method: 'DELETE',
      params: { locationId: mat.id },
    })
    const { status } = await runHandler(locationsDelete, event)
    expect(status).toBe(204)

    // Linha continua (soft), inactive — via SQL cru com tenant na GUC,
    // para provar o estado físico da linha (não o shape da listagem).
    const [inactive] = await withTenant(created.id, null, owner.id, async (tx) =>
      tx.execute<{ is_active: boolean; name: string }>(
        sql`SELECT is_active, name FROM location WHERE id = ${mat.id}`,
      ),
    )
    expect(inactive?.is_active).toBe(false)
    expect(inactive?.name).toBe('Matriz Renomeada')

    // GET não lista mais a location (listagem filtra active).
    const listing = await locationRepository.listLocations(created.id, owner.id)
    expect(listing).toHaveLength(0)

    // Idem no detalhe da empresa.
    const detail = await companyRepository.findCompanyWithLocations(created.id, owner.id)
    expect(detail?.locations).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // 8) DELETE de location inexistente da própria empresa → 404
  // ---------------------------------------------------------------------------
  it('owner DELETE/PATCH location inexistente da própria empresa → 404', async () => {
    const owner = await registerUser(`lc-404-${Date.now()}@example.com`, '404 Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `404 Co ${Date.now()}` },
      owner.id,
    )
    const ghost = 'eeeeeeee-0000-0000-0000-000000000000'

    const patchCode = await getStatus(
      runHandler(
        locationsPatch,
        mkEvent({
          path: `/api/v1/companies/${created.id}/locations/${ghost}`,
          user: { id: owner.id },
          method: 'PATCH',
          body: { name: 'X' },
          params: { locationId: ghost },
        }),
      ),
    )
    expect(patchCode).toBe(404)

    const deleteCode = await getStatus(
      runHandler(
        locationsDelete,
        mkEvent({
          path: `/api/v1/companies/${created.id}/locations/${ghost}`,
          user: { id: owner.id },
          method: 'DELETE',
          params: { locationId: ghost },
        }),
      ),
    )
    expect(deleteCode).toBe(404)
  })

  // ---------------------------------------------------------------------------
  // 9) locationRepository.updateLocation cross-tenant backstop: 0 linhas (404)
  // ---------------------------------------------------------------------------
  it('repository: updateLocation contra outra empresa → 404, nada muda', async () => {
    const ownerA = await registerUser(`lc-rep-a-${Date.now()}@example.com`, 'Rep Owner A')
    const ownerB = await registerUser(`lc-rep-b-${Date.now()}@example.com`, 'Rep Owner B')
    const companyA = await companyRepository.createCompanyWithOwner(
      { name: `Rep A ${Date.now()}` },
      ownerA.id,
    )
    const companyB = await companyRepository.createCompanyWithOwner(
      { name: `Rep B ${Date.now()}` },
      ownerB.id,
    )
    const locB = (await locationRepository.listLocations(companyB.id, ownerB.id))[0]!

    // O repositório roda com tenant = company B… mas quem chama só chega aqui
    // via handler, que já fez 404 no middleware. O backstop de repositório:
    // update com tenant da company A vs id de B → 0 linhas → 404.
    await expect(
      locationRepository.updateLocation(companyA.id, ownerA.id, locB.id, { name: 'Hacked' }),
    ).rejects.toMatchObject({ statusCode: 404 })

    const intact = (await locationRepository.listLocations(companyB.id, ownerB.id))[0]!
    expect(intact.name).toBe('Matriz')
  })

  it('GET /companies/{id} (detalhe) devolve a empresa com locations via handler real', async () => {
    const owner = await registerUser(`lc-det-${Date.now()}@example.com`, 'Det Owner')
    const created = await companyRepository.createCompanyWithOwner(
      { name: `Det Co ${Date.now()}` },
      owner.id,
    )

    const detailHandler = (await import('~~/server/api/v1/companies/[companyId]/index.get'))
      .default as (event: unknown) => Promise<unknown>

    const event = mkEvent({
      path: `/api/v1/companies/${created.id}`,
      user: { id: owner.id },
      // O roteamento do Nitro grava context.params; réplica para o handler
      // conseguir o companyId via getRouterParam.
      params: { companyId: created.id },
    })
    const { status, body } = await runHandler(detailHandler, event)
    expect(status).toBe(200)
    const detail = body as {
      id: string
      name: string
      locations: Array<{ name: string; isActive: boolean }>
    }
    expect(detail.id).toBe(created.id)
    expect(detail.locations).toHaveLength(1)
    expect(detail.locations[0]?.name).toBe('Matriz')
  })
})
