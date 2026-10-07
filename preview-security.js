/**
 * Repository preview security boundary.
 *
 * The preview executes repository-controlled HTML in a sandboxed iframe that
 * does not receive allow-same-origin, forms, popups, downloads, or top-level
 * navigation privileges. The preview document also carries its own restrictive
 * CSP so repository code cannot make network requests or load remote code.
 */

export const PREVIEW_SANDBOX = 'allow-scripts';
export const PREVIEW_CSP = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'media-src data: blob:',
    'font-src data: blob:',
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "worker-src 'none'"
].join('; ');

function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    return btoa(binary);
}

function injectPreviewCsp(html) {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
    const normalized = String(html ?? '');

    // The repository controls the entire document string, including where its
    // <head> appears. Put the CSP before any repository-controlled token so a
    // script placed before <head> cannot execute before the policy is active.
    // Preserve a leading doctype when present so ordinary previews stay in
    // standards mode.
    const doctypeMatch = normalized.match(/^(\s*)(<!doctype\b[^>]*>)/i);
    if (doctypeMatch) {
        const leading = doctypeMatch[1];
        const doctype = doctypeMatch[2];
        const remainder = normalized.slice(doctypeMatch[0].length);
        return `${leading}${doctype}${meta}${remainder}`;
    }
    return `${meta}${normalized}`;
}

function escapePreviewText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildHtmlPreviewDocument(html) {
    // The sandbox allowlist is intentionally limited to scripts. In particular,
    // do not add allow-top-navigation, allow-top-navigation-by-user-activation,
    // allow-popups, allow-popups-to-escape-sandbox, allow-forms, or allow-same-origin.
    // The browser then enforces the navigation boundary for repository code.
    const protectedDocument = injectPreviewCsp(html);
    const encoded = encodeBase64Utf8(protectedDocument);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Studio Repository Preview</title>
<style>
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; }
iframe { border: 0; width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
<iframe sandbox="${PREVIEW_SANDBOX}" referrerpolicy="no-referrer" src="data:text/html;base64,${encoded}"></iframe>
</body>
</html>`;
}

export function buildTextPreviewDocument(filename, text) {
    const safeFilename = escapePreviewText(filename || 'Untitled Buffer');
    const safeText = escapePreviewText(text || '');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<title>Universal Preview - ${safeFilename}</title>
<style>
html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #121212; color: #e0e0e0; font-family: 'Courier New', Courier, monospace; }
.header { background: #1a1a1a; padding: 10px 20px; border-bottom: 1px solid #333; font-size: 12px; color: #888; }
pre { margin: 0; padding: 20px; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.6; }
</style>
</head>
<body>
<div class="header">Target Workspace Node: ${safeFilename} | Plaintext Runtime View</div>
<pre id="output-content">${safeText}</pre>
</body>
</html>`;
}

export function openSandboxPreview(documentHtml) {
    const blob = new Blob([documentHtml], { type: 'text/html' });
    const blobURL = URL.createObjectURL(blob);
    const previewWindow = window.open(blobURL, '_blank', 'noopener,noreferrer');
    if (!previewWindow) {
        URL.revokeObjectURL(blobURL);
        throw new Error('the browser blocked the preview window. allow pop-ups for Studio and try again.');
    }
    // Preserve existing preview behavior while bounding the lifetime of the
    // top-level wrapper URL. The sandboxed child has its own opaque origin.
    window.setTimeout(() => URL.revokeObjectURL(blobURL), 60000);
    return previewWindow;
}
