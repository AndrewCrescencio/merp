# ADR-004: Session TTL by Profile

## Decision

- **Backoffice** (admin, gestor): TTL fixo 7 dias (`disableSessionRefresh: true`).
- **Terminal PDV/KDS compartilhado**: TTL curto + PIN de turno.

## State of Implementation

- **Código atual**: TTL fixo 7 dias para todos os usuários (`disableSessionRefresh: true`).
- **Regra operacional**: "Logout obrigatório ao fim do turno no PDV/KDS" — enquanto TTL por perfil não é implementado.

## Criteria for Profile-Based TTL (Future Implementation)

- Multiple operators on the same terminal (PDV counter, KDS kitchen).
- Risk of open session from previous operator.
- Feature flag `session.ttlByProfile` habilita lógica.

## Rejected Alternative

- Short TTL for all (including backoffice) — poor experience for managers who don't share terminals.

## Note

This ADR documents the current implementation (7d fixo for all) and the planned evolution toward profile-based TTL. The code currently enforces a fixed 7-day TTL for all users, with operational logout required at the end of each PDV/KDS turn.
