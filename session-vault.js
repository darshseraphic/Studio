const STORAGE_KEY = 'studio_secure_session_v1';
const LEGACY_TOKEN_KEY = 'user';
const LEGACY_USERNAME_KEY = 'github_username';
const SESSION_AAD = new TextEncoder().encode('studio-github-session-v1');

const ARGON2_CONFIG = Object.freeze({
    version: 0x13, // Argon2 v1.3
    algorithm: 'Argon2id',
    memorySize: 131072, // KiB = 128 MiB
    iterations: 4,
    parallelism: 1,
    hashLength: 32,
    outputType: 'binary',
    saltLength: 32
});
const ARGON2_DERIVATION_TIMEOUT_MS = 120000;

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 32;
const ARGON2_WORKER_PATH = './argon2-worker.js';

let unlockedSession = null;
let unlockedSessionKey = null;
let unlockedSessionEnvelope = null;
let argon2RequestCounter = 0;

function assertSecureContext() {
    if (!window.isSecureContext || !window.crypto?.subtle) {
        throw new Error('secure browser cryptography requires HTTPS or a trusted localhost context.');
    }
}

function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    return btoa(binary);
}

function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function validateSessionPassword(password) {
    if (typeof password !== 'string') {
        throw new Error('session password must be text.');
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        throw new Error(`session password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`);
    }
    for (let i = 0; i < password.length; i += 1) {
        const code = password.charCodeAt(i);
        if (code < 0x20 || code > 0x7e) {
            throw new Error('session password must contain printable ASCII characters only.');
        }
    }
}

function requestPassword({ mode = 'unlock' } = {}) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'studio-session-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'studio-session-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const title = document.createElement('h2');
        title.textContent = mode === 'create' ? 'SECURE SESSION' : 'UNLOCK SESSION';

        const description = document.createElement('p');
        description.textContent = mode === 'create'
            ? 'Set a temporary Studio password. It is never stored; only the encrypted session is persisted locally.'
            : 'Enter the temporary Studio password to unlock the encrypted GitHub session.';

        const input = document.createElement('input');
        input.className = 'studio-session-field';
        input.type = 'password';
        input.autocomplete = mode === 'create' ? 'new-password' : 'current-password';
        input.autocapitalize = 'off';
        input.spellcheck = false;
        input.maxLength = PASSWORD_MAX;
        input.placeholder = 'ASCII password';
        input.setAttribute('aria-label', mode === 'create' ? 'Temporary Studio session password' : 'Studio session password');

        const confirmInput = document.createElement('input');
        confirmInput.className = 'studio-session-field';
        confirmInput.type = 'password';
        confirmInput.autocomplete = 'new-password';
        confirmInput.autocapitalize = 'off';
        confirmInput.spellcheck = false;
        confirmInput.maxLength = PASSWORD_MAX;
        confirmInput.placeholder = 'Confirm password';
        confirmInput.setAttribute('aria-label', 'Confirm temporary Studio session password');
        confirmInput.style.marginTop = '10px';
        confirmInput.hidden = mode !== 'create';

        const error = document.createElement('div');
        error.className = 'studio-session-error';
        error.setAttribute('aria-live', 'polite');

        const actions = document.createElement('div');
        actions.className = 'studio-session-actions';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'CANCEL';

        const submit = document.createElement('button');
        submit.type = 'button';
        submit.textContent = mode === 'create' ? 'SAVE SESSION' : 'UNLOCK';

        actions.append(cancel, submit);
        dialog.append(title, description, input, confirmInput, error, actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        let settled = false;
        const close = (value) => {
            if (settled) return;
            settled = true;
            input.value = '';
            confirmInput.value = '';
            backdrop.remove();
            resolve(value);
        };

        const fail = (message, focusTarget = input) => {
            error.textContent = message;
            focusTarget.focus();
            focusTarget.select();
        };

        const submitForm = () => {
            try {
                const password = input.value;
                validateSessionPassword(password);

                if (mode === 'create') {
                    const confirmation = confirmInput.value;
                    validateSessionPassword(confirmation);
                    if (confirmation !== password) {
                        fail('Password confirmation did not match.', confirmInput);
                        return;
                    }
                }

                close(password);
            } catch (errorValue) {
                fail(errorValue instanceof Error ? errorValue.message : 'Invalid session password.');
            }
        };

        cancel.addEventListener('click', () => close(null));
        submit.addEventListener('click', submitForm);

        const handleKeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitForm();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                close(null);
            }
        };

        input.addEventListener('keydown', handleKeydown);
        confirmInput.addEventListener('keydown', handleKeydown);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) close(null);
        });

        input.focus();
    });
}

function createArgon2Worker() {
    if (typeof Worker !== 'function') {
        throw new Error('Studio requires Web Worker support for the Argon2id session provider.');
    }
    return new Worker(ARGON2_WORKER_PATH, { name: 'studio-argon2' });
}

async function deriveKeyBytes(password, salt) {
    assertSecureContext();
    validateSessionPassword(password);

    const worker = createArgon2Worker();
    const requestId = ++argon2RequestCounter;
    const passwordBytes = new TextEncoder().encode(password);
    const saltCopy = new Uint8Array(salt);

    return new Promise((resolve, reject) => {
        let settled = false;
        let buffersTransferred = false;
        const timeoutId = window.setTimeout(() => {
            fail(new Error('Argon2id derivation timed out.'));
        }, ARGON2_DERIVATION_TIMEOUT_MS);
        const cleanup = () => {
            window.clearTimeout(timeoutId);
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
        };
        const fail = (errorValue) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (!buffersTransferred) {
                if (passwordBytes.byteLength > 0) passwordBytes.fill(0);
                if (saltCopy.byteLength > 0) saltCopy.fill(0);
            }
            try { worker.terminate(); } catch { /* best-effort cleanup */ }
            reject(errorValue instanceof Error ? errorValue : new Error('Argon2id worker failed.'));
        };
        const handleMessage = (event) => {
            const data = event.data || {};
            if (data.requestId !== requestId) return;
            if (data.ok !== true || !(data.key instanceof ArrayBuffer)) {
                fail(new Error(typeof data.error === 'string' ? data.error : 'Argon2id derivation failed.'));
                return;
            }

            settled = true;
            cleanup();
            try { worker.terminate(); } catch { /* best-effort cleanup */ }

            const derived = new Uint8Array(data.key);
            if (derived.length !== ARGON2_CONFIG.hashLength) {
                derived.fill(0);
                reject(new Error('Argon2id produced an invalid key length.'));
                return;
            }
            resolve(derived);
        };
        const handleError = (event) => {
            fail(new Error(event?.message || 'Argon2id worker failed.'));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);
        try {
            worker.postMessage({
                requestId,
                password: passwordBytes.buffer,
                salt: saltCopy.buffer,
                includeProvider: false,
                kdf: {
                    algorithm: ARGON2_CONFIG.algorithm,
                    version: ARGON2_CONFIG.version,
                    memorySize: ARGON2_CONFIG.memorySize,
                    iterations: ARGON2_CONFIG.iterations,
                    parallelism: ARGON2_CONFIG.parallelism,
                    hashLength: ARGON2_CONFIG.hashLength,
                    outputType: ARGON2_CONFIG.outputType
                }
            }, [passwordBytes.buffer, saltCopy.buffer]);
            buffersTransferred = true;
        } catch (errorValue) {
            fail(errorValue);
        }
    });
}

async function importAesKey(rawKey) {
    return crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptSessionWithKey(session, key, kdfMetadata) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(session));
    try {
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv,
                additionalData: SESSION_AAD,
                tagLength: 128
            },
            key,
            plaintext
        );

        return {
            version: 1,
            kdf: { ...kdfMetadata },
            cipher: {
                name: 'AES-GCM-256',
                iv: bytesToBase64(iv),
                tagLength: 128,
                aad: bytesToBase64(SESSION_AAD),
                ciphertext: bytesToBase64(new Uint8Array(ciphertext))
            }
        };
    } finally {
        plaintext.fill(0);
    }
}

async function deriveSessionKey(password, salt) {
    const rawKey = await deriveKeyBytes(password, salt);
    try {
        return await importAesKey(rawKey);
    } finally {
        rawKey.fill(0);
    }
}

export async function encryptSession(session, password) {
    assertSecureContext();
    validateSessionPassword(password);

    const salt = crypto.getRandomValues(new Uint8Array(32));
    try {
        const key = await deriveSessionKey(password, salt);
        const kdfMetadata = {
        name: ARGON2_CONFIG.algorithm,
        version: ARGON2_CONFIG.version,
        memoryKiB: ARGON2_CONFIG.memorySize,
        iterations: ARGON2_CONFIG.iterations,
        parallelism: ARGON2_CONFIG.parallelism,
        hashLength: ARGON2_CONFIG.hashLength,
        salt: bytesToBase64(salt)
    };

        return await encryptSessionWithKey(session, key, kdfMetadata);
    } finally {
        salt.fill(0);
    }
}

export async function decryptSession(envelope, password) {
    assertSecureContext();
    validateSessionPassword(password);

    if (!envelope || envelope.version !== 1 || envelope.kdf?.name !== ARGON2_CONFIG.algorithm || envelope.cipher?.name !== 'AES-GCM-256') {
        throw new Error('unsupported encrypted session format.');
    }

    const storedArgonVersion = envelope.kdf.version === undefined ? ARGON2_CONFIG.version : envelope.kdf.version;
    if (storedArgonVersion !== ARGON2_CONFIG.version ||
        envelope.kdf.memoryKiB !== ARGON2_CONFIG.memorySize ||
        envelope.kdf.iterations !== ARGON2_CONFIG.iterations ||
        envelope.kdf.parallelism !== ARGON2_CONFIG.parallelism ||
        envelope.kdf.hashLength !== ARGON2_CONFIG.hashLength ||
        envelope.cipher.tagLength !== 128) {
        throw new Error('stored session cryptographic parameters do not match the active security policy.');
    }

    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    const ciphertext = base64ToBytes(envelope.cipher.ciphertext);
    if (salt.length !== 32 || iv.length !== 12 || ciphertext.length < 16) {
        throw new Error('stored session envelope contains invalid binary parameters.');
    }

    let key = null;
    let plaintext = null;
    try {
        key = await deriveSessionKey(password, salt);
        plaintext = new Uint8Array(await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv,
                additionalData: SESSION_AAD,
                tagLength: 128
            },
            key,
            ciphertext
        ));
        const session = JSON.parse(new TextDecoder().decode(plaintext));

        if (!session || typeof session.token !== 'string' || typeof session.githubUsername !== 'string') {
            throw new Error('decrypted session payload is invalid.');
        }
        return { session, key };
    } catch (errorValue) {
        if (errorValue instanceof SyntaxError) {
            throw new Error('decrypted session payload is invalid.');
        }
        throw new Error('unable to unlock the session with that password.');
    } finally {
        if (plaintext) plaintext.fill(0);
        if (salt.byteLength > 0) salt.fill(0);
        if (iv.byteLength > 0) iv.fill(0);
        if (ciphertext.byteLength > 0) ciphertext.fill(0);
    }
}

function createSessionId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function clearLegacyGithubStorage() {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USERNAME_KEY);
    localStorage.removeItem('repository');
    localStorage.removeItem('github_active');
}

export function hasLegacyGithubSession() {
    return !!(localStorage.getItem(LEGACY_TOKEN_KEY) && localStorage.getItem(LEGACY_USERNAME_KEY));
}

export async function migrateLegacyGithubSession(identityVerifier = null) {
    if (hasStoredSession() || !hasLegacyGithubSession()) return getUnlockedSession();

    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    const legacyUsername = localStorage.getItem(LEGACY_USERNAME_KEY);
    const legacyRepository = localStorage.getItem('repository') || '';
    const password = await requestNewSessionPassword();

    if (password === null) {
        clearLegacyGithubStorage();
        return null;
    }

    let verifiedIdentity = null;
    try {
        if (typeof identityVerifier !== 'function') {
            throw new Error('legacy session migration requires verified GitHub identity metadata.');
        }
        verifiedIdentity = await identityVerifier(legacyToken, legacyUsername);
        if (!verifiedIdentity || typeof verifiedIdentity.githubUserId !== 'string' || !verifiedIdentity.githubUserId ||
            typeof verifiedIdentity.githubUsername !== 'string' || !verifiedIdentity.githubUsername) {
            throw new Error('legacy session identity verification returned incomplete metadata.');
        }
        if (verifiedIdentity.githubUsername !== legacyUsername) {
            throw new Error('legacy session identity verification did not match the stored username.');
        }

        const session = {
            token: legacyToken,
            githubUserId: verifiedIdentity.githubUserId,
            githubUsername: verifiedIdentity.githubUsername,
            sessionId: createSessionId(),
            repository: legacyRepository,
            githubActive: true,
            createdAt: new Date().toISOString(),
            migrated: true
        };

        await saveSession(session, password);
        clearLegacyGithubStorage();
        return getUnlockedSession();
    } catch (errorValue) {
        clearLegacyGithubStorage();
        throw new Error(`secure session migration failed: ${errorValue instanceof Error ? errorValue.message : 'unknown cryptographic failure'}`);
    }
}

export async function saveSession(session, password) {
    assertSecureContext();
    validateSessionPassword(password);

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const rawKey = await deriveKeyBytes(password, salt);
    try {
        const key = await importAesKey(rawKey);
        const kdfMetadata = {
            name: ARGON2_CONFIG.algorithm,
            version: ARGON2_CONFIG.version,
            memoryKiB: ARGON2_CONFIG.memorySize,
            iterations: ARGON2_CONFIG.iterations,
            parallelism: ARGON2_CONFIG.parallelism,
            hashLength: ARGON2_CONFIG.hashLength,
            salt: bytesToBase64(salt)
        };
        const envelope = await encryptSessionWithKey(session, key, kdfMetadata);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
        unlockedSession = structuredClone(session);
        unlockedSessionKey = key;
        unlockedSessionEnvelope = envelope;
        return getUnlockedSession();
    } finally {
        rawKey.fill(0);
        salt.fill(0);
    }
}

async function persistUnlockedSession() {
    if (!unlockedSession || !unlockedSessionKey || !unlockedSessionEnvelope) {
        throw new Error('encrypted session is locked or unavailable.');
    }

    const envelope = await encryptSessionWithKey(
        unlockedSession,
        unlockedSessionKey,
        unlockedSessionEnvelope.kdf
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    unlockedSessionEnvelope = envelope;
    return getUnlockedSession();
}

async function updateWorkspaceSession(patch) {
    if (!unlockedSession) {
        throw new Error('encrypted session is locked. unlock the session before updating its state.');
    }
    unlockedSession = {
        ...unlockedSession,
        repository: typeof patch.repository === 'string' ? patch.repository : unlockedSession.repository || '',
        githubActive: patch.githubActive === undefined ? unlockedSession.githubActive === true : !!patch.githubActive
    };
    return await persistUnlockedSession();
}

export function getWorkspaceStateSync() {
    if (!unlockedSession) {
        return { repository: '', githubActive: false };
    }
    return {
        repository: typeof unlockedSession.repository === 'string' ? unlockedSession.repository : '',
        githubActive: unlockedSession.githubActive === true
    };
}

export async function setWorkspaceState(repository = '', githubActive = true) {
    if (!unlockedSession) {
        throw new Error('encrypted GitHub session is locked. unlock it before changing workspace state.');
    }
    const normalizedRepository = typeof repository === 'string' ? repository : '';
    return await updateWorkspaceSession({
        repository: normalizedRepository,
        githubActive: !!githubActive
    });
}

export async function clearWorkspaceState() {
    return await setWorkspaceState('', false);
}

export async function unlockAndValidateStoredSession(validate) {
    if (typeof validate !== 'function') {
        throw new TypeError('validated session unlock requires an identity validator.');
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    let envelope;
    try {
        envelope = JSON.parse(raw);
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        lockSession();
        throw new Error('stored session envelope is corrupt and has been cleared.');
    }

    const password = await requestPassword({ mode: 'unlock' });
    if (password === null) return null;

    let decrypted = null;
    try {
        // The decrypted session/key are temporary locals. They MUST NOT be copied
        // into operational state until the validator has succeeded.
        decrypted = await decryptSession(envelope, password);
        await validate(structuredClone(decrypted.session));

        unlockedSession = structuredClone(decrypted.session);
        unlockedSessionKey = decrypted.key;
        unlockedSessionEnvelope = envelope;
        return getUnlockedSession();
    } catch {
        unlockedSession = null;
        unlockedSessionKey = null;
        unlockedSessionEnvelope = null;
        decrypted = null;
        return null;
    }
}

export function getUnlockedSession() {
    return unlockedSession ? structuredClone(unlockedSession) : null;
}

export function getUnlockedUsernameSync() {
    return unlockedSession?.githubUsername || '';
}

export function hasStoredSession() {
    return !!localStorage.getItem(STORAGE_KEY);
}

export function lockSession() {
    unlockedSession = null;
    unlockedSessionKey = null;
    unlockedSessionEnvelope = null;
}

export function clearSession() {
    lockSession();
    localStorage.removeItem(STORAGE_KEY);
    clearLegacyGithubStorage();
}

export async function requestNewSessionPassword() {
    return requestPassword({ mode: 'create' });
}

export const SECURITY_CONFIG = Object.freeze({
    storageKey: STORAGE_KEY,
    passwordMin: PASSWORD_MIN,
    passwordMax: PASSWORD_MAX,
    argon2: { ...ARGON2_CONFIG, workerPath: ARGON2_WORKER_PATH },
    aes: {
        name: 'AES-GCM-256',
        ivBytes: 12,
        tagLength: 128
    }
});
