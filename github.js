import { registerTool, print, getSystemPrompt } from './main.js';

let activeRepo = localStorage.getItem('repository') || '';
let pendingRepoCreation = null;

const REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const SAFE_FILE_NAME_REGEX = /^[a-zA-Z0-9._\-\/]+$/;
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
                // Return empty if the nested path doesn't exist yet
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
        const base64Content = btoa(String.fromCharCode(...new TextEncoder().encode(content)));
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
            message: `Initialize VFS write commit: ${sanitizeInputString(filePath)}`,
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

        if (!pushRes.ok) {
            if (pushRes.status === 404) {
                print(`error: repository '${rawRepo}' not found under @${rawUsername}.`);
            } else if (pushRes.status === 403) {
                print("error: github access forbidden (403). your token lacks fine-grained repository content permissions.");
            } else if (pushRes.status === 401) {
                print("error: github authentication failed (401). token is invalid or expired.");
            } else {
                print(`error: sync rejected by GitHub with HTTP status ${pushRes.status}.`);
            }
            return false;
        }

        return true;
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

        if (!res.ok) {
            if (res.status === 404) {
                return null;
            } else if (res.status === 403) {
                print("error: github access forbidden (403). check token repository-scope permissions.");
            } else {
                print(`error: pull failed with HTTP status ${res.status}.`);
            }
            return null;
        }

        const contentType = res.headers.get("content-type");
        if (contentType && !contentType.includes("application/json")) {
            return null;
        }

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
        print(`error: networking error during pull connection: ${e.message}`);
        return null;
    }
}

const githubTool = {
    helpText: "configure terminal verification credentials. subcommands: login/token, repo/name, confirm, logout",
    prompt: "github>",
    sync: pushFileToGitHub,
    pull: pullFileFromGitHub,
    tree: fetchRepoTree,
    
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
            print("status: unauthenticated. authorize workspace by generating a token and entering: login/token");
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
                        
                        // Force kernel refresh configuration states synchronously
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
                print("error: you must execute authentication log-in verification routines before tracking a workspace repo.");
                return;
            }
            if (!value) {
                print("error: repository target name parameter cannot be empty.");
                return;
            }
            if (!REPO_NAME_REGEX.test(value) || value.length > 100) {
                print("error: illegal repository name formatting string structure target.");
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
                    print("type 'github>confirm' to automatically initialize a private backup repository under this name.");
                } else {
                    print("error: unauthorized workspace retrieval verification parameters encountered.");
                }
            } catch (e) {
                print("error: network communication check with github api timed out.");
            }
            return;
        }

        if (action === 'confirm') {
            const token = localStorage.getItem('user');
            if (!token) {
                print("error: active target authorization session context not initialized.");
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
                        description: "Studio cloud sync environment tracking workspace storage"
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

        print("error: unhandled sub-command. available options: login/token, repo/name, confirm, logout");
    },
    onExit: () => {
        print("system: exited github config mode.");
    }
};

registerTool('github', githubTool);