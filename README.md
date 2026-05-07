# sponsor-motor

Cloudflare Worker dedicado para processar apoios/doações via Mercado Pago Checkout Transparente com Orders API para a LCV Ideas & Software.

## Status

Stable bootstrap. Current release: **APP v01.01.02**.

## Histórico de versões

| Versão          | Mudanças                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
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
- Backend principal: `POST /api/orders` cria uma order em `/v1/orders` com cartão tokenizado, item categorizado e 3DS por risco.
- Compatibilidade legada: `POST /api/preferences` permanece disponível para Checkout Pro, mas não é usado pela página pública principal.
- O custom domain `sponsor-motor.lcv.app.br` fica declarado em `wrangler.json` como `custom_domain: true`; o token de deploy precisa manter permissão de gerenciamento de Workers/Custom Domains na zona `lcv.app.br`.

## Rotas

- `GET /api/health`
- `GET /api/config`
- `GET /api/projects`
- `POST /api/orders`
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

- O Access Token Mercado Pago fica somente no Cloudflare Secrets Store.
- A Public Key é exposta por `/api/config` para inicializar MercadoPago.js V2 no frontend.
- O webhook valida `x-signature` e `x-request-id` com HMAC SHA-256 antes de processar eventos `order` ou `payment`.
- Dados de pagador são armazenados apenas como hash SHA-256.
- Dados de cartão são capturados exclusivamente pelos Secure Fields do Card Payment Brick; `sponsor-motor` recebe apenas token transitório.
- `items.category_id` é enviado como `services` para melhorar sinais de aprovação do Mercado Pago em serviços digitais.
- Orders usam `config.online.transaction_security.validation=on_fraud_risk` e `liability_shift=required` para 3DS conforme risco.
- O pagamento é considerado confirmado apenas após webhook/consulta server-side ao Mercado Pago.

## Links

- Sponsor page: <https://www.lcv.dev/sponsor>
- Repository: <https://github.com/LCV-Ideas-Software/sponsor-motor>
- Sponsorship: <https://www.lcv.dev/sponsor>

## Licença

AGPL-3.0-or-later.
