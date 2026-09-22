# Fase 5 — Financeiro (Faturamento e Pagamentos)

**Status**: Planejado | **Origem**: extraído de `ERP_FEATURE_PLAN.md` (§2 Fase 3, §3.3, §4.4)
**Fundação**: `specs/001-auth-context/` · `specs/002-vertical-slices/architecture.md` · depende de `specs/004-erp-sales/` (origem) e `specs/006-erp-crm/` (customer)

## Escopo

| Módulo    | Entidades                                                              |
| --------- | ---------------------------------------------------------------------- |
| Invoicing | `invoice`, `invoice_line` (da sales order ou standalone)               |
| Payments  | `payment` (+ `payment_method`, `payment_transaction` — DDL a desenhar) |

## Schema (draft — converter para Drizzle em `server/utils/schema/finance.ts` + `generate`)

```sql
-- Invoices
CREATE TABLE invoice (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL,
  customer_id text NOT NULL REFERENCES customer(id),
  sales_order_id text REFERENCES sales_order(id), -- Link to source order
  status 'draft' | 'open' | 'paid' | 'partial' | 'overdue' | 'cancelled' DEFAULT 'draft',
  issue_date date DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric(12,2) DEFAULT 0,
  discount_percent numeric(5,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  tax_percent numeric(5,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  total numeric(12,2) NOT NULL,
  amount_paid numeric(12,2) DEFAULT 0,
  amount_remaining numeric(12,2) DEFAULT 0,
  notes text,
  company_id text NOT NULL REFERENCES company(id),
  created_at timestamp WITH time zone DEFAULT now(),
  updated_at timestamp WITH time zone DEFAULT now()
);

-- Invoice Lines
CREATE TABLE invoice_line (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id text NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  total_price numeric(12,2) NOT NULL,
  created_at timestamp WITH time zone DEFAULT now()
);

-- Payments
CREATE TABLE payment (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id text NOT NULL REFERENCES invoice(id),
  amount numeric(12,2) NOT NULL,
  payment_method 'credit_card' | 'bank_transfer' | 'pix' | 'cash' | 'check' DEFAULT 'credit_card',
  status 'pending' | 'completed' | 'failed' | 'refunded' DEFAULT 'pending',
  transaction_id text, -- External payment gateway ref
  paid_at timestamp WITH time zone,
  company_id text NOT NULL REFERENCES company(id),
  created_at timestamp WITH time zone DEFAULT now()
);
```

Em aberto: `overdue` automático por `due_date` (job scheduled novo ou regra no
read); gateway externo (Stripe/MercadoPago — §10 Q2 do plano) vs. tracking
interno; idempotência de `pay` (retry de rede não pode duplicar baixa).

## Endpoints (`server/api/finance/`, todos autenticados + CSRF)

| Endpoint                 | Method    | Descrição                                          |
| ------------------------ | --------- | -------------------------------------------------- |
| `/api/invoices`          | GET       | List invoices with filter (status, customer, date) |
| `/api/invoices`          | POST      | Create invoice (from sales order or standalone)    |
| `/api/invoices/[id]`     | GET       | Get invoice with lines and payments                |
| `/api/invoices/[id]/pay` | POST      | Record payment against invoice                     |
| `/api/invoices/[id]`     | PUT/PATCH | Mark invoice as paid/partial/overdue               |

Auditoria sugerida: `invoice.created`, `invoice.paid`, `invoice.refunded`.
Valores em `numeric(12,2)` — nunca float; totais recalculados no servidor
(nunca confiar em total vindo do cliente).

## Testes

- Pagamento parcial (paid → partial → paid) e estorno.
- Idempotência de `pay` sob retry.
- E2E: order → invoice → payment (com Fase 4).

## Tarefas (Sprint 3)

- [ ] DDL + RLS + repositories + testes
- [ ] Invoices (standalone + da order), lines, taxes/discounts
- [ ] `pay` idempotente + métodos (PIX, cartão, transferência, dinheiro)
