# TODO — Core enxuto (MVP restaurante)

Ordem importa: cada item desbloqueia o seguinte. Nada de vertical nova antes do fluxo
"abrir mesa → lançar itens → KDS → fechar conta" funcionar de ponta a ponta.

## Concluído

- [x] **Location** — bootstrap "Matriz" na criação da empresa + `default_location_id` do owner + CRUD `GET/POST/PATCH/DELETE /companies/{id}/locations`.
- [x] **Idempotência de order** — header `Idempotency-Key` (alias no body), replay da resposta original em retry, 409 em payload diferente (`idempotency_fingerprint`, migração `0003`).

## Core

- [ ] **1. Produtos** — CRUD mínimo `GET/POST/PATCH /companies/{id}/products` (name, sku, unitPrice, isActive). Preço passa a vir do banco, não do body.
- [ ] **2. Mesas/estações** — CRUD de `restaurant_table` (unique `(company_id, location_id, number)`, `current_order_id` com FK) e `kitchen_station` + `GET /companies/{id}/members`.
- [ ] **3. Kitchen ticket** — corrigir `createKitchenTicket` (hoje insere `default` em FK NOT NULL e ignora `items`) + roteamento item→estação + `POST .../kitchen-tickets/{id}/start|ready|serve|cancel` com `WHERE status = esperado`.
- [ ] **4. Mesa ↔ order** — `openTable` cria order `dine_in` e grava `current_order_id`; `closeTable` completa e libera; `POST/DELETE .../orders/{id}/items[/itemId]` para itens incrementais.
- [ ] **5. FSM de order** — `open → preparing → ready → completed`, `cancelled`; transição por `POST {verbo}` com 409 e UPDATE condicional (sem SELECT+UPDATE).
- [ ] **6. Dinheiro** — `total_amount = SUM(line_total)` em SQL (remover `Math.round` em JS), migrar `quantity` para `numeric(12,3)`, CHECKs básicos (`quantity > 0`, `unit_price >= 0`, `total_amount >= 0`).

## Depois do core (não agora)

Print (worker/ESC-POS/templates) · cashier shift/pagamentos · roles (manager/waiter/cashier/kitchen) + auditoria operacional + rate limit em mutações · CHECKs restantes · testes de integração de restaurant/print · frontend das telas operacionais.

## Cortes confirmados

- Só `dine_in`/`takeout` (sem delivery/retail/wholesale/quotation e sem as 4 tabelas satélites).
- Fiscal (NFC-e/SAT/NF-e), pagamentos integrados e ERP B2B ficam para depois do MVP.
- 2FA (ADR-010) e TTL por perfil (ADR-004) seguem adiados.
- Não confiar no cliente para preço, total, status ou expected cash.

Detalhamento e aceites de cada item: `FEATURE_AUDIT_E_ROADMAP.md` §3.2–3.3.
