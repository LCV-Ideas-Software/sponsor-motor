# Third-Party Components

Direct dependencies declared by this repository, maintained against its
manifest and npm lockfile. This is not an automatically generated or exhaustive
Worker-bundle report; dependency changes require a new inventory review.

| Component                 | Version       | License           | Scope       | Source                                                                                          |
| ------------------------- | ------------- | ----------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| hono                      | ^4.13.7       | MIT               | runtime     | https://www.npmjs.com/package/hono                                                              |
| mercadopago               | 3.6.0         | MIT               | runtime     | https://github.com/mercadopago/sdk-nodejs/blob/c8da864cd370d179ad10e182e4793510d6d03bfe/LICENSE |
| zod                       | ^4.5.4        | MIT               | runtime     | https://www.npmjs.com/package/zod                                                               |
| @biomejs/biome            | ^2.5.12       | MIT OR Apache-2.0 | development | https://www.npmjs.com/package/@biomejs/biome                                                    |
| @cloudflare/workers-types | ^5.20260901.1 | MIT OR Apache-2.0 | development | https://www.npmjs.com/package/@cloudflare/workers-types                                         |
| prettier                  | ^3.9.6        | MIT               | development | https://www.npmjs.com/package/prettier                                                          |
| typescript                | ^7.0.2        | Apache-2.0        | development | https://www.npmjs.com/package/typescript                                                        |
| vitest                    | ^4.1.11       | MIT               | development | https://www.npmjs.com/package/vitest                                                            |
| wrangler                  | ^4.127.1      | MIT OR Apache-2.0 | development | https://www.npmjs.com/package/wrangler                                                          |

## Provenance notes

- `mercadopago@3.6.0`: the package metadata omits the `license` field. The
  package is nevertheless distributed under MIT: `package-lock.json` resolves
  the npm tarball with SRI
  `sha512-Dk47c/bgRPdbMPcRvopitgZq4jOujMfeMf/msWNr942QQ4p+CDBhhov+059UWhsoyGjdizzJaZeyveApoEgDBg==`,
  which matches the official registry metadata. `npm ci` installs `LICENSE`
  (SHA-256
  `b254eee4c4a6d2343cde112cb1ccd5af259ec6788a04332dcdaa1cadf1193ba4`),
  byte-identical to the upstream MIT license at commit
  `c8da864cd370d179ad10e182e4793510d6d03bfe`. Both the npm `gitHead` and the
  Git tag `3.6.0` resolve to that commit at this review. The earlier `3.4.0`
  assessment remains recorded in [Discussion #217](https://github.com/LCV-Ideas-Software/sponsor-motor/discussions/217).
- The existing development-toolchain override selects `sharp@0.35.4`; its
  platform packages use the corresponding `@img` releases and libvips `1.3.3`.
  This does not change the three direct payment-runtime dependencies.
