# Merp

ERP multi-tenant para restaurantes (Nuxt 4, Better Auth, Drizzle, PostgreSQL+RLS).

**Status:** MVP em desenvolvimento — auth consolidado, order/restaurant/print parciais.  
Ver estado completo: [`docs/PROJETO.md`](docs/PROJETO.md)

## Início Rápido

```bash
cp .env.example .env
# edite .env: host "postgres" → "localhost" se Nuxt roda no host
docker compose up -d postgres
npm run db:migrate:full      # aplica migrations 0000→0004 + verifica RLS
npm run dev                  # → http://localhost:3000
```

## Testes

```bash
npm test                     # unit + integration (precisa PostgreSQL rodando)
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:watch
```

## Qualidade

```bash
npm run check                # format:check + lint + typecheck + check:routes
npm run lint
npm run typecheck
npm run format
```

## Estrutura

```
server/
├─ api/                      # 89 handlers HTTP
├─ middleware/               # auth, tenant, csrf, pii-audit
├─ utils/
│  ├─ auth/                  # identity, company, invite
│  ├─ order/                 # order repository
│  ├─ restaurant/            # restaurant repository
│  ├─ print/                 # print repository
│  ├─ schema/                # Drizzle tables (19 arquivos)
│  └─ shared/                # errors, security, email, csrf
app/                         # frontend (apenas auth pages por enquanto)
drizzle/                     # migrations SQL (5 arquivos)
```

## Documentação

- **Estado do produto:** [`docs/PROJETO.md`](docs/PROJETO.md) — matriz de funcionalidades, regras de negócio, roadmap realista
- **Auditoria completa:** [`FEATURE_AUDIT_E_ROADMAP.md`](FEATURE_AUDIT_E_ROADMAP.md) — análise detalhada de 2026-10-27
- **Decisões de arquitetura:** [`docs/decisions.md`](docs/decisions.md) — ADRs verificáveis no código
- **Regras para agentes:** [`CLAUDE.md`](CLAUDE.md) — convenções e restrições do projeto

## Comandos Úteis

```bash
# Database
npx drizzle-kit generate --name <nome>  # criar nova migração
npx drizzle-kit studio                 # abrir Drizzle Studio
npm run db:migrate:full                # migrar do zero + verificar RLS

# Build
npm run build                          # production build
npm run preview                        # preview do build
```
