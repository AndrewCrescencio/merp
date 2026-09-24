# Decisões pendentes — handoff para o próximo chat

**Estado em 2026-09-22** (branch `dev`, pushed): 381 testes verdes,
docs sem drift conhecido.

---

## RESOLVIDO em 2026-09-22: Decisão 1 — Direção: ERP genérico vs restaurante

**Decisão**: Núcleo comum + packs verticais (ADR-001). Ver `specs/decisions/ADR-001-vertical-strategy.md`.

- ERP genérico (`specs/003–007`) → movido para `specs/packs/erp-b2b/` (ADIADO)
- Restaurante → `specs/packs/restaurant/` (próximo após núcleo)
- Núcleo → `specs/006-core-order/` (em spec, implementação não iniciada)

**Decidido por**: executor (você) — data: 2026-09-22

---

## RESOLVIDO em 2026-09-22: Decisão 2 — CI com Docker

**Decisão**: CI criada em `.github/workflows/ci.yml` com:

- Canary job (RLS) obrigatório → test job (needs canary) → lint/typecheck
- Postgres service container
- `pnpm db:migrate:full` (drizzle-kit migrate + applier custom via `scripts/apply-custom-sql.ts`)

**Decidido por**: executor (você) — data: 2026-09-22

---

## Próximos passos

- [ ] Implementar `specs/006-core-order/spec.md` (núcleo unificado)
- [ ] Após núcleo estável: implementar `specs/packs/restaurant/`
- [ ] `specs/packs/erp-b2b/` permanece ADIADO

---

## Checklist de encerramento

- [x] Decisão 1 registrada acima
- [x] Roadmap preterido marcado como descartado (movido para packs/erp-b2b)
- [x] CI com Docker criada e verde (integração executada, não skip)
- [x] `pnpm db:migrate:full` implementado e testado em banco limpo
- [ ] Sprint 0 (núcleo) aberto
