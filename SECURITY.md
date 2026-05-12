# Security Policy

## Reporting

Report security issues privately to the repository owner before public disclosure.

**Contact:** alert@lcvmail.com

Include:

- affected component or endpoint
- impact and exploitability
- reproduction steps or proof of concept, if safe to share
- suggested fix, if available

The maintainer will triage as soon as practical. Critical reports that may expose user data, credentials, payment flows, deployment credentials, webhook integrity, or CI/CD integrity are prioritized.

## Payment Scope

`sponsor-motor` never stores card data. MercadoPago.js V2/Card Payment Brick captures card details through secure fields, the Worker receives only the transient token, creates Checkout Transparente orders through the official Mercado Pago SDK, validates webhooks, and stores minimal audit metadata.

## Supported Versions

| Version                 | Supported                                          |
| ----------------------- | -------------------------------------------------- |
| Latest release / `main` | Yes                                                |
| Older releases          | Security updates only when operationally practical |
