/*
 * Studio Argon2id worker boundary.
 *
 * Security properties:
 * - Runs Argon2id v1.3 in a dedicated Worker which is terminated after each derivation.
 * - Enforces the production KDF policy in this boundary; callers cannot select weaker parameters.
 * - Uses only the same-origin vendored hash-wasm@4.12.0 provider and verifies the exported API.
 * - Fails closed if the local provider cannot be loaded or does not expose hashwasm.argon2id.
 * - Never transfers the worker's original provider result. A copy is transferred after the worker
 *   wipes the original result, leaving the worker without a retained sensitive result buffer.
 * - Password and salt bytes are explicitly wiped in the worker after the provider call.
 */

const LOCAL_PROVIDER = './vendor/argon2.umd.min.js';
const PASSWORD_MIN_BYTES = 8;
const PASSWORD_MAX_BYTES = 32;
const ARGON2_POLICY = Object.freeze({
    algorithm: 'Argon2id',
    version: 0x13,
    memorySize: 131072, // KiB = 128 MiB
    iterations: 4,
    parallelism: 1,
    hashLength: 32,
    outputType: 'binary',
    saltLength: 32
});

let providerError = null;
let providerSource = 'unavailable';

function providerIsValid() {
    try {
        return typeof globalThis.hashwasm?.argon2id === 'function';
    } catch {
        return false;
    }
}

function loadProvider() {
    try {
        importScripts(LOCAL_PROVIDER);
    } catch (errorValue) {
        providerError = errorValue instanceof Error
            ? errorValue.message
            : 'Unable to load the local Argon2id provider.';
        providerSource = 'unavailable';
        return;
    }

    if (!providerIsValid()) {
        providerError = 'Local Argon2id provider did not expose hashwasm.argon2id.';
        providerSource = 'unavailable';
        return;
    }

    providerSource = 'local';
}

function requestMatchesPolicy(data) {
    const kdf = data?.kdf;
    return Number.isInteger(data?.requestId)
        && kdf
        && kdf.algorithm === ARGON2_POLICY.algorithm
        && kdf.version === ARGON2_POLICY.version
        && kdf.memorySize === ARGON2_POLICY.memorySize
        && kdf.iterations === ARGON2_POLICY.iterations
        && kdf.parallelism === ARGON2_POLICY.parallelism
        && kdf.hashLength === ARGON2_POLICY.hashLength
        && kdf.outputType === ARGON2_POLICY.outputType
        && data.password instanceof ArrayBuffer
        && data.salt instanceof ArrayBuffer;
}

loadProvider();

self.addEventListener('message', async (event) => {
    const data = event.data || {};
    const requestId = data.requestId ?? null;
    let passwordBytes = data.password instanceof ArrayBuffer ? new Uint8Array(data.password) : null;
    let saltBytes = data.salt instanceof ArrayBuffer ? new Uint8Array(data.salt) : null;
    let providerResult = null;
    let handoff = null;
    let handoffTransferred = false;

    try {
        if (!requestMatchesPolicy(data)) {
            self.postMessage({ requestId, ok: false, error: 'Argon2id request violates the production security policy.' });
            return;
        }

        if (passwordBytes.length < PASSWORD_MIN_BYTES || passwordBytes.length > PASSWORD_MAX_BYTES ||
            passwordBytes.some((value) => value < 0x20 || value > 0x7e)) {
            self.postMessage({ requestId, ok: false, error: 'Argon2id password encoding violates the session password policy.' });
            return;
        }

        if (saltBytes.byteLength !== ARGON2_POLICY.saltLength) {
            self.postMessage({ requestId, ok: false, error: 'Argon2id salt length is invalid.' });
            return;
        }

        if (providerError || !providerIsValid()) {
            self.postMessage({
                requestId,
                ok: false,
                error: providerError || 'Argon2id provider is unavailable.'
            });
            return;
        }

        providerResult = await globalThis.hashwasm.argon2id({
            password: passwordBytes,
            salt: saltBytes,
            parallelism: ARGON2_POLICY.parallelism,
            iterations: ARGON2_POLICY.iterations,
            memorySize: ARGON2_POLICY.memorySize,
            hashLength: ARGON2_POLICY.hashLength,
            outputType: ARGON2_POLICY.outputType
        });

        if (!(providerResult instanceof Uint8Array) || providerResult.length !== ARGON2_POLICY.hashLength) {
            throw new Error('Argon2id provider returned an invalid result.');
        }

        // Keep the provider's result out of the transferable buffer. Wipe the worker-owned
        // provider result first, then transfer a separate copy whose ArrayBuffer is detached
        // from this worker as soon as postMessage succeeds.
        handoff = providerResult.slice();
        providerResult.fill(0);
        providerResult = null;

        const message = { requestId, ok: true, key: handoff.buffer };
        if (data.includeProvider === true) message.provider = providerSource;
        try {
            self.postMessage(message, [handoff.buffer]);
            handoffTransferred = true;
        } finally {
            // Whether transfer succeeded or failed, the worker must not retain a live reference.
            // If postMessage detached the buffer before throwing, byteLength is already zero.
            handoff = null;
        }
    } catch (errorValue) {
        self.postMessage({
            requestId,
            ok: false,
            error: errorValue instanceof Error ? errorValue.message : 'Argon2id derivation failed.'
        });
    } finally {
        if (passwordBytes) passwordBytes.fill(0);
        if (saltBytes) saltBytes.fill(0);
        if (providerResult) providerResult.fill(0);
        if (handoff && !handoffTransferred && handoff.byteLength > 0) handoff.fill(0);
    }
});
