# sponsor-motor

Cloudflare Worker dedicado para processar apoios/doações via Mercado Pago Checkout Transparente com Orders API para a LCV Ideas & Software.

## Status

Stable bootstrap. Current release: **APP v01.02.03**.

## Histórico de versões

| Versão          | Mudanças                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`v01.02.03`** | **Site sponsor card iteration.** `site/index.html` GitHub Sponsors iframe (caixa branca cross-origin) substituído por link card dark navy com ❤ pink + meta cyan + seta animada; card movido para DEPOIS dos botões (lcv.dev/sponsor primário, GitHub Sponsors alternativa). Companion ship Phase 3 (12 repos). |
| **`v01.02.02`** | **Identidade visual da org.** Reskin da página `site/index.html` (GitHub Pages) pra nova paleta dark-first navy/cyan da LCV (`#050b18`/`#38bdf8`/`#34d399`, gradientes, glow). Companion ship coordenado com `cross-review-v1` 1.12.9, `cross-review-v2` v02.18.07, `deepseek-cli` 0.3.1, `grok-cli` 1.6.2 e `.github-org/site` (org root + /sponsor). Sem mudança no Worker runtime; apenas a página GitHub Pages muda.                          |
| **`v01.02.01`** | **Página pública e catálogo de sponsor.** Publica `site/` no padrão dos demais repositórios em `sponsor-motor.lcv.dev`, adiciona `Sponsor Motor` ao catálogo aceito pelo backend e à página central `/sponsor`.                            |
| **`v01.02.00`** | **Operações e qualidade Mercado Pago.** Adiciona `MERCADOPAGO_INTEGRATOR_ID`, `payerLastPurchase`, endpoints operador-only de cancelamento/reembolso e cobertura de testes para essas rotas administrativas.                               |
| **`v01.01.07`** | **Boas práticas Mercado Pago/3DS.** Criação de Orders via SDK oficial, telefone opcional do pagador, fallback server-side de status por Orders API, logs sem PII e manual de qualidade da integração.                                      |
| **`v01.01.06`** | **Fluxo 100% Orders API.** Desativa o fallback Checkout Pro/Conta Mercado Pago, remove a opção wallet, pré-registra tentativas antes da chamada ao MP e preserva estados de webhook ao separar IDs `PAY...` de Payment IDs numéricos.      |
| **`v01.01.05`** | **Webhook Mercado Pago com `ts` em segundos.** Assinaturas reais da dashboard agora validam `x-signature.ts` em segundos ou milissegundos, corrigindo `401` em notificações como `payment.created`.                                        |
| **`v01.01.04`** | **Webhook Mercado Pago compatível com a dashboard.** Todos os tópicos marcados no painel são aceitos com assinatura válida; testes oficiais com IDs fictícios retornam `200 OK` e ficam auditados sem esconder falhas reais não-404.       |
| **`v01.01.03`** | **Compliance Orders API ampliado.** Orders agora enviam sobrenome, endereço do pagador, endereço de entrega e `additional_info` antifraude aceito; `/api/preferences` suporta Conta Mercado Pago com `purpose=wallet_purchase`.            |
| **`v01.01.02`** | **Payload Orders API corrigido.** Remove `additional_info` não aceito pela Orders API, cria orders por REST controlado e evita converter recusas com `data.id` em erro 500.                                                                |
| **`v01.01.01`** | **Alinhamento de credenciais Mercado Pago.** Public Key do Secrets Store foi atualizada a partir de `Secrets/variaveis_secretas.txt` para casar com o Access Token atual, e erros da SDK passaram a preservar causa segura.                |
| **`v01.01.00`** | **Checkout Transparente via Orders API.** Fluxo principal migrou para MercadoPago.js V2/Card Payment Brick no frontend e `/v1/orders` no backend, com Secure Fields, `Order ID`, `items.category_id=services` e 3DS `on_fraud_risk`.       |
| **`v01.00.03`** | **Hotfix SDK no Cloudflare Workers.** Adiciona compatibilidade `Headers.raw()` para a SDK oficial `mercadopago`, corrigindo criação de preferências no runtime Cloudflare com `nodejs_compat`.                                             |
| **`v01.00.02`** | **Mercado Pago SDK oficial.** Backend passou a criar/consultar pagamentos com o SDK oficial `mercadopago`, envia `items.category_id=services` e expõe `/api/config` com Public Key para integrações frontend.                              |
| **`v01.00.01`** | **DeepSeek CLI no catálogo de sponsor.** `deepseek-cli` passou a ser aceito em `/api/projects` e `/api/preferences`, habilitando o checkout central por `project=deepseek-cli`.                                                            |
| **`v01.00.00`** | **Mercado Pago sponsor backend.** Novo Worker dedicado com Checkout Pro preferences, webhook assinado, auditoria em tabelas `sponsor_*` no `bigdata_db`, Secrets Store bindings e página pública central em `https://www.lcv.dev/sponsor`. |

## Arquitetura

- Página pública: `https://www.lcv.dev/sponsor`.
- API pública: `https://sponsor-motor.lcv.app.br`.
- Banco: `bigdata_db`, com tabelas `sponsor_payments`, `sponsor_payment_events` e `sponsor_rate_limits`.
- Secrets Store: `mp-access-token`, `mercadopago-webhook-secret`, `mercadopago-public-key`.
- Backend Mercado Pago: SDK oficial `mercadopago`, com `nodejs_compat` no Worker para suportar a biblioteca Node.
- Frontend Mercado Pago: a página `https://www.lcv.dev/sponsor` carrega MercadoPago.js V2 e renderiza Card Payment Brick com Secure Fields.
- Backend principal: `POST /api/orders` cria uma order com `Order.create` da SDK oficial `mercadopago@2.12.0`, cartão tokenizado, item categorizado e 3DS por risco.
- Fallback Checkout Pro: `POST /api/preferences` permanece bloqueado com `410 Gone`; a integração ativa é somente Checkout Transparente + Orders API.
- O custom domain `sponsor-motor.lcv.app.br` fica declarado em `wrangler.json` como `custom_domain: true`; o token de deploy precisa manter permissão de gerenciamento de Workers/Custom Domains na zona `lcv.app.br`.

## Rotas

- `GET /api/health`
- `GET /api/config`
- `GET /api/projects`
- `POST /api/orders`
- `POST /api/preferences` retorna `410 Gone` para impedir mistura com Checkout Pro.
- `GET /api/status/:externalReference`
- `POST /api/webhooks/mercadopago`

## Webhooks Mercado Pago

O endpoint `POST /api/webhooks/mercadopago` valida `x-signature`/`x-request-id`, registra todos os eventos em `sponsor_payment_events` e processa de forma específica os tópicos habilitados no painel Mercado Pago:

- Pagamentos: `payment`
- Order (Mercado Pago): `order`, `orders`
- Alertas de fraude: `stop_delivery_op_wh`, `delivery_cancellation`
- Card Updater: `topic_card_id_wh`, `automatic-payments`
- Vinculação de aplicações: `mp-connect`
- Reclamações: `topic_claims_integration_wh`, `claim`
- Contestações: `topic_chargebacks_wh`, `chargeback`
- Envios: `shipment`, `shipments`
- Planos e assinaturas: `subscription_authorized_payment`, `subscription_preapproval`, `subscription_preapproval_plan`
- Delivery: `delivery`
- Pedidos comerciais: `topic_merchant_order_wh`, `merchant_order`
- Integrações Point: `point_integration_wh`
- Wallet Connect: `wallet_connect`
- Self Service: `self_service`

## Desenvolvimento

```powershell
npm ci
npm run check
```

## Qualidade da integração Mercado Pago

O checklist operacional fica em [`docs/mercadopago-integration-quality.md`](docs/mercadopago-integration-quality.md).

Resumo dos pontos críticos preservados:

- Orders API pura: `POST /api/preferences` segue bloqueado com `410 Gone`.
- Card Payment Brick/Secure Fields: a LCV não recebe número, validade nem CVV.
- SDK oficial no backend: criação/consulta de orders usam `mercadopago`.
- Idempotência: cada tentativa usa `X-Idempotency-Key` único derivado da `external_reference`.
- 3DS: `config.online.transaction_security.validation=on_fraud_risk`, `liability_shift=required` e Challenge lido em `transactions.payments[i].payment_method.transaction_security.url`.
- Fallback de status: se o webhook demorar, `/api/status/:externalReference` consulta a Orders API server-side sem expor credenciais.
- Logs internos: eventos de criação, webhook e fallback são registrados sem PII.

## Deploy

O workflow `Deploy` injeta o `D1_DATABASE_ID` do GitHub Secret, aplica migrations remotas no `bigdata_db` e publica o Worker no Cloudflare.

## Segurança

- O Access Token Mercado Pago fica somente no Cloudflare Secrets Store.
- A Public Key é exposta por `/api/config` para inicializar MercadoPago.js V2 no frontend.
- O webhook valida `x-signature` e `x-request-id` com HMAC SHA-256 antes de processar eventos `order` ou `payment`.
- Dados de pagador são armazenados apenas como hash SHA-256.
- Dados de cartão são capturados exclusivamente pelos Secure Fields do Card Payment Brick; `sponsor-motor` recebe apenas token transitório.
- `items.category_id` é enviado como `services` para melhorar sinais de aprovação do Mercado Pago em serviços digitais.
- Orders usam `config.online.transaction_security.validation=on_fraud_risk` e `liability_shift=required` para 3DS conforme risco.
- Orders enviam `payer.first_name`, `payer.last_name`, `payer.phone` quando informado, `payer.address`, `shipment.address` e `additional_info` antifraude aceito pela Orders API para melhorar a medição de qualidade sem persistir PII em claro.
- O pagamento é considerado confirmado apenas após webhook/consulta server-side ao Mercado Pago.

## Links

- Sponsor page: <https://www.lcv.dev/sponsor>
- Repository: <https://github.com/LCV-Ideas-Software/sponsor-motor>
- Sponsorship: <https://www.lcv.dev/sponsor>

## Licença

AGPL-3.0-or-later.
