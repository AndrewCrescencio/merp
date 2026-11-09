# Base do projeto

Este repositório é uma fundação reutilizável para iniciar produtos SaaS
multi-tenant. O domínio de negócio é deliberadamente deixado para o próximo
projeto.

## O que já está resolvido

- autenticação com Better Auth;
- cadastro, login, logout, verificação e recuperação de senha;
- usuário autenticado e gerenciamento de consentimento;
- empresas, membros, papéis, convites e locais;
- middleware de autenticação e resolução de tenant;
- RLS com contexto de empresa, local e usuário;
- CSRF, headers de segurança, validação de ambiente e auditoria;
- health checks, migrations, Docker e pipeline de qualidade.

## O que não pertence à base

Pedidos, produtos, estoque, financeiro, impressão, cozinha, vendas ou qualquer
outro fluxo específico devem ser implementados no projeto derivado como
features independentes.

## Regra de extensão

Uma feature deve conter, no mínimo:

- schema e migration;
- repositório ou serviço de domínio;
- handlers REST sob `/api/v1/companies/{companyId}`;
- validação de entrada;
- autorização por papel;
- testes de comportamento e isolamento multi-tenant.

Não adicione lógica de negócio em `server/middleware/auth.ts`,
`server/middleware/tenant.ts` ou nos utilitários compartilhados sem uma
necessidade transversal comprovada.
