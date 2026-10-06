import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const providerPath = path.join(ROOT, 'vendor', 'argon2.umd.min.js');
const shaPath = path.join(ROOT, 'vendor', 'argon2.umd.min.js.sha256');
const versionPath = path.join(ROOT, 'vendor', 'hash-wasm-version.txt');

if (!fs.existsSync(providerPath)) {
    console.error('vendor-provider-verification: BLOCKED — vendor/argon2.umd.min.js is absent.');
    process.exit(2);
}
if (!fs.existsSync(shaPath) || !fs.existsSync(versionPath)) {
    throw new Error('vendored provider manifests are incomplete');
}
if (fs.readFileSync(versionPath, 'utf8').trim() !== 'hash-wasm@4.12.0') {
    throw new Error('vendored provider version manifest is not hash-wasm@4.12.0');
}
const expected = fs.readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0];
const actual = createHash('sha256').update(fs.readFileSync(providerPath)).digest('hex');
if (!/^[0-9a-f]{64}$/.test(expected) || actual !== expected) {
    throw new Error('vendored provider SHA-256 does not match its recorded manifest');
}
const source = fs.readFileSync(providerPath, 'utf8');
const context = {
    console,
    Uint8Array,
    ArrayBuffer,
    Promise,
    WebAssembly,
    TextEncoder,
    globalThis: null,
};
context.globalThis = context;
vm.createContext(context);
new vm.Script(source, { filename: 'vendor/argon2.umd.min.js' }).runInContext(context);
if (typeof context.hashwasm?.argon2id !== 'function') {
    throw new Error('vendored provider does not expose a callable hashwasm.argon2id');
}
console.log(`vendor-provider-verification: PASS sha256=${actual} provider=local`);
