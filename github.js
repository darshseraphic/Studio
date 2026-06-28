import { registerTool, print, getSystemPrompt } from './main.js';

let activeRepo = localStorage.getItem('repository') || '';
let pendingRepoCreation = null;

const REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const SAFE_FILE_NAME_REGEX = /^[a-zA-Z0-9._\-\/]+$/;
const AUTH_TOKEN_REGEX = /^[a-zA-Z0-9_=\-]+$/;

function sanitizeInputString(str) {
    return str.trim().replace(/[<>'"\`]/g, '');
}

export async function pushFileToGitHub(fileName, content) {
    const rawToken = localStorage.getItem('user');
    const rawUsername = localStorage.getItem('github_username');
    const rawRepo = localStorage.getItem('repository');

    if (!rawToken || !rawUsername || !rawRepo) return false;

    if (!AUTH_TOKEN_REGEX.test(rawToken) || !REPO_NAME_REGEX.test(rawRepo)) {
        return false;
    }
    if (!SAFE_FILE_NAME_REGEX.test(fileName) || fileName.includes('..')) {
        return false;
    }

    const username = encodeURIComponent(rawUsername);
    const repo = encodeURIComponent(rawRepo);
    const safeFileName = encodeURIComponent(fileName);
    const apiPath = `https://api.github.com/repos/${username}/${repo}/contents/${safeFileName}`;

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
            message: `Initialize commit: ${sanitizeInputString(fileName)}`,
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
                print(`error: repository '${rawRepo}' not found under @${rawUsername}. create it on GitHub first.`);
            } else if (pushRes.status === 403) {
                print("error: github access forbidden (403). your token lacks 'Contents' write permissions.");
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

export async function pullFileFromGitHub(fileName) {
    const rawToken = localStorage.getItem('user');
    const rawUsername = localStorage.getItem('github_username');
    const rawRepo = localStorage.getItem('repository');

    if (!rawToken || !rawUsername || !rawRepo) return null;
    if (!AUTH_TOKEN_REGEX.test(rawToken) || !REPO_NAME_REGEX.test(rawRepo)) return null;
    if (!SAFE_FILE_NAME_REGEX.test(fileName) || fileName.includes('..')) return null;

    const username = encodeURIComponent(rawUsername);
    const repo = encodeURIComponent(rawRepo);
    const safeFileName = encodeURIComponent(fileName);

    const apiPath = `https://api.github.com/repos/${username}/${repo}/contents/${safeFileName}`;

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
                print(`error: file '${fileName}' does not exist yet in repo '${rawRepo}'. run 'save' first.`);
            } else if (res.status === 403) {
                print("error: github access forbidden (403). check token permissions.");
            } else {
                print(`error: pull failed with HTTP status ${res.status}.`);
            }
            return null;
        }

        const contentType = res.headers.get("content-type");
        if (contentType && !contentType.includes("application/json")) {
            const badText = await res.text();
            print(`error: Connected to local server fallback instead of GitHub API. Starts with: "${badText.substring(0, 25)}"`);
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
    helpText: "configure cloud sync backups. commands: login/token, repo/name, confirm, logout, or github/reponame/filename/save",
    prompt: "github>",
    sync: pushFileToGitHub,
    pull: pullFileFromGitHub,
    
    onEnter: async () => {
        print("system: github workspace mode activated.");
        const token = localStorage.getItem('user');
        const username = localStorage.getItem('github_username');
        const repo = localStorage.getItem('repository');

        if (token && username) {
            print(`status: authenticated via stored token cache as @${sanitizeInputString(username)}`);
            if (repo) {
                print(`active workspace repo: ${sanitizeInputString(repo)}`);
            } else {
                print("active workspace repo: none (set using repo/name)");
            }
        } else {
            print("status: unauthenticated. generate a token on github and login using: login/token");
        }
        print("press CTRL + E to return to main prompt.");
    },

    handleInput: async (input) => {
        const cleanInput = input.trim();
        if (cleanInput === '') return;

        print(`github>${sanitizeInputString(cleanInput)}`);

        const parts = cleanInput.split('/');
        
        // --- Pipeline Interceptor Implementation ---
        let isPipelineAction = false;
        let targetRepo = '';
        let targetFile = '';

        if (parts.length === 4 && parts[0].trim().toLowerCase() === 'github' && parts[3].trim().toLowerCase() === 'save') {
            isPipelineAction = true;
            targetRepo = parts[1].trim();
            targetFile = parts[2].trim();
        } else if (parts.length === 3 && parts[2].trim().toLowerCase() === 'save') {
            isPipelineAction = true;
            targetRepo = parts[0].trim();
            targetFile = parts[1].trim();
        }

        if (isPipelineAction) {
            const token = localStorage.getItem('user');
            const username = localStorage.getItem('github_username');

            if (!token || !username) {
                print("error: you must execute authentication log-in verification routines before triggering a pipeline save.");
                return;
            }
            if (!REPO_NAME_REGEX.test(targetRepo) || targetRepo.length > 100) {
                print("error: illegal repository name formatting string structure target.");
                return;
            }
            if (!SAFE_FILE_NAME_REGEX.test(targetFile) || targetFile.includes('..')) {
                print("error: illegal file name formatting string structure target.");
                return;
            }

            // Sync structural targets seamlessly
            localStorage.setItem('repository', targetRepo);
            activeRepo = targetRepo;

            try {
                const { htmlTool } = await import('./html.js');
                const content = htmlTool.getLines();

                if (!content || content.trim() === '') {
                    print("warning: source layout buffer is empty. write some html code first!");
                    return;
                }

                print(`system: executing unified pipeline save for '${sanitizeInputString(targetFile)}' to '${sanitizeInputString(targetRepo)}'...`);
                const success = await pushFileToGitHub(targetFile, content);
                if (success) {
                    print(`system: successfully initialized commit and pushed direct changes!`);
                    import('./main.js').then(m => m.setMode("main", m.getSystemPrompt()));
                }
            } catch (e) {
                print(`error: critical sync error during pipeline communication: ${e.message}`);
            }
            return;
        }
        // --- End of Pipeline Interceptor ---

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

            print("system: validating access token with github gateway...");
            
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
                        print("system: exited github config mode.");
                        import('./main.js').then(m => m.setMode("main", m.getSystemPrompt()));
                    } else {
                        print("error: failed to retrieve valid parsing metadata profile from endpoint.");
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
                    print(`system: connected to existing repository: ${sanitizeInputString(value)}`);
                    print("system: exited github config mode.");
                    import('./main.js').then(m => m.setMode("main", m.getSystemPrompt()));
                } else if (checkRes.status === 404) {
                    pendingRepoCreation = value;
                    print(`warning: repository '${sanitizeInputString(value)}' does not exist.`);
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

            print(`system: repository not found. creating private repository '${sanitizeInputString(repoToCreate)}' automatically...`);
            
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
                        description: "Studio repository"
                    })
                });

                if (createRes.ok) {
                    print(`system: successfully initialized private repository '${sanitizeInputString(repoToCreate)}'!`);
                    localStorage.setItem('repository', repoToCreate);
                    activeRepo = repoToCreate;
                    import('./main.js').then(m => m.setMode("main", m.getSystemPrompt()));
                } else {
                    print("error: failed to automatically provision a new github repository.");
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
            print("system: logged out. token and workspace config cleared from this browser.");
            import('./main.js').then(m => m.setMode("main", m.getSystemPrompt()));
            return;
        }

        print("error: unhandled sub-command. available options: login/token, repo/name, confirm, logout, or github/reponame/filename/save");
    },
    onExit: () => {
        print("system: exited github config mode.");
    }
};

registerTool('github', githubTool);