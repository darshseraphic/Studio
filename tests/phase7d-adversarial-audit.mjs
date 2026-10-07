import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const EXCLUDED = new Set(['.git', 'node_modules', 'tests', 'vendor']);
const SECURITY_FILES = [
    'argon2-worker.js',
    'network-security.js',
    'session-vault.js',
    'github.js',
    'github-permissions.js',
    'preview-security.js',
    'main.js',
    'editor.js',
    'map.js',
];

function discoverProductionJavaScript(directory) {
    const out = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (EXCLUDED.has(entry.name)) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            out.push(...discoverProductionJavaScript(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js') && !/(?:\.test|\.spec)\.js$/i.test(entry.name)) {
            out.push(fullPath);
        }
    }
    return out.sort();
}

const productionFiles = discoverProductionJavaScript(ROOT);
const relative = productionFiles.map((file) => path.relative(ROOT, file).replaceAll(path.sep, '/'));
assert.ok(relative.length >= SECURITY_FILES.length, 'production JavaScript source tree is unexpectedly small');
for (const file of SECURITY_FILES) assert.ok(relative.includes(file), `${file} missing from production scan`);
assert.ok(!relative.some((file) => file.startsWith('tests/')));
assert.ok(!relative.some((file) => file.startsWith('vendor/')));

const sources = new Map(productionFiles.map((file) => [
    path.relative(ROOT, file).replaceAll(path.sep, '/'),
    fs.readFileSync(file, 'utf8')
]));
const allSource = [...sources.values()].join('\n');

// No direct application network APIs may bypass the centralized gateway.
for (const [name, source] of sources) {
    if (name === 'network-security.js') continue;
    assert.doesNotMatch(source, /\bfetch\s*\(/, `${name}: raw fetch bypasses network-security.js`);
    assert.doesNotMatch(source, /\b(?:XMLHttpRequest|WebSocket|EventSource)\s*[({]/, `${name}: raw network API bypasses network-security.js`);
    assert.doesNotMatch(source, /navigator\.sendBeacon\s*\(/, `${name}: sendBeacon bypasses network-security.js`);
}

// Preview trust boundary is shared by both repository preview entry points.
const preview = sources.get('preview-security.js');
assert.match(preview, /export const PREVIEW_SANDBOX = ['"]allow-scripts['"]/);
assert.equal(preview.match(/export const PREVIEW_SANDBOX = ['\"]([^'\"]+)['\"]/)[1], 'allow-scripts');
for (const directive of [
    "connect-src 'none'",
    "frame-src 'none'",
    'worker-src \'none\'',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
]) assert.match(preview, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `preview CSP missing ${directive}`);
assert.match(preview, /<iframe sandbox="\$\{PREVIEW_SANDBOX\}"/);
assert.match(sources.get('main.js'), /line\.textContent\s*=\s*text/);
const previewCallers = relative.filter((file) => file !== 'preview-security.js' && /openSandboxPreview\s*\(/.test(sources.get(file)));
assert.deepEqual(previewCallers, ['editor.js', 'github.js']);

// Cross-context message invariants.
assert.doesNotMatch(preview, /addEventListener\(\s*['"]message['"]|postMessage/);
const map = sources.get('map.js');
assert.match(map, /event\.source !== openedWindow/);
assert.match(map, /event\.origin !== openedWindowOrigin/);
assert.match(map, /Object\.keys\(data\)\.sort\(\)/);
assert.match(map, /data\.type === MAP_CLOSE_MESSAGE\.type/);
assert.match(map, /data\.version === MAP_CLOSE_MESSAGE\.version/);
assert.match(map, /data\.action === MAP_CLOSE_MESSAGE\.action/);

// Session and network boundary regressions remain present in the integrated baseline.
const vault = sources.get('session-vault.js');
const github = sources.get('github.js');
assert.doesNotMatch(vault, /export async function unlockStoredSession\b/);
assert.match(vault, /export async function unlockAndValidateStoredSession\(validate\)/);
assert.match(vault, /await validate\(structuredClone\(decrypted\.session\)\)/);
assert.match(github, /unlockAndValidateStoredSession\(async \(candidate\)/);
assert.match(github, /profile\.id\) === String\(session\.githubUserId/);
assert.match(github, /profile\.login === session\.githubUsername/);

// Local Argon2 provider remains pinned and verified in the cumulative tree.
const provider = path.join(ROOT, 'vendor', 'argon2.umd.min.js');
const manifest = path.join(ROOT, 'vendor', 'argon2.umd.min.js.sha256');
const version = path.join(ROOT, 'vendor', 'hash-wasm-version.txt');
assert.ok(fs.existsSync(provider), 'local Argon2 provider missing');
assert.ok(fs.existsSync(manifest), 'Argon2 SHA-256 manifest missing');
assert.ok(fs.existsSync(version), 'hash-wasm version manifest missing');
const actualSha = createHash('sha256').update(fs.readFileSync(provider)).digest('hex');
const expectedSha = fs.readFileSync(manifest, 'utf8').trim().split(/\s+/)[0];
assert.equal(actualSha, expectedSha);
assert.equal(actualSha, 'dcec617a2e1b700fa132d1583a186cb70611113395e869f2dd6cc82b415d3094');
assert.equal(fs.readFileSync(version, 'utf8').trim(), 'hash-wasm@4.12.0');

// Previously approved adversarial and regression layers must remain in the release.
for (const testFile of [
    'tests/preview-browser-security.py',
    'tests/dom-injection-security.py',
    'tests/message-channel-security.py',
    'tests/argon2id-local-provider-integration.mjs',
    'tests/argon2id-reference-vector.mjs',
    'tests/github-permissions-audit.mjs',
    'tests/github-session-audit.mjs',
    'tests/preview-isolation-runtime.mjs',
    'tests/preview-navigation-security.mjs',
    'tests/security-regression.mjs',
    'tests/session-state-runtime.mjs',
    'tests/vendor-provider-verification.mjs',
]) {
    assert.ok(fs.existsSync(path.join(ROOT, testFile)), `${testFile} missing from cumulative release`);
}

console.log(`phase7d-adversarial-audit: production JavaScript files scanned: ${relative.length}`);
for (const file of relative) console.log(`  ${file}`);
console.log('phase7d-adversarial-audit: PASS');
