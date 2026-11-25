# Fase 9 — Decisões opcionais de política e operação

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Identifique a política em avaliação, o ambiente e a evidência disponível. Quando ainda não houver uma decisão de produto ou operação, entregue a avaliação e a condição objetiva para prosseguir.

## Tarefa

Avalie uma decisão por vez. Entregue evidência, efeito público ou operacional, custo, condição para adotar e como verificar o resultado. Implemente apenas a mudança cuja política esteja definida para o ambiente alvo. Cada alteração de comportamento recebe um PR próprio.

Exportação. O middleware limita operações comuns a 120 por minuto por usuário. Existe `checkExportRateLimit` de 5 por minuto, ainda desconectado. Se o limite dedicado for adotado, aplique-o uma vez com sua chave própria, preserve a cota comum e o registro pii_access. Verifique sucesso até o limite, 429 e `Retry-After` na chamada seguinte, independência entre usuários e reabertura da janela. Trate a nova cota como alteração pública.

Auditoria e retenção. Meça volume/custo de `session_validated` e identifique requisitos e consumidores antes de mudar a frequência. Para as quatro tasks de purge, confira agendamentos, retenção, permissões, nomes observados e recuperação de falha por tarefa. Só consolide quando puder preservar as garantias em operação.

Infraestrutura. Preserve o journal aplicado. Só avalie um baseline novo com evidência de que nenhum ambiente compartilhado aplicou as migrations e um procedimento de provisionamento validado em banco vazio. Avalie Tailwind/Vite diante de um problema real, comparando CSS gerado, desenvolvimento e build. Vincule decisões sobre Compose, nginx e certbot à estratégia de deploy adotada.

Registre também os gatilhos das propostas futuras. Paginação/filtros na primeira listagem de negócio, permissões por ação quando owner/member deixarem de expressar a regra, idempotência no primeiro comando sujeito a repetição, outbox ou fila quando houver entrega assíncrona que precise de garantia, conversão de classes em funções quando uma alteração concreta simplificar os chamadores, observabilidade quando houver uma questão operacional e Better Auth Organization quando resolver uma necessidade concreta de associação. Aceite o encerramento da avaliação com uma decisão fundamentada de manter o comportamento atual.

## Entrega

Entregue uma decisão por item avaliado, com evidência, dependência externa e critério de reavaliação. Se uma alternativa já aprovada gerar mudança de código, rode em Node 24 `npm run check`, `npm test` com o banco de testes e `npm run build`.
