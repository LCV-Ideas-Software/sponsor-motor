# Changelog

## [APP v01.02.00] - 2026-05-07

### Added

- Suporte a `MERCADOPAGO_INTEGRATOR_ID` (Programa de Parcerias). Quando definido, o SDK do Mercado Pago propaga o cabeçalho `x-integrator-id` em todas as chamadas de criação, cancelamento e reembolso de orders. Sem o env var, a integração permanece anônima como antes.
- Suporte a `additional_info.payer.last_purchase` (recomendação de qualidade da integração). O schema `CreateOrderSchema` aceita o campo opcional `payerLastPurchase` (ISO-8601). Vazio ou ausente = field omitido no payload da Orders API.
- Endpoint operador-only `POST /api/orders/:orderId/cancel` para cancelar uma order ainda não capturada via SDK `Order.cancel`. Protegido pelo bearer token `SPONSOR_OPERATOR_TOKEN` (timing-safe comparison; 403 quando não configurado, 401 quando token ausente/inválido). Reflete o status final no D1 quando o `external_reference` retornado pertence a uma linha local.
- Endpoint operador-only `POST /api/orders/:orderId/refund` para reembolso total (body vazio) ou parcial (`{ transactions: [{ id, amount }] }`) via SDK `Order.refund`. Mesma proteção bearer + atualização local do D1 + validação Zod do body antes de hit no MP.
- Helpers `cancelMercadoPagoOrder` e `refundMercadoPagoOrder` em `src/lib/mercadopago.ts` com extração consistente de erros e suporte ao `integratorId` para o cabeçalho `x-integrator-id`.
- 8 novos testes unitários (`src/index.test.ts` `Operator admin endpoints`) cobrindo: gate desabilitado por default; ausência/mismatch de Authorization → 401/403; cancel + refund passthrough no SDK em token correto; encaminhamento de `MERCADOPAGO_INTEGRATOR_ID`; refund parcial; rejeição de body malformado.

### Notes

- Mudança aditiva no schema (`payerLastPurchase` opcional). Frontends pré-v01.02.00 continuam funcionando sem alterações; o campo é simplesmente omitido do payload `additional_info`.
- Os endpoints admin retornam 403 enquanto `SPONSOR_OPERATOR_TOKEN` não estiver presente em `wrangler.json` `secrets_store_secrets` — fail-closed por design para não abrir uma superfície de cancelamento/reembolso por engano.
- Testes 28/28 GREEN. Lint + typecheck + format public limpos.

## [APP v01.01.07] - 2026-05-07

### Added

- Adicionado checklist/manual `docs/mercadopago-integration-quality.md` com matriz de boas práticas Mercado Pago, decisão explícita de 3DS e itens não aplicáveis ao fluxo de doação digital.
- Adicionado campo opcional de telefone na página `/sponsor`, enviado ao Mercado Pago como `payer.phone.area_code` e `payer.phone.number` quando preenchido.
- Adicionada lógica de backup em `GET /api/status/:externalReference` para consultar a Orders API quando o status local ainda não é terminal e há `Order ID` disponível.
- Adicionados logs estruturados sem PII para criação de orders, webhooks aceitos e consultas fallback de status.
- Adicionado suporte controlado a `MERCADOPAGO_3DS_VALIDATION=always` como modo estrito, mantendo produção em `on_fraud_risk`.
- Adicionado teste de regressão para garantir que o Challenge 3DS seja lido do caminho oficial de Orders API: `transactions.payments[i].payment_method.transaction_security.url`.

### Changed

- A criação de orders passou a usar `Order.create` da SDK oficial `mercadopago@2.12.0`, preservando `X-Idempotency-Key`, payload Orders API, 3DS no nó `config.online.transaction_security` e tratamento de recusas com `data.id`.
- Ajustada a mensagem pós-3DS na página pública para não usar jargão técnico como `order`.

## [APP v01.01.06] - 2026-05-07

### Changed

- Desativado o fallback Checkout Pro em `POST /api/preferences`, removendo o fluxo de Conta Mercado Pago que gerava `payment.*`/Payment IDs fora da integração principal Checkout Transparente + Orders API.
- A página pública de sponsor passou a expor somente o Card Payment Brick/Orders API, evitando mistura de produtos na medição de qualidade do Mercado Pago.

### Fixed

- Corrigida corrida em que webhooks `payment.*` podiam chegar antes do fim de `POST /api/orders` e antes da criação da linha local em `sponsor_payments`.
- `sponsor_payments` agora separa o ID transacional da Orders API (`PAY...`) do resource ID numérico vindo da Payment API em notificações `payment.*`.
- O upsert final de orders preserva estados terminais já gravados por webhook, e falhas de criação só marcam `order_creation_failed` se a linha ainda estiver em `order_requested`.

## [APP v01.01.05] - 2026-05-07

### Fixed

- Corrigida a validação HMAC do webhook Mercado Pago para aceitar `x-signature.ts` em segundos ou milissegundos, preservando o valor original no manifesto assinado e normalizando apenas a checagem de idade.
- Corrigida falha `401` em notificações reais como `payment.created` enviadas pela dashboard do Mercado Pago com timestamp no formato de segundos.

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
