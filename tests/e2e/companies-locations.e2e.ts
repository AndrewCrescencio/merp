import { execSync } from 'node:child_process'
import { beforeEach, describe, expect, it } from 'vitest'
import { setup, useTestContext, url } from '@nuxt/test-utils/e2e'
import { E2eClient, resetRateLimits, seedCompanyMember } from './support/http'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

if (dbAvailable) {
  // Servidor Nitro real via `nuxt dev` (@nuxt/cli). Dev e não built: o nitro
  // define NODE_ENV=production no bundle (`production` no rollup define), o
  // que ativaria sslmode=require na conexão local (sem TLS) e as envs de
  // produção — o dev server roda o MESMO Nitro/middleware/handlers sem o
  // stub de produção.
  await setup({ server: true, dev: true, teardownTimeout: 120_000 })

  // O dev server regenera .nuxt/tsconfig.* do REPO apontando para o buildDir
  // efêmero do worker (removido no teardown) — `tsc` perde os auto-imports.
  // Roda o MESMO comando do postinstall no fim de cada run para deixar o
  // .nuxt do repositório íntegro.
  const ctx = useTestContext()
  ctx.teardown = [
    ...(ctx.teardown ?? []),
    () => {
      execSync('npx nuxt prepare', { cwd: process.cwd(), stdio: 'pipe' })
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

    /** Fluxo REAL: register → verifyEmail (token mintado como o do link) → login. */
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

      return { client, id: String(registered.body.id), email, password: pass }
    }

    /**
     * Company criada pelo endpoint real. O GET prévio é o bootstrap do CSRF:
     * o cookie só é emitido em requests seguros não-isentos — antes do login
     * não há rota /api que o emita para o público.
     */
    async function createCompany(user: User, name: string): Promise<CompanyRef> {
      const me = await user.client.get<{ id: string }>('/api/v1/me')
      if (me.status !== 200) {
        throw new Error(`GET /me: HTTP ${me.status}`)
      }

      const created = await user.client.post<{ id: string; name: string }>('/api/v1/companies', {
        name,
      })
      if (created.status !== 201) {
        throw new Error(`POST /companies: HTTP ${created.status} ${JSON.stringify(created.body)}`)
      }

      const locations = await user.client.get<{
        locations: Array<{ id: string; name: string; isActive: boolean }>
      }>(`/api/v1/companies/${created.body.id}/locations`)
      if (locations.status !== 200) {
        throw new Error(`GET /locations: HTTP ${locations.status}`)
      }
      const matriz = locations.body.locations.find((l) => l.name === 'Matriz')
      if (!matriz) {
        throw new Error(`sem location "Matriz" no bootstrap: ${JSON.stringify(locations.body)}`)
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
    // Bootstrap de company: Matriz visível por HTTP
    // ---------------------------------------------------------------------------
    it('POST /companies 201; GET detail 200 com Matriz; location_header do recurso', async () => {
      const owner = await makeUser('owner-det')
      const me = await owner.client.get('/api/v1/me')
      expect(me.status).toBe(200)

      const created = await owner.client.post<{ id: string; name: string }>('/api/v1/companies', {
        name: `Det Co ${unique()}`,
      })
      expect(created.status).toBe(201)
      expect(created.headers.get('location')).toContain(created.body.id)

      const detail = await owner.client.get<{
        id: string
        locations: Array<{ id: string; name: string; isActive: boolean }>
      }>(`/api/v1/companies/${created.body.id}`)
      expect(detail.status).toBe(200)
      expect(detail.body.locations).toHaveLength(1)
      expect(detail.body.locations[0]?.name).toBe('Matriz')
      expect(detail.body.locations[0]?.isActive).toBe(true)
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
      expect(created.headers.get('location')).toContain(created.body.id)

      let list = await owner.client.get<{ locations: Array<{ name: string }> }>(
        `/api/v1/companies/${co.id}/locations`,
      )
      expect(list.body.locations.map((l) => l.name).sort()).toEqual(['Filial Zona Sul', 'Matriz'])

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

      list = await owner.client.get<{ locations: Array<{ name: string }> }>(
        `/api/v1/companies/${co.id}/locations`,
      )
      expect(list.body.locations.map((l) => l.name)).toEqual(['Matriz'])
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
      expect(list.body.locations.map((l) => l.name)).toContain('Matriz')

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
      expect(intact.body.locations.map((l) => l.name)).toEqual(['Matriz'])
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
      expect(intact.body.locations.map((l) => l.name)).toEqual(['Matriz'])
    })
  },
)
