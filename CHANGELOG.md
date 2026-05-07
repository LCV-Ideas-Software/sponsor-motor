# Changelog

## [APP v01.00.03] - 2026-05-07

### Fixed

- Adicionado shim estreito para `Headers.raw()` antes das chamadas ao SDK oficial `mercadopago`, corrigindo incompatibilidade entre `node-fetch` esperado pela SDK Node e o runtime Cloudflare Workers com `nodejs_compat`.

## [APP v01.00.02] - 2026-05-07

### Changed

- Migrada a criação de preferências e a consulta de pagamentos para o SDK oficial `mercadopago`.
- Adicionado `items.category_id=services` às preferências de apoio para atender à recomendação de aprovação de pagamentos do Mercado Pago.
- Exposta a rota pública `GET /api/config` para entregar a Public Key usada pelo MercadoPago.js v2 no frontend.
- Habilitado `nodejs_compat` no Worker para suportar a SDK oficial Node no runtime Cloudflare.

### Documentation

- Documentado o fluxo MercadoPago.js v2 / Wallet Brick e a separação PCI: `sponsor-motor` não coleta dados de cartão; o checkout seguro é renderizado pelo Mercado Pago.

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
