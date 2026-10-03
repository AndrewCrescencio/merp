# ADR-001: Estratégia Vertical — Núcleo Comum + Packs

## Contexto

O produto atende ERP B2B, restaurante e varejo. Specs 003–007 especificam ERP genérico, mas o briefing pede restaurante. **Decisão pendente** registra dois roadmaps concorrentes. Escolher um inviabiliza o produto; fork inviabiliza o time.

## Decisão

Arquitetura de **NÚCLEO COMUM + PACKS VERTICAIS**, com feature flags por tenant.

### Núcleo (specs/00X-core-\*)

identity, company, location, party, catalog, inventory, order (com order_type), payment, fiscal, finance, audit.

### Packs (specs/packs/\*)

restaurant, retail, erp-b2b. Habilitados por tenant via `company.enabled_packs` jsonb ou tabela `company_pack`.

### Ordem de implementação

núcleo → restaurant → retail → erp-b2b.

**Justificativa**: restaurant exercita o núcleo mais intensamente (PDV + KDS + mesa + fiscal + turno + impressão).

## Consequências

- 003–007 atuais viram `packs/erp-b2b/`. Não descartados, adiados.
- `sales_order` deixa de existir como entidade do ERP; vira `order` de núcleo com `order_type='wholesale'`.
- `location_id` entra no escopo de RLS desde o dia 1 (ver ADR-002).
- Todo endpoint novo declara pack em metadata.

## Alternativas rejeitadas

| Alternativa                                            | Motivo                                 |
| ------------------------------------------------------ | -------------------------------------- |
| Escolher uma vertical só                               | Perde mercado restaurante/varejo/ERP   |
| Fork em 3 repositórios                                 | Time único não sustenta 3 codebases    |
| Monolito específico de restaurante com "campos extras" | Torna o núcleo sujo, difícil de manter |

## Perguntas abertas (não resolver agora)

- `enabled_packs` por company ou por location?
- Pack pode ser desabilitado após ter dados?
- Preço por pack ou por seat?
