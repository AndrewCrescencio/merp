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
updated: '2026-10-03'
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
├── _archive/              # histórico (nunca apagar — git + tag)
│   ├── deprecated/
│   ├── future-packs/
│   └── snapshots/
└── _meta/                 # governança da própria docs
    ├── doc-standards.md   # Este arquivo
    ├── templates/         # Templates opcionais
    ├── scripts/           # validate-frontmatter, check-links, generate-index
    └── inventory.json     # inventário vivo (gerado por script)
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

Comando: `pnpm run docs:new <template> <slug> <titulo>`

---

## 5. Processo de Revisão (MVP)

| Papel           | Responsabilidade           | MVP                                    |
| --------------- | -------------------------- | -------------------------------------- |
| **Doc Owner**   | Mantém arquivo, aprova PRs | Autor do arquivo                       |
| **Reviewer**    | Valida correção técnica    | **1 pessoa** (frontmatter `reviewers`) |
| **Stakeholder** | Aprova specs funcionais    | Product lead (quando houver)           |

**Fluxo:**

1. Nova doc / mudança → PR com template + frontmatter
2. CI: `validate-frontmatter` + `check-links` (obrigatório)
3. **1 reviewer** aprova
4. Doc Owner merge → atualiza `updated` no frontmatter

---

## 6. Arquivamento

| Situação         | Ação                                             |
| ---------------- | ------------------------------------------------ |
| Spec substituída | `status: deprecated` + `replaced-by` + banner    |
| Pack adiado      | Move `_archive/future-packs/` + tag git          |
| Draft > 30 dias  | Move `_archive/drafts/`                          |
| Runbook obsoleto | `status: archived` + move `_archive/deprecated/` |

> **NUNCA `git rm` / `rm` um arquivo `.md` sem PR com revisão e tag de archive.**

---

## 7. Automação (Scripts Obrigatórios)

| Script                    | Função                                   | Comando                  |
| ------------------------- | ---------------------------------------- | ------------------------ |
| `validate-frontmatter.ts` | Valida schema YAML + slugs únicos        | `pnpm run docs:validate` |
| `check-links.ts`          | Verifica links internos/externos/anchors | `pnpm run docs:links`    |
| `generate-index.ts`       | Gera `inventory.json`                    | `pnpm run docs:index`    |

**CI Pipeline (`.github/workflows/docs.yml`):**

- `validate-frontmatter`: schema + slugs únicos
- `check-links`: internos + externos + anchors

_markdownlint, cspell, mkdocs — opcionais, não bloqueiam CI no MVP._

---

## 8. Métricas de Sucesso (MVP)

| Métrica                              | Target | Como Medir                          |
| ------------------------------------ | ------ | ----------------------------------- |
| **% docs com frontmatter válido**    | 100%   | `pnpm run docs:validate` (CI)       |
| **Links quebrados**                  | 0      | `pnpm run docs:links` (CI)          |
| **Docs `active` revisadas no ciclo** | ≥ 90%  | Query `inventory.json` (trimestral) |

---

## 9. Checklist de Execução (MVP)

- [x] Frontmatter mínimo (8 campos) definido
- [x] Estrutura `docs/` já existe
- [x] Scripts `validate-frontmatter`, `check-links`, `generate-index` funcionam
- [ ] CI `docs.yml` criado (T19)
- [ ] Templates opcionais copiados para `_meta/templates/`
- [ ] `CODEOWNERS` por pasta `docs/` (opcional MVP)

---

## Apêndice: Comandos Úteis

```bash
# Inventário vivo
find docs -name "*.md" -exec sh -c 'echo "=== $1 ==="; head -30 "$1" | grep -A 20 "^---"' _ {} \;

# Buscar arquivos sem frontmatter
find docs -name "*.md" -exec sh -c 'grep -q "^---" "$1" || echo "$1"' _ {} \;

# Contar por categoria
jq -r '.[].category' docs/_meta/inventory.json | sort | uniq -c | sort -rn

# Docs vencidas para revisão (quarterly > 3 meses)
jq -r '.[] | select(.status=="active") | select(.["review-cycle"]=="quarterly") | select(.updated < "'$(date -d '-3 months' +%Y-%m-%d)'") | "\(.slug) \(.updated)"' docs/_meta/inventory.json
```
