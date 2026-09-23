# Third-Party Components

Direct dependencies declared by this repository, maintained against its
manifest and npm lockfile. This is not an automatically generated or exhaustive
Worker-bundle report; dependency changes require a new inventory review.

| Component                 | Version       | License           | Scope       | Source                                                                                          |
| ------------------------- | ------------- | ----------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| hono                      | ^4.13.7       | MIT               | runtime     | https://www.npmjs.com/package/hono                                                              |
| mercadopago               | 3.6.1         | MIT               | runtime     | https://github.com/mercadopago/sdk-nodejs/blob/59a1f91e7c072cbda4e394267b24e7383ea3b1f3/LICENSE |
| zod                       | ^4.5.4        | MIT               | runtime     | https://www.npmjs.com/package/zod                                                               |
| @biomejs/biome            | ^2.5.12       | MIT OR Apache-2.0 | development | https://www.npmjs.com/package/@biomejs/biome                                                    |
| @cloudflare/workers-types | ^5.20260907.1 | MIT OR Apache-2.0 | development | https://www.npmjs.com/package/@cloudflare/workers-types                                         |
| prettier                  | ^3.9.6        | MIT               | development | https://www.npmjs.com/package/prettier                                                          |
| typescript                | ^7.0.2        | Apache-2.0        | development | https://www.npmjs.com/package/typescript                                                        |
| vitest                    | ^5.0.0        | MIT               | development | https://www.npmjs.com/package/vitest                                                            |
| wrangler                  | 4.137.0       | MIT OR Apache-2.0 | development | https://www.npmjs.com/package/wrangler                                                          |

## Provenance notes

- `mercadopago@3.6.1`: the package metadata omits the `license` field. The
  package is nevertheless distributed under MIT: `package-lock.json` resolves
  the npm tarball with SRI
  `sha512-JFgKCSRHMxkS1p12VMIcpI/Zki739J+5lbpl7PB0O8WHaFl4SFKQnm9paX/gqBQeh211Ozc498D49Fbe3U1jEw==`,
  which matches the official registry metadata. `npm ci` installs `LICENSE`
  (SHA-256
  `b254eee4c4a6d2343cde112cb1ccd5af259ec6788a04332dcdaa1cadf1193ba4`),
  byte-identical to the upstream MIT license at commit
  `59a1f91e7c072cbda4e394267b24e7383ea3b1f3`. Both the npm `gitHead` and the
  Git tag `3.6.1` resolve to that commit at this review. That LICENSE hash is
  the same one recorded when `3.6.0` was reviewed: the licence text did not
  change across the bump, only the version identifier did. The earlier `3.4.0`
  assessment remains recorded in [Discussion #217](https://github.com/LCV-Ideas-Software/sponsor-motor/discussions/217).
- The official Miniflare dependency selects `sharp@0.35.4`; its
  platform packages use the corresponding `@img` releases and libvips `1.3.3`.
  This does not change the three direct payment-runtime dependencies.

## Distributed license texts

These three packages are bundled into the deployed Worker, so their notices
travel with the software and are reproduced in full below. The development
dependencies in the table above are build and test tooling: they are not part
of the deployed bundle and no notice obligation arises from them.

Each text was read from the artifact `npm ci` installed at the version the
lockfile resolves, not from a manifest field or a registry page.

### hono 4.13.7

`LICENSE`, 1100 bytes, SHA-256 `a6ab98e5c77b9070c443eaff2ff81034a6f8cc05a7524d5098eb0f24defa0115`.

```
MIT License

Copyright (c) 2021 - present, Yusuke Wada and Hono contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### mercadopago 3.6.1

`LICENSE`, 1078 bytes, SHA-256 `b254eee4c4a6d2343cde112cb1ccd5af259ec6788a04332dcdaa1cadf1193ba4`.

```
MIT License

Copyright (c) 2021 MercadoPago Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### zod 4.6.4

`LICENSE`, 1071 bytes, SHA-256 `3f1189b28e3866e0d979968d466b78f813f76827cfdca1fbb124cc0a5c8841f8`.

```
MIT License

Copyright (c) 2025 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
