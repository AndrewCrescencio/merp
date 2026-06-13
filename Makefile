.PHONY: help dev dev-d prod prod-down prod-logs db migrate migrate-prod seed studio

help:
	@echo "Merp — Docker Compose shortcuts"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start dev environment (foreground)
	docker compose up

dev-d: ## Start dev environment (detached)
	docker compose up -d

prod: ## Start production stack
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-down: ## Stop production stack
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

prod-logs: ## Tail production logs
	docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

db: ## Start only postgres (useful when running Nuxt on host)
	docker compose up -d postgres

migrate: ## Run Drizzle migrations (dev)
	docker compose exec app npx drizzle-kit migrate

migrate-prod: ## Run Drizzle migrations (prod)
	docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm app npx drizzle-kit migrate

seed: ## Run database seeds
	docker compose exec app npx tsx server/utils/seed.ts

studio: ## Open Drizzle Studio
	docker compose exec app npx drizzle-kit studio
