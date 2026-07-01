import { registerTool, print, getSystemPrompt } from './main.js';

let activeRepo = localStorage.getItem('repository') || '';
let pendingRepoCreation = null;

const REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const SAFE_FILE_NAME_REGEX = /^[a-zA-Z0-9._\- \/]+$/;
const AUTH_TOKEN_REGEX = /^[a-zA-Z0-9_=\-]+$/;

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
            }
        });

        if (!res.ok) {
            if (res.status === 404) {
                return [];
            }
            print(`error: directory retrieval rejected by GitHub with status ${res.status}.`);
            return [];
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

export async function pushFileToGitHub(filePath, content) {
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
            }
        });
        
        if (fileCheck.ok) {
            const fileData = await fileCheck.json();
            if (fileData && typeof fileData.sha === 'string') {
                sha = fileData.sha;
            }
        }

        const payload = {
            message: `Initial Commit`,
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
            }
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
            }
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
                    message: `Initial Commit`,
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

export async function renameDirectoryInGitHub(oldDir, newDir) {
    const rawToken = localStorage.getItem('user');
    const rawUsername = localStorage.getItem('github_username');
    const rawRepo = localStorage.getItem('repository');

    if (!rawToken || !rawUsername || !rawRepo) return false;
    if (!AUTH_TOKEN_REGEX.test(rawToken) || !REPO_NAME_REGEX.test(rawRepo)) return false;
    if (!SAFE_FILE_NAME_REGEX.test(oldDir) || oldDir.includes('..')) return false;
    if (!SAFE_FILE_NAME_REGEX.test(newDir) || newDir.includes('..')) return false;

    const username = encodeURIComponent(rawUsername);
    const repo = encodeURIComponent(rawRepo);
    const commonHeaders = {
        'Authorization': `Bearer ${rawToken}`,
        'Accept': 'application/vnd.github+json'
    };

    try {
        print(`system: connecting to git transaction engine for single-commit atomic shift...`);
        
        // 1. Find the default repository branch targeting index (main vs master context mapping)
        const repoInfoRes = await fetch(`https://api.github.com/repos/${username}/${repo}`, { headers: commonHeaders });
        if (!repoInfoRes.ok) {
            print(`error: failed to retrieve repository details. status: ${repoInfoRes.status}`);
            return false;
        }
        const repoInfo = await repoInfoRes.json();
        const defaultBranch = repoInfo.default_branch || 'main';

        // 2. Query active head reference pointer signature
        print(`system: reading head reference for branch [${defaultBranch}]...`);
        const refRes = await fetch(`https://api.github.com/repos/${username}/${repo}/git/ref/heads/${defaultBranch}`, { headers: commonHeaders });
        if (!refRes.ok) {
            print(`error: failed to read head branch reference layout mapping.`);
            return false;
        }
        const refData = await refRes.json();
        const parentCommitSha = refData.object.sha;

        // 3. Download full repository recursive tree index composition
        print(`system: loading repository object relationship graph map matrix...`);
        const treeRes = await fetch(`https://api.github.com/repos/${username}/${repo}/git/trees/${parentCommitSha}?recursive=true`, { headers: commonHeaders });
        if (!treeRes.ok) {
            print(`error: failed to safely crawl repository git object tree layout entries.`);
            return false;
        }
        const treeData = await treeRes.json();
        
        // 4. Transform folder tree path keys mapping array structures inside local layout memory
        const cleanOldDir = oldDir.endsWith('/') ? oldDir : oldDir + '/';
        const cleanNewDir = newDir.endsWith('/') ? newDir : newDir + '/';
        let newTreeEntries = [];
        let filesMovedCount = 0;

        for (const item of treeData.tree) {
            // Low-level Git trees automatically generate subfolders dynamically from file path configurations
            if (item.type !== 'blob') continue;

            if (item.path.startsWith(cleanOldDir)) {
                const relativePath = item.path.substring(cleanOldDir.length);
                newTreeEntries.push({
                    path: cleanNewDir + relativePath,
                    mode: item.mode,
                    type: item.type,
                    sha: item.sha // Point directly to the existing content SHA—no downloads or data changes needed
                });
                filesMovedCount++;
            } else if (item.path === oldDir) {
                newTreeEntries.push({
                    path: newDir,
                    mode: item.mode,
                    type: item.type,
                    sha: item.sha
                });
                filesMovedCount++;
            } else {
                // Keep everything else completely unmodified
                newTreeEntries.push({
                    path: item.path,
                    mode: item.mode,
                    type: item.type,
                    sha: item.sha
                });
            }
        }

        if (filesMovedCount === 0) {
            print(`warning: no active structural files discovered within directory path configuration [${oldDir}].`);
            return false;
        }

        print(`system: staged ${filesMovedCount} file node(s) for reallocation. compiling atomic tree...`);

        // 5. Post the absolute replacement tree object representation matrix
        const createTreeRes = await fetch(`https://api.github.com/repos/${username}/${repo}/git/trees`, {
            method: 'POST',
            headers: { ...commonHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ tree: newTreeEntries })
        });
        if (!createTreeRes.ok) {
            print(`error: github rejected structural tree payload build compilation array format.`);
            return false;
        }
        const newTreeData = await createTreeRes.json();
        const newTreeSha = newTreeData.sha;

        // 6. Build the combined individual commit pointing to the compiled tree framework
        print(`system: packing transaction payload into single atomic commit manifest...`);
        const createCommitRes = await fetch(`https://api.github.com/repos/${username}/${repo}/git/commits`, {
            method: 'POST',
            headers: { ...commonHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Rename directory '${oldDir}' to '${newDir}'`,
                tree: newTreeSha,
                parents: [parentCommitSha]
            })
        });
        if (!createCommitRes.ok) {
            print(`error: transaction commit verification generation failed under cloud processing.`);
            return false;
        }
        const newCommitData = await createCommitRes.json();
        const newCommitSha = newCommitData.sha;

        // 7. Pivot head reference pointer array target to look safely at our new commit node
        print(`system: pushing commit block to head reference array...`);
        const updateRefRes = await fetch(`https://api.github.com/repos/${username}/${repo}/git/refs/heads/${defaultBranch}`, {
            method: 'PATCH',
            headers: { ...commonHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sha: newCommitSha, force: false })
        });

        if (updateRefRes.ok) {
            print(`system: transaction complete! folder shifted cleanly via 1 consolidated atomic commit.`);
            return true;
        } else {
            print(`error: head reference pointing pipeline shift execution blocked or rejected.`);
            return false;
        }

    } catch (e) {
        print(`error: transaction execution tracking pipeline failed unexpectedly: ${e.message}`);
        return false;
    }
}

const githubTool = {
    helpText: "configure terminal verification credentials. subcommands: help, status, login/token, repo/name, confirm, logout",
    prompt: "github>",
    sync: pushFileToGitHub,
    pull: pullFileFromGitHub,
    tree: fetchRepoTree,
    delete: deletePathFromGitHub,
    renameDirectory: renameDirectoryInGitHub,
    
    onEnter: async () => {
        print("system: github configuration subsystem activated.");
        const token = localStorage.getItem('user');
        const username = localStorage.getItem('github_username');
        const repo = localStorage.getItem('repository');

        if (token && username) {
            print(`status: verified authorization stream caching as @${sanitizeInputString(username)}`);
            if (repo) {
                print(`active structural tracking repo context: ${sanitizeInputString(repo)}`);
            } else {
                print("active workspace repo: none contextually bound (use root traversal or 'repo/name')");
            }
        } else {
            print("status: unauthenticated. authorize workspace by generating a personal access token and entering: login/token");
        }
        print("press CTRL + E to shift back to your main structural shell loop prompt.");
    },

    handleInput: async (input) => {
        const cleanInput = input.trim();
        if (cleanInput === '') return;

        print(`github>${sanitizeInputString(cleanInput)}`);

        const parts = cleanInput.split('/');
        const action = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join('/').trim();

        if (action === 'help') {
            print(githubTool.helpText);
            return;
        }

        if (action === 'status') {
            const token = localStorage.getItem('user');
            const username = localStorage.getItem('github_username');
            const repo = localStorage.getItem('repository');

            if (token && username) {
                print(`status: verified authorization stream caching as @${sanitizeInputString(username)}`);
                if (repo) {
                    print(`active structural tracking repo context: ${sanitizeInputString(repo)}`);
                } else {
                    print("active workspace repo: none contextually bound (use root traversal or 'repo/name')");
                }
            } else {
                print("status: unauthenticated. authorize workspace by generating a personal access token and entering: login/token");
            }
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
                    }
                });

                if (res.ok) {
                    const userData = await res.json();
                    if (userData && userData.login) {
                        localStorage.setItem('user', value);
                        localStorage.setItem('github_username', userData.login);
                        print(`system: successfully authenticated as @${sanitizeInputString(userData.login)}!`);
                        const { setMode } = await import('./main.js');
                        setMode("main", getSystemPrompt());
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
                    }
                });

                if (checkRes.ok) {
                    localStorage.setItem('repository', value);
                    activeRepo = value;
                    print(`system: successfully set target repository to: ${sanitizeInputString(value)}`);
                    const { setMode } = await import('./main.js');
                    setMode("main", getSystemPrompt());
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
                    const { setMode } = await import('./main.js');
                    setMode("main", getSystemPrompt());
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
            activeRepo = '';
            pendingRepoCreation = null;
            print("system: authentication tracking arrays systematically cleared.");
            const { setMode } = await import('./main.js');
            setMode("main", getSystemPrompt());
            return;
        }

        print("error: unhandled sub-command. available options: help, status, login/token, repo/name, confirm, logout");
    },
    onExit: () => {
        print("system: exited github config mode.");
    }
};

registerTool('github', githubTool);