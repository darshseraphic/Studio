import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function discoverProductionJavaScript(root) {
    const results = [];
    const excludedDirectories = new Set(['.git', 'node_modules', 'tests', 'vendor']);
    const stack = [root];

    while (stack.length > 0) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!excludedDirectories.has(entry.name)) stack.push(fullPath);
                continue;
            }
            if (entry.isFile() && entry.name.endsWith('.js')) results.push(fullPath);
        }
    }

    return results.sort();
}

const productionFiles = discoverProductionJavaScript(ROOT);
const relativeFiles = productionFiles.map((file) => path.relative(ROOT, file).replaceAll(path.sep, '/'));
assert.ok(relativeFiles.length > 0, 'no production JavaScript files were discovered');
assert.ok(relativeFiles.includes('map.js'), 'map.js was not discovered');
assert.ok(!relativeFiles.some((name) => name.startsWith('tests/')), 'test JavaScript leaked into production scan');
assert.ok(!relativeFiles.some((name) => name.startsWith('vendor/')), 'vendor JavaScript leaked into production scan');

const allSource = new Map(productionFiles.map((file) => [path.relative(ROOT, file).replaceAll(path.sep, '/'), fs.readFileSync(file, 'utf8')]));
const map = allSource.get('map.js');
const preview = allSource.get('preview-security.js');
const sessionVault = allSource.get('session-vault.js');
const argonWorker = allSource.get('argon2-worker.js');

assert.equal([...allSource.values()].filter((source) => /addEventListener\(\s*['"]message['"]/.test(source)).length, 3,
    'unexpected number of production window/worker message listeners discovered');
assert.match(map, /window\.addEventListener\(['"]message['"],\s*\(event\)\s*=>/);
assert.match(map, /event\.source !== openedWindow/);
assert.match(map, /event\.origin !== openedWindowOrigin/);
assert.match(map, /Object\.keys\(data\)\.sort\(\)/);
assert.match(map, /data\.type === MAP_CLOSE_MESSAGE\.type/);
assert.match(map, /data\.version === MAP_CLOSE_MESSAGE\.version/);
assert.match(map, /data\.action === MAP_CLOSE_MESSAGE\.action/);
assert.doesNotMatch(map, /event\.data === ['"]close-map-environment['"]/);
assert.doesNotMatch(map, /postMessage\([^\n]*,\s*['"]\*['"]\s*\)/);
assert.doesNotMatch(preview, /postMessage|addEventListener\(['"]message['"]|window\.onmessage/);
assert.doesNotMatch([...allSource.values()].filter((_, index) => !['map.js', 'argon2-worker.js'].includes(relativeFiles[index])).join('\n'), /BroadcastChannel|MessageChannel|SharedWorker|navigator\.serviceWorker|addEventListener\(['"]storage['"]/);

// Worker-response validation remains request-bound and does not dispatch arbitrary commands.
assert.match(sessionVault, /if \(data\.requestId !== requestId\) return;/);
assert.match(sessionVault, /data\.ok !== true/);
assert.match(sessionVault, /data\.key instanceof ArrayBuffer/);
assert.doesNotMatch(sessionVault, /data\.command\s*\(/);
assert.match(argonWorker, /requestMatchesPolicy\(data\)/);
assert.match(argonWorker, /Number\.isInteger\(data\?\.requestId\)/);
assert.match(argonWorker, /ok: false/);

console.log(`message-channel-security: production JS files scanned: ${relativeFiles.length}`);
for (const name of relativeFiles) console.log(`  ${name}`);
console.log('message-channel-security: PASS');
