import { networkTool } from './network.js';

const outputDiv = document.getElementById('output');
const cmdInput = document.getElementById('cmd-input');
const themeToggle = document.getElementById('theme-toggle');
const promptSpan = document.querySelector('.input-line span');

export const VALID_EXTENSIONS = [
    'txt', 'md', 'html', 'css', 'js', 'json', 'ts', 'jsx', 'tsx',
    'py', 'rb', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'sh', 'dart'
];

export let currentMode = "main";
export let currentPath = JSON.parse(localStorage.getItem('current_path') || '[]');
export let fileBuffers = {};
export let virtualDirectories = new Set();
export const usedToolsInSession = new Set();

export const registry = {};
registry['network'] = networkTool;

export function savePathState() {
    if (localStorage.getItem('repository')) {
        localStorage.setItem('current_path', JSON.stringify(currentPath));
    } else {
        localStorage.removeItem('current_path');
    }
}

export function getSystemPrompt() {
    const username = localStorage.getItem('github_username') || 'guest';
    const repo = localStorage.getItem('repository') || '';
    const githubActive = localStorage.getItem('github_active') === 'true';
    let pathStr = '';

    if (repo) {
        pathStr = '/github/' + repo;
        if (currentPath.length > 0) {
            pathStr += '/' + currentPath.join('/');
        }
    } else if (githubActive) {
        pathStr = '/github';
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

window.print = print;

export function registerTool(name, toolModule) {
    registry[name] = toolModule;
}

export function setMode(modeName, promptText = "") {
    currentMode = modeName;
    if (promptSpan) {
        promptSpan.textContent = promptText || getSystemPrompt();
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

            const GitHub = await import('./github.js');

            if (GitHub.hasPendingInteraction()) {
                await GitHub.handlePendingInteraction(rawInput);
                return;
            }

            const commandLogPrompt = getSystemPrompt();
            print(`${commandLogPrompt}${rawInput}`);

            const cleanCommand = rawInput.trim();
            const lowerCommand = cleanCommand.toLowerCase();
            const firstSegment = lowerCommand.split('/')[0];

            if (lowerCommand === 'help') {
                if (GitHub.isInGithubContext()) {
                    GitHub.printGithubHelp();
                } else {
                    print("available core state command maps:");
                    print("  help                       - clear layout mapping diagnostics");
                    print("  clear                      - clean the terminal output viewport framework");
                    print("  refresh                    - execute program pipeline environment reboot context");
                    print("  github                     - switch context configuration sub-menus");
                    print("  calculator                 - trigger calculation environment variables");
                    print("  weather/[location]         - query weather database forecasting reports");
                    print("  bhagvad/geeta              - enter the Bhagavad Geeta reader (then type chapter/shlok)");
                    print("  network/ip                 - show ip address");
                    print("  network/location           - show ip location");
                    print("  network/speed              - show network speed live");
                    print("  open [url] (or open/[url]) - open target URL link inside a new browser tab cleanly");
                }
            } else if (lowerCommand === 'clear') {
                if (outputDiv) outputDiv.textContent = '';
            } else if (lowerCommand === 'refresh') {
                print("system: rebooting environment console pipeline sync arrays...");
                window.location.reload();
                return;
            } else if (lowerCommand === 'hello') {
                print('hello, this is darshseraphic, nice to meet you!');
            } else if (lowerCommand.startsWith('open ') || lowerCommand === 'open' || lowerCommand.startsWith('open/')) {
                let urlTarget = '';
                if (cleanCommand.startsWith('open ')) {
                    urlTarget = cleanCommand.substring(5).trim();
                } else if (cleanCommand.startsWith('open/')) {
                    urlTarget = cleanCommand.substring(5).trim();
                }

                if (!urlTarget) {
                    print("error: specify a valid URL to open.");
                } else {
                    let url = urlTarget;
                    if (!/^https?:\/\//i.test(url)) {
                        url = 'https://' + url;
                    }
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            } else if (GitHub.isWorkspaceCommand(cleanCommand)) {
                await GitHub.handleWorkspaceCommand(cleanCommand);
            } else if (registry[firstSegment]) {
                if ((firstSegment === 'weather' || firstSegment === 'network') && cleanCommand.includes('/')) {
                    await registry[firstSegment].handleInput(cleanCommand);
                    return;
                }
                usedToolsInSession.add(firstSegment);
                setMode(firstSegment, registry[firstSegment].prompt || "");
                if (typeof registry[firstSegment].onEnter === 'function') {
                    await registry[firstSegment].onEnter();
                }
                if (cleanCommand.includes('/')) {
                    await registry[firstSegment].handleInput(cleanCommand.split('/').slice(1).join('/'));
                }
            } else {
                print(`error: command signature or directory target path "${cleanCommand}" unrecognized.`);
            }
        }
    });
}