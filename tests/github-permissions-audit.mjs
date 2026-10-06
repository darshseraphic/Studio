import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    GITHUB_PERMISSION_MATRIX,
    GITHUB_PERMISSION_PROBES,
    auditGithubPermissions,
    runGithubPermissionProbes
} from '../github-permissions.js';

const githubSource = fs.readFileSync(path.join(fileURLToPath(new URL('../', import.meta.url)), 'github.js'), 'utf8');
const permissionsSource = fs.readFileSync(path.join(fileURLToPath(new URL('../', import.meta.url)), 'github-permissions.js'), 'utf8');

// The permissions command is registered in the GitHub workspace and dispatches
// to the read-only audit module.
assert.match(githubSource, /'permissions'/, 'permissions command is not registered');
assert.match(githubSource, /if \(action === 'permissions'\)/, 'permissions command handler is missing');
assert.match(githubSource, /auditGithubPermissions\(\)/, 'permissions command does not invoke the permission audit');

// The audit module itself must not contain mutation probe methods.
assert.doesNotMatch(permissionsSource, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
assert.equal(GITHUB_PERMISSION_PROBES.length, 6);
assert.ok(GITHUB_PERMISSION_PROBES.every(probe => probe.method === 'GET'), 'every runtime permission probe must be GET');
assert.ok(GITHUB_PERMISSION_PROBES.every(probe => /^GET\s*$/.test(probe.method)), 'runtime probes must declare GET explicitly');

const contents = GITHUB_PERMISSION_MATRIX.find(x => x.capability === 'Repository contents write');
const workflow = GITHUB_PERMISSION_MATRIX.find(x => x.capability === 'Workflow file write');
const issueComment = GITHUB_PERMISSION_MATRIX.find(x => x.capability === 'Issue/comment write');
const administration = GITHUB_PERMISSION_MATRIX.find(x => x.capability === 'Repository administration/update');
const creation = GITHUB_PERMISSION_MATRIX.find(x => x.capability === 'Repository creation');

assert.ok(contents);
assert.ok(workflow);
assert.ok(issueComment);
assert.ok(administration);
assert.ok(creation);
assert.deepEqual(contents.requirements.allOf, ['Contents: write']);
assert.deepEqual(workflow.requirements.allOf, ['Contents: write', 'Workflows: write']);
assert.deepEqual(issueComment.requirements.issueWriteAnyOf, ['Issues: write']);
assert.deepEqual(issueComment.requirements.commentWriteAnyOf, ['Issues: write', 'Pull requests: write']);
assert.deepEqual(administration.requirements.allOf, ['Administration: write']);
assert.equal(creation.endpoint, 'POST /user/repos');
assert.deepEqual(creation.requirements.anyOf, ['Administration: write', 'Repository creation: write']);
assert.equal(creation.fineGrained, 'Administration: write OR Repository creation: write');
assert.equal(creation.runtimeProbe, 'Not probed; repository creation is a mutation');
assert.ok(creation.requirements.anyOf.includes('Administration: write'), 'Studio /user/repos must accept Administration: write');
assert.ok(creation.requirements.anyOf.includes('Repository creation: write'), 'Studio /user/repos must accept Repository creation: write');
assert.equal(creation.requirements.allOf, undefined);
assert.match(creation.fineGrained, /^Administration: write OR Repository creation: write$/);
assert.equal(creation.requirements.anyOf.join(' OR '), creation.fineGrained);
assert.ok(!('organizationCreationAnyOf' in creation.requirements), 'Studio matrix must not claim organization creation capability');
assert.ok(!('templateCreationAlternatives' in creation.requirements), 'Studio matrix must not claim template repository creation capability');

// Runtime probes exercise the real secureFetch path with deterministic HTTP
// responses. The transport mock observes every actual outbound request and
// rejects any attempt to use a non-GET method.
const previousFetch = globalThis.fetch;
const previousWindow = globalThis.window;
const requests = [];

globalThis.window = {
    location: { href: 'https://studio.example/' },
    setTimeout,
    clearTimeout
};
globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options: { ...options } });
    assert.equal(options.method, 'GET', `permission probe used ${options.method || 'implicit'} instead of GET`);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');

    const requestUrl = new URL(url);
    const pathname = requestUrl.pathname;
    if (pathname.endsWith('/permission')) {
        return new Response(JSON.stringify({ permission: 'maintain' }), {
            status: 200,
            headers: { 'content-type': 'application/json', 'x-accepted-github-permissions': 'metadata=read' }
        });
    }
    const accepted = pathname.endsWith('/interaction-limits')
        ? 'administration=read'
        : pathname === '/user'
            ? 'metadata=read'
            : 'contents=read';
    return new Response('{}', {
        status: 200,
        headers: { 'x-accepted-github-permissions': accepted }
    });
};

try {
    const results = await runGithubPermissionProbes({
        token: 'github_pat_test',
        githubUsername: 'octocat',
        repository: 'Hello-World'
    });

    assert.equal(results.length, GITHUB_PERMISSION_PROBES.length);
    assert.ok(results.every(result => result.method === 'GET'));
    assert.ok(requests.every(request => request.options.method === 'GET'));

    const role = results.find(result => result.name === 'repository role');
    assert.equal(role?.result, 'reachable');
    assert.equal(role?.role, 'maintain');
    assert.deepEqual(role?.acceptedPermissions, ['metadata=read']);
    assert.ok(requests.some(request => request.url.endsWith('/collaborators/octocat/permission')));
    assert.ok(requests.some(request => request.url.endsWith('/interaction-limits')));

    // The session-bound command refuses to operate without a verified session.
    const previousPrint = globalThis.print;
    try {
        globalThis.print = () => {};
        await assert.rejects(() => auditGithubPermissions(), /unlock a verified GitHub session/);
    } finally {
        globalThis.print = previousPrint;
    }
} finally {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
}

console.log('github-permissions-audit: PASS');
