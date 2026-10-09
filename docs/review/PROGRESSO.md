# Progresso da Revisão — Merp

## Status Geral

- **Fase**: 0 → 1 (Planejamento concluído, aguardando confirmação)
- **Partes totais**: 9
- **Concluídas**: 0
- **Em andamento**: 0
- **Pendentes**: 9

## Partes

| #   | Nome                             | Status    | Resumo (1 linha)                                                                                                                                                     |
| --- | -------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Infra/Config/Dependências        | concluída | 7 achados (1 alta sec, 2 médios bugs, 4 baixa); deps vuln só em devDeps                                                                                              |
| 2   | Banco/Schema/Migrations/RLS      | concluída | 10 achados (1 crítica: RLS location-scoped ausente, 2 alta: migration ordering, 7 méd/baixa)                                                                         |
| 3   | Auth Bounded Context             | concluída | 15 achados (1 alta: searchCompanies missing, 3 méd, 11 baixa/forte); anti-enumeração, rate limit, lockout, RLS backstop bem feitos                                   |
| 4   | Company/Membership/Invites       | concluída | 7 achados (1 méd: consent withdraw não revoga sessões, 6 baixa/forte); owner-only writes, invite flow seguro, membership gate DB+app                                 |
| 5   | Core Order                       | concluída | 8 achados (2 crítica: auth context bug + migration ordering, 1 alta: FSM ausente, 5 méd/baixa); idempotency, snapshot, RLS backstop bons                             |
| 6   | Restaurant Pack                  | concluída | 8 achados (1 crítica: auth context bug, 3 alta: kitchen_ticket/kitchen_station ausentes no DB, 4 méd/baixa); cashier shift reconciliation, table status machine bons |
| 7   | Print/Operational                | concluída | 8 achados (3 crítica: auth context bug + sendToPrinter stub + templates ausentes, 3 alta: cron 30min vs 30s, endpoints faltando, schema drift, 2 méd)                |
| 8   | Middleware/Shared/Error Handling | concluída | 9 achados (1 crítica: auth context bug, 1 méd: background serverless, 7 baixa/forte); CSRF, IP spoofing, error handling, PII audit, rate limit bem feitos            |
| 9   | Frontend (parcial)               | concluída | 8 achados (1 alta: CSRF token não enviado, 3 méd, 4 baixa); pages auth bem feitas mas sem guards, components, stores, layouts                                        |
| 10  | Consolidação + Roadmap           | concluída | Veredito geral R1❌ R2⚠️; 11 críticos/altos; problemas sistêmicos; plano correção P0-P2; roadmap 8-12 semanas                                                        |

## Próxima Parte

**Parte 1: Infra/Config/Dependências** — Aguardando confirmação para iniciar.

---

## Log de Execução

- 2026-10-08: Plano criado (00-plano.md), PROGRESSO.md inicializado.
- 2026-10-08: Parte 1 (Infra/Config) concluída — 7 achados
- 2026-10-08: Parte 2 (Banco/Schema/RLS) concluída — 10 achados (1 crítica: RLS location-scoped)
- 2026-10-08: Parte 3 (Auth) concluída — 15 achados (1 alta: searchCompanies missing)
- 2026-10-08: Parte 4 (Company/Membership/Invites) concluída — 7 achados
- 2026-10-08: Parte 5 (Core Order) concluída — 8 achados (2 crítica: auth bug + migration order)
- 2026-10-08: Parte 6 (Restaurant Pack) concluída — 8 achados (1 crítica: auth bug)
- 2026-10-08: Parte 7 (Print) concluída — 8 achados (3 crítica: auth bug + stub worker + templates)
- 2026-10-08: Parte 8 (Middleware/Shared/Error Handling) concluída — 9 achados (1 crítica: auth bug)
- 2026-10-08: Parte 9 (Frontend) concluída — 8 achados (1 alta: CSRF token)
- 2026-10-08: Consolidação (99-consolidado.md) + Roadmap (98-roadmap.md) concluídos
