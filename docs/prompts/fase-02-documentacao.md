# Fase 2 — Receita de feature em uma fonte

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Compare o README, `CLAUDE.md` e `docs/decisions.md` com os scripts atuais. Use o código da branch para decidir quais instruções ainda são válidas.

## Tarefa

Consolide a documentação do MERP. Mantenha no README o quickstart, os comandos executáveis, os limites da fundação e uma única receita de feature. Transfira de `docs/PROJETO.md` o que for exclusivo antes de removê-lo. Em `CLAUDE.md` mantenha as regras dos agentes e um link para a receita. Em `docs/decisions.md` mantenha decisões vigentes, incluindo imutabilidade de migrations compartilhadas e edição de schema acompanhada de migration e testes.

Retire o histórico sobre round_half_up, CNPJ/razaoSocial e a renumeração antiga quando já estiver registrado no Git. Preserve qualquer obrigação operacional ainda aplicável. Ilustre a receita com um endpoint real e a assinatura presente na branch. A migração do wrapper atualizará esse mesmo exemplo. Registre que domínios comerciais pertencem a aplicações derivadas.

Aceite quando houver uma receita, os links relativos resolverem, as referências da documentação de uso a PROJETO.md tiverem sido atualizadas e os comandos coincidirem com `package.json` e o CI.

## Entrega

Rode `npm run format:check` e confira os links e os caminhos da documentação a partir do checkout. Informe os arquivos que foram consolidados.
