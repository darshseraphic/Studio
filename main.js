const outputDiv = document.getElementById('output');
const cmdInput = document.getElementById('cmd-input');
const themeToggle = document.getElementById('theme-toggle');
const promptSpan = document.querySelector('.input-line span');

// Stateful Virtual Path Infrastructure
export let currentMode = "main"; 
export let currentPath = [];     // Tracks directory depth arrays ['src', 'components']
export let fileBuffers = {};     // Shared local workspace content memory traces

// FIXED: Added 'export' so editor.js and other tools can import the central tool registry
export const registry = {};
const usedToolsInSession = new Set();

export function getSystemPrompt() {
    const username = localStorage.getItem('github_username') || 'darshseraphic';
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

// Live GitHub verification link loop for paths and repositories
async function verifyRemotePath(repoName, directoryPath = '') {
    const token = localStorage.getItem('user');
    const username = localStorage.getItem('github_username') || 'darshseraphic';
    
    if (!token) {
        print("warning: active github auth token not found. switching paths without remote validation verification.");
        return true; 
    }

    let url = `https://api.github.com/repos/${username}/${repoName}`;
    if (directoryPath) {
        url += `/contents/${directoryPath}`;
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

// Generates correct relative path strings required by GitHub operations
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

// Global hotkey capture sequence to safely back out of any active tool context
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

    // Dynamic pasting interface routed straight to active sub-tool engines
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
        // Dynamic backspace intercepts delegated directly to active tool context logic
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

            // --- MODE: Active Subsystem Tool Routing Delegation ---
            if (currentMode !== "main") {
                if (registry[currentMode] && typeof registry[currentMode].handleInput === 'function') {
                    await registry[currentMode].handleInput(rawInput);
                    return;
                }
            }

            // --- MODE: Standard Virtual Shell Navigation Parsing ---
            const commandLogPrompt = getSystemPrompt();
            print(`${commandLogPrompt}${rawInput}`);
            
            const cleanCommand = rawInput.trim();
            const lowerCommand = cleanCommand.toLowerCase();

            // 1. Dynamic Absolute System Escape Jump Framework
            const currentUsername = (localStorage.getItem('github_username') || 'darshseraphic').toLowerCase();
            if (lowerCommand === 'darshseraphic/' || lowerCommand === 'rocen/' || lowerCommand === `${currentUsername}/`) {
                localStorage.removeItem('repository');
                currentPath = [];
                setMode("main", getSystemPrompt());
                return;
            }

            // 2. Direct Raw Relative Navigation Execution (e.g. `../`, `../../`, `..`)
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

            // 3. Intercept and cleanly evaluate standard space 'cd' relocation logic
            if (lowerCommand.startsWith('cd ') || lowerCommand === 'cd' || lowerCommand.startsWith('cd/')) {
                let pathTarget = '';
                if (lowerCommand.startsWith('cd ')) {
                    pathTarget = cleanCommand.substring(3).trim();
                } else if (lowerCommand.startsWith('cd/')) {
                    pathTarget = cleanCommand.substring(3).trim();
                }

                if (!pathTarget) return;

                // Relative backward loops processing inside cd
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

                // File validation check if targeted inside cd
                if (pathTarget.includes('.')) {
                    print(`system: executing read-only preview pull for: ${pathTarget}`);
                    if (registry['github'] && typeof registry['github'].pull === 'function') {
                        const fullPath = getFullFilePath(pathTarget);
                        const data = await registry['github'].pull(fullPath);
                        if (data !== null) {
                            print("--------------------------------------------------");
                            print(data);
                            print("--------------------------------------------------");
                        } else {
                            print("error: remote system failed cehck the spelling or extension of the file.");
                        }
                    } else {
                        print("warning: git environment context missing configuration profiles.");
                    }
                    return;
                }

                // Subdirectory push routing logic with strict verification pings
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

            // For explicit slash sub-actions (pull, save, run, edit), isolate parameters cleanly
            const firstSegment = lowerCommand.split('/')[0];
            const targetPayload = cleanCommand.split('/').slice(1).join('/');

            // Explicit target command: edit/filename OR editor/filename
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
                    // Forward directly into the editor's file switching routing protocol
                    await registry['editor'].handleInput(cleanCommand);
                } else {
                    print("error: universal plaintext workspace editor is offline or unregistered.");
                }
                return;
            }

            // Explicit target command: pull/filename
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

            // Explicit target command: save/filename
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

            // Explicit target command: run/filename (UNIVERSAL RENDERING LAYER)
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

            // Global System Core Interfaces Routing Block
            if (lowerCommand === 'help') {
                print("available core state command maps:");
                print("  help                       - clear layout mapping diagnostics");
                print("  clear                      - clean the terminal output viewport framework");
                print("  github                     - switch context configuration sub-menus");
                print("  editor                     - trigger universal plaintext file editor");
                print("  edit/[file_name]           - open targeted items inside the workspace text editor");
                print("  calculator                 - trigger calculation environment variables");
                print("  weather/[location]         - query weather database forecasting reports");
                print("  cd [dir_name]              - descend into a sub-directory node array");
                print("  cd [file_name]             - pull and perform immediate read-only preview console blocks");
                print("  cd .. (or ../../)          - perform relative tracking stack reversals");
                print("  [relative_path] (ex: ../)  - quick relative tracking jumps without writing 'cd'");
                print("  darshseraphic/             - direct workspace layout structural reset jump to root prompt");
                print("  pull/[file_name]           - restore structural content configurations from cloud nodes");
                print("  save/[file_name]           - serialize buffer arrays and execute remote pushes to cloud git");
                print("  run/[file_name]            - compile and render document nodes to sub-sandbox tabs cleanly");
            } else if (lowerCommand === 'clear') {
                if (outputDiv) outputDiv.textContent = '';
            } else if (lowerCommand === 'hello') {
                print('hello, this is darshseraphic, nice to meet you!');
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