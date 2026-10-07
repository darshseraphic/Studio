import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', 'tests', 'vendor']);

function discoverProductionJavaScript(directory) {
    const discovered = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
            discovered.push(...discoverProductionJavaScript(path.join(directory, entry.name)));
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        if (/\.(?:test|spec)\.js$/i.test(entry.name)) continue;
        discovered.push(path.join(directory, entry.name));
    }
    return discovered.sort();
}

const productionFiles = discoverProductionJavaScript(ROOT);
assert.ok(productionFiles.length > 0, 'expected at least one production JavaScript source file');
const sources = Object.fromEntries(productionFiles.map(filePath => [
    path.relative(ROOT, filePath).replaceAll(path.sep, '/'),
    fs.readFileSync(filePath, 'utf8')
]));
const fileNames = Object.keys(sources);
const sourceText = fileNames.map(name => `\n===== ${name} =====\n${sources[name]}`).join('\n');

for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /\binnerHTML\b/, `${name}: trusted production code must not use innerHTML`);
    assert.doesNotMatch(source, /\bouterHTML\b/, `${name}: trusted production code must not use outerHTML`);
    assert.doesNotMatch(source, /\binsertAdjacentHTML\s*\(/, `${name}: trusted production code must not call insertAdjacentHTML`);
    assert.doesNotMatch(source, /\bdocument\.write(?:ln)?\s*\(/, `${name}: trusted production code must not use document.write/writeln`);
    assert.doesNotMatch(source, /\bDOMParser\b/, `${name}: trusted production code must not use DOMParser for repository content`);
    assert.doesNotMatch(source, /\.srcdoc\s*=/, `${name}: trusted production code must not assign repository HTML to iframe.srcdoc`);
    assert.doesNotMatch(source, /\b(?:createContextualFragment)\s*\(/, `${name}: trusted production code must not create contextual HTML fragments`);
    assert.doesNotMatch(source, /\.(?:href|src)\s*=\s*[^;\n]+;/i, `${name}: production code must not directly assign href/src from repository-controlled values`);
    assert.doesNotMatch(source, /\.on[a-z][a-z0-9]*\s*=\s*[^;\n]+;/i, `${name}: production code must not assign executable event-handler properties`);

    for (const match of source.matchAll(/\.setAttribute\s*\(\s*([^,\)]+)/g)) {
        const attribute = match[1].trim().replace(/^['"]|['"]$/g, '');
        if (attribute.startsWith('on') || attribute === 'href' || attribute === 'src' || attribute === 'srcdoc') {
            assert.fail(`${name}: potentially executable setAttribute sink for ${attribute}`);
        }
    }
}

assert.match(sources['main.js'] ?? '', /line\.textContent\s*=\s*text;/, 'Studio output sink must render repository text with textContent');
assert.match(sources['preview-security.js'] ?? '', /function escapePreviewText\(value\)/, 'text preview must use explicit HTML escaping');
assert.match(sources['preview-security.js'] ?? '', /const encoded\s*=\s*encodeBase64Utf8\(protectedDocument\)/, 'HTML preview must encode repository markup before wrapper insertion');
assert.match(sources['preview-security.js'] ?? '', /sandbox="\$\{PREVIEW_SANDBOX\}"/, 'HTML preview must remain sandboxed');
assert.equal((sources['preview-security.js']?.match(/<iframe\b/g) || []).length, 1, 'preview wrapper must have exactly one isolated iframe path');

const printCalls = [];
for (const [name, source] of Object.entries(sources)) {
    if (name === 'preview-security.js') continue;
    for (const match of source.matchAll(/print\s*\(([^\n]*)\)/g)) printCalls.push(`${name}: ${match[1]}`);
}
assert.ok(printCalls.length > 0, 'expected application output paths to use print()');

const expectedApplicationEntryFiles = ['main.js', 'editor.js', 'github.js'].filter(name => sources[name]);
assert.deepEqual(expectedApplicationEntryFiles, ['main.js', 'editor.js', 'github.js'], 'expected core application entry points to be in the production scan');

console.log(`dom-injection-audit: PASS (${productionFiles.length} production JavaScript files scanned)`);
for (const relativePath of fileNames) console.log(`  ${relativePath}`);
