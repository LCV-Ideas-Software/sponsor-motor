# Mercado Pago integration quality checklist

This document records the current quality posture of `sponsor-motor` for the Mercado Pago Checkout Transparente + Orders API flow.

## Official references checked

- Integration quality: https://www.mercadopago.com.br/developers/pt/docs/integration-quality
- Orders API create order reference: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/create-order/post
- Orders API 3DS guide: https://docs02.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/integrate-3ds
- Card Payment Brick payment submission: https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/payment-submission
- Card Payment Brick PCI/Secure Fields overview: https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/introduction
- Official Node.js SDK: https://github.com/mercadopago/sdk-nodejs

## 3DS policy

- `sponsor-motor` sends 3DS configuration in the documented Orders API node: `config.online.transaction_security`.
- Default validation is `on_fraud_risk`, because the Mercado Pago Orders 3DS guide recommends this value to balance security and approval.
- `liability_shift` is always `required`, the documented value for 3DS liability shift.
- The challenge URL is read from the documented Orders API response path `transactions.payments[i].payment_method.transaction_security.url`.
- The frontend embeds the returned challenge URL in an iframe and listens for challenge completion before querying server-side status.
- `MERCADOPAGO_3DS_VALIDATION=always` is supported as a strict mode, but production remains pinned to `on_fraud_risk` to avoid silently increasing friction after the app already reached 100% integration quality.
- `never` is intentionally not supported by this Worker because it would disable 3DS and regress the security posture.

## Implemented or preserved

| Item                            | Status                    | Evidence                                                                                                                            |
| ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Orders API only                 | Preserved                 | `POST /api/orders` creates `/v1/orders`; `POST /api/preferences` returns 410.                                                       |
| Secure Fields / PCI             | Preserved                 | `/sponsor` uses MercadoPago.js V2 Card Payment Brick; card number, expiry and CVV are never handled by LCV code.                    |
| Backend SDK                     | Implemented               | Order creation and lookups use the official `mercadopago` Node.js SDK pinned to `2.12.0`.                                           |
| Idempotency                     | Preserved                 | `Order.create` receives `requestOptions.idempotencyKey = externalReference`; the SDK emits `X-Idempotency-Key`.                     |
| 3DS                             | Preserved and hardened    | `validation=on_fraud_risk`, `liability_shift=required`, documented challenge URL path, status polling and webhook processing.        |
| Buyer phone                     | Implemented when provided | Optional phone field is sent as `payer.phone.area_code` + `payer.phone.number`.                                                     |
| Buyer name and address          | Preserved                 | `payer.first_name`, `payer.last_name`, `payer.address` and `shipment.address` remain in the order payload.                          |
| Item category and external code | Preserved                 | `items[0].category_id=services` and `items[0].external_code=projectSlug`.                                                           |
| External reference without PII  | Preserved                 | `sp_<project>_<uuid>` contains project slug + random UUID only.                                                                     |
| Webhook notifications           | Preserved                 | Signed webhooks are validated, all dashboard-enabled topics are acknowledged, and payment/order topics update `sponsor_payments`.   |
| Webhook backup logic            | Implemented               | `/api/status/:externalReference` falls back to official Orders API lookup when local status is non-terminal and an order ID exists. |
| Internal logs                   | Implemented               | Structured logs record order creation, webhook acknowledgement and fallback lookups without PII or card data.                       |
| User response messages          | Preserved and improved    | The public page avoids internal terms such as webhook/order for normal sponsor status text.                                         |
| Unique external reference       | Preserved                 | A new UUID is generated for each order attempt.                                                                                     |

## Not implemented by design

These items are documented by Mercado Pago as good practices, but are not safe to add blindly to the current donation flow.

| Item                                                                                        | Reason                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Priority shipping / shipping receiver fields                                                | The sponsor flow sells no physical product. Sending fake delivery/priority data would lower data quality.                                              |
| `payer.customer_id`, saved cards, zero-value validation and card updater flows              | The app does not store or reuse cards. Adding this would create a new customer-vaulting product and extra LGPD/security scope.                         |
| Pix, Wallet Brick, Checkout Pro, Brand Brick, Status Screen Brick, Review and Confirm Brick | These are product/UX expansions, not safe hardening of the current Card Payment Brick + Orders API flow. They should be planned separately if desired. |

## v01.02.00 additions (2026-05-07)

The items below were originally listed under "Not implemented by design" before the operator pushed for maximum coverage of the Mercado Pago integration quality recommendations. They are now implemented behind opt-in gates (env vars, bearer tokens) so they don't enable themselves automatically.

### Integrator ID (`x-integrator-id`)

`MERCADOPAGO_INTEGRATOR_ID` env var. When defined, it is forwarded to the SDK via `MercadoPagoConfig.options.integratorId`, which the SDK then attaches as the `x-integrator-id` header on every Order create/get/cancel/refund request. Absent env var keeps the integration anonymous (previous behaviour). Operators in the Programa de Parcerias can set the value once in Cloudflare Secrets Store and the worker picks it up on next deploy.

### `additional_info.payer.last_purchase`

`CreateOrderSchema` now accepts an optional `payerLastPurchase` ISO-8601 timestamp. When the caller provides one, it is forwarded to `additional_info.payer.last_purchase` for fraud analysis. The donation flow does not currently surface this on the public form (most sponsors are first-time donors), but the API surface is ready for a future authenticated/repeat-donor path. Empty string and absent field collapse to "no last_purchase" so the SDK does not send a fake value.

### Operator-only refund + cancel endpoints

`POST /api/orders/:orderId/cancel` and `POST /api/orders/:orderId/refund` (full or partial). Both routes are gated by `Authorization: Bearer <SPONSOR_OPERATOR_TOKEN>` with timing-safe comparison. When the worker secret is not configured the routes return 403 (fail-closed); 401 covers missing or mismatched tokens. The SDK helpers (`cancelMercadoPagoOrder`, `refundMercadoPagoOrder`) extract MP error responses consistently and forward the integrator ID when set. Local D1 status is reflected when the returned order matches a row we own.

Operators trigger refunds/cancellations via curl with the secret token; there is no public UI for these actions today.

```bash
# Full refund example (operator-side, not in the public flow):
curl -X POST https://sponsor-motor.lcv.app.br/api/orders/ORD-123/refund \
  -H "Authorization: Bearer $SPONSOR_OPERATOR_TOKEN"

# Partial refund (single transaction):
curl -X POST https://sponsor-motor.lcv.app.br/api/orders/ORD-123/refund \
  -H "Authorization: Bearer $SPONSOR_OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"transactions":[{"id":"txn-1","amount":"5.00"}]}'

# Cancel pre-capture:
curl -X POST https://sponsor-motor.lcv.app.br/api/orders/ORD-123/cancel \
  -H "Authorization: Bearer $SPONSOR_OPERATOR_TOKEN"
```

### Mercado Pago logo on `/sponsor`

The official Mercado Pago logo is now displayed near the "Apoiar agora" panel header on the public form, linking to `mercadopago.com.br`. This addresses the "Logotipos oficiais do Mercado Pago" recommendation while keeping LCV branding dominant in the page chrome.

### v01.02.00 status table

| Item                       | Status before v01.02.00       | Status after v01.02.00                                                                       |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| Integrator ID              | Documented as not configured  | Implemented, env-driven; absent env keeps prior anonymous behaviour                          |
| `payer.last_purchase`      | Not implemented (donation N/A) | Optional API field; only forwarded when caller provides value                                |
| Cancellation API endpoint  | Not exposed                   | `POST /api/orders/:id/cancel` with bearer-token auth; fail-closed when token not configured  |
| Refund API endpoint        | Not exposed                   | `POST /api/orders/:id/refund` (full + partial) with bearer-token auth; fail-closed otherwise |
| Mercado Pago logo on UI    | Not displayed                 | Official MP logo near the payment area on `/sponsor` (links to mercadopago.com.br)           |

## Operational guardrails

- Do not deploy this Worker manually with Wrangler during normal workflow. Deployment is through GitHub Actions.
- Keep webhook URL configured in Mercado Pago as `https://sponsor-motor.lcv.app.br/api/webhooks/mercadopago`.
- Keep all Mercado Pago credentials in Cloudflare Secrets Store.
- If strict 3DS is intentionally required, set `MERCADOPAGO_3DS_VALIDATION=always` in Cloudflare/GitHub configuration and run a fresh approved + declined + challenge test cycle before production sign-off.
