---
title: 'Especificação: Restaurant Pack'
slug: 'spec-restaurant'
category: 'spec'
status: 'draft'
version: '1.0.0'
owner: '@restaurant-pack-owner'
reviewers: ['@tech-lead', '@backend-lead']
module: 'restaurant'
tags: ['spec', 'restaurant', 'pack', 'pdv', 'kds', 'nfce']
audience: ['dev', 'qa', 'product']
created: '2026-10-03'
updated: '2026-10-03'
review-cycle: 'quarterly'
related:
  - 'data-model-restaurant'
  - 'api-restaurant'
  - 'adr-001-vertical-strategy'
  - 'adr-002-location-scope'
  - 'adr-004-session-ttl-by-profile'
replaces: []
replaced-by: null
---

# Spec: Restaurant Pack

## Visão Geral

O Restaurant Pack estende o núcleo comum para atender restaurantes, pizzarias e food service. Inclui PDV, KDS (Kitchen Display System), gestão de mesas/comandas, impressão fiscal (NFC-e/SAT), turno de caixa e delivery.

**Habilitado por**: `company.enabled_packs` contendo `"restaurant"` (feature flag por tenant).

**Dependência**: Núcleo comum (auth, company, catalog, inventory, order, payment, fiscal, finance, audit) deve estar estável.

## Módulos do Pack

| Módulo               | Descrição                                                        | Entidades-Chave                                                              |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Menu/Cardápio**    | Produtos, categorias, variantes, ingredientes, fichas técnicas   | `product`, `category`, `product_variant`, `ingredient`, `product_ingredient` |
| **PDV / Orders**     | Pedidos de salão, balcão, delivery, takeaway; mesa/comanda       | `order`, `order_item`, `table`, `table_session`                              |
| **KDS**              | Tickets de cozinha, estações, tempo de preparo, status real-time | `kitchen_ticket`, `station`, `prep_time_estimate`                            |
| **Mesas/Comandas**   | Gestão de mesas, QR code, abertura/fechamento de comanda         | `table`, `table_session`, `qr_code`                                          |
| **Impressão/Fiscal** | NFC-e/SAT, contingência offline, impressoras térmicas            | `printer`, `print_job`, `fiscal_document`                                    |
| **Turno de Caixa**   | Abertura/fechamento, sangria, reforço, fechamento cego           | `cash_shift`, `cash_movement`                                                |
| **Delivery**         | Integração iFood/Rappi, zonas, motoboys                          | `delivery_zone`, `driver`, `delivery_order`                                  |
| **Estoque/Insumos**  | Controle de insumos, ficha técnica, baixo estoque                | `stock_item`, `stock_movement`, `supplier`                                   |

## User Stories Principais

### US-REST-001: Pedido no PDV (Priority: P1)

**Cenário**: Operador abre comanda na mesa 5, adiciona 2 pizzas + 1 refrigerante, envia para cozinha.

**Critérios de Aceite:**

1. **Dado** mesa 5 livre, **Quando** operador abre comanda, **Então** `table_session` criada com status `open`.
2. **Dado** comanda aberta, **Quando** adiciona itens do cardápio, **Então** `order_item` criados com preço congelado do momento.
3. **Dado** itens na comanda, **Quando** operador clica "Enviar para cozinha", **Então** `order` status = `preparing`, tickets KDS criados por estação.
4. **Dado** ticket na estação "Pizzaria", **Quando** pizzaiolo clica "Iniciar", **Então** status = `preparing`, tempo de preparo inicia.
5. **Dado** ticket "Preparando", **Quando** pizzaiolo clica "Pronto", **Então** status = `ready`, notificação push para operador.

### US-REST-002: KDS Real-time (Priority: P1)

**Cenário**: Cozinha visualiza tickets em tempo real, organiza por prioridade/estação.

**Critérios de Aceite:**

1. **Dado** KDS aberto, **Quando** novo pedido chega, **Então** ticket aparece em < 2s (SSE/WebSocket).
2. **Dado** múltiplas estações, **Quando** filtra por "Pizzaria", **Então** só tickets da estação aparecem.
3. **Dado** ticket "Pronto" há > 10min, **Então** destaque visual (alerta de tempo).

### US-REST-003: NFC-e Contingência Offline (Priority: P1)

**Cenário**: Internet cai durante pico; PDV continua vendendo e emitindo NFC-e em contingência.

**Critérios de Aceite:**

1. **Dado** internet indisponível, **Quando** finaliza venda, **Então** NFC-e emitida em contingência (tpEmis=9) com QR Code válido.
2. **Dado** internet restaurada, **Quando** sincronização automática, **Então** NFC-es de contingência transmitidas e autorizadas.
3. **Dado** falha na transmissão, **Então** retry exponencial + alerta no dashboard.

### US-REST-004: Turno de Caixa (Priority: P2)

**Cenário**: Gerente abre turno, operadores fazem sangrias/reforços, fechamento cego ao final.

**Critérios de Aceite:**

1. **Dado** turno aberto, **Quando** operador faz sangria, **Então** `cash_movement` tipo `withdrawal` registrado com valor e responsável.
2. **Dado** turno em andamento, **Quando** gerente consulta, **Então** vê saldo esperado vs realizado em tempo real.
3. **Dado** fim do turno, **Quando** fechamento cego, **Então** sistema não mostra valores — operador digita contagem, sistema compara e alerta diferença.

### US-REST-005: Delivery iFood (Priority: P2)

**Cenário**: Pedido chega via iFood, normalizado para order interno, impresso na cozinha.

**Critérios de Aceite:**

1. **Dado** webhook iFood recebido, **Quando** normaliza, **Então** `order` criado com `order_type='delivery'`, `source='ifood'`.
2. **Dado** order delivery, **Quando** impresso, **Então** vai para impressora "Delivery" + ticket KDS estação "Expedição".
3. **Dado** motoboy sai, **Quando** atualiza status no app, **Então** `delivery_order` status sincronizado.

## Requisitos Funcionais (Resumo)

| ID          | Requisito                                                                              |
| ----------- | -------------------------------------------------------------------------------------- |
| FR-REST-001 | Cardápio: CRUD produtos/categorias com variantes, ingredientes, preços por localização |
| FR-REST-002 | Pedido: fluxo `draft` → `pending` → `preparing` → `ready` → `delivered`/`cancelled`    |
| FR-REST-003 | Mesa: abrir/fechar comanda, transferir entre mesas, dividir conta                      |
| FR-REST-004 | KDS: tickets por estação, tempo real (SSE), priorização, alerta de tempo               |
| FR-REST-005 | Impressão: NFC-e/SAT, contingência offline, múltiplas impressoras por perfil           |
| FR-REST-006 | Turno: abertura/fechamento, sangria/reforço, fechamento cego, relatório Z              |
| FR-REST-007 | Delivery: webhook iFood/Rappi, normalização, rastreamento motoboy                      |
| FR-REST-008 | Estoque insumos: baixa automática por ficha técnica, alerta mínimo                     |
| FR-REST-009 | Fiscal: NFC-e (modelo 65), SAT (SP), contingência SCAN/FS-DA                           |
| FR-REST-010 | Relatórios: vendas por hora/produto/operador, curva ABC, CMV                           |

## Entidades-Chave (Novas)

| Entidade             | Descrição                                                             |
| -------------------- | --------------------------------------------------------------------- |
| `product_variant`    | Variações de produto (tamanho, borda, meia-a-meia)                    |
| `ingredient`         | Insumo para ficha técnica e controle de estoque                       |
| `product_ingredient` | Composição (quantidade de ingrediente por produto/variante)           |
| `table`              | Mesa física do salão                                                  |
| `table_session`      | Comanda aberta na mesa (abertura, fechamento, status)                 |
| `order`              | Pedido unificado (salão, balcão, delivery, takeaway)                  |
| `order_item`         | Item do pedido (produto, variante, qtd, preço congelado, observações) |
| `kitchen_ticket`     | Ticket impresso/exibido na cozinha (estação, prioridade, tempo)       |
| `station`            | Estação de preparo (Pizzaria, Churrasqueira, Bebidas, Expedição)      |
| `printer`            | Impressora térmica (modelo, IP/USB, perfil: fiscal/cozinha/delivery)  |
| `print_job`          | Fila de impressão (status, tentativas, fallback)                      |
| `fiscal_document`    | NFC-e/SAT emitido (chave, xml, qr_code, status, contingência)         |
| `cash_shift`         | Turno de caixa (abertura, fechamento, operador, valores)              |
| `cash_movement`      | Movimento no caixa (venda, sangria, reforço, troco)                   |
| `delivery_zone`      | Zona de entrega (polígono, taxa, tempo estimado)                      |
| `driver`             | Motoboy (nome, telefone, veículo, status)                             |
| `delivery_order`     | Rastreamento de entrega (status, motoboy, ETA, coordenadas)           |

## Regras de Negócio Específicas

| ID          | Regra                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| BR-REST-001 | Preço do item congelado no momento do pedido (não muda se produto alterado depois)  |
| BR-REST-002 | Pedido não pode voltar de `delivered`/`cancelled` para estados anteriores           |
| BR-REST-003 | NFC-e em contingência deve ser transmitida em até 24h após emissão                  |
| BR-REST-004 | Fechamento cego: diferença > 5% alerta gerente; > 10% bloqueia até conferência      |
| BR-REST-005 | Ficha técnica: baixa de insumo = qtd_vendida × qtd_por_unidade (considera variante) |
| BR-REST-006 | Mesa só pode ter 1 comanda aberta por vez                                           |
| BR-REST-007 | Transferência de mesa: itens movem, histórico preservado                            |

## Integrações Externas

| Integração       | Tipo                                    | Prioridade |
| ---------------- | --------------------------------------- | ---------- |
| iFood            | Webhook (pedidos, status)               | P2         |
| Rappi            | Webhook (pedidos, status)               | P3         |
| SAT (SP)         | API fiscal nativa                       | P1 (se SP) |
| NFC-e (nacional) | API SEFAZ                               | P1         |
| TEF              | Pagamento cartão (Stone, Cielo, Getnet) | P2         |

## Observabilidade

- **Métricas**: latência PDV (p95 < 500ms), fila KDS (tempo médio ticket), taxa contingência, diferença caixa.
- **Alertas**: contingência ativa > 5min, fila KDS > 20 tickets, diferença caixa > 5%.
- **Logs**: todos eventos de venda, impressão fiscal, abertura/fechamento caixa auditados.

## Fora de Escopo (MVP Restaurant)

- Loyalty program / fidelidade
- App mobile próprio para cliente (pedido na mesa via QR)
- Gestão de reservas (mesas reservadas)
- Cardápio digital com fotos (apenas texto + preço)
- Integração com balanças etiquetadoras
