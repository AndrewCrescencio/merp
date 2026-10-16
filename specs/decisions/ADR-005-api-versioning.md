# ADR-005: API Versioning — /api/v1 desde já

## Decisão

Adotar `/api/v1` prefixo em todos os endpoints novos, e migrar para lá
também os **existentes** que não são fluxo de autenticação.

## Alternativa Rejeitada

Esperar primeiro consumidor externo para versionar.

## Motivo

- Contrato estável desde o início evita breaking changes silenciosos.
- Facilita depreciação futura (`/api/v2`).
- Documentação OpenAPI gerada por versão.
- Clientes internos (frontend Nuxt) já consomem via `/api/*` — migrar para
  `/api/v1/*` é mudança única.
- **Escopo de tenant no path (R5)** — razão que reescreveu o item 2 do plano:
  `server/middleware/tenant.ts` extrai `companyId` do path por regex, e um
  path flat (`/api/auth/companies`) não tem segmento onde colocá-lo. Sem isso
  o `companyId` teria de vir do body, contra o fail-closed do §4. Evidência:
  24 handlers usam `requireTenant`, **0** leem `companyId` de body.

## Plano de Migração

1. Novos endpoints: `/api/v1/...`
2. Existentes que **não** são fluxo de auth (`/api/auth/companies`, `/invite`,
   `/invites`, `/me`, `/consent`, `/deactivate`, `/export`): migrar para
   `/api/v1` — nunca foram autenticação, e R5 exige `companyId` no path.
3. **Fluxos de auth** (`login`, `logout`, `register`, `password/*`, `email/*`)
   e `health`: manter sem versionamento até v2 (contrato próprio).
4. `/api/metrics` removido; `/api/health` dividiu-se em
   `/api/health/live` e `/api/health/ready` (ambos sem versionamento).
5. Documentar em `contracts/auth-api.md` que auth permanece em `/api/auth`
   (exceção deliberada).

## Revisão — 2026-10-16

O item 2 original mandava manter em `/api/auth/*`, **sem versionamento até
v2, todos os endpoints existentes**. Estreitou-se porque foi escrito antes de
R5 (tenant no path) e confundiu "protegido por sessão" com "fluxo de
autenticação": `/api/auth/companies` nunca foi autenticação, e mantê-lo flat
tornaria o escopo por tenant impossível. O critério passou a ser **o tipo do
endpoint, não o path que ele ocupava**.

Detalhamento de R1–R8 (estrutura, verbos, tenant, params, tokens no body) e a
relação com este ADR vivem em `specs/000-foundation/rest-api.md`, impostas por
`scripts/check-routes.ts` e `server/utils/stale-api-urls.spec.ts` no CI.

Consequência da migração já executada: as URLs de `password/*` e `email/*`
ganharam sub-recurso (`/api/auth/password/forgot`) e `verify-email` mudou de
`GET ?token=` para `POST` com token no body (R6). Isso **não** é versionamento
— nenhum consumidor externo existe ainda, e o frontend é migrado na mesma
mudança; §9 da constituição foi corrigido em conjunto.

## Consequências e riscos

- `specs/001-auth-context/contracts/auth-api.md` documenta o contrato antigo
  (24 endpoints nos paths pré-migração); divergência conhecida, registrada em
  `specs/000-foundation/rest-api.md`.
- Remoção de `POST /api/auth/companies/switch` deixou `setActiveCompany`
  sem chamador de produção. O código morto foi removido em 2026-10-16
  (`setActiveCompany`, `getActiveCompany`, o campo em `GET /api/v1/me` e os
  fallbacks de audit `tenantId`); a coluna `session.active_company_id`
  permanece no schema como legado — ver `specs/000-foundation/rest-api.md`.

## Critério para reavaliar

1. Se existir consumidor externo, `password/*`/`email/*` precisam de um
   período de alias antes de qualquer novo renomeio.
2. Se o cliente escolher empresa sem `companyId` no path (ex.: painel
   cross-empresa), o campo `activeCompanyId` volta a ser fonte e o switch
   retorna — hoje ele não existe porque R5 o tornou redundante.
