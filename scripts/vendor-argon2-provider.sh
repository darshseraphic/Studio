#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

command -v npm >/dev/null 2>&1 || {
  echo "npm is required to vendor hash-wasm@4.12.0" >&2
  exit 1
}

cd "$TMP_DIR"
npm pack hash-wasm@4.12.0 >/dev/null
tar -xzf hash-wasm-4.12.0.tgz
install -D -m 0644 package/dist/argon2.umd.min.js "$ROOT_DIR/vendor/argon2.umd.min.js"
install -D -m 0644 package/LICENSE "$ROOT_DIR/vendor/hash-wasm-LICENSE"

printf 'Vendored Argon2id provider to %s/vendor/argon2.umd.min.js\n' "$ROOT_DIR"
