# Decisões técnicas

## Fundação

- **Nuxt 4 + Nitro:** frontend e API no mesmo projeto, com SSR quando útil.
- **Better Auth:** autenticação não deve ser reimplementada por cada produto.
- **Drizzle + PostgreSQL:** schema tipado e migrations versionadas.
- **RLS obrigatório:** toda consulta de dados de tenant deve executar com
  `withTenant`; o banco é a última barreira de isolamento.
- **Tenant no path:** endpoints de domínio usam
  `/api/v1/companies/{companyId}/...`; o middleware valida a associação do
  usuário antes do handler.
- **Fail closed:** ausência de sessão, tenant ou configuração obrigatória deve
  gerar erro explícito, nunca um fallback permissivo.

## Convenções de features

- Rotas seguem nomes kebab-case e verbos HTTP explícitos.
- Dados de entrada são validados com os contratos existentes em
  `server/utils/shared`.
- Regras de autorização ficam próximas ao caso de uso, não na interface.
- Cada mudança de schema acompanha migration e testes.
- O schema da fundação é pequeno; features não devem ser incluídas antes de
  existir um caso de uso real.
