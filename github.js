import {
    registerTool, print, getSystemPrompt, setMode, registry,
    currentPath, fileBuffers, virtualDirectories,
    getFullFilePath, savePathState, VALID_EXTENSIONS, usedToolsInSession
} from './main.js';

let activeRepo = localStorage.getItem('repository') || '';
let pendingRepoCreation = null;

let pendingDeleteTarget = "";
let pendingDeleteType = "";
let pendingRenameTarget = "";
let pendingRenameType = "";
let pendingVisibilityChange = "";
let pendingSettingsRenameConfirm = false;
let pendingSettingsRenameInput = false;
let pendingSettingsRenameOldName = "";

const REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const SAFE_FILE_NAME_REGEX = /^[a-zA-Z0-9._\\-\\/]+$/;
const AUTH_TOKEN_REGEX = /^[a-zA-Z0-9_=\\-\\.]+$/;

function sanitizeInputString(str) {
    return str.trim().replace(/[<>'"\`]/g, '');
}

export async function fetchRepoTree(repoName, subDirectoryPath = '') {
    const rawToken = localStorage.getItem('user');
    const rawUsername = localStorage.getItem('github_username');

    if (!rawToken || !rawUsername) {
        print("error: authentication token signature missing. login verified credential profiles required.");
        return [];
    }

    const username = encodeURIComponent(rawUsername);
    const repo = encodeURIComponent(repoName);
    const cleanSubPath = encodeURIComponent(subDirectoryPath);
    const apiPath = `https://api.github.com/repos/${username}/${repo}/contents/${cleanSubPath}`;

    try {
        const res = await fetch(apiPath, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${rawToken}`,
                'Accept': 'application/vnd.github+json'
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            if (res.status === 404) {
                return null;
            }
            print(`error: directory retrieval rejected by GitHub with status ${res.status}.`);
            return null;
        }

        const structuralData = await res.json();
        if (Array.isArray(structuralData)) {
            return structuralData.map(node => ({
                name: node.name,
                type: node.type,
                path: node.path
            }));
        } else if (structuralData && typeof structuralData === 'object') {
            return [{ name: structuralData.name, type: 'file', path: structuralData.path }];
        }
        return [];
    } catch (err) {
        print(`error: structural network error during directory fetching: ${err.message}`);
        return [];
    }
}

export async function fetchUserRepos() {
    const rawToken = localStorage.getItem('user');
    if (!rawToken) {
        print("error: authentication token missing. login first via github > login/token.");
        return [];
    }

    try {
        const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${rawToken}`,
                'Accept': 'application/vnd.github+json'
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            print(`error: failed to retrieve repository list. GitHub status ${res.status}.`);
            return [];
        }

        const data = await res.json();
        if (Array.isArray(data)) {
            return data.map(r => ({ name: r.name, private: r.private }));
        }
        return [];
    } catch (err) {
        print(`error: network error fetching repository list: ${err.message}`);
        return [];
    }
}

export async function pushFileToGitHub(filePath, content, commitMessage = null) {
    const rawToken = localStorage.getItem('user');
    const rawUsername = localStorage.getItem('github_username');
    const rawRepo = localStorage.getItem('repository');

    if (!rawToken || !rawUsername || !rawRepo) return false;

    if (!AUTH_TOKEN_REGEX.test(rawToken) || !REPO_NAME_REGEX.test(rawRepo)) {
        return false;
    }
    if (!SAFE_FILE_NAME_REGEX.test(filePath) || filePath.includes('..')) {
        return false;
    }

    const username = encodeURIComponent(rawUsername);
    const repo = encodeURIComponent(rawRepo);
    const safeFilePath = filePath.split('/').map(p => encodeURIComponent(p)).join('/');
    const apiPath = `https://api.github.com/repos/${username}/${repo}/contents/${safeFilePath}`;

    try {
        const uint8Array = new TextEncoder().encode(content);
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64Content = btoa(binaryString);
        let sha = null;

        const fileCheck = await fetch(apiPath, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${rawToken}`,
                'Accept': 'application/vnd.github+json'
            },
            cache: 'no-store'
        });

        if (fileCheck.ok) {
            const fileData = await fileCheck.json();
            if (fileData && typeof fileData.sha === 'string') {
                sha = fileData.sha;
            }
        }

        const actionType = sha ? 'Update' : 'Create';
        const payload = {
            message: commitMessage || `${actionType} environment workspace tracking resource: ${sanitizeInputString(filePath)}`,
            content: base64Content
        };

        if (sha) {
            payload.sha = sha;
        }

        const pushRes = await fetch(apiPath, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${rawToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github+json'
            },
            body: JSON.stringify(payload)
        });

        return pushRes.ok;
    } catch (e) {
        print(`error: networking error during push connection: ${e.message}`);
        return false;
    }
}

export async function pullFileFromGitHub(filePath) {
    const rawToken = localStorage.getItem('user');
    const rawUsername = localStorage.getItem('github_username');
    const rawRepo = localStorage.getItem('repository');

    if (!rawToken || !rawUsername || !rawRepo) return null;
    if (!AUTH_TOKEN_REGEX.test(rawToken) || !REPO_NAME_REGEX.test(rawRepo)) return null;
    if (!SAFE_FILE_NAME_REGEX.test(filePath) || filePath.includes('..')) return null;

    const username = encodeURIComponent(rawUsername);
    const repo = encodeURIComponent(rawRepo);
    const safeFilePath = filePath.split('/').map(p => encodeURIComponent(p)).join('/');

    const apiPath = `https://api.github.com/repos/${username}/${repo}/contents/${safeFilePath}`;

    try {
        const res = await fetch(apiPath, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${rawToken}`,
                'Accept': 'application/vnd.github+json'
            },
            cache: 'no-store'
        });

        if (!res.ok) return null;

        const data = await res.json();
        if (data && typeof data.content === 'string') {
            const cleanedBase64 = data.content.replace(/\s/g, '');
            const binaryString = atob(cleanedBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return new TextDecoder().decode(bytes);
        }
        return null;
    } catch (e) {
        return null;
    }
}

export async function deletePathFromGitHub(filePath) {
    const rawToken = localStorage.getItem('user');
    const rawUsername = localStorage.getItem('github_username');
    const rawRepo = localStorage.getItem('repository');

    if (!rawToken || !rawUsername || !rawRepo) return false;
    if (!AUTH_TOKEN_REGEX.test(rawToken) || !REPO_NAME_REGEX.test(rawRepo)) return false;
    if (!SAFE_FILE_NAME_REGEX.test(filePath) || filePath.includes('..')) return false;

    const username = encodeURIComponent(rawUsername);
    const repo = encodeURIComponent(rawRepo);
    const safeFilePath = filePath.split('/').map(p => encodeURIComponent(p)).join('/');
    const apiPath = `https://api.github.com/repos/${username}/${repo}/contents/${safeFilePath}`;

    try {
        const res = await fetch(apiPath, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${rawToken}`,
                'Accept': 'application/vnd.github+json'
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            if (res.status === 404) return true;
            return false;
        }

        const data = await res.json();

        if (Array.isArray(data)) {
            let overallSuccess = true;
            for (const node of data) {
                const success = await deletePathFromGitHub(node.path);
                if (!success) overallSuccess = false;
            }
            return overallSuccess;
        }
        else if (data && typeof data.sha === 'string') {
            const deleteRes = await fetch(apiPath, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${rawToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github+json'
                },
                body: JSON.stringify({
                    message: `Purge workspace resource node: ${sanitizeInputString(filePath)}`,
                    sha: data.sha
                })
            });
            return deleteRes.ok;
        }
        return false;
    } catch (e) {
        print(`error: network communication error during remote deletion stream: ${e.message}`);
        return false;
    }
}

async function renameDirectoryOnGitHub(repoName, oldDirPath, newDirPath) {
    const treeItems = await fetchRepoTree(repoName, oldDirPath);
    if (!treeItems) return false;

    let overallSuccess = true;
    for (const item of treeItems) {
        const oldItemPath = item.path;
        const newItemPath = newDirPath + oldItemPath.substring(oldDirPath.length);

        if (item.type === 'dir') {
            const nestedSuccess = await renameDirectoryOnGitHub(repoName, oldItemPath, newItemPath);
            if (!nestedSuccess) overallSuccess = false;
        } else {
            const content = await pullFileFromGitHub(oldItemPath);
            if (content === null) {
                overallSuccess = false;
                continue;
            }
            const created = await pushFileToGitHub(newItemPath, content);
            if (!created) {
                overallSuccess = false;
                continue;
            }
            const purged = await deletePathFromGitHub(oldItemPath);
            if (!purged) overallSuccess = false;
        }
    }
    return overallSuccess;
}

async function fetchRepoIssues(repoName, state = 'all') {
    const token = localStorage.getItem('user');
    const username = localStorage.getItem('github_username');
    if (!token || !username) return null;

    try {
        const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/issues?state=${state}&per_page=100`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json'
            },
            cache: 'no-store'
        });

        if (!res.ok) return null;

        const data = await res.json();
        if (!Array.isArray(data)) return null;
        return data.filter(item => !item.pull_request);
    } catch (e) {
        return null;
    }
}

async function verifyRemotePath(repoName, directoryPath = '') {
    if (directoryPath && virtualDirectories.has(directoryPath)) {
        return true;
    }

    const token = localStorage.getItem('user');
    const username = localStorage.getItem('github_username') || 'guest';

    if (!token) {
        print("warning: active github auth token not found. switching paths without remote validation verification.");
        return true;
    }

    const safeUsername = encodeURIComponent(username);
    const safeRepo = encodeURIComponent(repoName);

    let url = `https://api.github.com/repos/${safeUsername}/${safeRepo}`;

    if (directoryPath) {
        const safeSegments = directoryPath
            .split('/')
            .map(segment => encodeURIComponent(segment))
            .join('/');
        url += `/contents/${safeSegments}`;
    }

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json'
            },
            cache: 'no-store'
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

function getGithubConfigPrompt() {
    const username = localStorage.getItem('github_username') || 'guest';
    const repo = localStorage.getItem('repository') || '';
    const deepPath = currentPath && currentPath.length > 0 ? '/' + currentPath.join('/') : '';
    return `${username}/github${repo ? '/' + repo : ''}${deepPath}>`;
}

export function isInGithubContext() {
    return localStorage.getItem('github_active') === 'true' || !!localStorage.getItem('repository');
}

export function printGithubHelp() {
    const activeUsername = localStorage.getItem('github_username') || 'guest';
    const dynamicUserCmd = `  ${activeUsername}/`.padEnd(29);

    print("github workspace command maps:");
    print("  github                         - switch context configuration sub-menus");
    print("  editor                         - trigger universal plaintext file editor");
    print("  edit/[file_name]               - fletch and open targeted items inside the workspace text editor");
    print("  cd [dir_name]                  - descend into a sub-directory node array");
    print("  cd [file_name]                 - pull and perform immediate read-only preview console blocks");
    print("  cd .. (or ../../)              - perform relative tracking stack reversals");
    print("  [relative_path] (ex: ../)      - quick relative tracking jumps without writing 'cd'");
    print(`${dynamicUserCmd}    - unbind the active repository, stay inside the github workspace`);
    print("  create/[target]                - allocate new repositories, sub-directories, or code files");
    print("  delete/[target]                - clear architectural nodes or elements with interactive safeguards");
    print("  rename/[target]                - change resource titles or repository labels interactively");
    print("  pull/[file_name]               - restore structural content configurations from cloud nodes");
    print("  save/[file_name]               - serialize buffer arrays and execute remote pushes to cloud git");
    print("  run/[file_name]                - compile and render document nodes to sub-sandbox tabs cleanly");
    print("  fletch                         - list every repository under your github account (no repo bound)");
    print("  fletch/[directory_name]        - parse file extensions and nested nodes inside a subdirectory");
    print("  fletch/[file_name.exten]       - display full layout code contents of a file node instantly");
    print("  description                    - fetch the current repository description");
    print("  edit/description               - fletch and edit the current repository description");
    print("  issues                         - list repository issues (++ open, -- closed)");
    print("  issues/[number or title]       - fletch full details for a specific issue");
    print("  issues/close/[number]          - close an open issue");
    print("  issues/reopen/[number]         - reopen a closed issue");
    print(`  issues/comment/[number]/"msg"  - post a comment on an issue`);
    print(`  issues/fixed/[number]/"msg"    - post a comment and close the issue`);
    print("  exit                           - leave the github workspace and return to the default prompt");
}

export function printSettingsHelp() {
    print("repository settings command maps:");
    print("  settings/help                          - show this settings command list");
    print("  settings/rename                        - rename the repository (confirmation required)");
    print("  settings/branch/[branchName]           - change the repository's default branch");
    print("  settings/issues/all                    - remove interaction restrictions, issues open to all users");
    print("  settings/issues/collaborative           - restrict issue interactions to collaborators only");
    print("  settings/sponsorships                  - toggle the sponsor button on or off");
    print("  settings/discussions                   - toggle discussions on or off");
    print("  settings/projects                      - toggle projects on or off");
    print("  settings/visibility/public              - make the repository public (confirmation required)");
    print("  settings/visibility/private              - make the repository private (confirmation required)");
}

export function hasPendingInteraction() {
    return !!(pendingDeleteTarget || pendingRenameTarget || pendingVisibilityChange || pendingSettingsRenameConfirm || pendingSettingsRenameInput);
}

export async function handlePendingInteraction(rawInput) {
    if (pendingDeleteTarget) {
        print(`> ${rawInput}`);

        const cleanInput = rawInput.trim();
        const lowerInput = cleanInput.toLowerCase();

        if (lowerInput === 'yes' || lowerInput === 'y') {
            if (pendingDeleteType === 'repository') {
                print(`system: executing structural teardown streams for remote repository: '${pendingDeleteTarget}'...`);
                const activeRepoName = localStorage.getItem('repository');
                if (activeRepoName && activeRepoName.toLowerCase() === pendingDeleteTarget.toLowerCase()) {
                    localStorage.removeItem('repository');
                    currentPath.length = 0;
                    virtualDirectories.clear();
                    savePathState();
                }
            } else if (pendingDeleteType === 'file') {
                print(`system: removing local workspace content memory traces for file: '${pendingDeleteTarget}'...`);
                delete fileBuffers[pendingDeleteTarget];

                const fullPath = getFullFilePath(pendingDeleteTarget);
                print(`system: streaming teardown verification request to remote GitHub repository...`);
                const remoteSuccess = await deletePathFromGitHub(fullPath);
                if (remoteSuccess) {
                    print(`system: remote cloud resource verification cleared successfully.`);
                } else {
                    print(`error: local trace wiped, but remote pipeline encountered an authorization/network failure.`);
                }
            } else if (pendingDeleteType === 'directory') {
                print(`system: purging structural directory node tree components for: '${pendingDeleteTarget}'...`);
                const fullDir = getFullFilePath(pendingDeleteTarget);
                virtualDirectories.delete(fullDir);

                print(`system: streaming recursive teardown request to remote GitHub repository...`);
                const remoteSuccess = await deletePathFromGitHub(fullDir);
                if (remoteSuccess) {
                    print(`system: remote directory tree verification cleared successfully.`);
                } else {
                    print(`error: local trace wiped, but remote directory pipeline encountered a failure.`);
                }

                const idx = currentPath.findIndex(p => p.toLowerCase() === pendingDeleteTarget.toLowerCase());
                if (idx !== -1) {
                    currentPath.length = idx;
                    savePathState();
                }
            }
            print(`system: target modification sequence complete. '${pendingDeleteTarget}' deleted successfully.`);
            pendingDeleteTarget = "";
            pendingDeleteType = "";
            setMode("main", getSystemPrompt());
        } else if (lowerInput === 'no' || lowerInput === 'n') {
            print("system: deletion deployment sequence canceled by administrative authority.");
            pendingDeleteTarget = "";
            pendingDeleteType = "";
            setMode("main", getSystemPrompt());
        } else {
            print(`Are you sure you want to delete the ${pendingDeleteType} '${pendingDeleteTarget}', [Yes/no]?`);
        }
        return;
    }

    if (pendingRenameTarget) {
        print(`> ${rawInput}`);
        const newName = rawInput.trim();

        if (!newName) {
            print(`error: new name configuration cannot be blank. Enter new name for ${pendingRenameType} '${pendingRenameTarget}':`);
            return;
        }

        if (pendingRenameType === 'repository') {
            print(`system: streaming structural administrative PATCH updates to GitHub repository: '${pendingRenameTarget}'...`);
            const token = localStorage.getItem('user');
            const username = localStorage.getItem('github_username');

            if (!token || !username) {
                print("error: active github auth credentials not resolved. process aborted.");
            } else {
                try {
                    const patchRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(pendingRenameTarget)}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/vnd.github+json'
                        }
                    });

                    if (patchRes.ok) {
                        print(`system: repository successfully rewritten to '${newName}' in cloud configurations.`);
                        localStorage.setItem('repository', newName);
                        savePathState();
                    } else {
                        const errData = await patchRes.json().catch(() => ({}));
                        print(`error: failed to rewrite repository frame. GitHub status ${patchRes.status}: ${errData.message || 'Unknown administrative constraint'}`);
                    }
                } catch (e) {
                    print(`error: unexpected transmission pipeline failure: ${e.message}`);
                }
            }
        }
        else if (pendingRenameType === 'file') {
            const fileSegments = newName.split('.');
            const extension = fileSegments[fileSegments.length - 1].toLowerCase();

            if (!newName.includes('.') || !VALID_EXTENSIONS.includes(extension)) {
                print(`error: layout configuration rejected. extension '.${extension}' breaks systemic syntax rule maps.`);
                print(`accepted matrix models: ${VALID_EXTENSIONS.join(', ')}`);
            } else {
                const oldFullPath = getFullFilePath(pendingRenameTarget);
                const newFullPath = getFullFilePath(newName);

                print(`system: configuring file tracking shift from [${oldFullPath}] to [${newFullPath}]...`);

                let activeContent = fileBuffers[pendingRenameTarget] ? fileBuffers[pendingRenameTarget].join('\n') : null;
                if (activeContent === null) {
                    activeContent = await pullFileFromGitHub(oldFullPath);
                }

                if (activeContent !== null) {
                    print(`system: initializing atomic shift data frame copy...`);
                    const copyCreated = await pushFileToGitHub(newFullPath, activeContent);
                    if (copyCreated) {
                        print(`system: copy finalized. issuing teardown instruction on old node trace...`);
                        const oldPurged = await deletePathFromGitHub(oldFullPath);
                        if (oldPurged) {
                            if (fileBuffers[pendingRenameTarget]) {
                                fileBuffers[newName] = fileBuffers[pendingRenameTarget];
                                delete fileBuffers[pendingRenameTarget];
                            }
                            print(`system: cloud repository resource file rename process completed successfully.`);
                        } else {
                            print(`warning: copy mapped to destination, but local/remote pipeline failed to release the old resource footprint safely.`);
                        }
                    } else {
                        print(`error: target destination write failure. execution canceled.`);
                    }
                } else {
                    print(`error: cannot parse or read the initialization source parameters of '${pendingRenameTarget}'.`);
                }
            }
        }
        else if (pendingRenameType === 'directory') {
            const oldFullDir = getFullFilePath(pendingRenameTarget);
            const newFullDir = getFullFilePath(newName);
            const repoName = localStorage.getItem('repository');

            print(`system: configuring structural directory node updates from [${oldFullDir}] to [${newFullDir}]...`);
            print(`system: migrating each remote blob under the new directory path and purging old nodes...`);

            const success = await renameDirectoryOnGitHub(repoName, oldFullDir, newFullDir);
            if (success) {
                print(`system: cloud directory path mappings rewritten successfully.`);
            } else {
                print("warning: some remote directory nodes failed to migrate. local tree index adjusted regardless.");
            }

            if (virtualDirectories.has(oldFullDir)) {
                virtualDirectories.delete(oldFullDir);
                virtualDirectories.add(newFullDir);
            }
            const pathIndex = currentPath.findIndex(p => p.toLowerCase() === pendingRenameTarget.toLowerCase());
            if (pathIndex !== -1) {
                currentPath[pathIndex] = newName;
                savePathState();
            }
        }

        pendingRenameTarget = "";
        pendingRenameType = "";
        setMode("main", getSystemPrompt());
        return;
    }

    if (pendingVisibilityChange) {
        print(`> ${rawInput}`);
        const lowerInput = rawInput.trim().toLowerCase();

        if (lowerInput === 'yes' || lowerInput === 'y') {
            const token = localStorage.getItem('user');
            const username = localStorage.getItem('github_username');
            const activeRepoName = localStorage.getItem('repository');
            const newVisibility = pendingVisibilityChange;

            print(`system: updating repository visibility to '${newVisibility}'...`);
            try {
                const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(activeRepoName)}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github+json'
                    },
                    body: JSON.stringify({ private: newVisibility === 'private' })
                });

                if (res.ok) {
                    print(`system: repository visibility successfully changed to ${newVisibility}.`);
                } else {
                    const errData = await res.json().catch(() => ({}));
                    print(`error: failed to change visibility. GitHub status ${res.status}: ${errData.message || 'unknown administrative constraint'}`);
                }
            } catch (e) {
                print(`error: unexpected transmission pipeline failure: ${e.message}`);
            }

            pendingVisibilityChange = "";
            setMode("main", getSystemPrompt());
        } else if (lowerInput === 'no' || lowerInput === 'n') {
            print("system: visibility change canceled.");
            pendingVisibilityChange = "";
            setMode("main", getSystemPrompt());
        } else {
            print(`Are you sure? [Yes] or [No]?`);
        }
        return;
    }

    if (pendingSettingsRenameConfirm) {
        print(`> ${rawInput}`);
        const lowerInput = rawInput.trim().toLowerCase();

        if (lowerInput === 'yes' || lowerInput === 'y') {
            pendingSettingsRenameConfirm = false;
            pendingSettingsRenameInput = true;
            setMode("main", "Rename> ");
        } else if (lowerInput === 'no' || lowerInput === 'n') {
            print("system: rename canceled.");
            pendingSettingsRenameConfirm = false;
            pendingSettingsRenameOldName = "";
            setMode("main", getSystemPrompt());
        } else {
            print(`Currently, it's '${sanitizeInputString(pendingSettingsRenameOldName)}'. Are you sure you want to rename it? [Yes] or [No]?`);
        }
        return;
    }

    if (pendingSettingsRenameInput) {
        print(`Rename> ${rawInput}`);
        const newRepoName = rawInput.trim();

        if (!newRepoName) {
            print("error: repository name cannot be empty. try again:");
            return;
        }
        if (!REPO_NAME_REGEX.test(newRepoName) || newRepoName.length > 100) {
            print("error: invalid repository name format or character structure detected. try again:");
            return;
        }

        print(`system: renaming the repository name to '${sanitizeInputString(newRepoName)}'...`);

        const token = localStorage.getItem('user');
        const username = localStorage.getItem('github_username');
        const oldName = pendingSettingsRenameOldName;

        try {
            const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(oldName)}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github+json'
                },
                body: JSON.stringify({ name: newRepoName })
            });

            if (res.ok) {
                localStorage.setItem('repository', newRepoName);
                activeRepo = newRepoName;
                savePathState();
                print(`system: done. the repository name is now changed to '${sanitizeInputString(newRepoName)}'.`);
            } else {
                const errData = await res.json().catch(() => ({}));
                print(`error: failed to rename repository. GitHub status ${res.status}: ${errData.message || 'unknown administrative constraint'}`);
            }
        } catch (e) {
            print(`error: unexpected transmission pipeline failure: ${e.message}`);
        }

        pendingSettingsRenameInput = false;
        pendingSettingsRenameOldName = "";
        setMode("main", getSystemPrompt());
        return;
    }
}

const WORKSPACE_FIRST_SEGMENTS = new Set(['create', 'delete', 'rename', 'pull', 'save', 'run', 'fletch', 'issues', 'settings']);

export function isWorkspaceCommand(cleanCommand) {
    const lowerCommand = cleanCommand.toLowerCase();
    const firstSegment = lowerCommand.split('/')[0];
    const currentUsername = (localStorage.getItem('github_username') || 'guest').toLowerCase();

    if (firstSegment === 'github') return true;
    if (lowerCommand === 'editor' || firstSegment === 'edit') return true;
    if (lowerCommand === 'cd' || lowerCommand.startsWith('cd ') || lowerCommand.startsWith('cd/')) return true;
    if (lowerCommand === '..' || lowerCommand.startsWith('../') || lowerCommand.endsWith('/..')) return true;
    if (lowerCommand === 'darshseraphic/' || lowerCommand === 'rocen/' || lowerCommand === `${currentUsername}/`) return true;
    if (WORKSPACE_FIRST_SEGMENTS.has(firstSegment)) return true;
    if (lowerCommand === 'description') return true;
    if (lowerCommand === 'exit' || lowerCommand === 'logout' || firstSegment === 'login') return true;

    return false;
}

export async function handleWorkspaceCommand(cleanCommand) {
    const lowerCommand = cleanCommand.toLowerCase();
    const currentUsername = (localStorage.getItem('github_username') || 'guest').toLowerCase();
    const firstSegment = lowerCommand.split('/')[0];
    const isRootReset = (lowerCommand === 'darshseraphic/' || lowerCommand === 'rocen/' || lowerCommand === `${currentUsername}/`);
    const activeRepoName = localStorage.getItem('repository');

    // Validate deep directory command overrides
    if (currentPath.length > 0) {
        if (firstSegment === 'github') {
            print(`You are inside a deep directory, do ${currentUsername}/ to use those commands`);
            return;
        }
    }

    // Capture specific overrides when inside an active repository or deep working directory
    if (activeRepoName || currentPath.length > 0) {
        if (lowerCommand === 'exit' || lowerCommand === 'logout' || lowerCommand === 'login/token' || lowerCommand.startsWith('login/token/') || lowerCommand.startsWith('login/token ')) {
            print(`error: command such as exit, logout and login/token will not work inside the working directory. Do ${currentUsername}/ to use those commands`);
            return;
        }
    }

    if (firstSegment !== 'github' && lowerCommand !== 'exit' && lowerCommand !== 'editor' && !isRootReset && !isInGithubContext()) {
        print("error: you're not inside the github workspace yet. type 'github' to configure access first.");
        return;
    }

    if (isRootReset) {
        localStorage.removeItem('repository');
        currentPath.length = 0;
        savePathState();
        setMode("main", getSystemPrompt());
        return;
    }

    if (lowerCommand === 'exit') {
        if (!activeRepoName && currentPath.length === 0 && !isInGithubContext()) {
            print("system: no active github workspace context to exit.");
            setMode("main", getSystemPrompt());
            return;
        }
        localStorage.removeItem('repository');
        localStorage.removeItem('github_active');
        currentPath.length = 0;
        virtualDirectories.clear();
        savePathState();
        print("system: exited github workspace context. returning to default prompt.");
        setMode("main", getSystemPrompt());
        return;
    }

    if (lowerCommand === '..' || lowerCommand.startsWith('../') || lowerCommand.endsWith('/..')) {
        const steps = cleanCommand.split('/');
        steps.forEach(step => {
            if (step === '..') {
                if (currentPath.length > 0) {
                    currentPath.pop();
                } else {
                    localStorage.removeItem('repository');
                }
            }
        });
        savePathState();
        setMode("main", getSystemPrompt());
        return;
    }

    if (lowerCommand === 'cd' || lowerCommand.startsWith('cd ') || lowerCommand.startsWith('cd/')) {
        let pathTarget = '';
        if (lowerCommand.startsWith('cd ')) {
            pathTarget = cleanCommand.substring(3).trim();
        } else if (lowerCommand.startsWith('cd/')) {
            pathTarget = cleanCommand.substring(3).trim();
        }

        if (!pathTarget) return;

        if (pathTarget.startsWith('..')) {
            const steps = pathTarget.split('/');
            steps.forEach(step => {
                if (step === '..') {
                    if (currentPath.length > 0) {
                        currentPath.pop();
                    } else {
                        localStorage.removeItem('repository');
                    }
                }
            });
            savePathState();
            setMode("main", getSystemPrompt());
            return;
        }

        if (pathTarget.includes('.')) {
            print(`system: executing read-only preview pull for: ${pathTarget}`);

            if (fileBuffers[pathTarget]) {
                print("--------------------------------------------------");
                print(fileBuffers[pathTarget].join('\n'));
                print("--------------------------------------------------");
                return;
            }
            const fullPath = getFullFilePath(pathTarget);
            const data = await pullFileFromGitHub(fullPath);
            if (data !== null) {
                print("--------------------------------------------------");
                print(data);
                print("--------------------------------------------------");
            } else {
                print("error: remote system failed check the spelling or extension of the file.");
            }
            return;
        }

        if (!activeRepoName) {
            print(`system: scanning GitHub for repository configuration: '${pathTarget}'...`);
            const repoExists = await verifyRemotePath(pathTarget, '');
            if (repoExists) {
                localStorage.setItem('repository', pathTarget);
                savePathState();
                setMode("main", getSystemPrompt());
            } else {
                print(`error: repository identity '${pathTarget}' does not exist or is unauthorized.`);
            }
        } else {
            const proposedPath = [...currentPath, pathTarget].join('/');
            print(`system: verifying file tree structure map for: [${proposedPath}]...`);
            const pathExists = await verifyRemotePath(activeRepoName, proposedPath);
            if (pathExists) {
                currentPath.push(pathTarget);
                savePathState();
                setMode("main", getSystemPrompt());
            } else {
                print(`error: directory structural node components '${pathTarget}' do not exist.`);
            }
        }
        return;
    }

    const targetPayload = cleanCommand.split('/').slice(1).join('/');

    if (firstSegment === 'github') {
        localStorage.setItem('github_active', 'true');
        usedToolsInSession.add('github');
        setMode('github', getGithubConfigPrompt());
        if (typeof githubTool.onEnter === 'function') {
            await githubTool.onEnter();
        }
        if (cleanCommand.includes('/')) {
            await githubTool.handleInput(targetPayload);
        }
        return;
    }

    if (firstSegment === 'fletch') {
        if (!activeRepoName) {
            print("system: fletching all repositories bound to your github account...");
            const repos = await fetchUserRepos();
            if (repos.length > 0) {
                print("------------------------------------------------");
                repos.forEach(r => print(`-- ${r.name}${r.private ? ' (private)' : ''}`));
                print("------------------------------------------------");
                print(`total repositories tracked: ${repos.length}.`);
            } else {
                print("system: no repositories found under this account, or retrieval failed.");
            }
            return;
        }

        let fetchPath = "";
        if (currentPath.length > 0) {
            fetchPath = currentPath.join('/');
            if (targetPayload) {
                fetchPath += '/' + targetPayload;
            }
        } else {
            fetchPath = targetPayload;
        }

        if (targetPayload && targetPayload.includes('.')) {
            print(`system: fletching remote file content layout for [${fetchPath}]...`);
            let content = await pullFileFromGitHub(fetchPath);

            if (content === null) {
                if (fileBuffers[fetchPath]) {
                    content = fileBuffers[fetchPath].join('\n');
                } else if (fileBuffers[targetPayload]) {
                    content = fileBuffers[targetPayload].join('\n');
                }
            }

            if (content !== null) {
                print("------------------------------------------------");
                print(content);
                print("------------------------------------------------");
            } else {
                print("error: remote system failed to retrieve file content check parameters.");
            }
            return;
        }

        print(`system: fletching remote directory manifest for [${fetchPath || 'root'}]...`);
        const treeItems = await fetchRepoTree(activeRepoName, fetchPath);
        if (treeItems === null) {
            print(`error: directory '${fetchPath || 'root'}' does not exist in the active repository.`);
        } else if (treeItems.length > 0) {
            print("------------------------------------------------");
            const dirs = treeItems.filter(item => item.type === 'dir');
            const files = treeItems.filter(item => item.type === 'file');
            dirs.forEach(dir => {
                print(`-- ${dir.name}/`);
                virtualDirectories.add(dir.path);
            });
            files.forEach(file => {
                print(`-- ${file.name}`);
                if (!fileBuffers[file.path]) {
                    fileBuffers[file.path] = [""];
                }
            });
            print("------------------------------------------------");
            print(`total contents tracked: ${treeItems.length} nodes.`);
        } else {
            print("system: directory target path is completely empty.");
        }
        return;
    }

    if (firstSegment === 'issues') {
        if (!activeRepoName) {
            print("error: no active repository detected.");
            return;
        }

        if (!targetPayload) {
            print(`system: fletching issues for repository '${activeRepoName}'...`);
            const issues = await fetchRepoIssues(activeRepoName, 'all');
            if (issues === null) {
                print("error: failed to retrieve issues. verify authentication and repository access.");
                return;
            }
            if (issues.length === 0) {
                print("system: no issues found in this repository.");
                return;
            }
            print("------------------------------------------------");
            issues.forEach(issue => {
                const marker = issue.state === 'open' ? '++' : '--';
                print(`${marker} ${issue.number} ${issue.title}`);
            });
            print("------------------------------------------------");
            print(`total issues tracked: ${issues.length}.`);
            return;
        }

        const subParts = targetPayload.split('/');
        const subAction = subParts[0].toLowerCase();
        const token = localStorage.getItem('user');
        const username = localStorage.getItem('github_username');

        if (subAction === 'close' || subAction === 'reopen') {
            const issueNumber = subParts.slice(1).join('/').trim().replace('#', '');
            if (!issueNumber || !/^\d+$/.test(issueNumber)) {
                print(`error: specify a valid issue number, e.g. issues/${subAction}/12`);
                return;
            }
            const newState = subAction === 'close' ? 'closed' : 'open';
            print(`system: updating issue ${issueNumber} state to '${newState}'...`);
            try {
                const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(activeRepoName)}/issues/${issueNumber}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github+json'
                    }
                });
                if (res.ok) {
                    print(`system: issue ${issueNumber} successfully ${subAction === 'close' ? 'closed' : 'reopened'}.`);
                } else {
                    print(`error: failed to update issue state. GitHub status ${res.status}.`);
                }
            } catch (e) {
                print(`error: network error updating issue: ${e.message}`);
            }
            return;
        }

        if (subAction === 'comment' || subAction === 'fixed') {
            const issueNumber = (subParts[1] || '').trim().replace('#', '');
            let message = subParts.slice(2).join('/').trim();
            message = message.replace(/^["']|["']$/g, '');

            if (!issueNumber || !/^\d+$/.test(issueNumber)) {
                print(`error: specify a valid issue number, e.g. issues/${subAction}/12/"message"`);
                return;
            }
            if (!message) {
                print(`error: specify a comment message, e.g. issues/${subAction}/12/"message"`);
                return;
            }

            print(`system: posting comment to issue ${issueNumber}...`);
            try {
                const commentRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(activeRepoName)}/issues/${issueNumber}/comments`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github+json'
                    },
                    body: JSON.stringify({ body: message })
                });

                if (!commentRes.ok) {
                    print(`error: failed to post comment. GitHub status ${commentRes.status}.`);
                    return;
                }
                print(`system: comment posted successfully to issue ${issueNumber}.`);

                if (subAction === 'fixed') {
                    const closeRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(activeRepoName)}/issues/${issueNumber}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/vnd.github+json'
                        },
                        body: JSON.stringify({ state: 'closed' })
                    });
                    if (closeRes.ok) {
                        print(`system: issue ${issueNumber} marked as closed.`);
                    } else {
                        print(`error: comment posted, but failed to close the issue. GitHub status ${closeRes.status}.`);
                    }
                }
            } catch (e) {
                print(`error: network error posting comment: ${e.message}`);
            }
            return;
        }

        print(`system: fletching issue details for '${targetPayload}'...`);
        const issues = await fetchRepoIssues(activeRepoName, 'all');
        if (issues === null) {
            print("error: failed to retrieve issues. verify authentication and repository access.");
            return;
        }

        const numericTarget = targetPayload.replace('#', '').trim();
        let matched = null;
        if (/^\d+$/.test(numericTarget)) {
            matched = issues.find(issue => String(issue.number) === numericTarget);
        }
        if (!matched) {
            matched = issues.find(issue => issue.title.toLowerCase() === targetPayload.toLowerCase());
        }

        if (!matched) {
            print(`error: issue '${targetPayload}' not found in this repository.`);
            return;
        }

        const marker = matched.state === 'open' ? '++' : '--';
        print("------------------------------------------------");
        print(`${marker} ${matched.number} ${matched.title}`);
        print(`state: ${matched.state}`);
        print(`author: ${matched.user ? matched.user.login : 'unknown'}`);
        print(`created: ${matched.created_at}`);
        if (matched.state === 'closed' && matched.closed_at) {
            print(`closed: ${matched.closed_at}`);
        }
        print("--------------------------------------------------");
        print(matched.body || '(no description provided)');
        print("--------------------------------------------------");
        return;
    }

    if (firstSegment === 'create') {
        if (!targetPayload) {
            print("error: specify valid initialization target definitions. e.g. create/app.js or create/repo-name");
            return;
        }

        const token = localStorage.getItem('user');
        const username = localStorage.getItem('github_username');

        if (!token || !username) {
            print("error: active github auth token not found. please login using github tool first.");
            return;
        }

        if (!activeRepoName) {
            print(`system: compiling remote initialization sequence for new GitHub repository: '${targetPayload}'...`);
            try {
                const createRes = await fetch('https://api.github.com/user/repos', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github+json'
                    },
                    body: JSON.stringify({
                        name: targetPayload,
                        private: true,
                        description: "Studio cloud sync environment tracking workspace storage",
                        auto_init: true
                    })
                });

                if (createRes.ok) {
                    print(`system: successfully initialized actual remote repository '${targetPayload}' on GitHub!`);
                    localStorage.setItem('repository', targetPayload);
                    savePathState();
                    setMode("main", getSystemPrompt());
                } else {
                    const errData = await createRes.json().catch(() => ({}));
                    print(`error: failed to provision repository. GitHub status ${createRes.status}: ${errData.message || 'Unknown error'}`);
                }
            } catch (e) {
                print(`error: network communication with github api failed: ${e.message}`);
            }
        }
        else {
            const isFile = targetPayload.includes('.');
            let fullPath = getFullFilePath(targetPayload);
            let content = "";

            if (isFile) {
                const fileSegments = targetPayload.split('.');
                const extension = fileSegments[fileSegments.length - 1].toLowerCase();

                if (!VALID_EXTENSIONS.includes(extension)) {
                    print(`error: initialization aborted. extension '.${extension}' is not recognized in the valid format layout rules matrix.`);
                    print(`accepted matrix models: ${VALID_EXTENSIONS.join(', ')}`);
                    return;
                }

                print(`system: provisioning new isolated plaintext resource on GitHub: [${fullPath}]...`);
                fileBuffers[targetPayload] = [""];
                content = "\n";
            } else {
                print(`system: constructing directory layout node mapping on GitHub via .gitkeep: [${fullPath}]...`);
                virtualDirectories.add(fullPath);
                fullPath = fullPath + '/.gitkeep';
                content = "# Placeholder for virtual directory tracking\n";
            }

            const success = await pushFileToGitHub(fullPath, content);
            if (success) {
                print(`system: actual remote resource successfully pushed and created on your GitHub repository.`);
                setMode("main", getSystemPrompt());
            } else {
                print("error: failed to create resource on GitHub. Verify your token has write permissions.");
            }
        }
        return;
    }

    if (firstSegment === 'delete') {
        if (!targetPayload) {
            print("error: specify valid target resource configurations to delete, e.g. delete/index.html");
            return;
        }
        if (!activeRepoName) {
            pendingDeleteType = "repository";
        } else {
            if (targetPayload.includes('.')) {
                pendingDeleteType = "file";
            } else {
                pendingDeleteType = "directory";
            }
        }
        pendingDeleteTarget = targetPayload;
        print(`Are you sure you want to delete the ${pendingDeleteType} '${targetPayload}', [Yes/no]?`);
        setMode("main", "> ");
        return;
    }

    if (firstSegment === 'rename') {
        if (!targetPayload) {
            print("error: specify a valid target resource to rename, e.g. rename/index.html or rename/old-repo-name");
            return;
        }
        if (!activeRepoName) {
            pendingRenameType = "repository";
        } else {
            if (targetPayload.includes('.')) {
                pendingRenameType = "file";
            } else {
                pendingRenameType = "directory";
            }
        }
        pendingRenameTarget = targetPayload;
        print(`Enter new name for the ${pendingRenameType} '${targetPayload}':`);
        setMode("main", "> ");
        return;
    }

    if (firstSegment === 'edit' || firstSegment === 'editor') {
        if (!cleanCommand.includes('/')) {
            if (registry['editor']) {
                usedToolsInSession.add('editor');
                setMode('editor', registry['editor'].prompt || "");
                if (typeof registry['editor'].onEnter === 'function') {
                    await registry['editor'].onEnter();
                }
            } else {
                print("error: universal plaintext workspace editor is offline or unregistered.");
            }
            return;
        }

        if (!targetPayload) {
            print("error: specify path name parameter, e.g. edit/note.txt");
            return;
        }

        if (targetPayload === 'description') {
            if (!activeRepoName) {
                print("error: no active repository detected.");
                return;
            }
            print("system: fletching repository description from remote...");
            const token = localStorage.getItem('user');
            const username = localStorage.getItem('github_username');
            try {
                const res = await fetch(`https://api.github.com/repos/${username}/${activeRepoName}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
                    cache: 'no-store'
                });
                if (res.ok) {
                    const data = await res.json();
                    fileBuffers['description'] = [data.description || ""];
                } else {
                    fileBuffers['description'] = [""];
                }
            } catch (e) {
                fileBuffers['description'] = [""];
            }
        } else if (activeRepoName) {
            const fullPath = getFullFilePath(targetPayload);
            print(`system: fletching remote content for [${fullPath}]...`);
            const remoteContent = await pullFileFromGitHub(fullPath);
            if (remoteContent !== null) {
                fileBuffers[targetPayload] = remoteContent.replace(/\r\n/g, '\n').split('\n');
            }
        }

        if (registry['editor']) {
            usedToolsInSession.add('editor');
            setMode('editor', registry['editor'].prompt || "01 | ");
            if (typeof registry['editor'].onEnter === 'function') {
                await registry['editor'].onEnter();
            }
            await registry['editor'].handleInput(cleanCommand);
        } else {
            print("error: universal plaintext workspace editor is offline or unregistered.");
        }
        return;
    }

    if (firstSegment === 'pull') {
        if (!targetPayload) {
            print("error: specify path name parameter, e.g. pull/index.html");
            return;
        }
        const fullPath = getFullFilePath(targetPayload);
        print(`system: pulling file data payload from [${fullPath}]...`);
        const contents = await pullFileFromGitHub(fullPath);
        if (contents !== null) {
            fileBuffers[targetPayload] = contents.replace(/\r\n/g, '\n').split('\n');
            print(`system: local workspace buffer sync verified for ${targetPayload}.`);
        } else {
            print("error: failed to retrieve cloud structural components.");
        }
        return;
    }

    if (firstSegment === 'save') {
        if (!targetPayload) {
            print("error: specify target save path parameters, e.g. save/index.html");
            return;
        }
        if (targetPayload === 'description') {
            if (!activeRepoName) {
                print("error: no active repository detected.");
                return;
            }
            const contentLines = fileBuffers['description'];
            if (!contentLines) {
                print("error: no local description buffer found.");
                return;
            }
            const token = localStorage.getItem('user');
            const username = localStorage.getItem('github_username');
            try {
                const res = await fetch(`https://api.github.com/repos/${username}/${activeRepoName}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github+json'
                    },
                    body: JSON.stringify({ description: contentLines.join('\n') })
                });
                if (res.ok) {
                    print("system: repository description updated successfully in the cloud.");
                } else {
                    print("error: failed to update repository description.");
                }
            } catch (e) {
                print("error: network error updating description.");
            }
            return;
        }

        const contentLines = fileBuffers[targetPayload];
        if (!contentLines) {
            print(`error: no local workspace content memory traces found for file "${targetPayload}".`);
            return;
        }
        const fullPath = getFullFilePath(targetPayload);
        print(`system: executing structural write sequences to remote: [${fullPath}]...`);
        const success = await pushFileToGitHub(fullPath, contentLines.join('\n'), "Initial commit");
        if (success) {
            print(`system: cloud repository sync complete. verified ${targetPayload}.`);
        } else {
            print("error: cloud sync stream updates failed.");
        }
        return;
    }

    if (firstSegment === 'run') {
        if (!targetPayload) {
            print("error: specify run target parameters, e.g. run/note.txt");
            return;
        }

        const codeStructure = fileBuffers[targetPayload] ? fileBuffers[targetPayload].join('\n') : "";
        if (!codeStructure.trim()) {
            print(`warning: local workspace buffer logs for "${targetPayload}" are empty. write some text layout strings first.`);
            return;
        }

        print("system: packing web asset layout components and launching sandbox visualizer...");
        const escapedContent = btoa(unescape(encodeURIComponent(codeStructure)));
        const isHtml = targetPayload.toLowerCase().endsWith('.html');

        let sandboxWrapper = "";
        if (isHtml) {
            sandboxWrapper = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Application Sandbox Preview</title>
                    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none';">
                    <style>
                        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; }
                        iframe { border: none; width: 100%; height: 100%; display: block; }
                    </style>
                </head>
                <body>
                    <iframe sandbox="allow-scripts" src="data:text/html;base64,${escapedContent}"></iframe>
                </body>
                </html>
            `;
        } else {
            sandboxWrapper = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Universal Preview - ${targetPayload}</title>
                    <style>
                        html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #121212; color: #e0e0e0; font-family: 'Courier New', Courier, monospace; }
                        .header { background: #1a1a1a; padding: 10px 20px; border-bottom: 1px solid #333; font-size: 12px; color: #888; }
                        pre { margin: 0; padding: 20px; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.6; }
                    </style>
                </head>
                <body>
                    <div class="header">Target Workspace Node: ${targetPayload} | Plaintext Runtime View</div>
                    <pre id="output-content"></pre>
                    <script>
                        document.getElementById('output-content').textContent = decodeURIComponent(escape(atob('${escapedContent}')));
                    </script>
                </body>
                </html>
            `;
        }

        const blob = new Blob([sandboxWrapper], { type: 'text/html' });
        const blobURL = URL.createObjectURL(blob);
        window.open(blobURL, '_blank', 'noopener,noreferrer');
        return;
    }

    if (lowerCommand === 'description') {
        if (!activeRepoName) {
            print("error: no active repository detected.");
        } else {
            const token = localStorage.getItem('user');
            const username = localStorage.getItem('github_username');
            try {
                const res = await fetch(`https://api.github.com/repos/${username}/${activeRepoName}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
                    cache: 'no-store'
                });
                if (res.ok) {
                    const data = await res.json();
                    print(`description: ${data.description || '(no description set)'}`);
                } else {
                    print("error: failed to fetch repository description.");
                }
            } catch (e) {
                print("error: network error fetching description.");
            }
        }
        return;
    }

    if (firstSegment === 'settings') {
        if (!activeRepoName) {
            print("error: no active repository detected. settings require a bound repository context.");
            return;
        }

        const settingsParts = targetPayload.split('/');
        const settingsAction = (settingsParts[0] || '').toLowerCase();
        const token = localStorage.getItem('user');
        const username = localStorage.getItem('github_username');
        const repoApiBase = `https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(activeRepoName)}`;

        if (!settingsAction || settingsAction === 'help') {
            printSettingsHelp();
            return;
        }

        if (settingsAction === 'rename') {
            print("system: checking the current name of the repository...");
            pendingSettingsRenameOldName = activeRepoName;
            print(`Currently, it's '${sanitizeInputString(activeRepoName)}'. Are you sure you want to rename it? [Yes] or [No]?`);
            pendingSettingsRenameConfirm = true;
            return;
        }

        if (settingsAction === 'branch') {
            const branchName = settingsParts.slice(1).join('/').trim();
            if (!branchName) {
                print("error: specify a branch name, e.g. settings/branch/main");
                return;
            }

            print(`system: updating default branch to '${sanitizeInputString(branchName)}'...`);
            try {
                const res = await fetch(repoApiBase, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github+json'
                    },
                    body: JSON.stringify({ default_branch: branchName })
                });

                if (res.ok) {
                    print(`system: default branch successfully changed to '${sanitizeInputString(branchName)}'.`);
                } else {
                    const errData = await res.json().catch(() => ({}));
                    print(`error: failed to change default branch. GitHub status ${res.status}: ${errData.message || 'the branch may not exist on the remote.'}`);
                }
            } catch (e) {
                print(`error: network error updating default branch: ${e.message}`);
            }
            return;
        }

        if (settingsAction === 'issues') {
            const issueMode = (settingsParts[1] || '').toLowerCase();
            if (issueMode !== 'all' && issueMode !== 'collaborative') {
                print("error: specify settings/issues/all or settings/issues/collaborative");
                return;
            }

            if (issueMode === 'all') {
                print("system: removing interaction restrictions, issues open to all users...");
                try {
                    const res = await fetch(`${repoApiBase}/interaction-limits`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github+json'
                        }
                    });
                    if (res.ok || res.status === 204) {
                        print("system: interaction restrictions removed. issues are open to all users.");
                    } else {
                        print(`error: failed to remove interaction restrictions. GitHub status ${res.status}.`);
                    }
                } catch (e) {
                    print(`error: network error updating interaction limits: ${e.message}`);
                }
            } else {
                print("system: restricting issue interactions to collaborators only...");
                try {
                    const res = await fetch(`${repoApiBase}/interaction-limits`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/vnd.github+json'
                        },
                        body: JSON.stringify({ limit: 'collaborators_only', expiry: 'six_months' })
                    });
                    if (res.ok) {
                        print("system: issue interactions restricted to collaborators only (limit active for six months).");
                    } else {
                        print(`error: failed to set interaction restriction. GitHub status ${res.status}.`);
                    }
                } catch (e) {
                    print(`error: network error updating interaction limits: ${e.message}`);
                }
            }
            return;
        }

        if (settingsAction === 'sponsorships') {
            const fundingPath = '.github/FUNDING.yml';
            print("system: checking current sponsorship funding configuration...");
            try {
                const checkRes = await fetch(`${repoApiBase}/contents/${fundingPath}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
                    cache: 'no-store'
                });

                if (checkRes.ok) {
                    const fileData = await checkRes.json();
                    print("system: removing sponsorship funding file, disabling sponsor button...");
                    const deleteRes = await fetch(`${repoApiBase}/contents/${fundingPath}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/vnd.github+json'
                        },
                        body: JSON.stringify({ message: 'Disable sponsorships', sha: fileData.sha })
                    });
                    if (deleteRes.ok) {
                        print("system: sponsorships disabled successfully.");
                    } else {
                        print(`error: failed to disable sponsorships. GitHub status ${deleteRes.status}.`);
                    }
                } else if (checkRes.status === 404) {
                    print("system: creating sponsorship funding file, enabling sponsor button...");
                    const content = `github: ${username}\n`;
                    const uint8Array = new TextEncoder().encode(content);
                    let binaryString = '';
                    for (let i = 0; i < uint8Array.length; i++) {
                        binaryString += String.fromCharCode(uint8Array[i]);
                    }
                    const base64Content = btoa(binaryString);
                    const createRes = await fetch(`${repoApiBase}/contents/${fundingPath}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/vnd.github+json'
                        },
                        body: JSON.stringify({ message: 'Enable sponsorships', content: base64Content })
                    });
                    if (createRes.ok) {
                        print(`system: sponsorships enabled successfully, funding directed to @${sanitizeInputString(username)}.`);
                    } else {
                        print(`error: failed to enable sponsorships. GitHub status ${createRes.status}.`);
                    }
                } else {
                    print(`error: failed to check sponsorship configuration. GitHub status ${checkRes.status}.`);
                }
            } catch (e) {
                print(`error: network error toggling sponsorships: ${e.message}`);
            }
            return;
        }

        if (settingsAction === 'discussions' || settingsAction === 'projects') {
            const fieldName = settingsAction === 'discussions' ? 'has_discussions' : 'has_projects';
            print(`system: checking current ${settingsAction} configuration...`);
            try {
                const checkRes = await fetch(repoApiBase, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
                    cache: 'no-store'
                });
                if (!checkRes.ok) {
                    print(`error: failed to fetch current repository configuration. GitHub status ${checkRes.status}.`);
                    return;
                }
                const repoData = await checkRes.json();
                const currentState = !!repoData[fieldName];
                const newState = !currentState;

                print(`system: ${newState ? 'enabling' : 'disabling'} ${settingsAction}...`);
                const patchRes = await fetch(repoApiBase, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github+json'
                    },
                    body: JSON.stringify({ [fieldName]: newState })
                });
                if (patchRes.ok) {
                    print(`system: ${settingsAction} successfully ${newState ? 'enabled' : 'disabled'}.`);
                } else {
                    print(`error: failed to update ${settingsAction}. GitHub status ${patchRes.status}.`);
                }
            } catch (e) {
                print(`error: network error updating ${settingsAction}: ${e.message}`);
            }
            return;
        }

        if (settingsAction === 'visibility') {
            const targetVisibility = (settingsParts[1] || '').toLowerCase();
            if (targetVisibility !== 'public' && targetVisibility !== 'private') {
                print("error: specify settings/visibility/public or settings/visibility/private");
                return;
            }

            print("system: checking current visibility state...");
            try {
                const checkRes = await fetch(repoApiBase, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
                    cache: 'no-store'
                });
                if (!checkRes.ok) {
                    print(`error: failed to fetch current repository configuration. GitHub status ${checkRes.status}.`);
                    return;
                }
                const repoData = await checkRes.json();
                const isCurrentlyPrivate = !!repoData.private;

                if (targetVisibility === 'public' && !isCurrentlyPrivate) {
                    print("system: repository is already public.");
                    return;
                }
                if (targetVisibility === 'private' && isCurrentlyPrivate) {
                    print("system: repository is already private.");
                    return;
                }

                pendingVisibilityChange = targetVisibility;
                if (targetVisibility === 'public') {
                    print("warning: this will make the repository PUBLIC. it is currently private.");
                } else {
                    print("warning: this will make the repository PRIVATE. it is currently public.");
                }
                print("Are you sure? [Yes] or [No]?");
            } catch (e) {
                print(`error: network error checking visibility state: ${e.message}`);
            }
            return;
        }

        print(`error: unrecognized settings command "${sanitizeInputString(targetPayload)}". type settings/help for available commands.`);
        return;
    }

    print(`error: command signature or directory target path "${cleanCommand}" unrecognized.`);
}

const githubTool = {
    helpText: "configure terminal verification credentials. subcommands: login/token, repo/name, confirm, logout, exit",
    get prompt() {
        return getGithubConfigPrompt();
    },
    sync: pushFileToGitHub,
    pull: pullFileFromGitHub,
    tree: fetchRepoTree,
    delete: deletePathFromGitHub,

    onEnter: async () => {
        localStorage.setItem('github_active', 'true');
        const token = localStorage.getItem('user');
        const username = localStorage.getItem('github_username');
        const repo = localStorage.getItem('repository');

        if (token && username) {
            print(`status: verified authorization stream caching as @${sanitizeInputString(username)}`);
            if (repo) {
                print(`active structural tracking repo context: ${sanitizeInputString(repo)}`);
            } else {
                print("active workspace repo: none contextually bound (use 'repo/name', or exit and 'fletch' to list repos. Help for library)");
            }
        } else {
            print("status: unauthenticated. authorize workspace by generating a personal access token and entering: login/token");
        }
        print("type 'exit' or press CTRL + E to shift back to your main prompt loop.");
    },

    handleInput: async (input) => {
        const cleanInput = input.trim();
        if (cleanInput === '') return;

        const currentPrompt = getGithubConfigPrompt();
        const lowerInput = cleanInput.toLowerCase();
        const activeRepoName = localStorage.getItem('repository');

        // Validate deep directory command overrides
        if (currentPath.length > 0) {
            if (lowerInput === 'github' || lowerInput.startsWith('github/') || lowerInput.startsWith('github ')) {
                const username = localStorage.getItem('github_username') || 'guest';
                print(`You are inside a deep directory, do ${username}/ to use those commands`);
                return;
            }
        }

        // Capture specific overrides when inside an active repository or deep working directory
        if (activeRepoName || currentPath.length > 0) {
            if (lowerInput === 'exit' || lowerInput === 'logout' || lowerInput.startsWith('login/token')) {
                const username = localStorage.getItem('github_username') || 'guest';
                print(`error: command such as exit, logout and login/token will not work inside the working directory. Do ${username}/ to use those commands`);
                return;
            }
        }
        
        if (cleanInput.toLowerCase() === 'help') {
            print(`${currentPrompt}${cleanInput}`);
            printGithubHelp();
            return;
        }

        let action = '';
        let value = '';
        let isRawToken = false;

        if (cleanInput.startsWith('ghp_') || cleanInput.startsWith('github_pat_')) {
            action = 'login';
            value = cleanInput;
            isRawToken = true;
        } else {
            const spaceIdx = cleanInput.indexOf(' ');
            const slashIdx = cleanInput.indexOf('/');
            let delimIdx = -1;

            if (spaceIdx !== -1 && slashIdx !== -1) {
                delimIdx = Math.min(spaceIdx, slashIdx);
            } else {
                delimIdx = spaceIdx !== -1 ? spaceIdx : slashIdx;
            }

            if (delimIdx === -1) {
                action = cleanInput.toLowerCase();
                value = '';
            } else {
                action = cleanInput.substring(0, delimIdx).trim().toLowerCase();
                value = cleanInput.substring(delimIdx + 1).trim();
            }

            if (action === 'login') {
                if (value.toLowerCase().startsWith('token/')) value = value.substring(6).trim();
                else if (value.toLowerCase().startsWith('token ')) value = value.substring(6).trim();
            }
            if (action === 'repo') {
                if (value.toLowerCase().startsWith('name/')) value = value.substring(5).trim();
                else if (value.toLowerCase().startsWith('name ')) value = value.substring(5).trim();
            }
        }

        if (action === 'login' && value) {
            let maskedValue = '••••••••••••••••';
            if (value.startsWith('ghp_') && value.length > 8) {
                maskedValue = 'ghp_' + '••••••••••••' + value.substring(value.length - 4);
            } else if (value.startsWith('github_pat_') && value.length > 15) {
                maskedValue = 'github_pat_' + '••••••••••••' + value.substring(value.length - 4);
            } else if (value.length > 6) {
                maskedValue = value.substring(0, 2) + '••••••••' + value.substring(value.length - 2);
            }

            if (isRawToken) {
                print(`${currentPrompt}login/${sanitizeInputString(maskedValue)}`);
            } else {
                if (cleanInput.toLowerCase().includes('token/')) {
                    print(`${currentPrompt}login/token/${sanitizeInputString(maskedValue)}`);
                } else if (cleanInput.toLowerCase().includes('token ')) {
                    print(`${currentPrompt}login token ${sanitizeInputString(maskedValue)}`);
                } else {
                    const separator = cleanInput.includes('/') ? '/' : ' ';
                    print(`${currentPrompt}login${separator}${sanitizeInputString(maskedValue)}`);
                }
            }
        } else {
            print(`${currentPrompt}${sanitizeInputString(cleanInput)}`);
        }

        if (action === 'exit' || action === 'back') {
            setMode("main", getSystemPrompt());
            return;
        }

        if (action === 'login') {
            if (!value) {
                print("error: authentication token value cannot be completely empty.");
                return;
            }
            if (!AUTH_TOKEN_REGEX.test(value)) {
                print("error: invalid token format character signature detected.");
                return;
            }

            print("system: validating operational access token with GitHub cloud gateway...");

            try {
                const res = await fetch('https://api.github.com/user', {
                    headers: {
                        'Authorization': `Bearer ${value}`,
                        'Accept': 'application/vnd.github+json'
                    },
                    cache: 'no-store'
                });

                if (res.ok) {
                    const userData = await res.json();
                    if (userData && userData.login) {
                        localStorage.setItem('user', value);
                        localStorage.setItem('github_username', userData.login);
                        
                        setMode('github', getGithubConfigPrompt());

                        print(`system: successfully authenticated as @${sanitizeInputString(userData.login)}!`);
                        print("status: you are still in configuration mode. Now bind your workspace target via: repo/name");
                    } else {
                        print("error: failed to safely extract parseable metadata profile from endpoint data payload.");
                    }
                } else {
                    print("error: github rejected token credentials. verification check unauthorized.");
                }
            } catch (e) {
                print("error: unable to connect safely to github target api endpoint securely.");
            }
            return;
        }

        if (action === 'repo') {
            const token = localStorage.getItem('user');
            const username = localStorage.getItem('github_username');

            if (!token || !username) {
                print("error: you must log in and verify your credentials before tracking a workspace repository.");
                return;
            }
            if (!value) {
                print("error: repository target name parameter cannot be empty.");
                return;
            }
            if (!REPO_NAME_REGEX.test(value) || value.length > 100) {
                print("error: invalid repository name format or character structure detected.");
                return;
            }

            print(`system: checking if repository '${sanitizeInputString(value)}' exists under @${sanitizeInputString(username)}...`);

            try {
                const checkRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(value)}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github+json'
                    },
                    cache: 'no-store'
                });

                if (checkRes.ok) {
                    localStorage.setItem('repository', value);
                    activeRepo = value;
                    print(`system: successfully set target repository to: ${sanitizeInputString(value)}`);
                    print("status: setup successfully cached! type 'exit' to deploy configurations to terminal prompt.");
                } else if (checkRes.status === 404) {
                    pendingRepoCreation = value;
                    print(`warning: repository '${sanitizeInputString(value)}' does not exist yet.`);
                    print("type 'confirm' to automatically initialize a private backup repository under this name.");
                } else {
                    print("error: unauthorized or invalid workspace verification parameters encountered.");
                }
            } catch (e) {
                print("error: network communication check with github api timed out.");
            }
            return;
        }

        if (action === 'confirm') {
            const token = localStorage.getItem('user');
            if (!token) {
                print("error: active authorization session context is not initialized.");
                return;
            }
            if (!pendingRepoCreation) {
                print("error: no pending repository creation configurations requested.");
                return;
            }

            const repoToCreate = pendingRepoCreation;
            pendingRepoCreation = null;

            print(`system: creating private repository '${sanitizeInputString(repoToCreate)}' automatically on GitHub...`);

            try {
                const createRes = await fetch('https://api.github.com/user/repos', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github+json'
                    },
                    body: JSON.stringify({
                        name: repoToCreate,
                        private: true,
                        description: "Studio cloud sync environment tracking workspace storage",
                        auto_init: true
                    })
                });

                if (createRes.ok) {
                    print(`system: successfully initialized private repository '${sanitizeInputString(repoToCreate)}'!`);
                    localStorage.setItem('repository', repoToCreate);
                    activeRepo = repoToCreate;
                    print("status: workspace initialized! type 'exit' to use your environment core.");
                } else {
                    print("error: failed to automatically provision a new github repository storage engine.");
                }
            } catch (e) {
                print("error: network communication with github api timed out.");
            }
            return;
        }

        if (action === 'logout') {
            localStorage.removeItem('user');
            localStorage.removeItem('github_username');
            localStorage.removeItem('repository');
            localStorage.removeItem('github_active');
            currentPath.length = 0;
            virtualDirectories.clear();
            savePathState();
            activeRepo = '';
            pendingRepoCreation = null;

            setMode('github', getGithubConfigPrompt());

            print("system: authentication tracking arrays systematically cleared.");
            return;
        }

        if (isWorkspaceCommand(cleanInput)) {
            await handleWorkspaceCommand(cleanInput);
            return;
        }

        print("error: unhandled sub-command. available options: login/token, repo/name, confirm, logout, exit");
    },
    onExit: () => {
        print("system: exited github config mode.");
    }
};

registerTool('github', githubTool);