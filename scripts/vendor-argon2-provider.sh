#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

command -v npm >/dev/null 2>&1 || {
  echo "npm is required to vendor hash-wasm@4.12.0" >&2
  exit 1
}
command -v sha256sum >/dev/null 2>&1 || {
  echo "sha256sum is required to verify the vendored provider" >&2
  exit 1
}

cd "$TMP_DIR"
PACKAGE_TGZ="$(npm pack hash-wasm@4.12.0 --silent)"
[[ "$PACKAGE_TGZ" == "hash-wasm-4.12.0.tgz" ]] || {
  echo "unexpected package archive: $PACKAGE_TGZ" >&2
  exit 1
}

tar -xzf "$PACKAGE_TGZ"
PACKAGE_VERSION="$(node -p "require('./package/package.json').version")"
[[ "$PACKAGE_VERSION" == "4.12.0" ]] || {
  echo "unexpected hash-wasm package version: $PACKAGE_VERSION" >&2
  exit 1
}

PROVIDER_SOURCE="package/dist/argon2.umd.min.js"
[[ -s "$PROVIDER_SOURCE" ]] || {
  echo "missing Argon2 provider artifact: $PROVIDER_SOURCE" >&2
  exit 1
}

install -D -m 0644 "$PROVIDER_SOURCE" "$ROOT_DIR/vendor/argon2.umd.min.js"
install -D -m 0644 package/LICENSE "$ROOT_DIR/vendor/hash-wasm-LICENSE"
printf 'hash-wasm@4.12.0\n' > "$ROOT_DIR/vendor/hash-wasm-version.txt"
sha256sum "$ROOT_DIR/vendor/argon2.umd.min.js" | awk '{print $1}' > "$ROOT_DIR/vendor/argon2.umd.min.js.sha256"

printf 'Vendored hash-wasm@4.12.0 Argon2id provider to %s/vendor/argon2.umd.min.js\n' "$ROOT_DIR"
printf 'SHA-256: %s\n' "$(cat "$ROOT_DIR/vendor/argon2.umd.min.js.sha256")"
