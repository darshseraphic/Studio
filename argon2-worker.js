/*
 * Studio Argon2id worker boundary.
 *
 * The worker isolates the password-derived operation from the UI thread and
 * is terminated after every derivation. The provider is intentionally kept
 * behind this single file so it can be switched to a same-origin bundled
 * implementation without changing session-vault.js.
 */

const LOCAL_PROVIDER = './vendor/argon2.umd.min.js';
const ARGON2_CDN = 'https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/argon2.umd.min.js';
let providerError = null;
let providerSource = 'local';

try {
    importScripts(LOCAL_PROVIDER);
} catch {
    providerSource = 'external-pinned';
    try {
        importScripts(ARGON2_CDN);
    } catch (errorValue) {
        providerError = errorValue instanceof Error
            ? errorValue.message
            : 'Unable to load the Argon2id provider.';
    }
}

self.addEventListener('message', async (event) => {
    const data = event.data || {};
    const requestId = data.requestId ?? null;

    if (!Number.isInteger(data.requestId) || typeof data.password !== 'string' || !(data.salt instanceof ArrayBuffer)) {
        self.postMessage({ requestId, ok: false, error: 'Invalid Argon2id worker request.' });
        return;
    }

    if (providerError) {
        self.postMessage({ requestId, ok: false, error: providerError });
        return;
    }

    try {
        const argon2id = globalThis.hashwasm?.argon2id;
        if (typeof argon2id !== 'function') {
            throw new Error('Argon2id provider is unavailable.');
        }

        const derived = await argon2id({
            password: data.password,
            salt: new Uint8Array(data.salt),
            parallelism: data.parallelism,
            iterations: data.iterations,
            memorySize: data.memorySize,
            hashLength: data.hashLength,
            outputType: 'binary'
        });

        if (!(derived instanceof Uint8Array)) {
            throw new Error('Argon2id provider returned an invalid result.');
        }

        const result = new Uint8Array(derived);
        self.postMessage({ requestId, ok: true, key: result.buffer }, [result.buffer]);
        result.fill(0);
    } catch (errorValue) {
        self.postMessage({
            requestId,
            ok: false,
            error: errorValue instanceof Error ? errorValue.message : 'Argon2id derivation failed.'
        });
    }
});
