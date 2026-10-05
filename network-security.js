const ALLOWED_API_ORIGINS = Object.freeze([
    'https://api.github.com',
    'https://api.open-meteo.com',
    'https://geocoding-api.open-meteo.com',
    'https://vedicscriptures.github.io',
    'https://bible-api.com',
    'https://catfact.ninja'
]);

const ALLOWED_API_ORIGIN_SET = new Set(ALLOWED_API_ORIGINS);
const DEFAULT_TIMEOUT_MS = 20000;
const GITHUB_API_ORIGIN = 'https://api.github.com';
const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function normalizeUrl(target) {
    if (target instanceof URL) return new URL(target.href);
    if (typeof target !== 'string') throw new TypeError('network target must be a URL string.');
    return new URL(target, window.location.href);
}

function assertSafeTransport(url) {
    const protocol = url.protocol.toLowerCase();
    if (protocol === 'https:') return;

    const isLocalDevelopmentHttp = protocol === 'http:' && LOCAL_HTTP_HOSTS.has(url.hostname.toLowerCase());
    if (!isLocalDevelopmentHttp) {
        throw new Error('secure network policy requires HTTPS.');
    }
}

function assertNoEmbeddedCredentials(url) {
    if (url.username || url.password) {
        throw new Error('network URLs must not contain embedded credentials.');
    }
}

export function validateExternalUrl(target) {
    const url = normalizeUrl(target);
    assertSafeTransport(url);
    assertNoEmbeddedCredentials(url);
    return url;
}

export function validateApiUrl(target) {
    const url = validateExternalUrl(target);

    if (!ALLOWED_API_ORIGIN_SET.has(url.origin)) {
        throw new Error(`network origin is not authorized: ${url.origin}`);
    }

    return url;
}

function combineAbortSignals(externalSignal, controller) {
    if (!externalSignal) return () => {};

    const abort = () => controller.abort(externalSignal.reason);
    if (externalSignal.aborted) {
        abort();
        return () => {};
    }

    externalSignal.addEventListener('abort', abort, { once: true });
    return () => externalSignal.removeEventListener('abort', abort);
}

export async function secureFetch(target, options = {}) {
    const url = validateApiUrl(target);
    const safeOptions = options && typeof options === 'object' ? options : {};
    const controller = new AbortController();
    const timeoutMs = Number.isFinite(safeOptions.timeoutMs) ? Math.max(1000, safeOptions.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const cleanupExternalSignal = combineAbortSignals(safeOptions.signal, controller);
    const timeoutId = window.setTimeout(() => controller.abort(new DOMException('Network request timed out.', 'TimeoutError')), timeoutMs);

    const requestOptions = { ...safeOptions };
    delete requestOptions.timeoutMs;
    delete requestOptions.signal;

    const headers = new Headers(safeOptions.headers || {});
    if (headers.has('authorization') && url.origin !== GITHUB_API_ORIGIN) {
        throw new Error('authorization headers are restricted to the GitHub API origin.');
    }
    requestOptions.headers = headers;
    requestOptions.signal = controller.signal;
    requestOptions.credentials = 'omit';
    requestOptions.referrerPolicy = 'no-referrer';
    requestOptions.redirect = 'error';

    try {
        return await fetch(url.href, requestOptions);
    } finally {
        window.clearTimeout(timeoutId);
        cleanupExternalSignal();
    }
}

export function openExternalUrl(target, { name = '_blank' } = {}) {
    const url = validateExternalUrl(target);

    // Open a same-origin about:blank browsing context first so Studio can keep
    // a handle for the map tool's exit behavior. Setting opener to null before
    // navigating prevents the final external document from retaining an opener.
    const opened = window.open('about:blank', name);

    if (!opened) {
        throw new Error('the browser blocked the external window. allow pop-ups for Studio and try again.');
    }

    try {
        opened.opener = null;
        opened.location.replace(url.href);
    } catch (errorValue) {
        try { opened.close(); } catch { /* best-effort cleanup */ }
        throw new Error('external navigation could not be secured.');
    }

    return opened;
}

export const NETWORK_SECURITY_CONFIG = Object.freeze({
    allowedApiOrigins: [...ALLOWED_API_ORIGINS],
    githubApiOrigin: GITHUB_API_ORIGIN,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    localDevelopmentHttpHosts: [...LOCAL_HTTP_HOSTS]
});
