# Security Policy

## Reporting

Report security issues privately to the repository owner before public disclosure.

## Payment Scope

`sponsor-motor` never stores card data. MercadoPago.js V2/Card Payment Brick captures card details through secure fields, the Worker receives only the transient token, creates Checkout Transparente orders through the official Mercado Pago SDK, validates webhooks, and stores minimal audit metadata.
