# Fase 6 — CRM (Clientes, Fornecedores, Contatos)

**Status**: Planejado | **Origem**: extraído de `ERP_FEATURE_PLAN.md` (§2 Fase 4, §3.2 parcial, §3.4, §4.2)
**Fundação**: `specs/001-auth-context/` · `specs/002-vertical-slices/architecture.md` · consumido por `specs/004-erp-sales/` e `specs/005-erp-finance/`

> Implementar junto ao Sprint 1 (base para vendas e financeiro).

## Escopo

| Módulo    | Entidades                                   |
| --------- | ------------------------------------------- |
| Customers | `customer`, `contact_person`                |
| Vendors   | `vendor`, `vendor_contact`/`contact_person` |

## Schema (draft — converter para Drizzle em `server/utils/schema/crm.ts` + `generate`)

```sql
-- Customers
CREATE TABLE customer (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  cnpj_cpf text, -- Brazilian tax ID
  address text,
  city text,
  state text,
  zip_code text,
  country text DEFAULT 'BR',
  status 'active' | 'inactive' DEFAULT 'active',
  tags jsonb DEFAULT '[]',
  company_id text NOT NULL REFERENCES company(id),
  created_at timestamp WITH time zone DEFAULT now(),
  updated_at timestamp WITH time zone DEFAULT now()
);

-- Vendors
CREATE TABLE vendor (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  cnpj text, -- Brazilian tax ID
  address text,
  city text,
  state text,
  zip_code text,
  country text DEFAULT 'BR',
  status 'active' | 'inactive' DEFAULT 'active',
  tags jsonb DEFAULT '[]',
  company_id text NOT NULL REFERENCES company(id),
  created_at timestamp WITH time zone DEFAULT now(),
  updated_at timestamp WITH time zone DEFAULT now()
);

-- Contact persons (for customers/vendors)
CREATE TABLE contact_person (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  role 'primary' | 'commercial' | 'admin' | 'finance' | 'technical' DEFAULT 'primary',
  is_primary boolean DEFAULT true,
  customer_id text REFERENCES customer(id) ON DELETE SET NULL,
  vendor_id text REFERENCES vendor(id) ON DELETE SET NULL,
  company_id text NOT NULL REFERENCES company(id),
  created_at timestamp WITH time zone DEFAULT now()
);
```

Notas: `cnpj`/`cnpj_cpf` com validação de dígitos (precedente: `isValidCnpj()`
em `server/utils/shared/security.ts` — estender para CPF); `email` com
`normalizeEmail()` + `EMAIL_REGEX`; `tags` com teto de tamanho (padrão AUD-14).

## Endpoints (`server/api/crm/`, todos autenticados + CSRF)

| Endpoint                      | Method    | Descrição                   |
| ----------------------------- | --------- | --------------------------- |
| `/api/customers`              | GET       | List customers with filters |
| `/api/customers`              | POST      | Create customer             |
| `/api/customers/[id]`         | GET       | Get customer detail         |
| `/api/customers/[id]`         | PUT/PATCH | Update customer             |
| `/api/customers/[id]/contact` | POST      | Add contact person          |
| `/api/customers/[id]`         | DELETE    | Soft-delete customer        |
| `/api/vendors`                | GET/POST  | CRUD básico (Sprint 1)      |

Auditoria sugerida: `customer.created`, `customer.deleted`.

## Testes

- CNPJ/CPF inválido → 400; PII (email/telefone) nunca em logs além do padrão.
- Soft-delete preserva FKs de orders/invoices (restrição de integridade fiscal).

## Tarefas (Sprint 1, com catálogo)

- [ ] DDL + RLS + `server/utils/crm/` repositories + testes
- [ ] Customers & vendors CRUD + contact persons
