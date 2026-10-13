COMPOSE      := docker compose
COMPOSE_PROD := $(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml

.PHONY: help init setup db migrate migrate-full migrate-prod dev dev-d dev-down prod prod-down prod-logs studio

help: ## Lista os alvos disponíveis
	@echo "Merp — inicialização e operação"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-14s\033[0m %s\n", $$1, $$2}'

init: ## Do zero ao banco migrado: .env, dependências, PostgreSQL e policies de RLS
	@test -f .env || { \
		cp .env.example .env; \
		sed -i 's/@postgres:5432/@localhost:5432/' .env; \
		echo "✓ .env criado apontando para localhost (Nuxt no host)"; \
		echo "  edite CORS_ORIGIN/BETTER_AUTH_URL antes de qualquer coisa em produção"; \
	}
	$(MAKE) setup
	$(MAKE) db
	$(MAKE) migrate-full
	@echo ""
	@echo "Pronto. Suba o Nuxt com: pnpm dev"

setup: ## Instala dependências e gera os tipos do Nuxt
	pnpm install && pnpm nuxt prepare

db: ## Sobe só o PostgreSQL e espera o healthcheck ficar verde
	@$(COMPOSE) up -d --wait postgres || \
		echo "⚠ compose não subiu — se já houver um PostgreSQL respondendo na porta, o próximo passo usa esse."

migrate-full: ## Migrações COMPLETAS (journal + policies de RLS). Use em banco novo.
	pnpm db:migrate:full

migrate: ## Só o journal do Drizzle — NÃO aplica policies de RLS (use migrate-full)
	npx drizzle-kit migrate

migrate-prod: ## Migrações COMPLETAS (journal + RLS) no container de produção
	$(COMPOSE_PROD) build migrate
	$(COMPOSE_PROD) run --rm migrate

dev-down: ## Para stack dev
	$(COMPOSE) down

dev: ## Stack dev em foreground (Docker; o Nuxt continua sendo pnpm dev)
	$(COMPOSE) up

dev-d: ## Stack dev em background
	$(COMPOSE) up -d

# Ordem importa para segurança: as policies RLS (fail-closed) têm de estar no banco
# ANTES do app servir tráfego. Falhar a migração aborta o start — fail-closed.
prod: migrate-prod ## Sobe stack de produção (migra primeiro, depois sobe)
	$(COMPOSE_PROD) up -d

prod-down: ## Para stack de produção
	$(COMPOSE_PROD) down

prod-logs: ## Segue logs de produção
	$(COMPOSE_PROD) logs -f

studio: ## Abre Drizzle Studio
	npx drizzle-kit studio
