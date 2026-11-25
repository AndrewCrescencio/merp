# Fase 1.1 — Correções pontuais e contrato de erros

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Parta de uma instalação reproduzível em Node 24 e trate cada mudança de comportamento em um diff que possa ser revisado isoladamente.

## Tarefa

Revise `server/utils/shared/validate.ts`, o barrel `server/utils/shared/index.ts`, os helpers errors.ts e auth-context.ts e o normalizador `server/error-handler.ts`. Troque os imports circulares do validador por imports dos módulos de origem. Use o tipo Role na fronteira em que a associação já foi validada. Torne `assertRole` síncrono, migre os consumidores e preserve as mensagens observadas pela API.

Caracterize o envelope HTTP vigente `{ error, message }` e os headers de erro. normalizeError atualmente interpreta JSON em message para status abaixo de 500 e mascara falhas inesperadas. Se adotar erros estruturados do H3, adapte os produtores e o normalizador juntos, aceite o formato legado durante a migração e teste a resposta HTTP consumida por `useApiFetch`. Para entradas inválidas como null e undefined, verifique que os validadores devolvem o erro de validação previsto.

Leia as invariantes de associação a local inativo, bootstrap de fundador, histórico em `softDeleteCompany` e permissões concorrentes. Revise a recuperação de getAuth após falha de inicialização e a equivalência das respostas de cadastro para e-mails novos e já cadastrados. Para cada hipótese registre o comportamento esperado, a evidência encontrada e a decisão. Corrija em diff isolado o que contrariar uma regra estabelecida e cubra com regressão. Leve retenção histórica ou semântica ainda indefinida a uma decisão de produto. Aceite com Node 24, check, suíte e build verdes.

## Entrega

Use Node 24. Execute `npm run check`, `npm test` e `npm run build`. Para integração e E2E, use um banco de testes com `DB_AVAILABLE=true`, migrations como proprietário e aplicação como `merp_app`. No resumo da entrega, registre o SHA, as mudanças, os testes efetivamente executados e qualquer verificação pendente.
