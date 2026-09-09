# Contributing

This repository is maintained by LCV Ideas & Software. Contributions should preserve the security, automation, deployment, and internal-version posture of sponsor-motor.

## Baseline

- Keep pull requests focused and small enough to review safely.
- Do not commit secrets, tokens, private keys, credentials, generated build output, or local environment files.
- Keep GitHub Actions least-privilege by default and grant write permissions only at the job that needs them.
- Pin third-party GitHub Actions to immutable commit SHAs.
- Preserve Dependabot automation. Do not add required reviewers or CODEOWNERS rules that force manual approval for routine Dependabot updates.
- Prefer squash merges for automation and keep the default branch as `main`.

## Validation

Before proposing publication, run `npm run check`, `npm run biome`,
`npm run format:public:check` and
`npm exec -- wrangler deploy --dry-run --strict`. The product suite includes
payment, webhook, storage and admin CLI tests; do not exercise production
payments or remote D1 migrations as tests.

Present the complete local change report for operator approval before any
commit, push or PR. GitHub settings changes require separate prior approval.
For security-sensitive changes, retain private evidence under `SECURITY.md`.

## Inbound rights

The project remains licensed under AGPL-3.0-or-later. Opening a contribution
does not transfer copyright. Material not demonstrably owned by LCV Ideas &
Software requires a separately executed written inbound license or assignment,
verified before merge, as described in [INBOUND.md](./INBOUND.md).
