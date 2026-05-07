# Changelog

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
