# Decisão: Pivot do Merp → Laravel + Nuxt (Produto Próprio)

## Resumo Executivo

**Não continue no Merp**. É um projeto de estudo arquitetural com bugs críticos travando tudo. Para gerar receita rápido + estudar + preparar para vagas: **Laravel 11 (API) + Nuxt 3 (Frontend)**.

---

## Stack Recomendada

| Camada       | Tecnologia                                      | Por quê                                                             |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| **Frontend** | Nuxt 3 + @nuxt/ui + Pinia                       | Você já domina Vue; SSR/SSG/SPA nativo; auto-imports                |
| **Backend**  | Laravel 11 + Sanctum + Multitenancy + Billing   | Auth, tenants, Stripe, admin (Filament) prontos em minutos          |
| **Banco**    | PostgreSQL                                      | Mesmo do Merp; RLS nativo se precisar; JSONB, CTEs                  |
| **Infra**    | VPS Hetzner CX22 (€4.51/mês) + Docker + Coolify | Custo mínimo; deploy git-push; SSL automático; logs/metrics         |
| **Deploy**   | GitHub Actions → VPS (rsync/Docker)             | CI/CD grátis; zero vendor lock-in                                   |
| **Testes**   | Pest (PHP) + Vitest (unit) + Playwright (E2E)   | Cobertura fullstack; Pest = PHPUnit moderno; Playwright = confiável |

---

## Por que NÃO Merp

| Problema                                        | Impacto                                              |
| ----------------------------------------------- | ---------------------------------------------------- |
| `event.context.auth` não setado no middleware   | 15+ endpoints (orders/restaurant/print) retornam 401 |
| Migration `round_half_up` após `order_item`     | `db:migrate:full` falha em banco limpo               |
| Print worker = stub + templates inexistentes    | Impressão não funciona                               |
| RLS location-scoped ausente (`get_location_id`) | Cross-location leakage                               |
| Frontend = 5 páginas auth apenas                | Meses para completar                                 |
| Arquitetura custom (RLS/GUCs)                   | Curva íngreme, pouco reaproveitável em vagas         |

---

## Por que Laravel + Nuxt

- **Receita rápida**: `laravel/billing` (Stripe), `spatie/laravel-multitenancy`, `laravel/sanctum` = semanas economizadas
- **Vagas BR**: Muito mais PHP/Laravel que Nuxt fullstack
- **Ecossistema**: Filament (admin), Laravel Cloud/Forge, Laracasts (estudo)
- **Seu conhecimento transfere**: RLS → policies/tenancy; FSM → workflows; idempotency → middleware; multi-tenant → scoping

---

## Plano Semana 1

```bash
# Backend
composer create-project laravel/laravel meu-saas
cd meu-saas
composer require laravel/sanctum spatie/laravel-multitenancy laravel/billing filament/filament
php artisan migrate  # multi-tenant + auth + billing funcionando

# Frontend
cd ..
npm create nuxt@latest frontend
cd frontend
npm i @nuxt/ui pinia @pinia/nuxt nuxt-auth-utils

# Infra
# VPS Hetzner CX22 (€4.51/mês) + Coolify (gratuito, self-hosted Vercel-like)
# GitHub Actions → VPS (Docker)
```

---

## Estudo Paralelo (Prepare para Vagas)

| Tópico                     | Recurso                                         | Tempo    |
| -------------------------- | ----------------------------------------------- | -------- |
| Docker + Linux básico      | "Docker for Developers" (YouTube) + `man` pages | 1 sem    |
| CI/CD (GitHub Actions)     | Docs oficiais + 1 pipeline real                 | 3 dias   |
| Testes (Pest + Playwright) | Pest docs + Playwright trace viewer             | 1 sem    |
| Observabilidade            | Grafana Cloud (free) + Loki + Tempo             | Contínuo |
| Arquitetura limpa          | "Clean Architecture" + Laravel Beyond CRUD      | Contínuo |

---

## Próximos Passos Imediatos

1. Criar repo `meu-saas` no GitHub
2. Rodar comandos acima (backend + frontend)
3. Configurar Coolify na VPS (15 min)
4. Push → deploy automático
5. Implementar primeiro módulo cobrável (ex.: comanda digital simples)

---

**Data**: 2026-10-09  
**Decisão**: Pivot aprovado — iniciar Laravel + Nuxt hoje.
