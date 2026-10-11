---
title: 'MERP Documentation'
slug: 'readme'
category: 'guide'
status: 'active'
version: '1.0.0'
owner: '@docs-maintainer'
reviewers: ['@tech-lead']
module: 'overview'
tags: ['readme', 'entry-point']
audience: ['dev', 'qa', 'product', 'support']
created: '2026-10-03'
updated: '2026-10-03'
review-cycle: 'quarterly'
related: []
replaces: []
replaced-by: null
---

# MERP Documentation

Bem-vindo à documentação do **MERP** — ERP Multi-Tenant construído com Nuxt 4, Better Auth, Drizzle ORM e PostgreSQL.

## Navegação Rápida

| Seção                                                        | Descrição                                   |
| ------------------------------------------------------------ | ------------------------------------------- |
| [Primeiros Passos](../01-getting-started/quickstart.md)      | Configuração do ambiente, rodar localmente  |
| [Primeiros Passos](../01-getting-started/quickstart.md)      | Configuração do ambiente, rodar localmente  |
| [Arquitetura](../00-overview/architecture-overview.md)       | Visão geral vertical slices + RLS           |
| [Auth Spec](../03-domain/auth/spec.md)                       | Spec do bounded context auth (implementado) |
| [Core Order Spec](../specs/006-core-order/spec.md)           | Spec do Core Order (em progresso)           |
| [Restaurant Pack](../06-packs/restaurant/spec.md)            | Spec do Restaurant Pack (planejado)         |
| [API: Auth](../specs/001-auth-context/contracts/api-auth.md) | Contratos de endpoints auth                 |
| [Referência](../07-reference/cli-commands.md)                | CLI, env vars, schema, error codes          |
| [Glossário](../00-overview/glossary.md)                      | 44 termos de domínio explicados             |

## Status do Projeto

- **Implementado**: Auth Bounded Context (registro, login, multi-tenancy, convites, auditoria LGPD)
- **Em Progresso**: Core Order (dine_in, takeout, FSM, RLS)
- **Planeado**: Restaurant Pack (mesas, KDS, impressão), Print Operational
- **Stack**: Nuxt 4 + Better Auth + Drizzle + PostgreSQL + RLS
- **Deploy**: Docker Compose + Nginx + Certbot

## Links Úteis

- [Repositório](https://github.com/Texvec/merp)
- [Issues](https://github.com/Texvec/merp/issues)
- [CI/CD](https://github.com/Texvec/merp/actions)
