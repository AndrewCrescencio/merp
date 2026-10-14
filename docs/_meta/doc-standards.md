---
title: 'Padrões de Documentação — MERP (MVP)'
slug: 'doc-standards'
category: 'reference'
status: 'active'
version: '1.0.0'
owner: '@docs-maintainer'
reviewers: ['@tech-lead']
module: 'meta'
tags: ['standards', 'governance']
audience: ['dev']
created: '2026-10-03'
updated: '2026-10-13'
review-cycle: 'quarterly'
related: []
replaces: []
replaced-by: null
---

# Padrões de Documentação — MERP (MVP)

> Versão simplificada para MVP — time de 1 pessoa. Fonte: `docs/_meta/doc-standards.md`

---

## 1. Frontmatter Mínimo (8 campos obrigatórios)

```yaml
---
title: 'Título Humano do Documento'
slug: 'identificador-unico-para-url'
category: 'spec | adr | guide | plan | api | reference | audit | draft'
status: 'active | deprecated | archived | draft'
version: '1.0.0'
owner: '@github-handle'
module: 'auth | core-order | catalog | ...'
created: '2026-09-22'
---
```

Campos opcionais (adicionar conforme necessário):

- `updated` — data da última modificação (padrão = created)
- `tags` — array de strings para busca
- `reviewers` — array com 1+ handles (MVP: 1 mínimo)
- `audience` — array: ["dev", "qa", "product", "support"]
- `review-cycle` — "quarterly" | "semiannual" | "on-change" | "once"
- `related` — array de slugs relacionados
- `replaces` / `replaced-by` — para depreciação

---

## 2. Nomes de Arquivo

| Padrão                | Exemplo                                        | Regra                             |
| --------------------- | ---------------------------------------------- | --------------------------------- |
| `kebab-case`          | `auth-api.md`, `data-model.md`                 | Sempre                            |
| Prefixo por categoria | `spec-auth.md`, `adr-001-vertical-strategy.md` | Ver tabela abaixo                 |
| Numeração ADR         | `adr-001-`, `adr-002-`                         | Seqüencial, zero-padded 3 dígitos |

### Categorias e Prefixos

| Categoria                     | Prefixo               | Exemplos                                 |
| ----------------------------- | --------------------- | ---------------------------------------- |
| **Visão geral / README**      | `README`, `OVERVIEW`  | `README.md`                              |
| **Especificação funcional**   | `spec-`               | `spec-auth.md`                           |
| **ADR**                       | `adr-`                | `adr-001-vertical-strategy.md`           |
| **Guia / Tutorial / Runbook** | `guide-`, `runbook-`  | `guide-new-dev.md`                       |
| **Plano de implementação**    | `plan-`, `tasks-`     | `plan-core-order.md`                     |
| **Pesquisa / Spike**          | `research-`, `spike-` | `research-rls-pattern.md`                |
| **Auditoria / Análise**       | `audit-`, `analysis-` | `audit-2026-10-03-simplificacao.md`      |
| **Referência técnica**        | —                     | `database-schema.md`, `env-variables.md` |

---

## 3. Estrutura de Pastas (MVP)

```
docs/
├── 00-overview/           # README, architecture-overview, glossary
├── 01-getting-started/    # quickstart, dev-environment, testing-guide
├── 02-architecture/       # adr/ (index.md + adr-XXX.md), patterns/
├── 03-domain/             # specs por bounded context (auth, core-order, ...)
├── 04-api/                # contratos de API unificados
├── 05-operations/         # runbooks/, security/, monitoring/
├── 06-packs/              # packs verticais (restaurant, ...)
├── 07-reference/          # cli-commands, env-variables, database-schema, error-codes
├── audit/                 # auditorias históricas (AUD-XXX-*.md) — histórico preservado
└── _meta/                 # governança da própria docs
    ├── doc-standards.md   # Este arquivo
    └── templates/         # Templates opcionais
```

---

## 4. Templates (Opcionais)

Em `docs/_meta/templates/` — usar se ajudar, não obrigatório:

- `adr.md` — Architecture Decision Records
- `spec.md` — Especificação funcional
- `data-model.md` — Modelo de dados
- `api.md` — Contrato de API
- `runbook.md` — Runbook operacional
- `guide.md` — Guia/tutorial

---

## 5. Processo de Revisão (MVP)

| Papel           | Responsabilidade           | MVP                                    |
| --------------- | -------------------------- | -------------------------------------- |
| **Doc Owner**   | Mantém arquivo, aprova PRs | Autor do arquivo                       |
| **Reviewer**    | Valida correção técnica    | **1 pessoa** (frontmatter `reviewers`) |
| **Stakeholder** | Aprova specs funcionais    | Product lead (quando houver)           |

**Fluxo:**

1. Nova doc / mudança → PR com template + frontmatter
2. **1 reviewer** aprova
3. Doc Owner merge → atualiza `updated` no frontmatter

---

## 6. Arquivamento

| Situação         | Ação                                                   |
| ---------------- | ------------------------------------------------------ |
| Spec substituída | `status: deprecated` + `replaced-by` + banner          |
| Pack adiado      | Move `docs/audit/AUD-XXX-pack-name.md` + tag git       |
| Draft > 30 dias  | Move `docs/audit/AUD-XXX-draft-name.md`                |
| Runbook obsoleto | `status: archived` + move `docs/audit/AUD-XXX-name.md` |

> **NUNCA `git rm` / `rm` um arquivo `.md` sem PR com revisão e tag de archive.**

---

## 7. Automação

**Sem automação de docs.** O ferramental (`docs:*`, markdownlint, cspell, scripts de
geração de índice, workflow `docs.yml`) foi removido — não há lint de markdown nem
validação de frontmatter em CI. A validação é manual no review (seção 5).

---

## 8. Métricas de Sucesso (MVP)

| Métrica                              | Target | Como Medir                         |
| ------------------------------------ | ------ | ---------------------------------- |
| **% docs com frontmatter válido**    | 100%   | Review manual do PR                |
| **Links quebrados**                  | 0      | Review manual do PR                |
| **Docs `active` revisadas no ciclo** | ≥ 90%  | `git log` por arquivo (trimestral) |

---

## 9. Checklist de Execução (MVP)

- [x] Frontmatter mínimo (8 campos) definido
- [x] Estrutura `docs/` já existe
- [x] Ferramental `docs:*` (scripts, lint, workflow) removido — validação manual
- [ ] Templates opcionais copiados para `_meta/templates/`
- [ ] `CODEOWNERS` por pasta `docs/` (opcional MVP)

---

## Apêndice: Comandos Úteis

```bash
# Inventário vivo
find docs -name "*.md" -exec sh -c 'echo "=== $1 ==="; head -30 "$1" | grep -A 20 "^---"' _ {} \;

# Buscar arquivos sem frontmatter
find docs -name "*.md" -exec sh -c 'grep -q "^---" "$1" || echo "$1"' _ {} \;
```
