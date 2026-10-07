import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildHtmlPreviewDocument, PREVIEW_CSP, PREVIEW_SANDBOX } from '../preview-security.js';

const previewSecuritySource = fs.readFileSync(fileURLToPath(new URL('../preview-security.js', import.meta.url)), 'utf8');

const navigationVectors = [
    'location',
    'location.href',
    'location.assign()',
    'location.replace()',
    'window.open()',
    'window.opener',
    'window.top',
    'window.parent',
    'window.self',
    '<a href>',
    '<form>',
    '<meta refresh>',
    'javascript:',
    'data:',
    'blob:'
];

const malicious = `<!doctype html>
<html><head>
    <meta http-equiv="refresh" content="0;url=https://evil.example/refresh">
</head><body>
    <a href="https://evil.example/link" target="_top">link</a>
    <a href="https://evil.example/popup" target="_blank">popup</a>
    <form action="https://evil.example/form" target="_top" method="post"><input name="x"></form>
    <script>
        location = 'https://evil.example/location';
        location.href = 'https://evil.example/href';
        location.assign('https://evil.example/assign');
        location.replace('https://evil.example/replace');
        window.open('https://evil.example/open', '_blank');
        window.opener;
        window.top.location = 'https://evil.example/top';
        window.parent.location = 'https://evil.example/parent';
        window.self.location = 'https://evil.example/self';
        location = 'javascript:window.top.location="https://evil.example/javascript"';
        location = 'data:text/html,<script>location.href="https://evil.example/data"<\\/script>';
        location = 'blob:https://evil.example/blob';
    </script>
</body></html>`;

const wrapper = buildHtmlPreviewDocument(malicious);
const encoded = wrapper.match(/src="data:text\/html;base64,([^"]+)"/i)?.[1];
assert.ok(encoded, 'preview did not create the sandboxed data iframe');
const inner = Buffer.from(encoded, 'base64').toString('utf8');

assert.equal(PREVIEW_SANDBOX, 'allow-scripts');
assert.doesNotMatch(PREVIEW_SANDBOX, /allow-(?:same-origin|forms|popups|popups-to-escape-sandbox|top-navigation|downloads|custom-protocols)/);
assert.match(wrapper, /<iframe sandbox="allow-scripts"[^>]*referrerpolicy="no-referrer"/i);
assert.match(previewSecuritySource, /window\.open\(blobURL, '_blank', 'noopener,noreferrer'\)/);
assert.match(inner, /connect-src 'none'/);
assert.match(inner, /form-action 'none'/);
assert.match(inner, /frame-src 'none'/);
assert.match(inner, /object-src 'none'/);
assert.match(inner, /worker-src 'none'/);

assert.equal(navigationVectors.length, 15, 'focused navigation audit must cover every requested mechanism');

for (const marker of [
    'location.href',
    'location.assign',
    'location.replace',
    'window.open',
    'window.opener',
    'window.top',
    'window.parent',
    'window.self',
    '<a href=',
    '<form ',
    'http-equiv="refresh"',
    'javascript:',
    'data:text/html',
    'blob:'
]) {
    assert.match(inner, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `repository vector was unexpectedly filtered: ${marker}`);
}

assert.ok(
    inner.indexOf('<meta http-equiv="Content-Security-Policy"') < inner.indexOf('<script>'),
    'child CSP is not placed before repository script execution'
);

const earlyScriptHtml = '<script>fetch(\"https://evil.example/early\")</script><html><head><title>x</title></head><body>ok</body></html>';
const earlyWrapper = buildHtmlPreviewDocument(earlyScriptHtml);
const earlyEncoded = earlyWrapper.match(/src=\"data:text\/html;base64,([^\"]+)\"/i)?.[1];
assert.ok(earlyEncoded, 'preview did not encode early-script test document');
const earlyInner = Buffer.from(earlyEncoded, 'base64').toString('utf8');
assert.ok(
    earlyInner.indexOf('<meta http-equiv="Content-Security-Policy"') < earlyInner.indexOf('<script>'),
    'child CSP must precede repository scripts even when repository HTML places <script> before <head>'
);

console.log('preview-navigation-security: PASS');
