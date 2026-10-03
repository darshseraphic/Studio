const STORAGE_KEY = 'studio_secure_session_v1';
const LEGACY_TOKEN_KEY = 'user';
const LEGACY_USERNAME_KEY = 'github_username';
const SESSION_AAD = new TextEncoder().encode('studio-github-session-v1');

const ARGON2_CONFIG = Object.freeze({
    version: 1,
    memorySize: 131072, // KiB = 128 MiB
    iterations: 4,
    parallelism: 1,
    hashLength: 32,
    outputType: 'binary'
});

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 32;
const ARGON2_CDN = 'https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/argon2.umd.min.js';

let unlockedSession = null;
let argon2LoadPromise = null;

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

async function loadArgon2() {
    if (argon2LoadPromise) return argon2LoadPromise;

    argon2LoadPromise = new Promise((resolve, reject) => {
        if (globalThis.hashwasm?.argon2id) {
            resolve(globalThis.hashwasm.argon2id);
            return;
        }

        const script = document.createElement('script');
        script.src = ARGON2_CDN;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
            if (globalThis.hashwasm?.argon2id) {
                resolve(globalThis.hashwasm.argon2id);
            } else {
                reject(new Error('Argon2id module loaded without the expected API.'));
            }
        };
        script.onerror = () => reject(new Error('Unable to load the Argon2id implementation.'));
        document.head.appendChild(script);
    });

    return argon2LoadPromise;
}

async function deriveKeyBytes(password, salt) {
    assertSecureContext();
    validateSessionPassword(password);

    const argon2id = await loadArgon2();
    const derived = await argon2id({
        password,
        salt,
        parallelism: ARGON2_CONFIG.parallelism,
        iterations: ARGON2_CONFIG.iterations,
        memorySize: ARGON2_CONFIG.memorySize,
        hashLength: ARGON2_CONFIG.hashLength,
        outputType: ARGON2_CONFIG.outputType
    });

    if (!(derived instanceof Uint8Array) || derived.length !== ARGON2_CONFIG.hashLength) {
        throw new Error('Argon2id produced an invalid key length.');
    }
    return derived;
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

export async function encryptSession(session, password) {
    assertSecureContext();
    validateSessionPassword(password);

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const rawKey = await deriveKeyBytes(password, salt);

    try {
        const key = await importAesKey(rawKey);
        const plaintext = new TextEncoder().encode(JSON.stringify(session));
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
            kdf: {
                name: 'Argon2id',
                memoryKiB: ARGON2_CONFIG.memorySize,
                iterations: ARGON2_CONFIG.iterations,
                parallelism: ARGON2_CONFIG.parallelism,
                hashLength: ARGON2_CONFIG.hashLength,
                salt: bytesToBase64(salt)
            },
            cipher: {
                name: 'AES-GCM-256',
                iv: bytesToBase64(iv),
                tagLength: 128,
                aad: bytesToBase64(SESSION_AAD),
                ciphertext: bytesToBase64(new Uint8Array(ciphertext))
            }
        };
    } finally {
        rawKey.fill(0);
    }
}

export async function decryptSession(envelope, password) {
    assertSecureContext();
    validateSessionPassword(password);

    if (!envelope || envelope.version !== 1 || envelope.kdf?.name !== 'Argon2id' || envelope.cipher?.name !== 'AES-GCM-256') {
        throw new Error('unsupported encrypted session format.');
    }

    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    const ciphertext = base64ToBytes(envelope.cipher.ciphertext);
    const rawKey = await deriveKeyBytes(password, salt);

    try {
        const key = await importAesKey(rawKey);
        const plaintext = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv,
                additionalData: SESSION_AAD,
                tagLength: 128
            },
            key,
            ciphertext
        );
        const session = JSON.parse(new TextDecoder().decode(plaintext));

        if (!session || typeof session.token !== 'string' || typeof session.githubUsername !== 'string') {
            throw new Error('decrypted session payload is invalid.');
        }
        return session;
    } catch (errorValue) {
        if (errorValue instanceof SyntaxError) {
            throw new Error('decrypted session payload is invalid.');
        }
        throw new Error('unable to unlock the session with that password.');
    } finally {
        rawKey.fill(0);
    }
}

export async function saveSession(session, password) {
    const envelope = await encryptSession(session, password);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    unlockedSession = structuredClone(session);
    return unlockedSession;
}

export async function unlockStoredSession() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    let envelope;
    try {
        envelope = JSON.parse(raw);
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        unlockedSession = null;
        throw new Error('stored session envelope is corrupt and has been cleared.');
    }

    const password = await requestPassword({ mode: 'unlock' });
    if (password === null) return null;

    try {
        unlockedSession = await decryptSession(envelope, password);
        return structuredClone(unlockedSession);
    } catch (errorValue) {
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
}

export function clearSession() {
    unlockedSession = null;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USERNAME_KEY);
}

export async function requestNewSessionPassword() {
    return requestPassword({ mode: 'create' });
}

export const SECURITY_CONFIG = Object.freeze({
    storageKey: STORAGE_KEY,
    passwordMin: PASSWORD_MIN,
    passwordMax: PASSWORD_MAX,
    argon2: { ...ARGON2_CONFIG },
    aes: {
        name: 'AES-GCM-256',
        ivBytes: 12,
        tagLength: 128
    }
});
