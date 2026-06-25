import { registerTool, print } from './main.js';

let activeRepo = localStorage.getItem('repository') || '';

// The Sync function lives entirely inside this file now
async function pushFileToGitHub(fileName, content) {
    const token = localStorage.getItem('user');
    const username = localStorage.getItem('github_username');
    const repo = localStorage.getItem('repository');

    if (!token || !username || !repo) return false;

    try {
        const base64Content = btoa(unescape(encodeURIComponent(content)));
        let sha = null;

        const fileCheck = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/${fileName}`, {
            headers: { 'Authorization': `token ${token}` }
        });
        if (fileCheck.ok) {
            const fileData = await fileCheck.json();
            sha = fileData.sha;
        }

        const pushRes = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/${fileName}`, {
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

const githubTool = {
    helpText: "configure github backup workspace (use: login/token or repo/name)",
    prompt: "github>",
    // Attach the sync method here so main.js can read it without importing this file explicitly!
    sync: pushFileToGitHub, 
    onEnter: async () => {
        const token = localStorage.getItem('user');
        print("system: github workspace mode activated.");
        if (token) {
            print("status: authenticated via stored token cache.");
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

            const username = localStorage.getItem('github_username');
            print(`system: checking if repository '${value}' exists under @${username}...`);

            try {
                const repoCheck = await fetch(`https://api.github.com/repos/${username}/${value}`, {
                    headers: { 'Authorization': `token ${token}` }
                });

                if (repoCheck.ok) {
                    print(`system: connected to existing repository: ${value}`);
                    localStorage.setItem('repository', value);
                    activeRepo = value;
                } else if (repoCheck.status === 404) {
                    print(`system: repo not found. creating private repository '${value}' automatically...`);
                    
                    const createRes = await fetch('https://api.github.com/user/repos', {
                        method: 'POST',
                        headers: {
                            'Authorization': `token ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: value,
                            private: true,
                            description: "automated backup terminal logs repository"
                        })
                    });

                    if (createRes.ok) {
                        print(`system: successfully initialized private repository '${value}'!`);
                        localStorage.setItem('repository', value);
                        activeRepo = value;
                    } else {
                        print("error: failed to automatically provision a new github repository.");
                    }
                }
            } catch (e) {
                print("error: network communication with github api timed out.");
            }
            return;
        }

        print("error: unhandled sub-command. available options: login/token, repo/name");
    },
    onExit: () => {
        print("system: exited github config mode.");
    }
};

registerTool('github', githubTool);