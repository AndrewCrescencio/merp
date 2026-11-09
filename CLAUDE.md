# Guia de contribuição

## Contexto

Este é um starter SaaS multi-tenant. A fundação fornece autenticação,
empresas, membros, convites, locais, RLS e infraestrutura de segurança. Não
adicione funcionalidades de um domínio específico aqui.

## Regras

- Use TypeScript estrito e os padrões já existentes.
- Toda rota de domínio fica sob
  `server/api/v1/companies/[companyId]/<feature>/`.
- Toda consulta de tenant usa `withTenant`.
- Valide entrada e autorização no servidor.
- Não confie em IDs enviados no body quando eles podem ser derivados do path
  ou da sessão.
- Migrations são imutáveis depois de compartilhadas.
- Mudanças em auth, tenant, RLS ou segurança exigem testes de regressão.

## Antes de concluir

```bash
npm run format:check
npm run lint
npm run typecheck
npm run check:routes
npm test
```
