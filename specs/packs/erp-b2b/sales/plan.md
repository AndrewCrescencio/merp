# Fase 4 — Vendas e Compras (ERP)

**Status: ADIADO. Não será implementado até o núcleo estar estável.**
**Regras herdadas de specs/000-foundation/\*. Não é spec executável ainda.**

**Status**: Planejado | **Origem**: extraído de `ERP_FEATURE_PLAN.md` (§2 Fase 2, §3.2 parcial, §4.3)
**Fundação**: `specs/001-auth-context/` · `specs/002-vertical-slices/architecture.md` · depende de `specs/003-erp-catalog/` (produtos) e `specs/006-erp-crm/` (customers/vendors)

## Escopo

| Módulo          | Entidades                                                                        |
| --------------- | -------------------------------------------------------------------------------- |
| Sales Orders    | `sales_order`, `sales_order_item`, fluxo draft → confirmed → shipped → delivered |
| Purchase Orders | `purchase_order`, `purchase_order_item` (CRUD básico, Sprint 2)                  |

## Schema (draft — converter para Drizzle em `server/utils/schema/sales.ts` + `generate`)

> ⚠️ Decisão pendente herdada do draft: duas definições de `sales_order_item`
> no plano original — vale a segunda (PK simples `id`, sem `discount_*` no
> item). `company_id` NOT NULL + RLS por tenant em todas.

```sql
-- Sales Orders
CREATE TABLE sales_order (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL, -- Human-readable order number
  customer_id text NOT NULL REFERENCES customer(id),
  status 'draft' | 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' DEFAULT 'draft',
  payment_method 'credit_card' | 'bank_transfer' | 'pix' | 'cash' DEFAULT 'credit_card',
  subtotal numeric(12,2) DEFAULT 0,
  discount_percent numeric(5,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  shipping_cost numeric(12,2) DEFAULT 0,
  total numeric(12,2) NOT NULL,
  notes text,
  company_id text NOT NULL REFERENCES company(id),
  created_at timestamp WITH time zone DEFAULT now(),
  updated_at timestamp WITH time zone DEFAULT now()
);

-- Sales Order Items (vale esta definição — PK simples)
CREATE TABLE sales_order_item (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id text NOT NULL REFERENCES sales_order(id) ON DELETE CASCADE,
  product_id text REFERENCES product(id),
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  total_price numeric(12,2) NOT NULL,
  created_at timestamp WITH time zone DEFAULT now()
);
```

Em aberto: `purchase_order`/`purchase_order_item` (sem DDL no plano — espelhar
sales com `vendor_id`); `number` único por company (sequence por tenant);
transições de status válidas (máquina de estados no repositório, não só no handler).

## Endpoints (`server/api/sales/`, todos autenticados + CSRF)

| Endpoint                       | Method    | Descrição                         |
| ------------------------------ | --------- | --------------------------------- |
| `/api/sales-orders`            | GET       | List sales orders with pagination |
| `/api/sales-orders`            | POST      | Create sales order                |
| `/api/sales-orders/[id]`       | GET       | Get sales order with items        |
| `/api/sales-orders/[id]`       | PUT/PATCH | Update sales order status         |
| `/api/sales-orders/[id]/items` | POST      | Add item to order                 |
| `/api/sales-orders/[id]`       | DELETE    | Cancel order                      |
| `/api/purchase-orders`         | GET/POST  | CRUD básico (Sprint 2)            |
| `/api/purchase-orders/[id]`    | GET/PUT   | Detalhe e atualização             |

Auditoria sugerida: `sales_order.created`, `sales_order.cancelled`
(tabela própria de eventos de domínio a decidir).

## Testes

- Máquina de estados (transição inválida → 400/422 no contrato do repo).
- Concorrência: dois accepts/updates simultâneos (padrão do `acceptInvite`: claim condicional).
- Integração fim-a-fim: place order → invoice → payment (Sprint 2, com 005).

## Tarefas (Sprint 2)

- [ ] DDL + RLS + `server/utils/sales/` repositories + testes
- [ ] Sales Order API completa + items + purchase orders básico
- [ ] Teste E2E do fluxo até pagamento (com Fase 5)
