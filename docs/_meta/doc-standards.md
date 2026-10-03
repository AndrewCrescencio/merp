---
title: "Padrões de Documentação — MERP"
slug: "doc-standards"
category: "reference"
status: "active"
version: "1.0.0"
owner: "@docs-maintainer"
reviewers: ["@tech-lead"]
module: "meta"
tags: ["standards", "governance", "templates"]
audience: ["dev", "qa", "product", "support"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "quarterly"
related: []
replaces: []
replaced-by: null
---

# Padrões de Documentação — MERP

> Versão canônica do plano de limpeza e organização de arquivos Markdown.
> Fonte: `docs/_meta/doc-standards.md` | Atualizado: 2026-10-03

---

## Sumário

1. [Inventário e Classificação](#1-invent-rio-e-classifica-o)
2. [Critérios de Avaliação](#2-crit-rios-de-avalia-o-matriz-de-decis-o-)
3. [Taxonomia e Estrutura de Pastas](#3-taxonomia-e-estrutura-de-pastas-proposta-)
4. [Convenções de Nomenclatura e Metadados](#4-conven-es-de-nomenclatura-e-metadados)
5. [Templates Padronizados](#5-templates-padronizados)
6. [Processo de Revisão e Governança](#6-processo-de-revis-o-e-governan-a)
7. [Estratégia de Arquivamento e Exclusão](#7-estrat-gia-de-arquivamento-e-exclus-o)
8. [Automação e Ferramentas](#8-automa-o-e-ferramentas)
9. [Métricas de Sucesso](#9-m-tricas-de-sucesso)
10. [Cronograma e Priorização](#10-cronograma-e-prioriza-o)

---

## 1. Inventário e Classificação

### 1.1 Catálogo atual (mapeamento automático)

```bash
# Execute para gerar inventário vivo
find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" | sort > docs-inventory.txt
```

### 1.2 Classificação por tipo

| Categoria | Prefixo sugerido | Critério |
|-----------|------------------|----------|
| **Visão geral / README** | `README`, `OVERVIEW` | Entry point do repo ou módulo |
| **Especificação funcional** | `spec-` | Requisitos, user stories, critérios de aceite |
| **Especificação técnica** | `tech-`, `design-` | Arquitetura, padrões, decisões de implementação |
| **Modelo de dados** | `data-model-`, `schema-` | Tabelas, relacionamentos, RLS |
| **Contratos de API** | `api-`, `contract-` | Endpoints, schemas request/response |
| **ADR** | `adr-` | Decisões irreversíveis com contexto |
| **Guia / Tutorial / Runbook** | `guide-`, `runbook-`, `howto-` | Passo a passo operacional |
| **Plano de implementação** | `plan-`, `tasks-` | Sprint breakdown, tarefas, owners |
| **Pesquisa / Spike** | `research-`, `spike-` | Investigação técnica, PoC |
| **Quickstart / Onboarding** | `quickstart-`, `onboarding-` | Primeiros passos para dev novo |
| **Auditoria / Análise** | `audit-`, `analysis-` | Diagnóstico, achados, recomendações |
| **Decisões pendentes** | `pending-`, `decisions-` | Itens em aberto aguardando decisão |
| **Snapshot / Histórico** | `snapshot-`, `history-` | Estado congelado em data |
| **Revisão / Retrospectiva** | `review-`, `retro-` | Revisão de specs, lições aprendidas |
| **Rascunho / WIP** | `draft-`, `wip-` | Não validado, não implementado |

---

## 2. Critérios de Avaliação (Matriz de Decisão)

| Critério | Peso | Pergunta | Ação se **Não** |
|----------|------|----------|-----------------|
| **Atualidade** | 25% | Reflete código **atual** (HEAD `main`/`dev`)? | `UPDATE` ou `ARCHIVE` |
| **Relevância MVP** | 20% | Necessário para núcleo + restaurant pack (próximos 2 meses)? | `ARCHIVE` |
| **Duplicação** | 15% | Conteúdo repetido em outro arquivo mais canônico? | `MERGE` no canônico + redirect |
| **Completude** | 15% | Tem frontmatter, status, owner, links válidos? | `FIX` (adicionar metadados) |
| **Links quebrados** | 10% | `markdown-link-check` passa? | `FIX` links |
| **Dono claro** | 10% | `owner` no frontmatter aponta para pessoa/time ativo? | `ASSIGN` ou `ARCHIVE` |
| **Status explícito** | 5% | `status: draft \| active \| deprecated \| archived` presente? | `ADD` status |

### Fluxo de decisão por arquivo

```
Avaliar arquivo
    │
    ▼
┌───────────┐
│ Atual?    │──Não──▶ ARCHIVE (com tag git `doc/archive/<slug>-<date>`)
└─────┬─────┘
      │Sim
      ▼
┌───────────┐
│ Relevante │──Não──▶ ARCHIVE (future-packs ou deprecated)
│ p/ MVP?   │
└─────┬─────┘
      │Sim
      ▼
┌───────────┐
│ Duplicado?│──Sim──▶ MERGE no canônico + delete
└─────┬─────┘
      │Não
      ▼
┌───────────┐
│ Completo? │──Não──▶ FIX (frontmatter, links, owner)
└─────┬─────┘
      │Sim
      ▼
┌───────────┐
│ Links OK? │──Não──▶ FIX links
└─────┬─────┘
      │Sim
      ▼
┌───────────┐
│ Owner OK? │──Não──▶ ASSIGN owner
└─────┬─────┘
      │Sim
      ▼
┌───────────┐
│ Status OK?│──Não──▶ ADD status
└─────┬─────┘
      │Sim
      ▼
    MANTER (active)
```

---

## 3. Taxonomia e Estrutura de Pastas (Proposta)

```
docs/
├── 00-overview/                 # Entry points
│   ├── README.md
│   ├── architecture-overview.md
│   └── glossary.md
│
├── 01-getting-started/          # Onboarding dev
│   ├── quickstart.md
│   ├── dev-environment.md
│   ├── testing-guide.md
│   └── debug-troubleshooting.md
│
├── 02-architecture/             # Decisões estruturais
│   ├── adr/                     # ADRs (index.md + adr-XXX.md)
│   ├── patterns/                # Padrões normativos
│   └── data-model/              # Modelos canônicos por domínio
│
├── 03-domain/                   # Especificações por bounded context
│   ├── auth/
│   ├── core-order/
│   ├── catalog/
│   ├── sales/
│   └── finance/
│
├── 04-api/                      # Referência de API unificada
│   ├── auth-api.md
│   ├── catalog-api.md
│   ├── orders-api.md
│   └── openapi/                 # Generated (futuro)
│
├── 05-operations/               # Runbooks, ops, segurança
│   ├── runbooks/
│   ├── security/
│   └── monitoring/
│
├── 06-packs/                    # Packs verticais (feature flags)
│   ├── restaurant/
│   ├── retail/                  # (futuro)
│   └── erp-b2b/                 # (arquivado por enquanto)
│       └── _archive/
│
├── 07-reference/                # Referência técnica
│   ├── cli-commands.md
│   ├── env-variables.md
│   ├── database-schema.md
│   └── error-codes.md
│
├── _archive/                    # Nunca apagar — histórico git + tag
│   ├── deprecated/
│   ├── future-packs/
│   ├── drafts/
│   └── snapshots/
│
└── _meta/                       # Governança da própria docs
    ├── doc-standards.md         # Este arquivo
    ├── templates/               # Templates
    ├── scripts/                 # Scripts de automação
    └── inventory.json           # Inventário vivo (gerado por script)
```

---

## 4. Convenções de Nomenclatura e Metadados

### 4.1 Nomes de arquivo

| Padrão | Exemplo | Regra |
|--------|---------|-------|
| `kebab-case` | `auth-api.md`, `data-model.md` | Sempre |
| Prefixo por categoria | `spec-auth.md`, `adr-001-vertical-strategy.md` | Ver tabela seção 1.2 |
| Numeração ADR | `adr-001-`, `adr-002-` | Seqüencial, zero-padded 3 dígitos |

### 4.2 Frontmatter YAML obrigatório

```yaml
---
title: "Título Humano do Documento"
slug: "identificador-unico-para-url"
category: "spec | adr | guide | plan | api | reference | audit | draft"
status: "active | deprecated | archived | draft"
version: "1.0.0"
owner: "@github-handle"
reviewers: ["@handle1", "@handle2"]
module: "auth | core-order | catalog | ..."
tags: ["rls", "multi-tenant", "security"]
audience: ["dev", "qa", "product", "support"]
created: "2026-09-22"
updated: "2026-10-02"
review-cycle: "quarterly | semiannual | on-change | once"
related:
  - "adr-001-vertical-strategy"
  - "spec-auth"
replaces: []
replaced-by: null
---
```

---

## 5. Templates Padronizados

Todos em `docs/_meta/templates/` — usar `pnpm run docs:new <template> <slug>`

| Template | Uso | Comando |
|----------|-----|---------|
| `adr.md` | Architecture Decision Records | `pnpm run docs:new adr adr-012-minha-decisao "Minha Decisão"` |
| `spec.md` | Especificação funcional | `pnpm run docs:new spec spec-catalog "Catálogo e Estoque"` |
| `data-model.md` | Modelo de dados | `pnpm run docs:new data-model data-model-catalog "Catálogo e Estoque"` |
| `api.md` | Contrato de API | `pnpm run docs:new api api-catalog "Catálogo API"` |
| `runbook.md` | Runbook operacional | `pnpm run docs:new runbook runbook-db-migrate "Migração de Banco"` |
| `business-rule.md` | Regra de negócio | `pnpm run docs:new rule rule-catalog-sku-unique "SKU Único por Company"` |
| `guide.md` | Guia/tutorial | `pnpm run docs:new guide guide-new-dev "Onboarding Novo Dev"` |

---

## 6. Processo de Revisão e Governança

### 6.1 Papéis

| Papel | Responsabilidade | Quem |
|-------|------------------|------|
| **Doc Owner** | Mantém arquivo atualizado, aprova PRs, agenda revisões | Autor original ou maintainer do módulo |
| **Reviewer** | Valida correção técnica, completude, aderência ao template | 1-2 pessoas por arquivo (frontmatter `reviewers`) |
| **Docs Maintainer** | Guarda processo, templates, CI, métricas, migrações | `@docs-maintainer` (rotação trimestral) |
| **Stakeholder** | Aprova specs funcionais (product) | `@product-lead` |

### 6.2 Fluxo de Aprovação

```
Nova doc / Mudança significativa
        │
        ▼
┌───────────────────┐
│ PR com template   │ ← Preenchido obrigatoriamente
│ + frontmatter     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ CI: lint +        │ ← markdownlint, frontmatter schema,
│ link-check +      │   broken links, spell-check (cspell)
│ spell-check       │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Reviewers (2+)    │ ← CODEOWNERS por pasta
│ aprovação         │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Doc Owner merge   │ ← Só owner faz merge
└─────────┬─────────┘
          │
          ▼
    ATUALIZA `updated` no frontmatter (auto via script)
```

### 6.3 Periodicidade de Revisão

| Categoria | Ciclo | Trigger Extra |
|-----------|-------|---------------|
| ADR | `on-change` | Nova ADR que supere |
| Spec funcional | `quarterly` | Mudança de requisitos (issue `type:spec-change`) |
| Modelo de dados | `on-change` | Migration nova no domínio |
| API contract | `on-change` | Breaking change no endpoint |
| Runbook | `semiannual` | Incidente real que use o runbook |
| Guia/Onboarding | `quarterly` | Novo dev onboards + feedback |
| Audit/Analysis | `once` | Após ação corretiva → `archived` |

---

## 7. Estratégia de Arquivamento e Exclusão

### 7.1 Política de Archive

| Situação | Ação | Comando |
|----------|------|---------|
| Spec substituída | `status: deprecated` + `replaced-by` + banner | `pnpm run docs:deprecate <slug> <new-slug>` |
| Pack adiado | Move `_archive/future-packs/` + tag git | `pnpm run docs:archive-pack erp-b2b` |
| Draft > 30 dias | Move `_archive/drafts/` | `pnpm run docs:clean-drafts` |
| Runbook obsoleto | `status: archived` + move `_archive/deprecated/` | `pnpm run docs:archive <slug>` |
| Snapshot histórico | Move `_snapshot/` → `_archive/snapshots/` | `pnpm run docs:archive-snapshots` |

### 7.2 Tag Git para Rastreabilidade

```bash
git tag -a "doc/archive/<slug>-$(date +%Y%m%d)" -m "Archive: <título> (reason: <motivo>)"
git push origin "doc/archive/<slug>-$(date +%Y%m%d)"
```

### 7.3 Regra de Ouro

> **NUNCA `git rm` / `rm` um arquivo `.md` sem PR com revisão de 2+ pessoas e tag de archive.**

---

## 8. Automação e Ferramentas

### 8.1 Scripts Disponíveis

| Script | Função | Comando |
|--------|--------|---------|
| `validate-frontmatter.ts` | Valida schema YAML + slugs únicos | `pnpm run docs:validate` |
| `check-links.ts` | Verifica links internos/externos/anchors | `pnpm run docs:links` |
| `generate-index.ts` | Gera `inventory.json` + `mkdocs.yml` | `pnpm run docs:index` |
| `new-doc.ts` | Scaffold novo doc a partir de template | `pnpm run docs:new <template> <slug> <titulo>` |
| `deprecate.ts` | Marca doc como deprecated + banner | `pnpm run docs:deprecate <slug> <new-slug>` |
| `archive.ts` | Move para `_archive/` + tag git | `pnpm run docs:archive <slug>` |

### 8.2 CI Pipeline (`.github/workflows/docs.yml`)

- **lint**: markdownlint
- **validate-frontmatter**: schema + slugs únicos
- **check-links**: internos + externos + anchors
- **spell-check**: cspell (pt-BR + en)
- **generate-index**: gera inventory + mkdocs.yml no push para main/dev

### 8.3 Configurações

- `.markdownlint.json` — regras de estilo
- `.cspell.json` — dicionário customizado (termos técnicos MERP)
- `.github/CODEOWNERS` — owners por pasta

---

## 9. Métricas de Sucesso

| Métrica | Target | Como Medir | Frequência |
|---------|--------|------------|------------|
| **% docs com frontmatter válido** | 100% | `pnpm run docs:validate` | CI (todo PR) |
| **Links quebrados** | 0 | `pnpm run docs:links` | CI (todo PR) |
| **Docs `active` revisadas no ciclo** | ≥ 90% | Query `inventory.json` | Trimestral |
| **Tempo onboarding dev novo** | < 2h | Survey + time-to-first-PR | Por contratação |
| **Cobertura de módulos MVP** | 100% | Checklist `module-coverage.csv` | Sprint review |
| **ADRs superseded sem `replaced-by`** | 0 | Script validação | CI |
| **Arquivos `draft` > 30 dias** | 0 | `docs:clean-drafts --dry-run` | Mensal |

---

## 10. Cronograma e Priorização

### Fase 1 — Curto Prazo (Semanas 1-2) — Quick Wins

| Task | Esforço | Owner | Done Criteria |
|------|---------|-------|---------------|
| Criar estrutura `docs/` + templates + scripts | 2h | Docs Maintainer | Pastas existem |
| Mover `README.md` → `docs/00-overview/README.md` | 30min | Docs Maintainer | Link funciona |
| Mover `specs/decisions/` → `docs/02-architecture/adr/` | 1h | Docs Maintainer | ADRs no lugar |
| Frontmatter mínimo em todos `active` | 4h | Dev + Docs | `docs:validate` passa |
| Configurar CI `docs.yml` | 2h | Dev | CI verde |
| Arquivar `specs/packs/erp-b2b/` → `_archive/future-packs/` | 1h | Docs Maintainer | Tag criada |
| Mover `_snapshot/` → `_archive/snapshots/` | 30min | Docs Maintainer | Limpo |

### Fase 2 — Médio Prazo (Semanas 3-6) — Consolidação

| Task | Esforço | Owner | Done Criteria |
|------|---------|-------|---------------|
| Migrar `specs/001-auth-context/` → `docs/03-domain/auth/` | 2h | Dev (auth) | Specs no lugar |
| Migrar `specs/006-core-order/` → `docs/03-domain/core-order/` | 2h | Dev (core) | Specs no lugar |
| Migrar `specs/000-foundation/` → `docs/02-architecture/patterns/` | 1h | Dev | Patterns no lugar |
| Migrar `docs/runbooks/` → `docs/05-operations/runbooks/` | 1h | DevOps | Runbooks no lugar |
| Consolidar `ERP_FEATURE_PLAN.md` + `BACKEND_ANALYSIS.md` | 4h | Tech Lead | Duplicatas removidas |
| Criar `docs/04-api/` com contratos unificados | 3h | Dev | API ref completa |
| `mkdocs.yml` funcional localmente | 4h | Docs Maintainer | Site local sobe |
| Definir `CODEOWNERS` por pasta `docs/` | 1h | Tech Lead | PRs exigem review |

### Fase 3 — Longo Prazo (Mês 2+) — Manutenção Contínua

| Task | Frequência | Owner |
|------|------------|-------|
| Revisão trimestral de specs `active` | Trimestral | Doc Owners |
| Auditoria de links quebrados | Mensal (CI) | Bot |
| Limpeza drafts > 30 dias | Mensal | Docs Maintainer |
| Atualizar métricas dashboard | Sprint review | Docs Maintainer |
| Retrospectiva de docs | Trimestral | Todo time |

---

## Checklist de Execução

### Início (Semana 1)
- [ ] Aprovar este plano (PR com `doc-standards.md`)
- [ ] Criar pastas `docs/` + `_meta/templates/`
- [ ] Copiar templates da seção 5 para `_meta/templates/`
- [ ] Adicionar scripts em `_meta/scripts/` + `package.json`
- [ ] Rodar `pnpm run docs:validate` → corrigir erros críticos
- [ ] Subir CI `docs.yml`

### Sprint 1 (Semana 1-2)
- [ ] Migrar ADRs + foundation patterns
- [ ] Arquivar erp-b2b + snapshots
- [ ] Frontmatter mínimo em 100% dos `active`
- [ ] `mkdocs.yml` gerando site navegável localmente

### Sprint 2 (Semana 3-4)
- [ ] Migrar specs auth + core-order
- [ ] Consolidar API contracts
- [ ] `CODEOWNERS` ativo
- [ ] Métricas baseline coletadas

### Contínuo
- [ ] Toda nova doc usa template + frontmatter + passa CI
- [ ] Revisão trimestral agendada no calendário do time
- [ ] Dashboard de métricas visível para o time

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

# Gerar tag de archive
git tag -a "doc/archive/adr-001-vertical-strategy-$(date +%Y%m%d)" -m "Archive: ADR-001 vertical strategy (superseded by ADR-012)"
git push origin "doc/archive/adr-001-vertical-strategy-$(date +%Y%m%d)"
```