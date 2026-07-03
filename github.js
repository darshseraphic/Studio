import { registerTool, print, getSystemPrompt } from './main.js';

let activeRepo = localStorage.getItem('repository') || '';
let pendingRepoCreation = null;

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

        const actionType = sha ? 'Update' : 'Create';
        const payload = {
            message: `${actionType} environment workspace tracking resource: ${sanitizeInputString(filePath)}`,
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

const githubTool = {
    helpText: "configure terminal verification credentials. subcommands: login/token, repo/name, confirm, logout, exit",
    prompt: "github>",
    sync: pushFileToGitHub,
    pull: pullFileFromGitHub,
    tree: fetchRepoTree,
    delete: deletePathFromGitHub,
    
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
                print("active workspace repo: none contextually bound (use 'repo/name')");
            }
        } else {
            print("status: unauthenticated. authorize workspace by generating a personal access token and entering: login/token");
        }
        print("type 'exit' or press CTRL + E to shift back to your main prompt loop.");
    },

    handleInput: async (input) => {
        const cleanInput = input.trim();
        if (cleanInput === '') return;

        let action = '';
        let value = '';
        let isRawToken = false;

        // 1. Parsing logic handles raw tokens or split action lines
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

        // 2. Security Masking Echo: Print feedback line safely without leaking cleartext credentials
        if (action === 'login' && value) {
            let maskedValue = '••••••••••••••••';
            if (value.startsWith('ghp_') && value.length > 8) {
                maskedValue = 'ghp_' + '••••••••••••' + value.substring(value.length - 4);
            } else if (value.startsWith('github_pat_') && value.length > 15) {
                maskedValue = 'github_pat_' + '••••••••••••' + value.substring(value.length - 4);
            } else if (value.length > 6) {
                maskedValue = value.substring(0, 2) + '••••••••' + value.substring(value.length - 2);
            }

            // FIXED: If user pasted a raw token directly, prepend the explicit command format for clear terminal history tracking
            if (isRawToken) {
                print(`github>login/${sanitizeInputString(maskedValue)}`);
            } else {
                if (cleanInput.toLowerCase().includes('token/')) {
                    print(`github>login/token/${sanitizeInputString(maskedValue)}`);
                } else if (cleanInput.toLowerCase().includes('token ')) {
                    print(`github>login token ${sanitizeInputString(maskedValue)}`);
                } else {
                    const separator = cleanInput.includes('/') ? '/' : ' ';
                    print(`github>login${separator}${sanitizeInputString(maskedValue)}`);
                }
            }
        } else {
            // Echo normal, non-sensitive commands completely unmodified
            print(`github>${sanitizeInputString(cleanInput)}`);
        }

        // Handle structural navigation exits manually
        if (action === 'exit' || action === 'back') {
            const { setMode } = await import('./main.js');
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
                    }
                });

                if (res.ok) {
                    const userData = await res.json();
                    if (userData && userData.login) {
                        localStorage.setItem('user', value);
                        localStorage.setItem('github_username', userData.login);
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
                    }
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
            activeRepo = '';
            pendingRepoCreation = null;
            print("system: authentication tracking arrays systematically cleared.");
            const { setMode } = await import('./main.js');
            setMode("main", getSystemPrompt());
            return;
        }

        print("error: unhandled sub-command. available options: login/token, repo/name, confirm, logout, exit");
    },
    onExit: () => {
        print("system: exited github config mode.");
    }
};

registerTool('github', githubTool);