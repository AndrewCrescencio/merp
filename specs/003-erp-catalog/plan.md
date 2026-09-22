# Fase 3 — Catálogo e Estoque (ERP Core)

**Status**: Planejado | **Origem**: extraído de `ERP_FEATURE_PLAN.md` (§2 Fase 1, §3.1, §4.1)
**Fundação**: `specs/001-auth-context/` (auth, tenant, RLS) · `specs/002-vertical-slices/architecture.md` (slices, regras de ouro) · `specs/001-auth-context/contracts/auth-api.md` (padrões de endpoint)

> Primeira fase de domínio a implementar (Sprint 1, junto com CRM básico).
> Todo dado é escopado por `company_id` via `withTenant` + RLS (FR-011, AUD-20).
> Sem `company_id` em query de tenant = bug crítico.

## Escopo

| Módulo    | Entidades                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Products  | `product`, `category`, `product_image`                                                                     |
| Inventory | `stock_quantity`, `stock_movement`, `warehouse` (DDL a desenhar — só `inventory_quantity` existe no draft) |

## Schema (draft — converter para Drizzle em `server/utils/schema/catalog.ts` + `drizzle-kit generate)

> ⚠️ Pseudo-DDL de referência; não aplicar como SQL. Regras: `company_id`
> NOT NULL + FK em todas as tabelas; policies RLS por tenant (ver
> `drizzle/0016_company_select_membership.sql` como modelo); `slug`/`sku`
> únicos **por company** (unique global quebra multi-tenant).

```sql
-- Products table
CREATE TABLE product (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  description text,
  price numeric(12,2) NOT NULL,
  compare_at_price numeric(12,2), -- Sale price
  cost numeric(12,2), -- Cost price
  sku text UNIQUE,
  barcode text,
  track_inventory boolean DEFAULT true,
  inventory_quantity integer DEFAULT 0,
  min_stock_level integer DEFAULT 5,
  max_stock_level integer DEFAULT 1000,
  sold_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  category_id text REFERENCES category(id),
  company_id text NOT NULL REFERENCES company(id),
  created_at timestamp WITH time zone DEFAULT now(),
  updated_at timestamp WITH time zone DEFAULT now()
);

-- Categories table
CREATE TABLE category (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  parent_id text REFERENCES category(id), -- Self-referential for hierarchy
  company_id text NOT NULL REFERENCES company(id),
  is_active boolean DEFAULT true,
  created_at timestamp WITH time zone DEFAULT now()
);

-- Product images
CREATE TABLE product_image (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  url text NOT NULL, -- Storage URL (Supabase/S3 path)
  alt_text text,
  is_primary boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp WITH time zone DEFAULT now()
);
```

Em aberto: tabelas `warehouse`, `stock_quantity`, `stock_movement` (Sprint 0);
upload de imagem precisa de storage (S3/R2 + signed URLs — gap no BACKEND_ANALYSIS).

## Endpoints (`server/api/catalog/`, todos autenticados + CSRF)

| Endpoint                       | Method    | Descrição                                 |
| ------------------------------ | --------- | ----------------------------------------- |
| `/api/products`                | GET       | List products with pagination/filter      |
| `/api/products`                | POST      | Create product                            |
| `/api/products/[id]`           | GET       | Get product by ID                         |
| `/api/products/[id]`           | PUT/PATCH | Update product                            |
| `/api/products/[id]`           | DELETE    | Soft-delete product (set is_active=false) |
| `/api/products/[id]/inventory` | GET       | Check current stock                       |
| `/api/products/[id]/image`     | POST      | Upload product image                      |

Padrões do contrato auth a copiar: `{error, message}`, 201 em criação, 409 em
conflito (SKU), 404 genérico fora do tenant (nunca distinguir "não existe" de
"sem acesso"), rate limit por usuário (60/min) + auditoria de mutações
(ex.: `product.created` — avaliar tabela própria, `auth_event` é do contexto auth).

## Testes

- Unit (`.spec.ts`): validações (preço ≥ 0, tetos `MAX_*`-like), slug/sku.
- Repositório (`.test.ts`, DB real): CRUD escopado + RLS (outsider recebe 0 rows).
- Segurança: acesso cross-company, CSRF sem token, rate limit.

## Tarefas (Sprint 1)

- [ ] DDL Drizzle + `generate` + policies RLS por tenant
- [ ] `server/utils/catalog/product/repository.ts` + testes
- [ ] CRUD API + inventory tracking + 50+ assertions (com CRM)
