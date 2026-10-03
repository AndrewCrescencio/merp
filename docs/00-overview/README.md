---
title: "MERP Documentation"
slug: "readme"
category: "guide"
status: "active"
version: "1.0.0"
owner: "@docs-maintainer"
reviewers: ["@tech-lead"]
module: "overview"
tags: ["readme", "entry-point"]
audience: ["dev", "qa", "product", "support"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "quarterly"
related: []
replaces: []
replaced-by: null
---

# MERP Documentation

Bem-vindo à documentação do **MERP** — ERP Multi-Tenant construído com Nuxt 4, Better Auth, Drizzle ORM e PostgreSQL.

## Navegação Rápida

| Seção | Descrição |
|-------|-----------|
| [Primeiros Passos](../01-getting-started/quickstart.md) | Configuração do ambiente, rodar localmente |
| [Arquitetura](../02-architecture/adr/index.md) | ADRs, padrões, modelo de dados |
| [Domínios](../03-domain/auth/spec.md) | Specs por bounded context (auth, core-order, catalog, etc.) |
| [API Reference](../04-api/auth-api.md) | Contratos de endpoints |
| [Operações](../05-operations/runbooks/grants.md) | Runbooks, segurança, monitoramento |
| [Packs Verticais](../06-packs/restaurant/spec.md) | Restaurant, retail, erp-b2b (feature flags) |
| [Referência](../07-reference/cli-commands.md) | CLI, env vars, schema, error codes |

## Status do Projeto

- **MVP**: Núcleo comum (auth, company, catalog, inventory, order, payment, fiscal, finance, audit)
- **Próximo Pack**: Restaurant (PDV, KDS, mesas, NFC-e)
- **Stack**: Nuxt 4 + Better Auth + Drizzle + PostgreSQL + RLS
- **Deploy**: Docker Compose + Nginx + Certbot

## Links Úteis

- [Repositório](https://github.com/seu-org/merp) *(atualizar para URL real)*
- [Issues](https://github.com/seu-org/merp/issues) *(atualizar para URL real)*
- [CI/CD](https://github.com/seu-org/merp/actions) *(atualizar para URL real)*