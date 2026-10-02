# ADR-006: Tipo de PK — uuid nativo (novas tabelas) / text (tabelas auth legadas)

## Status

Aceito (revisado 2026-10)

## Contexto

- Tabelas auth (`user`, `session`, `account`, `verification`, `company`,
  `company_member`, `invite`, `auth_event`, `auth_security_state`,
  `email_queue`) foram criadas com `id text PRIMARY KEY DEFAULT gen_random_uuid()`.
  O **valor** é UUID, o **tipo de coluna** é text (mais largo, sem validação
  nativa).
- Tabelas de domínio (order, catalog, party, etc.) ainda não existem.

## Decisão

- **Tabelas auth/identity**: permanecem `text` até segunda ordem (migração
  custosa, zero benefício imediato).
- **Novas tabelas de domínio** (a partir de `006-core-order`): PK `uuid`
  nativa via Drizzle `uuid('id').primaryKey().defaultRandom()`.

## Consequências

- FKs mistas `uuid` → `text` entre domínio e auth: PostgreSQL faz cast
  implícito (funciona), mas perde validação de formato no lado auth.
- Ao adicionar nova tabela: usar `uuid`. Nunca `text` por copiar exemplo antigo.

## Alternativas rejeitadas

- Migrar auth para uuid agora: churn sem valor.
- Manter text em tudo: mantém risco de IDs malformados.
