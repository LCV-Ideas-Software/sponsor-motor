# Changelog

## [APP v01.01.04] - 2026-05-07

### Fixed

- Corrigido o webhook Mercado Pago para confirmar com `200 OK` as simulações assinadas da dashboard quando o `payment.updated` usa um ID fictício inexistente.
- Eventos de webhook com lookup `404/not_found` agora são auditados em `sponsor_payment_events` com status `not_found`, sem mascarar erros reais não-404 do Mercado Pago.
- Implementada cobertura explícita para todos os tópicos habilitados no painel Mercado Pago: Pagamentos, Orders, Alertas de fraude, Card Updater, Vinculação de aplicações, Reclamações, Contestações, Envios, Planos e assinaturas, Delivery, Pedidos comerciais, Integrações Point, Wallet Connect e Self Service.
- Ajustada a validação HMAC para seguir a regra oficial de remover `id:` do manifesto quando `data.id` não vier na URL, evitando falha em notificações como `automatic-payments/card.updated`.

## [APP v01.01.03] - 2026-05-07

### Changed

- Enriquecido o payload da Orders API com `payer.last_name`, `payer.address`, `shipment.address` e `additional_info` antifraude aceito pela Orders API.
- Adicionada opção explícita de Conta Mercado Pago em `/api/preferences` com `purpose=wallet_purchase`, sem interferir no fluxo principal por cartão/Orders.
- Mantida postura zero-trust: dados pessoais completos seguem sem persistência em claro no `bigdata_db`; apenas hashes técnicos continuam gravados.

## [APP v01.01.02] - 2026-05-07

### Fixed

- Removido `additional_info` do payload de criação de Orders, campo não aceito pela Orders API para os metadados customizados enviados.
- Trocada a criação de Orders para chamada REST controlada em `/v1/orders`, preservando o corpo de erro seguro do Mercado Pago em logs.
- Respostas não-2xx da Orders API que já retornam `data.id` agora são tratadas como order válida, permitindo exibir recusas de pagamento sem converter em erro 500.

## [APP v01.01.01] - 2026-05-07

### Fixed

- Atualizado `mercadopago-public-key` no Cloudflare Secrets Store a partir de `Secrets/variaveis_secretas.txt`, alinhando a Public Key usada pelo MercadoPago.js V2 ao Access Token atual.
- Melhorado o diagnóstico seguro de falhas da SDK Mercado Pago para preservar status/cause sem registrar dados sensíveis.

## [APP v01.01.00] - 2026-05-07

### Changed

- Migrado o fluxo principal de apoios para Checkout Transparente via Orders API (`/v1/orders`), mantendo `/api/preferences` apenas como compatibilidade legada.
- Adicionada rota `POST /api/orders` para criar orders com cartão tokenizado pelo MercadoPago.js V2/Card Payment Brick.
- Adicionados `items.category_id=services`, `processing_mode=automatic` e 3DS `on_fraud_risk`/`liability_shift=required` às orders.
- Atualizado webhook para processar eventos `order` e registrar `Order ID`/`Payment ID` no `bigdata_db`.

### Added

- Adicionada migration `0002_sponsor_orders_api.sql` com `sponsor_order_id` e `provider_api` em `sponsor_payments`.

## [APP v01.00.03] - 2026-05-07

### Fixed

- Adicionado shim estreito para `Headers.raw()` antes das chamadas ao SDK oficial `mercadopago`, corrigindo incompatibilidade entre `node-fetch` esperado pela SDK Node e o runtime Cloudflare Workers com `nodejs_compat`.

## [APP v01.00.02] - 2026-05-07

### Changed

- Migrada a criação de preferências e a consulta de pagamentos para o SDK oficial `mercadopago`.
- Adicionado `items.category_id=services` às preferências de apoio para atender à recomendação de aprovação de pagamentos do Mercado Pago.
- Exposta a rota pública `GET /api/config` para entregar a Public Key a integrações frontend quando necessário.
- Habilitado `nodejs_compat` no Worker para suportar a SDK oficial Node no runtime Cloudflare.

### Documentation

- Documentada a separação PCI: `sponsor-motor` não coleta dados de cartão; o checkout seguro é concluído no ambiente Mercado Pago.

## [APP v01.00.01] - 2026-05-07

### Changed

- Adicionado `deepseek-cli` ao catálogo aceito por `/api/projects` e `/api/preferences`, permitindo checkout central em `https://www.lcv.dev/sponsor?project=deepseek-cli`.

## [APP v01.00.00] - 2026-05-07

### Added

- Criado `sponsor-motor`, Worker dedicado para apoios/doações via Mercado Pago Checkout Pro.
- Adicionadas rotas de criação de preferência, status, health, catálogo de projetos e webhook Mercado Pago.
- Adicionadas tabelas `sponsor_*` no `bigdata_db` para auditoria isolada sem criar D1 separado.
- Configurados bindings do Cloudflare Secrets Store para `mp-access-token`, `mercadopago-webhook-secret` e `mercadopago-public-key`.
- Adicionados workflows de CI/deploy, Pages, auto-release, Dependabot e Dependabot automerge.
