---
title: 'Especificação: Auth Bounded Context'
slug: 'spec-auth'
category: 'spec'
status: 'active'
version: '1.0.0'
owner: '@auth-owner'
reviewers: ['@tech-lead', '@security-lead']
module: 'auth'
tags: ['spec', 'auth', 'authentication', 'multi-tenant']
audience: ['dev', 'qa', 'product']
created: '2026-09-22'
updated: '2026-09-22'
review-cycle: 'quarterly'
related:
  - 'data-model-auth'
  - 'api-auth'
  - 'adr-001-vertical-strategy'
  - 'adr-004-session-ttl-by-profile'
  - 'adr-010-2fa-deferred'
replaces: []
replaced-by: null
---

# Spec: Auth Bounded Context

## Visão Geral

O Auth bounded context gerencia identidade de usuários — registro, login, logout e gestão de sessão. É um domínio de suporte que todo outro contexto depende para acesso autenticado e membership multi-tenant.

**Por que existe**: Um ERP gerencia dados fiscais e financeiros sensíveis. Sem autenticação, não há como saber quem acessa o sistema, a qual tenant pertence ou se está autorizado. Auth é o portão — toda interação flui através dele.

## User Stories / Cenários

### US-001: Email & Password Registration and Login (Priority: P1)

**Por que esta prioridade**: Email/password auth é o baseline para qualquer sistema multi-tenant. Toda feature — emissão fiscal, operações financeiras, gestão de tenant — requer usuário autenticado.

**Teste Independente**: Registrar com email+password, depois login com as mesmas credenciais, depois acessar recurso protegido com sucesso.

**Critérios de Aceite:**

1. **Dado** um novo email e senha, **Quando** o usuário registra, **Então** o sistema cria conta e retorna resposta de sucesso.
2. **Dado** conta existente, **Quando** usuário faz login com credenciais corretas, **Então** sistema inicia sessão autenticada.
3. **Dado** conta existente, **Quando** usuário faz login com senha incorreta, **Então** sistema nega acesso com erro.
4. **Dado** email já registrado, **Quando** outro usuário tenta registrar com mesmo email, **Então** sistema responde `201 Created` com corpo idêntico ao de registro novo e **duração equivalente** (`enforceMinimumTime` piso de 300ms — sem isso o relógio vaza a duplicata) (AUD-03, anti-enumeração) e não cria duplicata (FR-003 = unicidade no banco, não código de erro). Nunca `409`.

### US-002: Logout and Session Lifecycle (Priority: P2)

**Por que esta prioridade**: Usuários devem poder encerrar acesso seguramente. Sessões que nunca expiram são risco em ambiente fiscal.

**Teste Independente**: Login, receber sessão, logout, então tentar requisição autenticada e receber erro de acesso negado.

**Critérios de Aceite:**

1. **Dado** sessão ativa, **Quando** usuário faz logout, **Então** sessão é terminada.
2. **Dado** sem sessão ativa, **Quando** usuário acessa recurso protegido, **Então** sistema nega acesso.
3. **Dado** sessão ativa após TTL de 7d, **Quando** usuário faz requisição, **Então** sistema nega acesso.

### US-003: Multi-Tenant Membership (Priority: P3)

**Por que esta prioridade**: Merp atende múltiplas empresas. Identidade sem contexto de tenant é incompleta.

**Teste Independente**: Registrar, criar empresa, login, então verificar requisições autenticadas carregam contexto de tenant correto.

**Critérios de Aceite:**

1. **Dado** usuário registrado sem empresa, **Quando** cria nova empresa, **Então** torna-se primeiro membro.
2. **Dado** usuário registrado, **Quando** aceita token de invite válido para empresa, **Então** torna-se membro.
3. **Dado** usuário com uma empresa, **Quando** faz login, **Então** sistema defaulta para contexto da empresa.
4. **Dado** usuário membro de múltiplas empresas, **Quando** faz login, **Então** pode trocar entre empresas.
5. **Dado** usuário sem empresa atribuída, **Quando** faz login, **Então** sistema retorna sucesso mas status de acesso limitado.

## Requisitos Funcionais

- **FR-001**: Sistema DEVE permitir registro com email e senha.
- **FR-002**: Sistema DEVE validar formato de email e exigir comprimento mínimo de senha no registro.
- **FR-003**: Sistema DEVE rejeitar registro com email duplicado.
- **FR-004**: Sistema DEVE permitir login com email e senha.
- **FR-005**: Sistema DEVE manter sessão autenticada após login bem-sucedido, válida em requisições subsequentes.
- **FR-006**: Sistema DEVE permitir logout encerrando sessão atual.
- **FR-007**: Sistema DEVE rejeitar requisições não autenticadas a recursos protegidos.
- **FR-008**: Sistema DEVE proteger senhas armazenadas contra comprometimento (ex.: hashing).
- **FR-009**: Sessões DEVEM expirar 7d após criação (TTL fixo: `expiresIn: 7d` com `disableSessionRefresh: true` — sem refresh deslizante). Flag `rememberMe` controla persistência do cookie apenas (7d persistente vs cookie de sessão); a linha do servidor sempre expira 7d após criação.
- **FR-010**: Tentativas de login DEVEM ter rate limit para mitigar brute-force. Rate limit usa **janela deslizante** de 5 requisições por 1 minuto por email. Quando excedido, responde HTTP 429.
- **FR-011**: Sistema DEVE associar cada usuário autenticado a pelo menos uma empresa (tenant) para decisões de autorização.
- **FR-013**: Registro DEVE criar apenas conta. Setup de empresa é passo separado após registro.
- **FR-014**: Sistema DEVE prover endpoint para criar nova empresa, tornando usuário solicitante seu primeiro membro.
- **FR-015**: Sistema DEVE prover endpoint para aceitar token de invite e entrar na empresa (join exclusivamente via convite).
- **FR-016**: Sistema DEVE bloquear tentativas de login após 10 falhas do mesmo IP para um email (qualquer janela de tempo); pares (email, IP) bloqueados auto-desbloqueiam após 30 min. Adicionalmente, sistema DEVE bloquear conta para todos IPs após 50 falhas totais entre IPs (brute-force distribuído com rotação de IP, AUD-02), também auto-desbloqueando após 30 min.
- **FR-017**: Sistema DEVE suportar desativação de usuário (soft delete). Usuários desativados não podem logar, mas dados são preservados.
- **FR-018**: Sistema DEVE logar todos eventos auth — registro, login, login falho, logout — com timestamp, email e outcome.
- **FR-012**: Sistema DEVE suportar múltiplas sessões ativas por usuário (dispositivos/navegadores diferentes).
- **FR-019**: Sistema DEVE suportar deleção de empresa. Apenas owners podem deletar (não existe role `super_admin` de plataforma — deferido). Deleção é soft-delete (`is_deleted` flag) para preservar integridade referencial para registros fiscais. Comportamento cascade: todas linhas CompanyMember purgadas, todos invites pendentes purgados, empresa não mais selecionável como contexto de tenant. Sessões ativas para outros tenants do usuário permanecem válidas.
- **FR-020**: Sistema DEVE prover endpoint de exportação de dados retornando todos dados pessoais do usuário (perfil, memberships, sessões, auth events) em JSON, cumprindo LGPD Art. 18. Apenas eventos vinculados ao usuário solicitante são incluídos.
- **FR-021**: Sistema DEVE registrar consentimento do usuário no registro (aceite de termos e processamento de dados) com timestamp e versão. Retirada de consentimento DEVE disparar desativação imediata da conta e terminação de sessão. Fila automatizada de deleção/anonymização de PII é deferida — retirada registrada como evento `consent_withdrawal`.
- **FR-022**: Sistema DEVE logar todos acessos a dados PII (email, name) no audit log — quem acessou, quando, e propósito. Logs de acesso PII retidos por 5 anos.
- **FR-023**: Sistema DEVE emitir eventos de observabilidade estruturados para ciclo de vida de sessão: session_created, session_validated, session_expired, session_invalidated. Cada evento inclui session_id, user_id, tenant_id (se aplicável), e timestamp.
- **FR-024**: Sistema DEVE impor timeouts HTTP para todas chamadas outbound: 5s para chamadas Better Auth, 10s para chamadas OAuth provider. Falhas de timeout DEVEM retornar HTTP 503.
- **FR-025**: Se inicialização de `shared/auth.ts` falhar na inicialização (ex.: env vars ausentes, erro config Better Auth), sistema NÃO DEVE crashar. Endpoints auth e health check DEVEM retornar HTTP 503.
- **FR-026**: Todos erros 500 inesperados DEVEM retornar corpo de resposta consistente: `{ "error": "internal_error", "message": "An unexpected error occurred." }`. Stack traces, paths internos, detalhes de implementação NÃO DEVEM vazar na resposta.
- **FR-027**: CORS DEVE ser configurado com origins permitidas explícitas (sem wildcard). Endpoints auth DEVEM incluir `Access-Control-Allow-Credentials: true` para suporte a cookie de sessão. Preflight (`OPTIONS`) DEVE responder com headers CORS apropriados para origins configuradas.
- **FR-028**: Validação de body de requisição DEVE usar schemas **Zod** nomeados por endpoint (ex.: `createOrderSchema`, `loginSchema`). Erros de validação retornam 400 com `details` por campo.

## Entidades-Chave

| Entidade    | Descrição                                                                                                             | Atributos Principais                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **User**    | Pessoa que acessa o sistema. Tem email, pode autenticar, e tem estado ativo/inativo. Pertence a uma ou mais empresas. | id, email, name, email_verified, is_active, consent_*                                  |
| **Session** | Período de acesso autenticado ativo. Criada no login, destruída no logout ou expiração.                               | id, user_id, token, expires_at, ip_address, user_agent, remember_me, active_company_id |
| **Company** | Tenant no modelo multi-tenant. Usuários são membros de empresas e operam dentro do seu escopo.                        | id, name, cnpj, razao_social, is_deleted                                               |

## Critérios de Sucesso (Mensuráveis)

- **SC-001**: Registro completa em < 2 segundos (p95).
- **SC-002**: Login completa em < 1 segundo (p95).
- **SC-003**: Validação de sessão (overhead de requisição autenticada) < 100ms (p95).
- **SC-004**: Registro duplicado retorna erro em < 500ms.
- **SC-005**: Requisições não autenticadas retornam acesso negado em < 50ms.
- **SC-006**: A 6ª requisição no window de 60s (por email) retorna 429 com header `Retry-After`.

## Pressupostos

- Entrega de email é **best-effort** via Resend (`server/utils/shared/email.ts`): três transacionais — aviso de verificação, aviso de reset de senha, aviso de desativação. Sem `RESEND_API_KEY` são pulados com warning; nunca derrubam a requisição. Boas-vindas independentes e fila de emails não existem.
- Gestão de perfil do usuário (nome, avatar, preferências) está fora de escopo do MVP.
- Escopo multi-tenancy (empresa que usuário pertence) é gerenciado na camada auth — contextos downstream consomem contexto de tenant da requisição autenticada.
- OAuth / social login é deferido — email+senha suficiente para lançamento inicial.
- Role-based access control (admin, operator, viewer) é deferido — MVP trata todos usuários autenticados dentro de uma empresa como tendo acesso igual.
- O contexto auth não lida com regras fiscais, transações financeiras, ou qualquer lógica de domínio fora de identidade e acesso.
