/**
 * Safe GitHub permission/capability audit.
 *
 * Runtime probes are strictly read-only. Write permissions are represented as
 * documented fine-grained permission requirements and are never tested with a
 * mutating request merely to prove a token's write access.
 */
import { secureFetch } from './network-security.js';
import { getUnlockedSession, getWorkspaceStateSync } from './session-vault.js';

export const GITHUB_PERMISSION_MATRIX = Object.freeze([
    {
        capability: 'Repository contents write',
        fineGrained: 'Contents: write',
        requirements: Object.freeze({
            allOf: Object.freeze(['Contents: write'])
        }),
        runtimeProbe: 'Not probed; proving write access requires a mutation'
    },
    {
        capability: 'Workflow file write',
        fineGrained: 'Contents: write + Workflows: write for .github/workflows/**',
        requirements: Object.freeze({
            allOf: Object.freeze(['Contents: write', 'Workflows: write'])
        }),
        runtimeProbe: 'Not probed; proving write access requires a mutation'
    },
    {
        capability: 'Issue/comment write',
        fineGrained: 'Issues: write OR Pull requests: write where applicable',
        requirements: Object.freeze({
            issueWriteAnyOf: Object.freeze(['Issues: write']),
            commentWriteAnyOf: Object.freeze(['Issues: write', 'Pull requests: write'])
        }),
        runtimeProbe: 'Not probed; proving write access requires a mutation'
    },
    {
        capability: 'Repository administration/update',
        fineGrained: 'Administration: write',
        requirements: Object.freeze({
            allOf: Object.freeze(['Administration: write'])
        }),
        runtimeProbe: 'Read-only administration state is probed via GET /interaction-limits'
    },
    {
        capability: 'Repository creation',
        endpoint: 'POST /user/repos',
        fineGrained: 'Administration: write OR Repository creation: write',
        requirements: Object.freeze({
            anyOf: Object.freeze(['Administration: write', 'Repository creation: write'])
        }),
        runtimeProbe: 'Not probed; repository creation is a mutation'
    }
]);

export const GITHUB_PERMISSION_PROBES = Object.freeze([
    Object.freeze({ name: 'account identity', method: 'GET', path: '/user' }),
    Object.freeze({ name: 'repository metadata', method: 'GET', path: '/repos/{owner}/{repo}' }),
    Object.freeze({ name: 'repository contents read', method: 'GET', path: '/repos/{owner}/{repo}/contents/' }),
    Object.freeze({ name: 'issues read', method: 'GET', path: '/repos/{owner}/{repo}/issues?state=open&per_page=1' }),
    Object.freeze({ name: 'repository role', method: 'GET', path: '/repos/{owner}/{repo}/collaborators/{username}/permission', parse: 'repository-role' }),
    Object.freeze({ name: 'administration read', method: 'GET', path: '/repos/{owner}/{repo}/interaction-limits' })
]);

function acceptedPermissions(response) {
    const raw = response.headers.get('x-accepted-github-permissions') || '';
    return raw
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}

function classify(response) {
    if (response.ok) return 'reachable';
    if (response.status === 401) return 'unauthorized';
    if (response.status === 403) return 'forbidden';
    if (response.status === 404) return 'not-found-or-not-authorized';
    return `http-${response.status}`;
}

function renderProbeUrl(pathTemplate, { owner, repository, username }) {
    return `https://api.github.com${pathTemplate
        .replace('{owner}', encodeURIComponent(owner))
        .replace('{repo}', encodeURIComponent(repository))
        .replace('{username}', encodeURIComponent(username))}`;
}

async function extractProbeData(spec, response) {
    if (spec.parse === 'repository-role' && response.ok) {
        const body = await response.json();
        return { role: typeof body?.permission === 'string' ? body.permission : null };
    }
    return {};
}

async function probe(spec, url, token) {
    const response = await secureFetch(url, {
        method: spec.method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
        },
        cache: 'no-store'
    });

    return {
        name: spec.name,
        method: spec.method,
        status: response.status,
        result: classify(response),
        acceptedPermissions: acceptedPermissions(response),
        ...(await extractProbeData(spec, response))
    };
}

/**
 * Executes only the read-only permission probes. This is separated from the
 * session-bound command so the runtime test can exercise the real probe code
 * without constructing an encrypted session or sending any write request.
 */
export async function runGithubPermissionProbes({ token, githubUsername, repository }) {
    if (typeof token !== 'string' || token.length === 0) throw new Error('GitHub token is required for permission probes.');
    if (typeof githubUsername !== 'string' || githubUsername.length === 0) throw new Error('GitHub username is required for permission probes.');
    if (typeof repository !== 'string' || repository.length === 0) throw new Error('repository is required for permission probes.');

    const context = {
        owner: githubUsername,
        repository,
        username: githubUsername
    };
    const results = [];

    for (const spec of GITHUB_PERMISSION_PROBES) {
        const url = spec.path === '/user'
            ? 'https://api.github.com/user'
            : renderProbeUrl(spec.path, context);
        try {
            results.push(await probe(spec, url, token));
        } catch (errorValue) {
            results.push({
                name: spec.name,
                method: spec.method,
                status: null,
                result: 'network-error',
                acceptedPermissions: [],
                error: errorValue instanceof Error ? errorValue.message : 'network failure'
            });
        }
    }

    return results;
}

function formatAcceptedPermissions(values) {
    return values.length ? ` | GitHub accepts: ${values.join(', ')}` : '';
}

function formatRequirementSummary(item) {
    const requirements = item.requirements || {};
    const parts = [];

    const separators = {
        allOf: ' + ',
        anyOf: ' OR ',
        issueWriteAnyOf: ' OR ',
        commentWriteAnyOf: ' OR '
    };
    for (const key of Object.keys(separators)) {
        if (Array.isArray(requirements[key])) {
            parts.push(`${key}: ${requirements[key].join(separators[key])}`);
        }
    }
    return parts.join('; ');
}

export async function auditGithubPermissions(printFn = globalThis.print) {
    const session = getUnlockedSession();
    if (!session?.token || !session.githubUsername || !session.githubUserId) {
        throw new Error('unlock a verified GitHub session before running the permission audit.');
    }
    if (typeof printFn !== 'function') throw new Error('permission audit output channel is unavailable.');

    const repo = getWorkspaceStateSync().repository;
    printFn('github permission audit: read-only probes only; no write operations are attempted.');
    printFn(`identity: @${session.githubUsername} (GitHub ID ${session.githubUserId})`);
    printFn(repo ? `repository: ${session.githubUsername}/${repo}` : 'repository: none bound; static permission profile only');
    printFn('');

    const results = repo
        ? await runGithubPermissionProbes({
            token: session.token,
            githubUsername: session.githubUsername,
            repository: repo
        })
        : [];

    for (const item of results) {
        const suffix = formatAcceptedPermissions(item.acceptedPermissions);
        const roleSuffix = item.role ? ` | role: ${item.role}` : '';
        const status = item.status === null ? item.result : `${item.result} (${item.status})`;
        printFn(`[ ${status.toUpperCase()} ] ${item.name} [${item.method}]${roleSuffix}${suffix}`);
    }

    printFn('');
    printFn('minimum fine-grained permission profile used by Studio:');
    for (const item of GITHUB_PERMISSION_MATRIX) {
        printFn(`- ${item.capability}: ${item.fineGrained}`);
        printFn(`  ${formatRequirementSummary(item)}`);
    }
    printFn('write permissions are documented requirements, not runtime-probed capabilities.');
    return {
        repository: repo,
        probes: results.length ? 'completed' : 'skipped-no-repository',
        results,
        matrix: GITHUB_PERMISSION_MATRIX
    };
}
