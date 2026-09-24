# specs/000-foundation/money.md

## Tipo Oficial

`numeric(12,2)` para valores monetários.

**Justificativa do teto (12 dígitos, 2 decimais):**

- Suporta até 999,999,999.99 (quase 1 bi) — suficiente para qualquer transação unitária no varejo/restaurante/ERP B2B.
- Alinha com NF-e/NFC-e (valor total até 15 dígitos, mas itens unitários tipicamente < 1 bi).
- `numeric` evita erros de ponto flutuante; `DECIMAL` em PG é alias de `numeric`.

## Arredondamento

**Half-up no servidor POR LINHA** (cada `order_item.unit_price * quantity` arredondado individualmente antes de somar).

```sql
-- Exemplo de arredondamento half-up por linha
SELECT round((unit_price * quantity)::numeric, 2) AS line_total
```

NUNCA arredondar só no total final — acumula diferença de centavos.

## Total = Soma das Linhas

O servidor **SEMPRE** recalcula `order.total_amount = sum(line_totals)`.
NUNCA aceitar `total_amount` enviado pelo cliente (anti-fraude, consistência).

## Quantidade

`numeric(12,3)` — permite kg fracionado em restaurante (ex.: 0.250 kg).

## Contexto Fiscal BR

- NFC-e / SAT: valor unitário com 4 casas decimais permitido, mas armazenamos 2 (arredondado half-up na linha).
- NF-e: total da nota com 2 casas.
- PIS/COFINS/ICMS calculados sobre base arredondada por item.
- Referência: Manual de Orientação do Contribuinte NFC-e, NT 2024.001.
