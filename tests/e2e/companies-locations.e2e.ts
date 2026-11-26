import { execSync } from 'node:child_process'
import { beforeEach, describe, expect, it } from 'vitest'
import { setup, useTestContext, url } from '@nuxt/test-utils/e2e'
import {
  E2eClient,
  expireUserRateLimit,
  resetRateLimits,
  seedCompanyMember,
  withRejectedAudit,
} from './support/http'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

if (dbAvailable) {
  // Servidor Nitro real via `nuxt dev` (@nuxt/cli). Dev e não built: o nitro
  // define NODE_ENV=production no bundle (`production` no rollup define), o
  // que ativaria sslmode=require na conexão local (sem TLS) e as envs de
  // produção — o dev server roda o MESMO Nitro/middleware/handlers sem o
  // stub de produção.
  await setup({
    server: true,
    dev: true,
    teardownTimeout: 120_000,
    // Com TCP até o worker do Nitro, o rate limit por IP recebe o IP do socket.
    env: { NITRO_NO_UNIX_SOCKET: '1' },
  })

  // O dev server regenera .nuxt/tsconfig.* do REPO apontando para o buildDir
  // efêmero do worker (removido no teardown) — `tsc` perde os auto-imports.
  // Roda o MESMO comando do postinstall no fim de cada run para deixar o
  // .nuxt do repositório íntegro.
  const ctx = useTestContext()
  ctx.teardown = [
    ...(ctx.teardown ?? []),
    () => {
      execSync('pnpm exec nuxt prepare', { cwd: process.cwd(), stdio: 'pipe' })
    },
  ]
}

interface CompanyRef {
  id: string
  matrizId: string
}

describe.skipIf(!dbAvailable)(
  'companies/locations — e2e HTTP real (Nitro + cookies + CSRF + Better Auth)',
  () => {
    // Rate-limit (register/login/confirm/companies) e lockout são chaveados por
    // IP (127.0.0.1) compartilhado; limpar por teste mantém a suíte hermética —
    // cleanup via owner DB é seeding, asserções seguem todas pelo HTTP.
    beforeEach(async () => {
      await resetRateLimits()
    })

    let seq = 0
    const unique = (): string => `${Date.now().toString(36)}-${++seq}`
    const password = (): string => `e2e-Pw-${unique()}-x9`
    const baseUrl = (): string => url('/').replace(/\/+$/, '')

    interface User {
      client: E2eClient
      id: string
      email: string
      password: string
    }

    async function eventTypes(user: User): Promise<string[]> {
      const exported = await user.client.get<{ authEvents: Array<{ eventType: string }> }>(
        '/api/v1/me/data-export',
      )
      expect(exported.status).toBe(200)
      return exported.body.authEvents.map(({ eventType }) => eventType)
    }

    /** Registra, confirma email, autentica e obtém o token CSRF para as escritas. */
    async function makeUser(label: string): Promise<User> {
      const email = `${label.toLowerCase()}-${unique()}@e2e.test`
      const pass = password()
      const client = new E2eClient(baseUrl())

      const registered = await client.register({
        email,
        password: pass,
        name: label,
        consentTermsVersion: 'v1',
      })
      if (registered.status !== 201) {
        throw new Error(
          `register ${label}: HTTP ${registered.status} ${JSON.stringify(registered.body)}`,
        )
      }

      const confirmed = await client.verifyEmail(email)
      if (confirmed.status !== 200) {
        throw new Error(
          `verifyEmail ${label}: HTTP ${confirmed.status} ${JSON.stringify(confirmed.body)}`,
        )
      }

      const logged = await client.login(email, pass)
      if (logged.status !== 200) {
        throw new Error(`login ${label}: HTTP ${logged.status} ${JSON.stringify(logged.body)}`)
      }

      const me = await client.get('/api/v1/me')
      expect(me.status).toBe(200)
      expect(me.headers.get('x-csrf-token')).toBeTruthy()

      return { client, id: String(registered.body.id), email, password: pass }
    }

    it('exporta cinco vezes, limita a sexta, isola usuários e reabre a janela', async () => {
      const first = await makeUser('export-limit-first')
      const second = await makeUser('export-limit-second')
      for (let i = 0; i < 5; i++) {
        expect((await first.client.get('/api/v1/me/data-export')).status).toBe(200)
      }
      const limited = await first.client.get('/api/v1/me/data-export')
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)

      expect((await second.client.get('/api/v1/me/data-export')).status).toBe(200)

      await expireUserRateLimit(first.id, 'export')
      expect((await first.client.get('/api/v1/me/data-export')).status).toBe(200)

      await resetRateLimits()
      for (let i = 0; i < 120; i++) {
        expect((await first.client.get('/api/v1/me')).status).toBe(200)
      }
      const commonLimited = await first.client.get('/api/v1/me/data-export')
      expect(commonLimited.status).toBe(429)
      expect(Number(commonLimited.headers.get('retry-after'))).toBeGreaterThan(0)
    })

    async function createCompany(user: User, name: string): Promise<CompanyRef> {
      const created = await user.client.post<{ id: string; name: string }>('/api/v1/companies', {
        name,
      })
      if (created.status !== 201) {
        throw new Error(`POST /companies: HTTP ${created.status} ${JSON.stringify(created.body)}`)
      }
      if (created.headers.get('location') !== `/api/v1/companies/${created.body.id}`) {
        throw new Error(`POST /companies: Location inesperado ${created.headers.get('location')}`)
      }

      const locations = await user.client.get<{
        locations: Array<{ id: string; name: string; isActive: boolean }>
      }>(`/api/v1/companies/${created.body.id}/locations`)
      if (locations.status !== 200) {
        throw new Error(`GET /locations: HTTP ${locations.status}`)
      }
      const matriz = locations.body.locations.find((l) => l.name === 'Principal')
      if (!matriz) {
        throw new Error(`sem location "Principal" no bootstrap: ${JSON.stringify(locations.body)}`)
      }

      return { id: created.body.id, matrizId: matriz.id }
    }

    // ---------------------------------------------------------------------------
    // Fluxo de auth completo sobre HTTP real (cookies de sessão/CSRF do jar)
    // ---------------------------------------------------------------------------
    it('auth flow: register 201 → confirm 200 → login 200 → GET /me 200 com cookies reais', async () => {
      const client = new E2eClient(baseUrl())
      const email = `auth-${unique()}@e2e.test`
      const pass = password()

      const registered = await client.register({
        email,
        password: pass,
        name: 'Auth Flow',
        consentTermsVersion: 'v1',
      })
      expect(registered.status).toBe(201)
      expect(String(registered.body.id)).toBeTruthy()

      const confirmed = await client.verifyEmail(email)
      expect(confirmed.status).toBe(200)
      expect(confirmed.body.status).toBe(true)

      const logged = await client.login(email, pass)
      expect(logged.status).toBe(200)

      // Sessão Better Auth de verdade no jar, e CSRF emitido no primeiro GET.
      expect(client.cookies.has('merp-session_token')).toBe(true)
      const me = await client.get<{ id: string; email: string }>('/api/v1/me')
      expect(me.status).toBe(200)
      expect(me.body.id).toBe(String(registered.body.id))
      expect(client.cookies.has('merp-csrf_token')).toBe(true)
    })

    it('login antes de verificar email → 403 email_not_verified', async () => {
      const client = new E2eClient(baseUrl())
      const email = `unverified-${unique()}@e2e.test`
      const pass = password()

      const registered = await client.register({
        email,
        password: pass,
        name: 'Unverified',
        consentTermsVersion: 'v1',
      })
      expect(registered.status).toBe(201)
      // Nenhuma verificação de email: o fluxo real recusa o login.
      const login = await client.login(email, pass)
      expect(login.status).toBe(403)
      expect((login.body as { error?: string }).error).toBe('email_not_verified')

      // E o login NÃO cria sessão.
      expect(client.cookies.has('merp-session_token')).toBe(false)
    })

    it('login com senha errada → 401', async () => {
      const client = new E2eClient(baseUrl())
      const email = `wrong-pass-${unique()}@e2e.test`
      const registered = await client.register({
        email,
        password: password(),
        name: 'Wrong Pass',
        consentTermsVersion: 'v1',
      })
      const confirmed = await client.verifyEmail(email)
      expect(registered.status).toBe(201)
      expect(confirmed.status).toBe(200)

      const login = await client.login(email, password())
      expect(login.status).toBe(401)
    })

    it('GET auth-rota sem sessão → 401', async () => {
      const fresh = new E2eClient(baseUrl())
      const me = await fresh.get('/api/v1/me')
      expect(me.status).toBe(401)
    })

    // ---------------------------------------------------------------------------
    // Bootstrap de company: Principal visível por HTTP
    // ---------------------------------------------------------------------------
    it('POST /companies 201; GET detail 200 com Principal; location_header do recurso', async () => {
      const owner = await makeUser('owner-det')
      const me = await owner.client.get('/api/v1/me')
      expect(me.status).toBe(200)

      const created = await owner.client.post<{ id: string; name: string }>('/api/v1/companies', {
        name: `Det Co ${unique()}`,
      })
      expect(created.status).toBe(201)
      expect(created.headers.get('location')).toBe(`/api/v1/companies/${created.body.id}`)

      const detail = await owner.client.get<{
        id: string
        locations: Array<{ id: string; name: string; isActive: boolean }>
      }>(`/api/v1/companies/${created.body.id}`)
      expect(detail.status).toBe(200)
      expect(detail.body.locations).toHaveLength(1)
      expect(detail.body.locations[0]?.name).toBe('Principal')
      expect(detail.body.locations[0]?.isActive).toBe(true)
    })

    it('GET /companies retorna apenas memberships próprias e valida q', async () => {
      const owner = await makeUser('company-search')
      const co = await createCompany(owner, `Search ${unique()}`)
      const own = await owner.client.get<{
        companies: Array<{ id: string; name: string }>
      }>('/api/v1/companies?q=Search')
      expect(own.status).toBe(200)
      expect(own.body.companies.some((company) => company.id === co.id)).toBe(true)

      const invalid = await owner.client.get('/api/v1/companies?q=%20')
      expect(invalid.status).toBe(400)

      const other = await makeUser('company-search-other')
      const isolated = await other.client.get('/api/v1/companies?q=Search')
      expect(isolated.status).toBe(200)
      expect((isolated.body as { companies: Array<{ id: string }> }).companies).toHaveLength(0)
    })

    // ---------------------------------------------------------------------------
    // CSRF sobre HTTP real
    // ---------------------------------------------------------------------------
    it('POST mutating sem header CSRF → 403 csrf_invalid; nada criado', async () => {
      const owner = await makeUser('owner-csrf')
      const co = await createCompany(owner, `Csrf Co ${unique()}`)

      const noCsrf = await owner.client.post(
        `/api/v1/companies/${co.id}/locations`,
        { name: 'Filial Sem CSRF' },
        { csrf: false },
      )
      expect(noCsrf.status).toBe(403)
      expect((noCsrf.body as { error?: string }).error).toBe('csrf_invalid')

      const list = await owner.client.get<{ locations: Array<{ id: string }> }>(
        `/api/v1/companies/${co.id}/locations`,
      )
      expect(list.status).toBe(200)
      expect(list.body.locations.map(({ id }) => id)).toEqual([co.matrizId])
    })

    it('locations exige sessão e rejeita body inválido com 400', async () => {
      const owner = await makeUser('location-validation')
      const co = await createCompany(owner, `Validation ${unique()}`)
      const fresh = new E2eClient(baseUrl())

      expect((await fresh.get(`/api/v1/companies/${co.id}/locations`)).status).toBe(401)

      const invalid = await owner.client.post(`/api/v1/companies/${co.id}/locations`, {})
      expect(invalid.status).toBe(400)
      expect((invalid.body as { message?: string }).message).toContain('name is required')

      const invalidPatch = await owner.client.patch(
        `/api/v1/companies/${co.id}/locations/${co.matrizId}`,
        {},
      )
      expect(invalidPatch.status).toBe(400)
      expect((invalidPatch.body as { message?: string }).message).toContain(
        'name or isActive is required',
      )

      const list = await owner.client.get<{ locations: unknown[] }>(
        `/api/v1/companies/${co.id}/locations`,
      )
      expect(list.body.locations).toHaveLength(1)
    })

    // ---------------------------------------------------------------------------
    // Ciclo de vida da location (com CSRF válido)
    // ---------------------------------------------------------------------------
    it('owner: segunda location 201 + Location header; PATCH renomeia; DELETE 204 soft', async () => {
      const owner = await makeUser('owner-life')
      const co = await createCompany(owner, `Life Co ${unique()}`)

      const created = await owner.client.post<{ id: string; name: string }>(
        `/api/v1/companies/${co.id}/locations`,
        { name: 'Filial Zona Sul' },
      )
      expect(created.status).toBe(201)
      expect(created.body.name).toBe('Filial Zona Sul')
      expect(created.headers.get('location')).toBe(
        `/api/v1/companies/${co.id}/locations/${created.body.id}`,
      )

      let list = await owner.client.get<{ locations: Array<{ name: string }> }>(
        `/api/v1/companies/${co.id}/locations`,
      )
      expect(list.body.locations.map((l) => l.name).sort()).toEqual([
        'Filial Zona Sul',
        'Principal',
      ])

      const renamed = await owner.client.patch<{ id: string; name: string }>(
        `/api/v1/companies/${co.id}/locations/${created.body.id}`,
        { name: 'Filial Zona Sul II' },
      )
      expect(renamed.status).toBe(200)
      expect(renamed.body.name).toBe('Filial Zona Sul II')

      const deleted = await owner.client.delete(
        `/api/v1/companies/${co.id}/locations/${created.body.id}`,
      )
      expect(deleted.status).toBe(204)
      expect(deleted.body).toBeNull()

      list = await owner.client.get<{ locations: Array<{ name: string }> }>(
        `/api/v1/companies/${co.id}/locations`,
      )
      expect(list.body.locations.map((l) => l.name)).toEqual(['Principal'])
    })

    it('location fantasma da própria empresa: PATCH/DELETE → 404', async () => {
      const owner = await makeUser('owner-ghost')
      const co = await createCompany(owner, `Ghost Co ${unique()}`)
      const ghost = 'eeeeeeee-0000-0000-0000-000000000000'

      const patch = await owner.client.patch(`/api/v1/companies/${co.id}/locations/${ghost}`, {
        name: 'X',
      })
      expect(patch.status).toBe(404)

      const del = await owner.client.delete(`/api/v1/companies/${co.id}/locations/${ghost}`)
      expect(del.status).toBe(404)
    })

    // ---------------------------------------------------------------------------
    // Membro (não-owner, membership semeada): leitura 200, escrita 403
    // ---------------------------------------------------------------------------
    it('membro: GET locations 200; POST/PATCH/DELETE → 403 e nada muda', async () => {
      const owner = await makeUser('member-owner')
      const co = await createCompany(owner, `Member Co ${unique()}`)

      const member = await makeUser('member-user')
      await seedCompanyMember(co.id, member.id, co.matrizId)

      const list = await member.client.get<{ locations: Array<{ name: string }> }>(
        `/api/v1/companies/${co.id}/locations`,
      )
      expect(list.status).toBe(200)
      expect(list.body.locations.map((l) => l.name)).toContain('Principal')

      const post = await member.client.post(`/api/v1/companies/${co.id}/locations`, {
        name: 'Hijack',
      })
      expect(post.status).toBe(403)

      const patch = await member.client.patch(
        `/api/v1/companies/${co.id}/locations/${co.matrizId}`,
        {
          name: 'Hijack',
        },
      )
      expect(patch.status).toBe(403)

      const del = await member.client.delete(`/api/v1/companies/${co.id}/locations/${co.matrizId}`)
      expect(del.status).toBe(403)

      const intact = await owner.client.get<{ locations: Array<{ name: string }> }>(
        `/api/v1/companies/${co.id}/locations`,
      )
      expect(intact.body.locations.map((l) => l.name)).toEqual(['Principal'])
    })

    // ---------------------------------------------------------------------------
    // Cross-tenant sobre HTTP: 404 do middleware, nada vaza
    // ---------------------------------------------------------------------------
    it('owner A contra company B → 404 em GET/PATCH/DELETE/POST', async () => {
      const ownerA = await makeUser('xt-a')
      const ownerB = await makeUser('xt-b')
      await createCompany(ownerA, `XT A ${unique()}`)
      const coB = await createCompany(ownerB, `XT B ${unique()}`)

      const detail = await ownerA.client.get(`/api/v1/companies/${coB.id}`)
      expect(detail.status).toBe(404)

      const get = await ownerA.client.get(`/api/v1/companies/${coB.id}/locations`)
      expect(get.status).toBe(404)

      const post = await ownerA.client.post(`/api/v1/companies/${coB.id}/locations`, {
        name: 'Hijack',
      })
      expect(post.status).toBe(404)

      const patch = await ownerA.client.patch(
        `/api/v1/companies/${coB.id}/locations/${coB.matrizId}`,
        {
          name: 'Hijack',
        },
      )
      expect(patch.status).toBe(404)

      const del = await ownerA.client.delete(
        `/api/v1/companies/${coB.id}/locations/${coB.matrizId}`,
      )
      expect(del.status).toBe(404)

      // Location de B intacta para o dono real.
      const intact = await ownerB.client.get<{ locations: Array<{ name: string }> }>(
        `/api/v1/companies/${coB.id}/locations`,
      )
      expect(intact.body.locations.map((l) => l.name)).toEqual(['Principal'])
    })

    // ---------------------------------------------------------------------------
    // Contratos de company e membros
    // ---------------------------------------------------------------------------
    it('sem sessão recebe 401 em rota protegida com tenant válido', async () => {
      const owner = await makeUser('authz-owner')
      const co = await createCompany(owner, `Authz ${unique()}`)
      const fresh = new E2eClient(baseUrl())
      const response = await fresh.get(`/api/v1/companies/${co.id}`)
      expect(response.status).toBe(401)
    })

    it('owner-only responde 403 e mantém company, membros e location intactos', async () => {
      const owner = await makeUser('owner-only')
      const co = await createCompany(owner, `Owner Only ${unique()}`)
      const member = await makeUser('owner-only-member')
      await seedCompanyMember(co.id, member.id, co.matrizId)

      const members = await member.client.get(`/api/v1/companies/${co.id}/members`)
      expect(members.status).toBe(403)

      const rename = await member.client.patch(`/api/v1/companies/${co.id}`, { name: 'Intruso' })
      expect(rename.status).toBe(403)
      expect((rename.body as { error?: string }).error).toBe('forbidden')

      const invalidRename = await member.client.patch(`/api/v1/companies/${co.id}`, {})
      expect(invalidRename.status).toBe(403)
      expect(invalidRename.body.message).toBe('Only company owners can update companies')
      expect((await owner.client.patch(`/api/v1/companies/${co.id}`, {})).status).toBe(400)

      const assign = await member.client.patch(
        `/api/v1/companies/${co.id}/members/${member.id}/default-location`,
        { defaultLocationId: co.matrizId },
      )
      expect(assign.status).toBe(403)

      const removeOwner = await member.client.delete(
        `/api/v1/companies/${co.id}/members/${owner.id}`,
      )
      expect(removeOwner.status).toBe(403)

      const stillThere = await owner.client.get<{ id: string; name: string }>(
        `/api/v1/companies/${co.id}`,
      )
      expect(stillThere.status).toBe(200)
      expect(stillThere.body.name).toContain('Owner Only')
      const memberList = await owner.client.get<{ members: Array<{ userId: string }> }>(
        `/api/v1/companies/${co.id}/members`,
      )
      expect(memberList.body.members.some((m) => m.userId === member.id)).toBe(true)

      const ownerAssign = await owner.client.patch(
        `/api/v1/companies/${co.id}/members/${member.id}/default-location`,
        { defaultLocationId: null },
      )
      expect(ownerAssign.status).toBe(200)
      const afterAssign = await owner.client.get<{
        members: Array<{ userId: string; defaultLocationId: string | null }>
      }>(`/api/v1/companies/${co.id}/members`)
      expect(afterAssign.body.members.find((m) => m.userId === member.id)?.defaultLocationId).toBe(
        null,
      )

      const ownerRename = await owner.client.patch<{ name: string }>(`/api/v1/companies/${co.id}`, {
        name: 'Renamed by owner',
      })
      expect(ownerRename.status).toBe(200)
      expect(ownerRename.body.name).toBe('Renamed by owner')
      expect(await eventTypes(owner)).toEqual(
        expect.arrayContaining(['member_default_location_updated', 'company_updated']),
      )
      expect(await eventTypes(member)).not.toContain('member_default_location_updated')
    })

    it('membro lista convites; owner cria convite e destinatário aceita via /me', async () => {
      const owner = await makeUser('invite-owner')
      const co = await createCompany(owner, `Invite ${unique()}`)
      const member = await makeUser('invite-member')
      await seedCompanyMember(co.id, member.id, co.matrizId)
      const recipient = await makeUser('invite-recipient')

      const created = await owner.client.post<{
        id: string
        companyId: string
        email: string
        token: string
      }>(`/api/v1/companies/${co.id}/invitations`, { email: recipient.email })
      expect(created.status).toBe(201)
      expect(created.body.email).toBe(recipient.email)
      expect(created.body.companyId).toBe(co.id)
      expect(created.headers.get('location')).toBe(
        `/api/v1/companies/${co.id}/invitations/${created.body.id}`,
      )

      const listed = await member.client.get<{ invites: Array<{ id: string; email: string }> }>(
        `/api/v1/companies/${co.id}/invitations`,
      )
      expect(listed.status).toBe(200)
      expect(listed.body.invites).toEqual([
        expect.objectContaining({ id: created.body.id, email: recipient.email, acceptedAt: null }),
      ])
      expect(listed.body.invites[0]).not.toHaveProperty('token')
      expect(listed.body.invites[0]).not.toHaveProperty('tokenHash')

      const acceptPath = '/api/v1/me/invitations/accept'
      const acceptBody = { token: created.body.token }
      expect((await recipient.client.post(acceptPath, {})).status).toBe(400)
      expect((await member.client.post(acceptPath, acceptBody)).status).toBe(404)
      const accepted = await recipient.client.post(acceptPath, acceptBody)
      expect(accepted.status).toBe(200)
      expect(accepted.body).toEqual({
        id: created.body.id,
        companyId: co.id,
        acceptedAt: expect.any(String),
      })
      expect((await recipient.client.post(acceptPath, acceptBody)).status).toBe(404)
      expect(await eventTypes(owner)).toContain('invite_created')
      expect(await eventTypes(recipient)).toContain('invite_accepted')
      const companies = await recipient.client.get<{
        companies: Array<{ id: string; role: string }>
      }>('/api/v1/me')
      expect(companies.body.companies).toContainEqual({
        id: co.id,
        role: 'member',
        name: expect.any(String),
      })
    })

    it('membro pode sair com 204 vazio; owner não pode remover a si próprio', async () => {
      const owner = await makeUser('leave-owner')
      const co = await createCompany(owner, `Leave ${unique()}`)
      const member = await makeUser('leave-member')
      await seedCompanyMember(co.id, member.id, co.matrizId)

      const ownerLeave = await owner.client.delete(`/api/v1/companies/${co.id}/members/${owner.id}`)
      expect(ownerLeave.status).toBe(403)
      expect(ownerLeave.body).toEqual({
        error: 'forbidden',
        message: 'Cannot remove a company owner',
      })

      const leave = await member.client.delete(`/api/v1/companies/${co.id}/members/${member.id}`)
      expect(leave.status).toBe(204)
      expect(leave.body).toBeNull()
      const detail = await member.client.get(`/api/v1/companies/${co.id}`)
      expect(detail.status).toBe(404)
      const members = await owner.client.get<{ members: Array<{ userId: string }> }>(
        `/api/v1/companies/${co.id}/members`,
      )
      expect(members.body.members.some((m) => m.userId === member.id)).toBe(false)
      expect(await eventTypes(member)).toContain('member_removed')
      expect(await eventTypes(owner)).not.toContain('member_removed')

      await seedCompanyMember(co.id, member.id, co.matrizId)
      const removed = await owner.client.delete(`/api/v1/companies/${co.id}/members/${member.id}`)
      expect(removed.status).toBe(204)
      expect(removed.body).toBeNull()
      expect((await member.client.get(`/api/v1/companies/${co.id}`)).status).toBe(404)
      expect(await eventTypes(owner)).toContain('member_removed')
      expect(
        (await owner.client.delete(`/api/v1/companies/${co.id}/members/${member.id}`)).status,
      ).toBe(404)
    })

    it('DELETE company retorna 204 vazio e remove acesso do owner', async () => {
      const owner = await makeUser('delete-company')
      const co = await createCompany(owner, `Delete ${unique()}`)
      const deleted = await owner.client.delete(`/api/v1/companies/${co.id}`)
      expect(deleted.status).toBe(204)
      expect(deleted.body).toBeNull()
      expect((await owner.client.get(`/api/v1/companies/${co.id}`)).status).toBe(404)
      expect(await eventTypes(owner)).toContain('company_deleted')
    })

    it('invite e assign recusados por member preservam estado; papel precede body', async () => {
      const owner = await makeUser('precedence-owner')
      const co = await createCompany(owner, `Precedence ${unique()}`)
      const member = await makeUser('precedence-member')
      await seedCompanyMember(co.id, member.id, co.matrizId)
      const invitedEmail = `not-created-${unique()}@e2e.test`
      const invitations = `/api/v1/companies/${co.id}/invitations`
      const invalidInvite = await member.client.post(invitations, {})
      expect(invalidInvite.status).toBe(403)
      expect(invalidInvite.body.message).toBe('Only company owners can invite members')

      const invite = await member.client.post(invitations, {
        email: invitedEmail,
      })
      expect(invite.status).toBe(403)
      const inviteList = await owner.client.get<{ invites: Array<{ email: string }> }>(
        `/api/v1/companies/${co.id}/invitations`,
      )
      expect(inviteList.body.invites.some((item) => item.email === invitedEmail)).toBe(false)

      const assignment = `/api/v1/companies/${co.id}/members/${member.id}/default-location`
      const invalidAssign = await member.client.patch(assignment, {})
      expect(invalidAssign.status).toBe(403)
      expect(invalidAssign.body.message).toBe('Only company owners can assign a default location')
      const invalidOwnerAssign = await owner.client.patch(assignment, {})
      expect(invalidOwnerAssign.status).toBe(400)
      const members = await owner.client.get<{
        members: Array<{ userId: string; defaultLocationId: string | null }>
      }>(`/api/v1/companies/${co.id}/members`)
      expect(
        members.body.members.find((item) => item.userId === member.id)?.defaultLocationId,
      ).toBe(co.matrizId)
    })

    it('convites: valida sessão, tenant, body e limite por IP antes da validação', async () => {
      const owner = await makeUser('invite-limit')
      const co = await createCompany(owner, `Invite Limit ${unique()}`)
      const outsider = await makeUser('invite-outsider')
      const invitations = `/api/v1/companies/${co.id}/invitations`
      const payload = { email: outsider.email }
      const anonymous = new E2eClient(baseUrl())
      expect((await anonymous.get('/api/v1/me')).status).toBe(401)
      expect((await anonymous.post(invitations, payload)).status).toBe(401)
      expect((await outsider.client.get(invitations)).status).toBe(404)
      expect((await outsider.client.post(invitations, payload)).status).toBe(404)

      await resetRateLimits()
      for (let i = 0; i < 20; i++) {
        const invalid = await owner.client.post(invitations, {})
        expect(invalid.status).toBe(400)
        expect(invalid.body).toEqual({
          error: 'validation_error',
          message: 'A valid email is required',
        })
      }
      const limited = await owner.client.post(invitations, {})
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
      expect(Number(limited.headers.get('ratelimit-reset'))).toBeGreaterThan(0)
      expect(limited.headers.get('ratelimit-remaining')).toBe('0')
      expect((await owner.client.get(invitations)).body).toEqual({ invites: [] })
    })

    it('convite duplicado não gera auditoria nem Location de sucesso', async () => {
      const owner = await makeUser('invite-duplicate')
      const co = await createCompany(owner, `Duplicate ${unique()}`)
      const invitations = `/api/v1/companies/${co.id}/invitations`
      const payload = { email: `duplicate-${unique()}@e2e.test` }
      expect((await owner.client.post(invitations, payload)).status).toBe(201)
      const duplicate = await owner.client.post(invitations, payload)
      expect(duplicate.status).toBe(409)
      expect(duplicate.headers.get('location')).toBeNull()
      expect((await eventTypes(owner)).filter((event) => event === 'invite_created')).toHaveLength(
        1,
      )
    })

    it('falha de auditoria preserva o 201 e o convite já gravado', async () => {
      const owner = await makeUser('invite-audit')
      const co = await createCompany(owner, `Audit ${unique()}`)
      const invitations = `/api/v1/companies/${co.id}/invitations`
      const email = `audit-${unique()}@e2e.test`
      const created = await withRejectedAudit(() =>
        owner.client.post<{ id: string }>(invitations, { email }),
      )
      expect(created.status).toBe(201)
      expect(created.headers.get('location')).toBe(`${invitations}/${created.body.id}`)
      const list = await owner.client.get(invitations)
      expect(list.status).toBe(200)
      expect(list.body.invites).toEqual([expect.objectContaining({ id: created.body.id, email })])
      expect(await eventTypes(owner)).not.toContain('invite_created')
    })

    it.each([
      ['/api/v1/me/deactivate', 'Account deactivated successfully'],
      ['/api/v1/me/consents/withdraw', 'Consent withdrawn successfully'],
    ])('%s funciona sem tenant e encerra a sessão', async (path, message) => {
      const user = await makeUser('account-close')
      const response = await user.client.post(path)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ message })
      expect((await user.client.get('/api/v1/me')).status).toBe(401)
    })
  },
)
