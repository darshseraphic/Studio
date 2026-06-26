import { registerTool, print, getSystemPrompt } from './main.js';

let activeRepo = localStorage.getItem('repository') || '';
let pendingRepoCreation = null;

async function pushFileToGitHub(fileName, content) {
    const token = localStorage.getItem('user');
    const username = localStorage.getItem('github_username');
    const repo = localStorage.getItem('repository');

    if (!token || !username || !repo) return false;

    try {
        const base64Content = btoa(unescape(encodeURIComponent(content)));
        let sha = null;
        const apiPath = `https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(fileName)}`;

        const fileCheck = await fetch(apiPath, {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if (fileCheck.ok) {
            const fileData = await fileCheck.json();
            sha = fileData.sha;
        }

        const pushRes = await fetch(apiPath, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `terminal session auto-sync: ${fileName}`,
                content: base64Content,
                sha: sha
            })
        });

        return pushRes.ok;
    } catch (e) {
        return false;
    }
}

async function pullFileFromGitHub(fileName) {
    const token = localStorage.getItem('user');
    const username = localStorage.getItem('github_username');
    const repo = localStorage.getItem('repository');

    if (!token || !username || !repo) return null;

    try {
        const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(fileName)}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        if (!res.ok) return null;
        return await res.text();
    } catch (e) {
        return null;
    }
}

const githubTool = {
    helpText: "configure github backup workspace (use: login/token, repo/name, confirm, logout)",
    prompt: "github>",
    sync: pushFileToGitHub,
    pull: pullFileFromGitHub,
    onEnter: async () => {
        const token = localStorage.getItem('user');
        print("system: github workspace mode activated.");
        if (token) {
            print("status: authenticated via stored token cache.");
            activeRepo = localStorage.getItem('repository') || '';
            print(`active workspace repo: ${activeRepo || 'none (set using repo/name)'}`);
        } else {
            print("status: unauthenticated. generate a token on github and login using: login/token");
        }
        print("press CTRL + E to return to main prompt.");
    },
    handleInput: async (input) => {
        print(`github>${input}`);
        if (input.trim() === '') return;

        const slashIndex = input.indexOf('/');
        const action = slashIndex !== -1 ? input.substring(0, slashIndex).trim().toLowerCase() : input.trim().toLowerCase();
        const value = slashIndex !== -1 ? input.substring(slashIndex + 1).trim() : '';

        const token = localStorage.getItem('user');

        if (action === 'login') {
            if (!value) {
                print("error: format must be login/token");
                return;
            }
            print("system: validating access token with github gateway...");
            try {
                const userRes = await fetch('https://api.github.com/user', {
                    headers: { 'Authorization': `token ${value}` }
                });
                if (!userRes.ok) throw new Error();
                const userData = await userRes.json();
                
                localStorage.setItem('user', value);
                localStorage.setItem('github_username', userData.login);
                print(`system: successfully authenticated as @${userData.login}!`);
                          
            } catch (err) {
                print("error: invalid github access token or network failure.");
            }
            return;
        }

        if (action === 'repo') {
            if (!token) {
                print("error: please complete login/token authentication first.");
                return;
            }
            if (!value) {
                print("error: specify a name using repo/name");
                return;
            }
            if (!/^[A-Za-z0-9._-]{1,100}$/.test(value) || value === '.' || value === '..') {
                print("error: invalid repository name. use only letters, numbers, '.', '_', or '-'.");
                return;
            }

            const username = localStorage.getItem('github_username');
            print(`system: checking if repository '${value}' exists under @${username}...`);

            try {
                const repoCheck = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(value)}`, {
                    headers: { 'Authorization': `token ${token}` }
                });

                if (repoCheck.ok) {
                    print(`system: connected to existing repository: ${value}`);
                    localStorage.setItem('repository', value);
                    activeRepo = value;
                } else if (repoCheck.status === 404) {
                    pendingRepoCreation = value;
                    print(`system: repo '${value}' not found under @${username}.`);
                    print(`system: type 'confirm' to create it as a new PRIVATE repository, or 'repo/othername' to try a different name.`);
                }
            } catch (e) {
                print("error: network communication with github api timed out.");
            }
            return;
        }

        if (action === 'confirm') {
            if (!pendingRepoCreation) {
                print("error: nothing pending to confirm.");
                return;
            }
            if (!token) {
                print("error: please complete login/token authentication first.");
                return;
            }
            const repoToCreate = pendingRepoCreation;
            pendingRepoCreation = null;
            print(`system: creating private repository '${repoToCreate}'...`);

            try {
                const createRes = await fetch('https://api.github.com/user/repos', {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: repoToCreate,
                        private: true,
                        description: "automated backup terminal logs repository"
                    })
                });

                if (createRes.ok) {
                    print(`system: successfully initialized private repository '${repoToCreate}'!`);
                    localStorage.setItem('repository', repoToCreate);
                    activeRepo = repoToCreate;
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
            return;
        }

        print("error: unhandled sub-command. available options: login/token, repo/name, confirm, logout");
    },
    onExit: () => {
        print("system: exited github config mode.");
    }
};

registerTool('github', githubTool);