# Third-Party Components

Direct dependencies declared by this repository:

| Component                 | Version       | License           | Scope       | Source                                                                                          |
| ------------------------- | ------------- | ----------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| hono                      | ^4.13.4       | MIT               | runtime     | https://www.npmjs.com/package/hono                                                              |
| mercadopago               | 3.4.0         | MIT               | runtime     | https://github.com/mercadopago/sdk-nodejs/blob/9a197d3c3f1950930ba6908ed6c2caa821ef78b9/LICENSE |
| zod                       | ^4.4.3        | MIT               | runtime     | https://www.npmjs.com/package/zod                                                               |
| @biomejs/biome            | ^2.5.10       | MIT OR Apache-2.0 | development | https://www.npmjs.com/package/@biomejs/biome                                                    |
| @cloudflare/workers-types | ^5.20260821.1 | MIT OR Apache-2.0 | development | https://www.npmjs.com/package/@cloudflare/workers-types                                         |
| prettier                  | ^3.9.6        | MIT               | development | https://www.npmjs.com/package/prettier                                                          |
| typescript                | ^7.0.2        | Apache-2.0        | development | https://www.npmjs.com/package/typescript                                                        |
| vitest                    | ^4.1.11       | MIT               | development | https://www.npmjs.com/package/vitest                                                            |
| wrangler                  | ^4.125.0      | MIT OR Apache-2.0 | development | https://www.npmjs.com/package/wrangler                                                          |

## Provenance notes

- `mercadopago@3.4.0`: the package metadata omits the `license` field. The
  package is nevertheless distributed under MIT: `package-lock.json` resolves
  the npm tarball with SRI
  `sha512-oMbjrD4Y+JA8tj3Vc4BdGAMGGtL5lqqypUb5WPhIMI2X47R8JlE76W3sQ8kfq0wIROxi5gaxCHT/3Ojm4MjTOA==`,
  which matches the registry artifact. That tarball contains `package/LICENSE`
  (SHA-256
  `b254eee4c4a6d2343cde112cb1ccd5af259ec6788a04332dcdaa1cadf1193ba4`),
  byte-identical to the upstream MIT license at commit
  `9a197d3c3f1950930ba6908ed6c2caa821ef78b9`. Both the npm `gitHead` and the
  immutable Git tag `3.4.0` resolve to that commit.
