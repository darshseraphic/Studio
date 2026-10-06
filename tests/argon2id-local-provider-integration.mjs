import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const providerPath = path.join(ROOT, 'vendor', 'argon2.umd.min.js');
const workerPath = path.join(ROOT, 'argon2-worker.js');
const shaPath = path.join(ROOT, 'vendor', 'argon2.umd.min.js.sha256');
const vector = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'argon2id-production-vector.json'), 'utf8'));

if (!fs.existsSync(providerPath)) {
    console.error('argon2id-local-provider-integration: BLOCKED — vendor/argon2.umd.min.js is absent.');
    process.exitCode = 2;
    process.exit();
}
if (!fs.existsSync(shaPath)) {
    throw new Error('local provider SHA-256 manifest is absent');
}

const expectedSha256 = fs.readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0];
const providerBytes = fs.readFileSync(providerPath);
const actualSha256 = createHash('sha256').update(providerBytes).digest('hex');
assert.equal(actualSha256, expectedSha256, 'local provider SHA-256 does not match the checked-in manifest');
const providerSource = providerBytes.toString('utf8');
const workerSource = fs.readFileSync(workerPath, 'utf8');
const messages = [];
const listeners = new Map();
let cdnAttempted = false;
const context = {
    console,
    Uint8Array,
    ArrayBuffer,
    Promise,
    setTimeout,
    clearTimeout,
    WebAssembly,
    TextEncoder,
    globalThis: null,
    hashwasm: undefined,
    importScripts(url) {
        if (url !== './vendor/argon2.umd.min.js') {
            cdnAttempted = true;
            throw new Error(`unexpected non-local provider load: ${url}`);
        }
        vm.runInContext(providerSource, context, { filename: 'vendor/argon2.umd.min.js' });
    },
    self: null,
};
context.globalThis = context;
context.self = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    postMessage(message, transferList) { messages.push({ message, transferList }); }
};
vm.createContext(context);
new vm.Script(workerSource, { filename: 'argon2-worker.js' }).runInContext(context);
assert.equal(typeof context.hashwasm?.argon2id, 'function', 'local provider did not expose hashwasm.argon2id');
assert.equal(typeof listeners.get('message'), 'function');

const password = new TextEncoder().encode(vector.password).buffer;
const salt = Uint8Array.from(vector.saltHex.match(/../g).map((x) => Number.parseInt(x, 16))).buffer;
await listeners.get('message')({
    data: {
        requestId: 1,
        password,
        salt,
        includeProvider: true,
        kdf: {
            algorithm: 'Argon2id',
            version: 0x13,
            memorySize: 131072,
            iterations: 4,
            parallelism: 1,
            hashLength: 32,
            outputType: 'binary'
        }
    }
});

const result = messages[0]?.message;
assert.equal(result?.ok, true, result?.error || 'local provider derivation failed');
assert.equal(result.provider, 'local');
assert.equal(cdnAttempted, false, 'CDN provider was attempted during the local-provider test');
const hex = Buffer.from(result.key).toString('hex');
assert.equal(hex, vector.expectedHex, 'local provider Argon2id production vector mismatch');
console.log(`argon2id-local-provider-integration: PASS provider=local sha256=${actualSha256}`);
