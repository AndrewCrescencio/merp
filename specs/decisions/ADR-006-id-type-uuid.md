# ADR-006: ID Type — UUID

## Decisão

PK `uuid` (não `text`).

## Estado Atual

Código usa `text` com `gen_random_uuid()` default. Spec 003 propõe o mesmo tipo inconsistente.

## Motivo

- `uuid` nativo tem validação, indexação otimizada, 16 bytes vs 36+ chars de `text`.
- `text` permite qualquer string (risco de IDs malformados).
- Drizzle: `uuid('id').primaryKey().defaultRandom()` → PG `uuid` type.

## Migração

Fica para quando a **primeira feature de domínio** for implementada (núcleo order/catalog).
Não vale migrar só auth/identity agora — custo/benefício baixo.

## Consequências

- Novas tabelas: `uuid` PK.
- Tabelas existentes (auth/identity): permanecem `text` até migração planejada.
- FKs entre novas tabelas e antigas: `uuid` → `text` (cast implícito PG funciona).
