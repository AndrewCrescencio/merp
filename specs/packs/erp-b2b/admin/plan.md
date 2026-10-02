> **Estado (2026-10):** plan-only. Sem `spec.md`, `data-model.md` ou
> `contracts/` ainda. Não implementado. Ver ADR-001 (núcleo primeiro).

# Fase 7 — Relatórios e Administração

**Status: ADIADO. Não será implementado até o núcleo estar estável.**
**Regras herdadas de specs/000-foundation/\*. Não é spec executável ainda.**

**Status**: Planejado | **Origem**: extraído de `ERP_FEATURE_PLAN.md` (§2 Fase 5, Sprint 4)
**Fundação**: `specs/001-auth-context/` (PII audit, LGPD) · consome todas as fases 003–006

## Escopo

| Módulo        | Entidades (a desenhar — sem DDL no plano)                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reports       | Agregações (vendas, produtos, clientes); materialized views ou tasks agendadas                                                                                          |
| Users & Roles | `user_role`, `permission` — **atenção**: hoje só existe `owner`/`member` em `company_member`; a matriz §5.3 do plano (Manager/Staff/Viewer) exige enum + policies novas |
| Settings      | `setting`, `integration` (config por company)                                                                                                                           |

## Relatórios

- Endpoints de leitura para gráficos (vendas, produtos, clientes) — só GET,
  escopados por tenant, sem PII além do necessário.
- Agregação pesada vai para Nitro tasks agendadas (padrão de `purge-*` +
  `runPurgeTask`), nunca no request.
- Auditoria de acesso a relatórios com PII (padrão do `pii-audit.ts`).

## Administração

- RBAC: estender `role` + RLS por papel; matriz de permissão (§5.3 do plano)
  deve ser desenhada ANTES (dirige policies e proteção de rotas).
- Settings por company; `company.update` já existe no contexto auth como referência.
- Sem `super_admin` de plataforma (deferido — ver FR-019 no spec).

## Testes

- RBAC: cada papel × cada endpoint (matriz executável).
- Auditoria final de segurança antes do release (pen test, rate limit) — Sprint 4.

## Tarefas (Sprint 4)

- [ ] Relatórios (dashboard API) + agregações agendadas
- [ ] RBAC completo + settings por company
- [ ] UI (Nuxt pages/components) + auditoria final + release prep
