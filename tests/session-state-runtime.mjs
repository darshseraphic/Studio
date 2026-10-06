import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MODULE_COPY = path.join(ROOT, 'tests', '.session-vault-runtime.mjs');
fs.copyFileSync(path.join(ROOT, 'session-vault.js'), MODULE_COPY);

class StorageMock {
    #data = new Map();
    getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
    keys() { return [...this.#data.keys()]; }
}

class ElementMock {
    constructor(tag) {
        this.tagName = String(tag).toUpperCase();
        this.children = [];
        this.listeners = new Map();
        this.attributes = new Map();
        this.style = {};
        this.hidden = false;
        this.value = '';
        this.textContent = '';
        this.parentNode = null;
    }
    append(...children) {
        for (const child of children) this.appendChild(child);
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    remove() {
        if (!this.parentNode) return;
        const index = this.parentNode.children.indexOf(this);
        if (index >= 0) this.parentNode.children.splice(index, 1);
        this.parentNode = null;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    addEventListener(type, fn) {
        const list = this.listeners.get(type) || [];
        list.push(fn);
        this.listeners.set(type, list);
    }
    dispatchEvent(type, event = {}) {
        for (const fn of this.listeners.get(type) || []) fn(event);
    }
    focus() {}
    select() {}
}

function walk(root, out = []) {
    out.push(root);
    for (const child of root.children || []) walk(child, out);
    return out;
}

const storage = new StorageMock();
const workerInstances = [];
let nextPromptPassword = 'StudioTest!';
const body = new ElementMock('body');
const document = {
    body,
    createElement(tag) { return new ElementMock(tag); }
};
const originalAppendChild = body.appendChild.bind(body);
body.appendChild = (child) => {
    const result = originalAppendChild(child);
    if (child.className === 'studio-session-backdrop') {
        queueMicrotask(() => {
            const elements = walk(child);
            const inputs = elements.filter((el) => el.tagName === 'INPUT');
            for (const input of inputs) input.value = nextPromptPassword;
            const submit = elements.find((el) => el.tagName === 'BUTTON' && el.textContent !== 'CANCEL');
            if (submit) submit.dispatchEvent('click', { target: submit });
        });
    }
    return result;
};

class RuntimeWorkerMock {
    constructor() {
        this.listeners = new Map();
        this.terminated = false;
        workerInstances.push(this);
    }
    addEventListener(type, fn) {
        const list = this.listeners.get(type) || [];
        list.push(fn);
        this.listeners.set(type, list);
    }
    removeEventListener(type, fn) {
        const list = this.listeners.get(type) || [];
        this.listeners.set(type, list.filter((item) => item !== fn));
    }
    terminate() { this.terminated = true; }
    postMessage(message) {
        queueMicrotask(async () => {
            const password = Buffer.from(message.password).toString('utf8');
            const salt = Buffer.from(message.salt);
            const input = new TextEncoder().encode(`${password}\0${salt.toString('hex')}`);
            const digest = new Uint8Array(await webcrypto.subtle.digest('SHA-256', input));
            this.listeners.get('message')?.forEach((listener) => listener({
                data: { requestId: message.requestId, ok: true, key: digest.buffer }
            }));
        });
    }
}

globalThis.window = {
    isSecureContext: true,
    crypto: webcrypto,
    setTimeout,
    clearTimeout
};
globalThis.document = document;
globalThis.localStorage = storage;
globalThis.Worker = RuntimeWorkerMock;
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
globalThis.btoa = btoa;
globalThis.atob = atob;

try {
    const vault = await import(`${pathToFileURL(MODULE_COPY).href}?runtime=${Date.now()}`);
    const password = 'StudioTest!';
    const session = {
        token: 'ghp_runtime_test',
        githubUserId: '12345',
        githubUsername: 'studio-user',
        sessionId: 'runtime-s1',
        repository: 'studio',
        githubActive: true,
        createdAt: '2026-10-04T00:00:00.000Z'
    };

    await vault.saveSession(session, password);
    assert.ok(workerInstances.at(-1)?.terminated, 'Argon2 worker was not terminated after saveSession derivation');
    assert.deepEqual(storage.keys(), ['studio_secure_session_v1'], 'saveSession created unexpected persistent keys');
    assert.deepEqual(vault.getWorkspaceStateSync(), { repository: 'studio', githubActive: true });

    await vault.setWorkspaceState('studio-next', true);
    assert.deepEqual(storage.keys(), ['studio_secure_session_v1'], 'workspace state leaked into plaintext storage');
    assert.deepEqual(vault.getWorkspaceStateSync(), { repository: 'studio-next', githubActive: true });

    vault.lockSession();
    assert.equal(vault.getUnlockedSession(), null, 'lock did not clear in-memory session');
    assert.deepEqual(vault.getWorkspaceStateSync(), { repository: '', githubActive: false }, 'lock did not clear in-memory workspace state');
    assert.equal(vault.hasStoredSession(), true, 'lock destroyed the encrypted persisted session');

    nextPromptPassword = 'WrongPassword!';
    const wrong = await vault.unlockAndValidateStoredSession(async () => {});
    assert.ok(workerInstances.at(-1)?.terminated, 'Argon2 worker was not terminated after failed unlock');
    assert.equal(wrong, null, 'wrong password unexpectedly unlocked the session');
    assert.equal(vault.getUnlockedSession(), null, 'wrong-password path left an unlocked session');
    assert.equal(vault.hasStoredSession(), true, 'wrong-password path destroyed persisted session');

    // Attack the old API boundary itself. If a validation-optional API ever returns an
    // operational session again, this assertion fails. The corrected vault has no such export.
    const legacyUnlock = vault.unlockStoredSession;
    await assert.rejects(async () => {
        if (typeof legacyUnlock !== 'function') {
            throw new TypeError('legacy unlock API is removed');
        }
        const bypassResult = await legacyUnlock();
        assert.equal(vault.getUnlockedSession(), null, 'legacy unlock committed a session without validation');
        assert.equal(bypassResult, null, 'legacy unlock returned an operational session without validation');
    }, 'validation-optional stored-session unlock must be rejected or absent');

    await assert.rejects(
        vault.unlockAndValidateStoredSession(),
        /requires an identity validator/,
        'operational unlock remained callable without mandatory validation'
    );
    assert.equal(vault.getUnlockedSession(), null, 'validation-less unlock changed operational state');
    assert.equal(vault.hasStoredSession(), true, 'validation-less unlock destroyed encrypted storage');

    nextPromptPassword = password;
    let validatorCalled = false;
    let validatorSawLockedState = false;
    const unlocked = await vault.unlockAndValidateStoredSession(async (candidate) => {
        validatorCalled = true;
        validatorSawLockedState = vault.getUnlockedSession() === null;
        assert.equal(candidate.githubUserId, '12345');
        assert.equal(candidate.githubUsername, 'studio-user');
    });
    assert.ok(workerInstances.at(-1)?.terminated, 'Argon2 worker was not terminated after successful unlock');
    assert.equal(validatorCalled, true, 'unlock validator was not called');
    assert.equal(validatorSawLockedState, true, 'validator ran after session became operational');
    assert.equal(unlocked.sessionId, 'runtime-s1');
    assert.equal(unlocked.repository, 'studio-next');
    assert.equal(unlocked.githubUserId, '12345');
    assert.equal(unlocked.githubUsername, 'studio-user');

    vault.lockSession();
    nextPromptPassword = password;
    const mismatch = await vault.unlockAndValidateStoredSession(async () => {
        throw new Error('identity mismatch');
    });
    assert.equal(mismatch, null, 'unlock validator failure unexpectedly unlocked the session');
    assert.equal(vault.getUnlockedSession(), null, 'validator failure left an unlocked session');
    assert.equal(vault.hasStoredSession(), true, 'validator failure destroyed the encrypted session');

    nextPromptPassword = password;
    const restored = await vault.unlockAndValidateStoredSession(async () => {});
    assert.equal(restored.sessionId, 'runtime-s1');
    await vault.clearWorkspaceState();
    assert.deepEqual(vault.getWorkspaceStateSync(), { repository: '', githubActive: false });
    assert.deepEqual(storage.keys(), ['studio_secure_session_v1']);

    vault.clearSession();
    assert.equal(vault.getUnlockedSession(), null, 'logout did not clear in-memory session');
    assert.equal(vault.hasStoredSession(), false, 'logout did not remove encrypted session');
    for (const key of ['user', 'github_username', 'repository', 'github_active']) {
        assert.equal(storage.getItem(key), null, `logout left legacy key ${key}`);
    }

    console.log('session-state-runtime: PASS');
} finally {
    fs.rmSync(MODULE_COPY, { force: true });
}
