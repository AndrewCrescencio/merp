# ADR-005: API Versioning — /api/v1 desde já

## Decisão

Adotar `/api/v1` prefixo em todos os endpoints novos a partir de agora.

## Alternativa Rejeitada

Esperar primeiro consumidor externo para versionar.

## Motivo

- Contrato estável desde o início evita breaking changes silenciosos.
- Facilita depreciação futura (`/api/v2`).
- Documentação OpenAPI gerada por versão.
- Clientes internos (frontend Nuxt) já consomem via `/api/*` — migrar para `/api/v1/*` é mudança única.

## Plano de Migração

1. Novos endpoints: `/api/v1/...`
2. Endpoints existentes (`/api/auth/*`, `/api/health`, `/api/metrics`): manter sem versionamento até v2 (são estáveis, auth é contrato próprio).
3. Documentar em `contracts/auth-api.md` que auth permanece em `/api/auth` (exceção deliberada).
