---
title: "Money — numeric(12,2) vs Centavos-Inteiro"
slug: "adr-003-money-numeric-vs-cents"
category: "adr"
status: "accepted"
version: "1.0.0"
owner: "@backend-lead"
reviewers: ["@tech-lead", "@dba"]
module: "cross-cutting"
tags: ["architecture", "decision", "money", "schema"]
audience: ["dev", "dba", "backend"]
created: "2026-09-22"
updated: "2026-09-22"
review-cycle: "on-change"
related:
  - "adr-006-id-type-uuid"
replaces: []
replaced-by: null
---

# ADR-003: Money — numeric(12,2) vs Centavos-Inteiro

## Decisão

`numeric(12,2)` com arredondamento half-up no servidor por linha.

## Alternativa Rejeitada

Centavos-inteiro (`bigint` armazenando centavos).

## Motivo

1. **Exigência fiscal BR**: NFC-e/SAT/NF-e exigem valores com 2 casas decimais na emissão; armazenar em centavos exige conversão constante (÷100) em queries, relatórios, exports — fonte de bugs.
2. **Legibilidade de extratos**: `SELECT * FROM order_item` mostra `19.90` legível vs `1990` opaco.
3. **Agregações SQL**: `sum(unit_price * quantity)` funciona nativamente; em centavos precisa cast/divisão.
4. **Precisão controlada**: `numeric(12,2)` garante 2 casas; `bigint` permite qualquer inteiro (risco de 3+ casas se bug no código).

## Consequências

- Arredondamento half-up **por linha** no servidor (não no total).
- `quantity` usa `numeric(12,3)` para fracionados (kg).
- Migração de centavos → numeric quando houver dados legados (não há hoje).
