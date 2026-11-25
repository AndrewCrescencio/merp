# Fase 0 — Instalação, CI e exportação de dados

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Restabeleça a linha de base em Node 24 e corrija o teste de exportação que depende de PostgreSQL.

## Tarefa

Confira `.nvmrc`, `.github/workflows/ci.yml` e `vitest.config.ts`. Reproduza a instalação limpa do CI com `npm ci`. Em dev@005c7a7 há 13 especificações de dependências diretas diferentes entre o manifesto e a raiz do `package-lock.json`. Se a instalação falhar, reconcilie as versões pretendidas com o lockfile usado pelo CI. Restrinja o diff à causa observada.

Corrija GET `/api/v1/me/data-export`. Reutilize `listUserAuthEvents` em `server/utils/auth/identity/queries.ts` e `membershipRepository.findUserCompanies`. A primeira função já executa a leitura de eventos do usuário, na ordem de criação e sob RLS. No spec do handler, isole as duas consultas e `callBetterAuth`. Confira a assinatura e o retorno de `getSession` na versão instalada antes de remover as interfaces copiadas e o cast para `.response`. Preserve o contrato de profile, companies, `sessions: []` e authEvents, o fallback de perfil e a projeção pública dos eventos. Cubra uma exportação com dados e a ausência de detalhes opcionais. Uma mudança de conteúdo em sessions merece requisito próprio.

Aceite quando `npm run test:unit` passar com o PostgreSQL indisponível. Depois rode `npm run check`, `npm test` e `npm run build` nas condições do CI, com PostgreSQL 18, migrations como proprietário, `APP_DATABASE_URL` de `merp_app` e `DB_AVAILABLE=true` para as suítes reais. Verifique execução de unit, integration, e2e e app. Acrescente a verificação de build de produção ao CI se ainda faltar. Relate separadamente o resultado local e o do CI quando disponível.

## Entrega

No resumo da entrega, informe o SHA, as versões de Node e npm, os quatro resultados do Vitest e o resultado do build. Registre qualquer etapa pendente e o motivo.
