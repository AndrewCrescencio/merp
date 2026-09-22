# Decisões pendentes — handoff para o próximo chat

**Estado em 2026-09-22** (branch `dev`, pushed): 291 testes unitários verdes,
docs sem drift conhecido, fases 003–007 fatiadas. Dois itens travam o Sprint 0
e exigem decisão humana + infraestrutura — este arquivo é o briefing para
resolvê-los em outra conversa.

---

## Decisão 1 — Direção: ERP genérico vs restaurante

Existem **dois roadmaps concorrentes** sobre a mesma fundação (auth + tenant + RLS):

| Critério        | A) ERP genérico (`ERP_FEATURE_PLAN.md` + `specs/003–007/`) | B) Restaurante (`BACKEND_ANALYSIS.md` §4–5)      |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Módulos         | Catálogo, vendas, financeiro, CRM, admin (5 fases)         | Menu, pedidos, cozinha, mesas, delivery, estoque |
| Entidades novas | ~20 tabelas relacionais clássicas                          | ~15 tabelas + estados de tempo real              |
| Realtime        | Não precisa (CRUD + jobs)                                  | Precisa (SSE/WebSocket p/ cozinha/pedidos)       |
| Infra extra     | Nenhuma (só Postgres)                                      | WS/SSE, storage de imagens, talvez fila          |
| RLS             | Padrão `company_id` direto                                 | Mesmo padrão + possível `location` por company   |
| Fiscal BR       | Previsto (NF-e em aberto, §10 Q3)                          | iFood/Rappi, Mercado Pago em aberto              |

**Se A**: seguir `specs/003-erp-catalog/plan.md` no Sprint 0; arquivar a §4–5 do
`BACKEND_ANALYSIS.md` como "alternativa descartada" (não apagar — tem gaps de
infra úteis: storage, webhooks, busca full-text).
**Se B**: criar `specs/008-restaurant-*/plan.md` no mesmo formato das fases
003–007 e arquivar o plano ERP.

**Perguntas para stakeholders** (de `ERP_FEATURE_PLAN.md` §10):

1. Gateway de pagamento (Stripe/MercadoPago) ou tracking interno?
2. Exigências fiscais (NF-e, CNPJ/CPF já coberto em parte por `isValidCnpj`)?
3. PT-BR only ou i18n?
4. Greenfield ou migração de dados legados?
5. Multi-unidade por company (`location`) ou 1 company = 1 unidade?

**Critério de saída**: decisão registrada aqui embaixo + roadmap preterido
marcado como descartado. Sem isso, o Sprint 0 não começa.

> **Decisão registrada**: _(preencher no próximo chat — A ou B, data, por quem)_

---

## Decisão 2 — CI com Docker (validar os testes de integração)

**Estado atual**:

- ~80 testes de integração em 6 arquivos (`server/**/*.test.ts`) pulam sem
  Docker (`DB_AVAILABLE !== 'true'`); `server/utils/test-setup.ts` (globalSetup
  do Vitest) sobe o Postgres via compose **sozinho** quando o daemon é acessível.
- Não existe `.github/workflows/` — só hooks locais (`pre-commit`: lint-staged;
  `pre-push`: `pnpm test --run`, que pula integração sem Docker).
- Nesta máquina Docker é **inutilizável** (usuário fora do grupo `docker`, sem
  sudo) — nunca validado aqui: testes novos (`listUserAuthEvents`), regressão
  de ordering (`apply-custom-sql.test.ts`) e toda a suíte `.test.ts`.

**Pendente de validação em ambiente com Docker**:

1. `docker compose up -d postgres && pnpm test` verde com `DB_AVAILABLE=true`.
2. `make migrate` + applier custom em banco limpo (runbook no README) — prova
   o fix `0014_app_role_ensure` fora do teste de regressão.
3. Criar `.github/workflows/ci.yml` (sugestão: `postgres:16` service +
   `pnpm install` + `pnpm test` + `pnpm lint`).

**Critério de saída**: CI verde com integração executada (não skipada) ao menos
uma vez, antes de qualquer deploy com dados reais.

---

## Checklist de encerramento

- [ ] Decisão 1 registrada acima
- [ ] Roadmap preterido marcado como descartado
- [ ] CI com Docker criada e verde (integração executada, não skip)
- [ ] `make migrate-full` implementado e testado em banco limpo (depende do CI)
- [ ] Sprint 0 aberto na fase correspondente
