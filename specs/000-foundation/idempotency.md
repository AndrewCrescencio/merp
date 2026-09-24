# specs/000-foundation/idempotency.md

## Header Obrigatório

`Idempotency-Key` obrigatório em:

- Criação de `order`
- Criação de `payment`
- Fechamento de conta (restaurante)
- Emissão fiscal (NFC-e, SAT, NF-e)
- Baixa de estoque (`stock_movement`)

## Tabela `idempotency_record`

```sql
CREATE TABLE idempotency_record (
  company_id uuid NOT NULL REFERENCES company(id),
  key varchar(255) NOT NULL,
  request_hash varchar(64) NOT NULL,  -- SHA-256 do body canonicalizado
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (company_id, key)
);
```

Índice: `(company_id, expires_at)` para purga.

## TTL

| Operação                       | TTL |
| ------------------------------ | --- |
| PDV (order, payment, conta)    | 24h |
| Fiscal (emissão, cancelamento) | 7d  |
| Estoque (movimentação)         | 24h |

## Retry

Devolve resposta **original byte-a-byte** (status, headers, body). Cliente não precisa reprocessar.

## Cliente

Gera UUID v7 (timestamp + random) — ordenável, único, sem coordenação.
