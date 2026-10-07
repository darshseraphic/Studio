import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { webcrypto, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const github = read('github.js');
const vault = read('session-vault.js');
const main = read('main.js');
const editor = read('editor.js');
const previewSecurity = read('preview-security.js');
const githubPermissions = read('github-permissions.js');
const network = read('network.js');
const networkSecurity = read('network-security.js');
const workerSource = read('argon2-worker.js');
const index = read('index.html');
const sourceFiles = fs.readdirSync(ROOT).filter((name) => name.endsWith('.js')).sort();

const securityMjsFiles = fs.readdirSync(path.join(ROOT, 'tests'))
    .filter((name) => name.endsWith('.mjs'))
    .sort();
for (const fileName of securityMjsFiles.filter((name) => name !== 'security-regression.mjs')) {
    const testSource = fs.readFileSync(path.join(ROOT, 'tests', fileName), 'utf8');
    assert.doesNotMatch(
        testSource,
        /new URL\([^)]*import\.meta\.url[^)]*\)\.pathname/,
        `${fileName} converts URL.pathname directly instead of using fileURLToPath()`
    );
}

assert.equal(path.isAbsolute(ROOT), true, 'security-regression root is not an absolute filesystem path');

function assertSyntax(fileName, source) {
    // Parse the complete source as an ES module. No functional region is excluded.
    const temp = path.join(ROOT, 'tests', `.syntax-${process.pid}-${fileName.replace(/[^a-z0-9]/gi, '_')}.mjs`);
    fs.writeFileSync(temp, source);
    try {
        const result = spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8' });
        assert.equal(result.status, 0, `${fileName} syntax check failed: ${result.stderr || result.stdout}`);
    } finally {
        fs.rmSync(temp, { force: true });
    }
}

for (const name of sourceFiles) {
    assertSyntax(name, read(name));
}
JSON.parse(read('tests/argon2id-vectors.json'));
JSON.parse(read('tests/argon2id-production-vector.json'));

const vendorProvider = path.join(ROOT, 'vendor', 'argon2.umd.min.js');
const vendorProviderSha = path.join(ROOT, 'vendor', 'argon2.umd.min.js.sha256');
const vendorVersion = path.join(ROOT, 'vendor', 'hash-wasm-version.txt');
if (fs.existsSync(vendorProvider)) {
    assert.ok(fs.existsSync(vendorProviderSha), 'vendored Argon2 provider is missing its recorded SHA-256 manifest');
    assert.ok(fs.existsSync(vendorVersion), 'vendored Argon2 provider is missing its hash-wasm version manifest');
    const expectedSha = fs.readFileSync(vendorProviderSha, 'utf8').trim().split(/\s+/)[0];
    const actualSha = createHash('sha256').update(fs.readFileSync(vendorProvider)).digest('hex');
    assert.match(expectedSha, /^[0-9a-f]{64}$/);
    assert.equal(actualSha, expectedSha, 'vendored Argon2 provider SHA-256 does not match its recorded manifest');
    assert.equal(fs.readFileSync(vendorVersion, 'utf8').trim(), 'hash-wasm@4.12.0');
} else {
    console.warn('security-regression: local Argon2 provider artifact is absent; provider integration remains BLOCKED.');
}

// --- Plaintext storage invariant: inspect every application source file, no source exclusions. ---
const forbiddenKeys = ['user', 'github_username', 'repository', 'github_active'];
const directStorageCall = /(localStorage|sessionStorage)\s*(?:\.\s*(?:getItem|setItem|removeItem)|\[\s*)(?:['"])(user|github_username|repository|github_active)(?:['"])/g;

function extractFunctionRange(source, functionName) {
    const marker = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*\\(`);
    const match = marker.exec(source);
    if (!match) throw new Error(`unable to locate legacy function ${functionName}`);
    const openBrace = source.indexOf('{', match.index);
    let depth = 0;
    let inString = null;
    let escaped = false;
    for (let i = openBrace; i < source.length; i += 1) {
        const ch = source[i];
        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === inString) inString = null;
            continue;
        }
        if (ch === '\"' || ch === "'" || ch === '`') { inString = ch; continue; }
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return [match.index, i + 1];
        }
    }
    throw new Error(`unterminated legacy function ${functionName}`);
}

const vaultLegacyRanges = ['clearLegacyGithubStorage', 'hasLegacyGithubSession', 'migrateLegacyGithubSession']
    .map((name) => extractFunctionRange(vault, name));

for (const fileName of sourceFiles) {
    const source = read(fileName);
    for (const match of source.matchAll(directStorageCall)) {
        const key = match[2];
        if (fileName !== 'session-vault.js') {
            assert.fail(`${fileName} directly touches forbidden GitHub storage key ${key}`);
        }
        const position = match.index ?? -1;
        assert.ok(
            vaultLegacyRanges.some(([startPos, endPos]) => position >= startPos && position < endPos),
            `session-vault.js touches forbidden key ${key} outside explicit legacy migration/cleanup`
        );
    }
}

for (const fileName of sourceFiles) {
    if (fileName === 'network-security.js') continue;
    assert.equal(/\bfetch\s*\(/.test(read(fileName)), false, `${fileName} contains a raw fetch() call outside the network gateway`);
}

assert.match(networkSecurity, /const MAX_TIMEOUT_MS = 20000;/);
assert.match(networkSecurity, /Math\.min\(MAX_TIMEOUT_MS/);
assert.match(vault, /export function lockSession\(\) \{[\s\S]*?unlockedSessionKey = null;/);
assert.match(index, /frame-src data:/);
assert.doesNotMatch(index, /frame-src 'self' data:/);
assert.match(github, /profile\.id\) === String\(session\.githubUserId/);
assert.match(github, /profile\.login === session\.githubUsername/);
assert.doesNotMatch(vault, /export async function unlockStoredSession\b/);
assert.match(vault, /export async function unlockAndValidateStoredSession\(validate\)/);
assert.match(vault, /if \(typeof validate !== 'function'\)/);
assert.match(vault, /await validate\(structuredClone\(decrypted\.session\)\);/);
assert.match(github, /export async function unlockAndValidateGithubSession\(\)/);
assert.match(github, /unlockAndValidateStoredSession\(async \(candidate\) =>/);
assert.doesNotMatch(github, /unlockStoredSession/);
assert.match(github, /HTTP 401/);
// --- Preview isolation source checks. ---
const sandboxMatch = previewSecurity.match(/export const PREVIEW_SANDBOX = '([^']+)';/);
assert.ok(sandboxMatch, 'preview sandbox constant is missing');
assert.equal(sandboxMatch[1], 'allow-scripts');
assert.doesNotMatch(sandboxMatch[1], /allow-(?:same-origin|forms|popups|popups-to-escape-sandbox|top-navigation|downloads|custom-protocols)/);
assert.match(previewSecurity, /connect-src 'none'/);
assert.match(previewSecurity, /frame-src 'none'/);
assert.match(previewSecurity, /worker-src 'none'/);
assert.match(previewSecurity, /script-src 'unsafe-inline'/);
assert.match(editor, /buildHtmlPreviewDocument/);
assert.match(github, /buildHtmlPreviewDocument/);
assert.match(editor, /from ['\"]\.\/preview-security\.js['\"]/);
assert.match(github, /from ['\"]\.\/preview-security\.js['\"]/);
const previewCallers = sourceFiles.filter((name) => name !== 'preview-security.js' && /openSandboxPreview\s*\(/.test(read(name)));
assert.deepEqual(previewCallers, ['editor.js', 'github.js'], 'Editor/GitHub preview creation paths must share preview-security.js');

// --- GitHub permission audit source checks. ---
assert.match(githubPermissions, /Contents: write/);
assert.match(githubPermissions, /Issues: write/);
assert.match(githubPermissions, /Administration: write/);
assert.match(githubPermissions, /Workflows: write/);
assert.doesNotMatch(githubPermissions, /method: ['\"](?:POST|PUT|PATCH|DELETE)['\"]/);

// --- Network gateway runtime checks. ---
{
    const context = {
        console,
        URL,
        Headers,
        AbortController,
        DOMException,
        setTimeout,
        clearTimeout,
        window: {
            location: { href: 'https://studio.example/' },
            setTimeout,
            clearTimeout
        },
        fetch: async () => ({ ok: true, status: 200 }),
        globalThis: null
    };
    context.globalThis = context;
    const stripped = networkSecurity.replace(/^export\s+/gm, '');
    vm.createContext(context);
    new vm.Script(stripped, { filename: 'network-security.js' }).runInContext(context);
    assert.equal(context.validateExternalUrl('http://localhost:8080').protocol, 'http:');
    assert.throws(() => context.validateApiUrl('http://localhost:8080'), /network origin is not authorized/);
    assert.throws(() => context.validateExternalUrl('http://example.com'), /requires HTTPS/);
    assert.throws(() => context.validateApiUrl('https://api.github.com.evil.example/user'), /network origin is not authorized/);

    let observedTimeout = null;
    context.window.setTimeout = (fn, ms) => { observedTimeout = ms; return 1; };
    context.window.clearTimeout = () => {};
    await context.secureFetch('https://api.github.com/user', { timeoutMs: 50000 });
    assert.equal(observedTimeout, 20000, 'secureFetch allowed a caller to extend the hard timeout');
}

// --- Worker protocol tests in a VM. These use an injected local/provider shim to test the actual
// worker policy and lifecycle code, while a separate integration test requires the real vendored file. ---
async function loadWorker({ localProvider, cdnProvider = 'unavailable' }) {
    const messages = [];
    const listeners = new Map();
    let cdnAttempts = 0;
    const providerResult = new Uint8Array(32);
    for (let i = 0; i < providerResult.length; i += 1) providerResult[i] = i + 1;

    const context = {
        console,
        Uint8Array,
        ArrayBuffer,
        Promise,
        setTimeout,
        clearTimeout,
        globalThis: null,
        self: null,
        importScripts(url) {
            if (url.includes('vendor/argon2.umd.min.js')) {
                if (localProvider === 'valid') {
                    context.hashwasm = {
                        argon2id: async () => providerResult
                    };
                    return;
                }
                if (localProvider === 'invalid') {
                    context.hashwasm = {};
                    return;
                }
                throw new Error('local provider unavailable');
            }
            if (url.includes('cdn.jsdelivr.net')) {
                cdnAttempts += 1;
                throw new Error('unexpected CDN provider load');
            }
            throw new Error(`unexpected provider URL: ${url}`);
        }
    };
    context.globalThis = context;
    context.self = {
        addEventListener(type, fn) { listeners.set(type, fn); },
        postMessage(message, transferList = []) {
            messages.push({ message, transferList, providerSnapshot: [...providerResult] });
        }
    };

    vm.createContext(context);
    new vm.Script(workerSource, { filename: 'argon2-worker.js' }).runInContext(context);
    const handler = listeners.get('message');
    assert.equal(typeof handler, 'function');
    return { context, handler, messages, providerResult, getCdnAttempts: () => cdnAttempts };
}

const approvedKdf = {
    algorithm: 'Argon2id', version: 0x13, memorySize: 131072, iterations: 4,
    parallelism: 1, hashLength: 32, outputType: 'binary'
};

{
    const { handler, messages, providerResult } = await loadWorker({ localProvider: 'valid' });
    const passwordBuffer = new TextEncoder().encode('StudioTest!').buffer;
    const saltBuffer = Uint8Array.from({ length: 32 }, (_, i) => i).buffer;
    await handler({ data: { requestId: 1, password: passwordBuffer, salt: saltBuffer, kdf: approvedKdf, includeProvider: true } });
    assert.equal(messages[0].message.ok, true);
    assert.equal(messages[0].message.provider, 'local');
    assert.deepEqual(messages[0].providerSnapshot, new Array(32).fill(0), 'provider result was not wiped before transfer');
    assert.deepEqual([...new Uint8Array(passwordBuffer)], new Array(11).fill(0), 'password buffer not wiped by worker');
    assert.deepEqual([...new Uint8Array(saltBuffer)], new Array(32).fill(0), 'salt buffer not wiped by worker');
}

{
    const harness = await loadWorker({ localProvider: 'invalid', cdnProvider: 'valid' });
    const { handler, messages } = harness;
    const passwordBuffer = new TextEncoder().encode('StudioTest!').buffer;
    const saltBuffer = new Uint8Array(32).buffer;
    await handler({ data: { requestId: 2, password: passwordBuffer, salt: saltBuffer, kdf: approvedKdf, includeProvider: true } });
    assert.equal(messages[0].message.ok, false, 'worker must fail closed when the local provider fails validation');
    assert.equal(harness.getCdnAttempts(), 0, 'worker must not fall back to the CDN after local provider validation fails');
    assert.match(messages[0].message.error, /local.*argon2id provider|argon2id provider/i);
    assert.deepEqual([...new Uint8Array(passwordBuffer)], new Array(11).fill(0), 'password was not wiped after local provider failure');
    assert.deepEqual([...new Uint8Array(saltBuffer)], new Array(32).fill(0), 'salt was not wiped after local provider failure');
}

{
    const harness = await loadWorker({ localProvider: 'valid' });
    const { handler, messages } = harness;
    const passwordBuffer = new TextEncoder().encode('StudioTest!').buffer;
    const saltBuffer = new Uint8Array(32).buffer;
    await handler({ data: { requestId: 3, password: passwordBuffer, salt: saltBuffer, kdf: { ...approvedKdf, iterations: 3 } } });
    assert.equal(messages[0].message.ok, false, 'worker accepted a weaker KDF configuration');
}


{
    const { handler, messages } = await loadWorker({ localProvider: 'invalid', cdnProvider: 'invalid-both' });
    const passwordBuffer = new TextEncoder().encode('StudioTest!').buffer;
    const saltBuffer = new Uint8Array(32).buffer;
    await handler({ data: { requestId: 4, password: passwordBuffer, salt: saltBuffer, kdf: approvedKdf } });
    assert.equal(messages[0].message.ok, false, 'worker should fail closed when both providers are invalid');
    assert.match(messages[0].message.error, /provider/i);
    assert.deepEqual([...new Uint8Array(passwordBuffer)], new Array(11).fill(0), 'password was not wiped on provider failure');
    assert.deepEqual([...new Uint8Array(saltBuffer)], new Array(32).fill(0), 'salt was not wiped on provider failure');
}

{
    const harness = await loadWorker({ localProvider: 'valid' });
    harness.context.hashwasm.argon2id = async () => {
        throw new Error('provider derivation failed');
    };
    const passwordBuffer = new TextEncoder().encode('StudioTest!').buffer;
    const saltBuffer = new Uint8Array(32).buffer;
    await harness.handler({ data: { requestId: 5, password: passwordBuffer, salt: saltBuffer, kdf: approvedKdf } });
    assert.equal(harness.messages[0].message.ok, false, 'worker should surface provider derivation failure');
    assert.deepEqual([...new Uint8Array(passwordBuffer)], new Array(11).fill(0), 'password was not wiped on derivation exception');
    assert.deepEqual([...new Uint8Array(saltBuffer)], new Array(32).fill(0), 'salt was not wiped on derivation exception');
}

// --- Full github.js runtime identity tests: no code is excluded from loading. ---
function createGithubHarness({ profile, existingSession = null, storedSession = null, status = 200 }) {
    let fetchCount = 0;
    const vaultState = { session: existingSession, key: existingSession ? { algorithm: 'AES-GCM' } : null };
    let unlockValidatorWasCalledBeforeCommit = false;
    const context = {
        console,
        crypto: webcrypto,
        window: { open() { return null; } },
        print() {},
        getSystemPrompt() { return 'prompt'; },
        setMode() {},
        registry: {},
        currentPath: [],
        fileBuffers: new Map(),
        virtualDirectories: new Map(),
        getFullFilePath(...parts) { return parts.join('/'); },
        savePathState() {},
        VALID_EXTENSIONS: new Set(['txt']),
        usedToolsInSession: new Set(),
        secureFetch: async () => { fetchCount += 1; return { ok: status >= 200 && status < 300, status, async json() { return profile; } }; },
        getUnlockedSession: () => vaultState.session,
        hasStoredSession: () => true,
        hasLegacyGithubSession: () => false,
        migrateLegacyGithubSession: async () => null,
        unlockAndValidateStoredSession: async (validate) => {
            if (typeof validate !== 'function') throw new TypeError('validated session unlock requires an identity validator.');
            if (!storedSession) return null;
            try {
                unlockValidatorWasCalledBeforeCommit = vaultState.session === null;
                await validate(structuredClone(storedSession));
                vaultState.session = structuredClone(storedSession);
                vaultState.key = { algorithm: 'AES-GCM' };
                return structuredClone(storedSession);
            } catch {
                vaultState.session = null;
                vaultState.key = null;
                return null;
            }
        },
        saveSession: async () => {},
        getUnlockedUsernameSync: () => '',
        lockSessionCalled: false,
        lockSession() {
            context.lockSessionCalled = true;
            vaultState.session = null;
            vaultState.key = null;
        },
        clearSession() {},
        requestNewSessionPassword: async () => null,
        clearLegacyGithubStorage() {},
        getWorkspaceStateSync() { return { repository: '', githubActive: false }; },
        setWorkspaceState: async () => {},
        clearWorkspaceState: async () => {},
        registerTool() {},
        structuredClone,
    };
    context.globalThis = context;
    const stripped = github
        .replace(/^import\s+[\s\S]*?;\s*/gm, '')
        .replace(/^export\s+/gm, '');
    vm.createContext(context);
    new vm.Script(`${stripped}\nthis.__validate = validateUnlockedGithubSession;\nthis.__require = requireGithubSession;`, { filename: 'github.js' }).runInContext(context);
    context.__getFetchCount = () => fetchCount;
    context.__vaultState = vaultState;
    context.__unlockValidatorWasCalledBeforeCommit = () => unlockValidatorWasCalledBeforeCommit;
    return context;
}

{
    const stored = { githubUserId: '777', githubUsername: 'studio-user', token: 'ghp_test', sessionId: 'stored-runtime-session' };
    const context = createGithubHarness({ profile: { id: 777, login: 'studio-user' }, storedSession: stored });
    const result = await context.__require();
    assert.equal(result.sessionId, 'stored-runtime-session');
    assert.equal(context.__unlockValidatorWasCalledBeforeCommit(), true, 'unlock validation happened after the session became operational');
    assert.equal(context.__getFetchCount(), 1, 'unlock did not validate GitHub credentials');
}

{
    const stored = { githubUserId: '777', githubUsername: 'studio-user', token: 'ghp_test', sessionId: 'stored-mismatch' };
    const context = createGithubHarness({ profile: { id: 778, login: 'studio-user' }, storedSession: stored });
    context.currentPath.push('repo', 'secret-file');
    context.virtualDirectories.set('repo', true);
    const result = await context.__require();
    assert.equal(result, null, 'identity mismatch unexpectedly became operational');
    assert.equal(context.__vaultState.session, null);
    assert.equal(context.__vaultState.key, null);
    assert.equal(context.currentPath.length, 0, 'identity mismatch left navigation state in memory');
    assert.equal(context.virtualDirectories.size, 0, 'identity mismatch left virtual workspace state in memory');
}

{
    const session = { githubUserId: '777', githubUsername: 'studio-user', token: 'ghp_test', sessionId: 'token-rejected' };
    const context = createGithubHarness({ profile: { id: 777, login: 'studio-user' }, existingSession: session, status: 401 });
    const result = await context.__validate(session);
    assert.equal(result, null, 'HTTP 401 did not invalidate the in-memory GitHub session');
    assert.equal(context.__vaultState.session, null);
    assert.equal(context.__vaultState.key, null);
}

{
    const session = { githubUserId: '777', githubUsername: 'studio-user', token: 'ghp_test', sessionId: 'fresh-runtime-session' };
    const context = createGithubHarness({ profile: { id: 777, login: 'studio-user' }, existingSession: session });
    const result = await context.__require();
    assert.equal(result.sessionId, 'fresh-runtime-session');
    assert.equal(context.__getFetchCount(), 1, 'an already-unlocked but not-yet-validated session bypassed /user validation');
}

for (const [name, profile, session] of [
    ['success', { id: 12345, login: 'studio-user' }, { githubUserId: '12345', githubUsername: 'studio-user', token: 'ghp_test', sessionId: 's1' }],
    ['id mismatch', { id: 54321, login: 'studio-user' }, { githubUserId: '12345', githubUsername: 'studio-user', token: 'ghp_test', sessionId: 's2' }],
    ['login mismatch', { id: 12345, login: 'other-user' }, { githubUserId: '12345', githubUsername: 'studio-user', token: 'ghp_test', sessionId: 's3' }],
]) {
    const context = createGithubHarness({ profile, storedSession: session });
    context.currentPath.push('repo', 'secret-file');
    context.virtualDirectories.set('repo', true);
    const result = await context.__require();
    if (name === 'success') {
        assert.equal(result.sessionId, 's1');
        assert.equal(context.lockSessionCalled, false);
        assert.equal(context.__unlockValidatorWasCalledBeforeCommit(), true, 'successful unlock committed before validation');
        assert.equal(context.__getFetchCount(), 1, 'successful unlock skipped GitHub /user validation');
    } else {
        assert.equal(result, null);
        assert.equal(context.lockSessionCalled, true, `${name} did not lock the session`);
        assert.equal(context.currentPath.length, 0);
        assert.equal(context.virtualDirectories.size, 0);
        assert.equal(context.__vaultState.session, null, `${name} left the unlocked session state in memory`);
        assert.equal(context.__vaultState.key, null, `${name} left the session cryptographic key in memory`);
    }
}

{
    const stored = { githubUserId: '777', githubUsername: 'studio-user', token: 'ghp_test', sessionId: 'unlock-401' };
    const context = createGithubHarness({ profile: { id: 777, login: 'studio-user' }, storedSession: stored, status: 401 });
    context.currentPath.push('repo', 'secret-file');
    context.virtualDirectories.set('repo', true);
    const result = await context.__require();
    assert.equal(result, null, 'HTTP 401 during stored-session unlock unexpectedly became operational');
    assert.equal(context.lockSessionCalled, true);
    assert.equal(context.currentPath.length, 0);
    assert.equal(context.virtualDirectories.size, 0);
    assert.equal(context.__vaultState.session, null);
    assert.equal(context.__vaultState.key, null);
}

console.log('security-regression: PASS');
