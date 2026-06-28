const outputDiv = document.getElementById('output');
const cmdInput = document.getElementById('cmd-input');
const themeToggle = document.getElementById('theme-toggle');
const promptSpan = document.querySelector('.input-line span');

const VALID_EXTENSIONS = [
    'txt', 'md', 'html', 'css', 'js', 'json', 'ts', 'jsx', 'tsx', 
    'py', 'rb', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'sh', 'dart'
];


export let currentMode = "main"; 
export let currentPath = [];
export let fileBuffers = {};
export let virtualDirectories = new Set();

let pendingDeleteTarget = "";
let pendingDeleteType = "";

export const registry = {};
const usedToolsInSession = new Set();

export function getSystemPrompt() {
    const username = localStorage.getItem('github_username') || 'guest';
    const repo = localStorage.getItem('repository') || '';
    let pathStr = '';
    
    if (repo) {
        pathStr = '/' + repo;
        if (currentPath.length > 0) {
            pathStr += '/' + currentPath.join('/');
        }
    }
    return `${username}${pathStr}>`;
}

if (promptSpan) {
    promptSpan.textContent = getSystemPrompt();
}

export function print(text) {
    const line = document.createElement('div');
    line.textContent = text;
    outputDiv.appendChild(line);
    cmdInput.scrollIntoView({ block: 'nearest' });
    return line;
}

export function registerTool(name, toolModule) {
    registry[name] = toolModule;
}

export function setMode(modeName, promptText = "") {
    currentMode = modeName;
    if (promptSpan) {
        promptSpan.textContent = promptText || getSystemPrompt();
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
            }
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

export function getFullFilePath(filename) {
    if (currentPath.length > 0) {
        return currentPath.join('/') + '/' + filename;
    }
    return filename;
}

document.body.addEventListener('click', (e) => {
    if (e.target !== themeToggle && cmdInput) cmdInput.focus();
});

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('theme-inverse');
        if (cmdInput) cmdInput.focus(); 
    });
}

window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (currentMode !== "main") {
            print(`system: closing active tool environment session [${currentMode}].`);
            if (registry[currentMode] && typeof registry[currentMode].onExit === 'function') {
                registry[currentMode].onExit();
            }
            setMode("main", getSystemPrompt());
            if (cmdInput) {
                cmdInput.value = '';
                cmdInput.style.height = '26px';
            }
        }
    }
});

if (cmdInput) {
    cmdInput.addEventListener('input', () => {
        cmdInput.style.height = '26px';
        cmdInput.style.height = cmdInput.scrollHeight + 'px';
    });

    cmdInput.addEventListener('paste', async (e) => {
        if (currentMode !== 'main') {
            if (registry[currentMode] && typeof registry[currentMode].handleInput === 'function') {
                e.preventDefault();
                const pastedText = (e.clipboardData || window.clipboardData).getData('text');
                await registry[currentMode].handleInput(pastedText);
                cmdInput.value = '';
                cmdInput.style.height = '26px';
            }
        }
    });

    cmdInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Backspace' && cmdInput.selectionStart === 0 && cmdInput.selectionEnd === 0) {
            if (currentMode !== "main") {
                if (registry[currentMode] && typeof registry[currentMode].backspaceUp === 'function') {
                    const currentInputText = cmdInput.value;
                    const previousLineText = registry[currentMode].backspaceUp();
                    
                    if (previousLineText !== null) {
                        e.preventDefault();
                        cmdInput.value = previousLineText + currentInputText;
                        cmdInput.style.height = '26px';
                        cmdInput.style.height = cmdInput.scrollHeight + 'px';
                        cmdInput.setSelectionRange(previousLineText.length, previousLineText.length);
                        return;
                    }
                }
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            
            const rawInput = cmdInput.value;
            cmdInput.value = '';
            cmdInput.style.height = '26px';
            
            if (rawInput.trim() === '' && currentMode === "main") return;

            if (currentMode !== "main") {
                if (registry[currentMode] && typeof registry[currentMode].handleInput === 'function') {
                    await registry[currentMode].handleInput(rawInput);
                    return;
                }
            }

            if (pendingDeleteTarget) {
                print(`> ${rawInput}`);
                
                const cleanInput = rawInput.trim();
                const lowerInput = cleanInput.toLowerCase();
                
                if (lowerInput === 'yes' || lowerInput === 'y') {
                    if (pendingDeleteType === 'repository') {
                        print(`system: executing structural teardown streams for remote repository: '${pendingDeleteTarget}'...`);
                        const activeRepo = localStorage.getItem('repository');
                        if (activeRepo && activeRepo.toLowerCase() === pendingDeleteTarget.toLowerCase()) {
                            localStorage.removeItem('repository');
                            currentPath = [];
                            virtualDirectories.clear();
                        }
                    } else if (pendingDeleteType === 'file') {
                        print(`system: removing local workspace content memory traces for file: '${pendingDeleteTarget}'...`);
                        delete fileBuffers[pendingDeleteTarget];
                    } else if (pendingDeleteType === 'directory') {
                        print(`system: purging structural directory node tree components for: '${pendingDeleteTarget}'...`);
                        const fullDir = getFullFilePath(pendingDeleteTarget);
                        virtualDirectories.delete(fullDir);
                        
                        const idx = currentPath.findIndex(p => p.toLowerCase() === pendingDeleteTarget.toLowerCase());
                        if (idx !== -1) {
                            currentPath = currentPath.slice(0, idx);
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

            const commandLogPrompt = getSystemPrompt();
            print(`${commandLogPrompt}${rawInput}`);
            
            const cleanCommand = rawInput.trim();
            const lowerCommand = cleanCommand.toLowerCase();

            const currentUsername = (localStorage.getItem('github_username') || 'guest').toLowerCase();
            if (lowerCommand === 'darshseraphic/' || lowerCommand === 'rocen/' || lowerCommand === `${currentUsername}/`) {
                localStorage.removeItem('repository');
                currentPath = [];
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
                setMode("main", getSystemPrompt());
                return;
            }

            if (lowerCommand.startsWith('cd ') || lowerCommand === 'cd' || lowerCommand.startsWith('cd/')) {
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
                    if (registry['github'] && typeof registry['github'].pull === 'function') {
                        const fullPath = getFullFilePath(pathTarget);
                        const data = await registry['github'].pull(fullPath);
                        if (data !== null) {
                            print("--------------------------------------------------");
                            print(data);
                            print("--------------------------------------------------");
                        } else {
                            print("error: remote system failed check the spelling or extension of the file.");
                        }
                    } else {
                        print("warning: git environment context missing configuration profiles.");
                    }
                    return;
                }

                const activeRepo = localStorage.getItem('repository');
                if (!activeRepo) {
                    print(`system: scanning GitHub for repository configuration: '${pathTarget}'...`);
                    const repoExists = await verifyRemotePath(pathTarget, '');
                    if (repoExists) {
                        localStorage.setItem('repository', pathTarget);
                        setMode("main", getSystemPrompt());
                    } else {
                        print(`error: repository identity '${pathTarget}' does not exist or is unauthorized.`);
                    }
                } else {
                    const proposedPath = [...currentPath, pathTarget].join('/');
                    print(`system: verifying file tree structure map for: [${proposedPath}]...`);
                    const pathExists = await verifyRemotePath(activeRepo, proposedPath);
                    if (pathExists) {
                        currentPath.push(pathTarget);
                        setMode("main", getSystemPrompt());
                    } else {
                        print(`error: directory structural node components '${pathTarget}' do not exist.`);
                    }
                }
                return;
            }

            const firstSegment = lowerCommand.split('/')[0];
            const targetPayload = cleanCommand.split('/').slice(1).join('/');
            if (firstSegment === 'create') {
                if (!targetPayload) {
                    print("error: specify valid initialization target definitions. e.g. create/app.js or create/repo-name");
                    return;
                }

                const activeRepo = localStorage.getItem('repository');
                const token = localStorage.getItem('user');
                const username = localStorage.getItem('github_username');

                if (!token || !username) {
                    print("error: active github auth token not found. please login using github tool first.");
                    return;
                }

                if (!activeRepo) {
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
                    if (registry['github'] && typeof registry['github'].sync === 'function') {
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

                        const success = await registry['github'].sync(fullPath, content);
                        if (success) {
                            print(`system: actual remote resource successfully pushed and created on your GitHub repository.`);
                            setMode("main", getSystemPrompt());
                        } else {
                            print(`error: failed to create resource on GitHub. Verify your token has write permissions.`);
                        }
                    } else {
                        print("warning: git sync engine configurations are currently offline.");
                    }
                }
                return;
            }

            if (firstSegment === 'delete') {
                if (!targetPayload) {
                    print("error: specify valid target resource configurations to delete, e.g. delete/index.html");
                    return;
                }
                const activeRepo = localStorage.getItem('repository');
                if (!activeRepo) {
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

            if (firstSegment === 'edit' || firstSegment === 'editor') {
                if (!targetPayload) {
                    print("error: specify path name parameter, e.g. edit/note.txt");
                    return;
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
                if (registry['github'] && typeof registry['github'].pull === 'function') {
                    const fullPath = getFullFilePath(targetPayload);
                    print(`system: pulling file data payload from [${fullPath}]...`);
                    const contents = await registry['github'].pull(fullPath);
                    if (contents !== null) {
                        fileBuffers[targetPayload] = contents.replace(/\r\n/g, '\n').split('\n');
                        print(`system: local workspace buffer sync verified for ${targetPayload}.`);
                    } else {
                        print("error: failed to retrieve cloud structural components.");
                    }
                } else {
                    print("warning: git sync engine configurations are currently offline.");
                }
                return;
            }

            if (firstSegment === 'save') {
                if (!targetPayload) {
                    print("error: specify target save path parameters, e.g. save/index.html");
                    return;
                }
                const contentLines = fileBuffers[targetPayload];
                if (!contentLines) {
                    print(`error: no local workspace content memory traces found for file "${targetPayload}".`);
                    return;
                }
                if (registry['github'] && typeof registry['github'].sync === 'function') {
                    const fullPath = getFullFilePath(targetPayload);
                    print(`system: executing structural write sequences to remote: [${fullPath}]...`);
                    const success = await registry['github'].sync(fullPath, contentLines.join('\n'));
                    if (success) {
                        print(`system: cloud repository sync complete. verified ${targetPayload}.`);
                    } else {
                        print("error: cloud sync stream updates failed.");
                    }
                } else {
                    print("warning: git workspace integration configurations missing.");
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
                            <meta charset="UTF-8);
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

            if (lowerCommand === 'help') {
                const activeUsername = localStorage.getItem('github_username') || 'guest';
                const dynamicUserCmd = `  ${activeUsername}/`.padEnd(29);

                print("available core state command maps:");
                print("  help                       - clear layout mapping diagnostics");
                print("  clear                      - clean the terminal output viewport framework");
                print("  github                     - switch context configuration sub-menus");
                print("  editor                     - trigger universal plaintext file editor");
                print("  edit/[file_name]           - open targeted items inside the workspace text editor");
                print("  calculator                 - trigger calculation environment variables");
                print("  time                       - show exact time")
                print("  weather/[location]         - query weather database forecasting reports");
                print("  cd [dir_name]              - descend into a sub-directory node array");
                print("  cd [file_name]             - pull and perform immediate read-only preview console blocks");
                print("  cd .. (or ../../)          - perform relative tracking stack reversals");
                print("  [relative_path] (ex: ../)  - quick relative tracking jumps without writing 'cd'");
                print(`  ${dynamicUserCmd}          - direct workspace layout structural reset jump to root prompt`);
                print("  create/[target]            - allocate new repositories, sub-directories, or code files");
                print("  delete/[target]            - clear architectural nodes or elements with interactive safeguards");
                print("  pull/[file_name]           - restore structural content configurations from cloud nodes");
                print("  save/[file_name]           - serialize buffer arrays and execute remote pushes to cloud git");
                print("  run/[file_name]            - compile and render document nodes to sub-sandbox tabs cleanly");
            } else if (lowerCommand === 'clear') {
                if (outputDiv) outputDiv.textContent = '';
            } else if (lowerCommand === 'hello') {
                print('hello, this is darshseraphic studio, nice to meet you!');
            } else if (registry[firstSegment]) {
                usedToolsInSession.add(firstSegment);
                setMode(firstSegment, registry[firstSegment].prompt || "");
                if (typeof registry[firstSegment].onEnter === 'function') {
                    await registry[firstSegment].onEnter();
                }
                if (cleanCommand.includes('/')) {
                    await registry[firstSegment].handleInput(cleanCommand);
                }
            } else {
                print(`error: command signature or directory target path "${cleanCommand}" unrecognized.`);
            }
        }
    });
}