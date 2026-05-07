# sponsor-motor

Cloudflare Worker dedicado para criar preferências de apoio/doação via Mercado Pago Checkout Pro para a LCV Ideas & Software.

## Status

Stable bootstrap. Current release: **APP v01.00.00**.

## Histórico de versões

| Versão          | Mudanças                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`v01.00.00`** | **Mercado Pago sponsor backend.** Novo Worker dedicado com Checkout Pro preferences, webhook assinado, auditoria em tabelas `sponsor_*` no `bigdata_db`, Secrets Store bindings e página pública central em `https://www.lcv.dev/sponsor`. |

## Arquitetura

- Página pública: `https://www.lcv.dev/sponsor`.
- API pública: `https://sponsor-motor.lcv.app.br`.
- Banco: `bigdata_db`, com tabelas `sponsor_payments`, `sponsor_payment_events` e `sponsor_rate_limits`.
- Secrets Store: `mp-access-token`, `mercadopago-webhook-secret`, `mercadopago-public-key`.
- O custom domain `sponsor-motor.lcv.app.br` fica declarado em `wrangler.json` como `custom_domain: true`; o token de deploy precisa manter permissão de gerenciamento de Workers/Custom Domains na zona `lcv.app.br`.

## Rotas

- `GET /api/health`
- `GET /api/projects`
- `POST /api/preferences`
- `GET /api/status/:externalReference`
- `POST /api/webhooks/mercadopago`

## Desenvolvimento

```powershell
npm ci
npm run check
```

## Deploy

O workflow `Deploy` injeta o `D1_DATABASE_ID` do GitHub Secret, aplica migrations remotas no `bigdata_db` e publica o Worker no Cloudflare.

## Segurança

- O token Mercado Pago fica somente no Cloudflare Secrets Store.
- O webhook valida `x-signature` e `x-request-id` com HMAC SHA-256 antes de processar eventos.
- Dados de pagador são armazenados apenas como hash SHA-256.
- O pagamento é considerado confirmado apenas após webhook/consulta server-side ao Mercado Pago.

## Links

- Sponsor page: <https://www.lcv.dev/sponsor>
- Repository: <https://github.com/LCV-Ideas-Software/sponsor-motor>
- Sponsorship: <https://www.lcv.dev/sponsor>

## Licença

AGPL-3.0-or-later.
