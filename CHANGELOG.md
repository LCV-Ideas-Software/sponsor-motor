# Changelog

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
