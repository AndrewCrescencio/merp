/**
 * Papéis de membresia de empresa — única fonte de verdade.
 *
 * `owner`: pode gerir a company (criar/editar locais, adicionar/remover membros).
 * `member`: pode ler os dados da company a que pertence.
 *
 * `manager` não existe: era um papel fantasma de uma versão anterior do
 * domínio. Apenas `owner` e `member` são válidos, e o banco o garante via
 * `CHECK (role IN ('owner', 'member'))` na migration 0004.
 */
export const ROLES = {
  owner: 'owner',
  member: 'member',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]
export type MemberRole = Role
