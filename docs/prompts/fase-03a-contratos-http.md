# Fase 3A — Testes HTTP antes da migração

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Trabalhe na branch em que a assinatura antiga de `defineAuthHandler` ainda está em uso. Use um banco de testes dedicado e confirme que a suíte E2E realmente executa sobre HTTP.

## Tarefa

Amplie os testes de contrato do MERP antes de implementar o novo wrapper. Comece em `tests/e2e/companies-locations.e2e.ts` e `tests/e2e/support/http.ts`. Rode Nitro e PostgreSQL reais com `merp_app` na aplicação. Use a conexão proprietária exclusivamente para preparação e limpeza das fixtures.

Inventarie as 19 rotas /v1 por sessão, tenant, papel, limite específico, validação, auditoria, corpo e headers. Reaproveite os testes existentes de companies e locations. Complete convites e membros. Cubra 401 para uma chamada protegida com os demais pré-requisitos válidos, 403 nas operações exclusivas de owner, 404 para empresa alheia, escrita com CSRF válido e rejeição sem CSRF. Confira o caminho feliz, 201 com o Location exato nas criações e 204 com corpo vazio onde aplicável.

Inclua um member listando convites, owner criando convite, aceite pelo destinatário e saída voluntária de member. Verifique também a restrição da lista de membros e a proteção do owner na remoção. Confira o estado persistido quando uma escrita é recusada. Mantenha a precedência de erros vigente nesta fase e marque os casos em que verificar o papel antes do body alterará a resposta. Aceite quando esses testes passarem na implementação original com `DB_AVAILABLE=true`, sem mock de h3 ou `assertRole`. Entregue a matriz de cobertura no PR.

## Entrega

Use Node 24. Execute `npm run check`, `npm test` e `npm run build`. Para integração e E2E, use um banco de testes com `DB_AVAILABLE=true`, migrations como proprietário e aplicação como `merp_app`. No resumo da entrega, registre o SHA, as mudanças, os testes efetivamente executados e qualquer verificação pendente.
