---
title: "Regra de Negócio: Nome"
slug: "rule-nome"
category: "reference"
status: "active"
version: "1.0.0"
owner: "@handle"
reviewers: ["@handle"]
module: "context"
tags: ["business-rule", "domain"]
audience: ["dev", "qa", "product"]
created: "2026-01-01"
updated: "2026-01-01"
review-cycle: "quarterly"
related: []
replaces: []
replaced-by: null
---

# Regra: <Nome>

**ID:** `BR-<CONTEXT>-XXX` (ex: `BR-CATALOG-001`)

## Descrição

<Uma frase: o que a regra exige/proíbe.>

## Contexto / Motivação

Por que existe? Qual requisito legal ou de negócio?

## Formalização

```typescript
// Pseudocódigo ou expressão lógica
function validate(input): boolean {
  // regra
}
```

## Exemplos

| Entrada | Resultado | Por quê |
|---------|-----------|---------|
|         |           |         |

## Onde é Aplicada

- Endpoint: `POST /api/...`
- Repository: `method()`
- Database: `CHECK constraint` / `TRIGGER`

## Testes de Regressão

- `spec.ts`: unit test da validação
- `test.ts`: integration test com DB

## Exceções / Edge Cases

- 

## Referências Legais / Normativas

- LGPD Art. X, NF-e manual, etc.