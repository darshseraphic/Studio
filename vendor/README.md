# Local Argon2id provider

Studio prefers `vendor/argon2.umd.min.js` for Argon2id session derivation. The
file should be the pinned `hash-wasm@4.12.0` `dist/argon2.umd.min.js` build.

When the vendor file exists, Studio does not contact jsDelivr for Argon2id.
The worker retains the pinned CDN as a migration fallback so the current
secure-session build remains functional before the vendor asset is added.

Recommended vendoring flow from a trusted development machine:

```bash
npm pack hash-wasm@4.12.0
mkdir -p vendor-tmp
```

Extract the resulting `hash-wasm-4.12.0.tgz` and copy only
`package/dist/argon2.umd.min.js` to this directory as `argon2.umd.min.js`.
Do not add the complete npm package; Studio only needs the individual Argon2
bundle. Keep the MIT license notice with the vendored artifact.
