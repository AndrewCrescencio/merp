---
title: "Session TTL by Profile"
slug: "adr-004-session-ttl-by-profile"
category: "adr"
status: "accepted"
version: "1.0.0"
owner: "@auth-owner"
reviewers: ["@tech-lead", "@security-lead"]
module: "auth"
tags: ["architecture", "decision", "session", "ttl"]
audience: ["dev", "architect", "security"]
created: "2026-09-22"
updated: "2026-09-22"
review-cycle: "on-change"
related:
  - "adr-001-vertical-strategy"
replaces: []
replaced-by: null
---

# ADR-004: Session TTL by Profile

## Decisão

- **Backoffice** (admin, gestor): TTL fixo 7 dias (`disableSessionRefresh: true`).
- **Terminal PDV/KDS compartilhado**: TTL curto + PIN de turno.

## Estado Atual

Código hoje tem 7d fixo para todos. Registrar como **regra operacional**:

> "Logout obrigatório ao fim do turno no PDV/KDS" enquanto TTL por perfil não for implementado.

## Critério para Implementar TTL por Perfil

- Múltiplos operadores no mesmo terminal (PDV balcão, KDS cozinha).
- Risco de sessão aberta por operador anterior.
- Feature flag `session.ttlByProfile` habilita lógica.

## Alternativa Rejeitada

TTL curto para todos (backoffice incluído) — experiência ruim para gestores que não compartilham terminal.
