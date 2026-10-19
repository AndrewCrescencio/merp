#!/usr/bin/env tsx
// Seed de desenvolvimento (dev-only): owner + empresa + location + catálogo
// mínimo do pack restaurant — pelos MESMOS fluxos do código de produção
// (registerUser + createCompanyWithOwner), para o estado semeado nunca divergir
// do que a aplicação aceitaria criar. Idempotente: re-executar só repara o que
// falta. Corre com `npm run db:seed`.
import { and, eq, inArray } from 'drizzle-orm'
import { verifyPassword } from 'better-auth/crypto'
import { registerUser, findUserByEmail } from '~~/server/utils/auth/identity/queries'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { db, createOwnerDbForSetupOnly } from '~~/server/utils/db'
import { user, account } from '~~/server/utils/schema/identity'
import { companyMember } from '~~/server/utils/schema/company'
import { location } from '~~/server/utils/schema/location'
import { product } from '~~/server/utils/schema/product'
import { restaurantTable } from '~~/server/utils/schema/restaurant-table'

const SEED_EMAIL = 'owner@merp.test'
const SEED_PASSWORD = 'DevSeed#2026'
const SEED_USER_NAME = 'Seed Owner'
const SEED_COMPANY_NAME = 'Merp Dev (seed)'
const CONSENT_VERSION = 'v1'
const LOCATION_ID = 'seed-location'
const PRODUCT_IDS = ['seed-prod-1', 'seed-prod-2', 'seed-prod-3']
const TABLE_IDS = ['seed-table-1', 'seed-table-2', 'seed-table-3']

// Dev-only: recusa qualquer banco que não seja local, seja o NODE_ENV o que for
// (o .env local do repo declara production). Corre só em loopback.
function assertLocal(url: string | undefined, name: string): void {
  if (!url) {
    console.error(`✗ ${name} não definida — existe um .env válido na raiz?`)
    process.exit(1)
  }
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error(`✗ db:seed é dev-only — ${name} aponta para "${host}", não para loopback`)
    process.exit(1)
  }
}

async function main(): Promise<void> {
  assertLocal(process.env.DATABASE_URL, 'DATABASE_URL')
  assertLocal(process.env.APP_DATABASE_URL, 'APP_DATABASE_URL')

  // Conexão owner: uso sancionado pelo próprio db.ts ("test setup / migrations
  // / seeding"); as policies continuam a valer para a aplicação, que lê como
  // merp_app com o tenant no lugar.
  const ownerDb = createOwnerDbForSetupOnly()

  // 1) utilizador — fluxo real de registo (hash de senha + conta credential)
  const existing = await findUserByEmail(SEED_EMAIL)
  let userId: string
  let createdNow = false
  if (existing) {
    userId = existing.id
    console.log(`• utilizador já existe (${SEED_EMAIL}) — só repara o estado`)
  } else {
    const created = await registerUser({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      name: SEED_USER_NAME,
      consentTermsVersion: CONSENT_VERSION,
    })
    if (!created) {
      console.error('✗ registerUser recusou o registo do seed')
      process.exit(1)
    }
    userId = created.id
    createdNow = true
    console.log('✓ utilizador criado (melhor auth + consentimento)')
  }
  // Login exige email verificado (AUD-04) — seed é local, marca de uma vez.
  await db
    .update(user)
    .set({ emailVerified: true, isActive: true, updatedAt: new Date() })
    .where(eq(user.id, userId))

  // 2) empresa + membro owner — transação real de bootstrap do fundador
  const [member] = await ownerDb
    .select()
    .from(companyMember)
    .where(and(eq(companyMember.userId, userId), eq(companyMember.role, 'owner')))
    .limit(1)
  let companyId: string
  if (member) {
    companyId = member.companyId
    console.log(`• empresa do owner já existe (${companyId})`)
  } else {
    const created = await companyRepository.createCompanyWithOwner(
      { name: SEED_COMPANY_NAME },
      userId,
    )
    companyId = created.id
    console.log(`✓ empresa criada (${companyId})`)
  }

  // 3) location + catálogo mínimo. shortcut: ids fixos seed-*; se trocares de
  // empresa a meio, apaga as linhas seed-* e reexecuta o seed.
  await ownerDb
    .insert(location)
    .values({ id: LOCATION_ID, companyId, name: 'Salão (seed)' })
    .onConflictDoNothing()
  await ownerDb
    .insert(product)
    .values([
      {
        id: PRODUCT_IDS[0],
        companyId,
        locationId: LOCATION_ID,
        name: 'Refeição do dia',
        unitPrice: '25.00',
      },
      {
        id: PRODUCT_IDS[1],
        companyId,
        locationId: LOCATION_ID,
        name: 'Água mineral',
        unitPrice: '3.00',
      },
      {
        id: PRODUCT_IDS[2],
        companyId,
        locationId: LOCATION_ID,
        name: 'Sumo natural',
        unitPrice: '7.50',
      },
    ])
    .onConflictDoNothing()
  await ownerDb
    .insert(restaurantTable)
    .values([
      { id: TABLE_IDS[0], companyId, locationId: LOCATION_ID, number: 1, capacity: 2 },
      { id: TABLE_IDS[1], companyId, locationId: LOCATION_ID, number: 2, capacity: 4 },
      { id: TABLE_IDS[2], companyId, locationId: LOCATION_ID, number: 3, capacity: 4 },
    ])
    .onConflictDoNothing()
  console.log('✓ location + 3 produtos + 3 mesas (re-execução = no-op)')

  // 4) self-check — o seed só fica verde a mostrar o estado final provado
  const [u] = await ownerDb.select().from(user).where(eq(user.id, userId))
  const [cred] = await ownerDb
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
  const [loc] = await ownerDb.select().from(location).where(eq(location.id, LOCATION_ID))
  const prods = await ownerDb
    .select({ id: product.id })
    .from(product)
    .where(inArray(product.id, PRODUCT_IDS))
  const tables = await ownerDb
    .select({ id: restaurantTable.id })
    .from(restaurantTable)
    .where(inArray(restaurantTable.id, TABLE_IDS))

  const problems: string[] = []
  if (!u?.emailVerified || !u.isActive) problems.push('user não fica verified+active')
  if (!loc) problems.push('location seed ausente')
  if (prods.length !== PRODUCT_IDS.length)
    problems.push(`produtos: ${prods.length}/${PRODUCT_IDS.length}`)
  if (tables.length !== TABLE_IDS.length)
    problems.push(`mesas: ${tables.length}/${TABLE_IDS.length}`)
  if (!cred?.password) {
    problems.push('conta credential sem senha')
  } else if (createdNow) {
    const pwdOk = await verifyPassword({ password: SEED_PASSWORD, hash: cred.password })
    if (!pwdOk) problems.push('hash de senha não verifica')
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`)
    process.exit(1)
  }

  console.log('✓ seed completo')
  console.log(`  login: ${SEED_EMAIL} / ${SEED_PASSWORD}`)
  console.log(
    `  empresa: ${companyId} · location: ${LOCATION_ID} · ${prods.length} produtos · ${tables.length} mesas`,
  )
  process.exit(0)
}

main().catch((error: unknown) => {
  console.error('✗ seed falhou:', error)
  process.exit(1)
})
