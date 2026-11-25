# Fase 7 — Contratos compartilhados e frontend

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Escolha uma operação já consumida pelo frontend. Verifique que o wrapper aceita Zod e validadores legados e identifique os caminhos atuais do domínio antes de migrar o primeiro contrato.

## Tarefa

Extraia por domínio as validações que têm consumidores reais no MERP. Zod já consta em `package.json`. Comece por um contrato usado na API e em um consumidor do frontend, por exemplo atualização de empresa via `useAuthFetch`. Coloque schemas e tipos derivados em `shared/contracts/<dominio>.ts`. Para payloads vindos da rede, valide no servidor e use o tipo de saída após a normalização. Preserve trim, limites, campos opcionais, null intencional, comportamento de campos desconhecidos, mensagens e status vigentes. Mantenha no servidor verificações com banco, sessão e consulta externa de senhas comprometidas. Use o adaptador de validadores legados do wrapper para migrar gradualmente.

Em `app/composables/useApiFetch.ts` existem hoje o transporte `useApiFetch` e os métodos de domínio em `useAuthFetch`. Mantenha um único transporte. Separe métodos de auth e empresas e acrescente composables de membros/locais conforme os consumidores. Atualize páginas, middleware e testes. Preserve a leitura de erros e o CSRF nas mutações. Caracterize a navegação autenticada de `app/middleware/auth.global.ts` em SSR e no cliente. No SSR use o contexto da requisição para a API interna da mesma origem e mantenha as credenciais restritas a esse destino.

Aceite com unit cobrindo normalização e erros, verificação da mesma forma de entrada no cliente e no servidor, testes de página/navegação autenticada e anônima, e mutações com CSRF. Confira que o bundle do cliente só importa dependências adequadas ao navegador. Rode Node 24, check, suíte e build.

## Entrega

Use Node 24. Execute `npm run check`, `npm test` e `npm run build`. Para integração e E2E, use um banco de testes com `DB_AVAILABLE=true`, migrations como proprietário e aplicação como `merp_app`. No resumo da entrega, registre o SHA, as mudanças, os testes efetivamente executados e qualquer verificação pendente.
