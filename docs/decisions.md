# Decisões de Arquitetura (verificáveis no código atual)

## Multi-tenancy via RLS com GUC

**Decisão**: Isolamento de tenant implementado via PostgreSQL Row Level Security. `withTenant()` define GUCs `app.tenant_id`, `app.location_id`, `app.user_id` e executa callback em transação. Policies usam `get_tenant_id()` (exige tenant) + `OR get_location_id() IS NULL` (escopo company legítimo sem location).
**Motivo**: Fail-closed por padrão; escopo location opcional (ADR-002). `merp_app` role NOBYPASSRLS — nunca bypassa RLS.

## Better Auth como dono do schema de auth

**Decisão**: Tabelas de auth (`user`, `session`, `account`, `verification`, `auth_event`, `auth_security_state`) geridas pelo Better Auth via Drizzle adapter. Migrações em `drizzle/0001_baseline.sql` incluem essas tabelas.
**Motivo**: Delegar complexidade de auth (senha, sessão, 2FA futuro, OAuth) para biblioteca mantida. Código próprio só estende via `auth_event`/`auth_security_state`.

## Dinheiro em numeric(12,2) com half-up por linha; quantidade em numeric(12,3)

**Decisão**: Colunas monetárias (`total_amount`, `unit_price`, etc.) = `numeric(12,2)`. Arredondamento `ROUND_HALF_UP` aplicado por linha no repository (`roundHalfUp(value, 2)`). Quantidades = `numeric(12,3)`.
**Motivo**: Precisão decimal exata; evita erro de ponto flutuante. `round_half_up` function em `drizzle/0000_functions_and_roles.sql`.

## Sem Service Layer

**Decisão**: Handler → Repository → Drizzle direto. Nenhuma interface `IRepository` ou camada de serviço.
**Motivo**: YAGNI. Repository é objeto simples com métodos async. Duas implementações reais justificariam interface; hoje há uma.

## Stack Nuxt/Drizzle mantida (sem migrar para Laravel)

**Decisão**: Backend roda em Nitro (Nuxt 4 server engine). Drizzle ORM para queries type-safe. Melhor Auth para autenticação.
**Motivo**: TypeScript end-to-end, ecossistema moderno, deploy serverless (Vercel) ou Docker sem reescrita.

## Auth endpoints fora de /api/v1

**Decisão**: `/api/auth/*` (7 endpoints) e `/api/health/*` (2 endpoints) são as únicas rotas fora do prefixo `/api/v1`.
**Motivo**: Contrato próprio do Better Auth; health checks públicos por convenção operacional.

## Rate limit por usuário no middleware auth

**Decisão**: Sliding window 60 req/min por usuário autenticado aplicado no middleware `auth.ts`. IP 20/min e email 5/min também no middleware.
**Motivo**: Centralizado, não repetível em handlers. Lockout dual-tier (email+IP 10, global email 50 → 30min).

## Soft delete only em dados fiscais/auditáveis

**Decisão**: Tabelas com `deleted_at` (ex: `company`, `user`, `order`) — `DELETE` nunca executado; `UPDATE deleted_at = now()`.
**Motivo**: Rastreabilidade fiscal/LGPD. Hard delete apenas em tabelas operacionais transitórias (ex: `print_job` retry).
