# specs/000-foundation/idempotency.md

## Header Obrigatório

`Idempotency-Key` obrigatório em:

- Criação de `order`
- Criação de `payment`
- Fechamento de conta (restaurante)
- Emissão fiscal (NFC-e, SAT, NF-e)
- Baixa de estoque (`stock_movement`)

## Implementação Simplificada (MVP)

**Sem tabela separada `idempotency_record`**. Usa constraint `UNIQUE (company_id, idempotency_key)` diretamente na tabela da operação:

```sql
-- Exemplo: order
ALTER TABLE "order" ADD COLUMN idempotency_key varchar(255);
ALTER TABLE "order" ADD CONSTRAINT order_idempotency_key_unique
  UNIQUE (company_id, idempotency_key);

-- Exemplo: payment
ALTER TABLE payment ADD COLUMN idempotency_key varchar(255);
ALTER TABLE payment ADD CONSTRAINT payment_idempotency_key_unique
  UNIQUE (company_id, idempotency_key);
```

**Vantagens:**
- Atômico: constraint + insert na mesma transação
- Sem código de purga/TTL (linha real expira com a operação)
- Sem tabela extra, sem joins
- Byte-a-byte response: handler lê a linha existente se constraint falhar

## Tabela `idempotency_record` (Futuro — Fiscal)

Apenas para auditoria fiscal (NFC-e/SAT) onde resposta byte-a-byte + TTL + purga são requisitos legais:

```sql
CREATE TABLE idempotency_record (
  company_id uuid NOT NULL REFERENCES company(id),
  key varchar(255) NOT NULL,
  request_hash varchar(64) NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (company_id, key)
);
```

## TTL (quando tabela separada for usada)

| Operação                       | TTL |
| ------------------------------ | --- |
| PDV (order, payment, conta)    | 24h |
| Fiscal (emissão, cancelamento) | 7d  |
| Estoque (movimentação)         | 24h |

## Retry

Devolve resposta **original byte-a-byte** (status, headers, body). Cliente não precisa reprocessar.

## Cliente

Gera UUID v7 (timestamp + random) — ordenável, único, sem coordenação.