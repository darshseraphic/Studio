# Local Argon2id provider

Studio prefers `vendor/argon2.umd.min.js`, which must be the `dist/argon2.umd.min.js`
artifact from exactly `hash-wasm@4.12.0`. The worker verifies that the loaded
provider exports `hashwasm.argon2id` before it is used.

The worker falls back only to the exact pinned `hash-wasm@4.12.0` jsDelivr URL
when the local provider cannot be loaded or fails provider-shape validation.
If the fallback also fails validation, the worker fails closed.

## Required artifact verification

The production build must contain:

```text
vendor/argon2.umd.min.js
vendor/hash-wasm-LICENSE
```

The exact SHA-256 of the verified vendored artifact must be recorded in the
release audit. This build environment did not contain the provider bytes, so
no artifact hash is fabricated here.

## Reproducible vendoring

Run `scripts/vendor-argon2-provider.sh` from a machine with npm registry
access. The script pins `hash-wasm@4.12.0`, extracts only
`package/dist/argon2.umd.min.js`, and copies the MIT license.
