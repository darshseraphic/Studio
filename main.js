const outputDiv = document.getElementById('output');
const cmdInput = document.getElementById('cmd-input');
const themeToggle = document.getElementById('theme-toggle');
const promptSpan = document.querySelector('.input-line span');

export function getSystemPrompt() {
    const username = localStorage.getItem('github_username') || 'guest';
    return `${username}/studio>`;
}

let currentMode = "main";
const registry = {};
const usedToolsInSession = new Set();

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
        promptSpan.textContent = promptText;
    }
    
    if (modeName !== "main") {
        usedToolsInSession.add(modeName);
    }
}

async function handleGlobalSave() {
    let savedAny = false;
    
    if (usedToolsInSession.has('note') && registry['note'] && typeof registry['note'].getLines === 'function') {
        const notes = registry['note'].getLines();
        if (notes && notes.trim() !== '') { 
            await download(notes, 'note.txt'); 
            savedAny = true; 
        }
    }
    
    if (usedToolsInSession.has('calculator') && registry['calculator'] && typeof registry['calculator'].getLines === 'function') {
        const calc = registry['calculator'].getLines();
        if (calc && calc.trim() !== '') { 
            await download(calc, 'calculator.txt'); 
            savedAny = true; 
        }
    }

    if (usedToolsInSession.has('weather') && registry['weather'] && typeof registry['weather'].getLines === 'function') {
        const weatherData = registry['weather'].getLines();
        if (weatherData && weatherData.trim() !== '') { 
            await download(weatherData, 'weather.csv'); 
            savedAny = true; 
        }
    }

    if (usedToolsInSession.has('html') && registry['html'] && typeof registry['html'].getLines === 'function') {
        const htmlCode = registry['html'].getLines();
        if (htmlCode && htmlCode.trim() !== '') { 
            await download(htmlCode, 'index.html'); 
            savedAny = true; 
        }
    }
    
    if (!savedAny) {
        print("system: no active session logs or data found to download.");
    }
}

async function handleToolPull(modeName) {
    const activeTool = registry[modeName];
    if (!activeTool) return;

    let filename = '';
    if (modeName === 'note') filename = 'note.txt';
    else if (modeName === 'calculator') filename = 'calculator.txt';
    else if (modeName === 'weather') filename = 'weather.csv';
    else if (modeName === 'html') filename = 'index.html';

    if (!filename) {
        print(`system: no cloud file mapping found for tool "${modeName}".`);
        return;
    }

    const token = localStorage.getItem('user');
    const repo = localStorage.getItem('repository');

    if (token && repo && registry['github'] && typeof registry['github'].pull === 'function') {
        print(`system: pulling ${filename} from your repository [${repo}]...`);
        const content = await registry['github'].pull(filename);
        if (content !== null && content !== undefined) {
            print(`system: ${filename} pulled and loaded successfully.`);
            usedToolsInSession.add(modeName);
            if (typeof activeTool.loadPulled === 'function') {
                await activeTool.loadPulled(content);
            } else if (typeof activeTool.handleInput === 'function') {
                await activeTool.handleInput(content);
            }
        } else {
            print(`error: failed to pull ${filename} from GitHub.`);
        }
    } else {
        print("warning: GitHub sync environment not configured or pull method unavailable.");
    }
}

async function download(content, filename) {
    const token = localStorage.getItem('user');
    const repo = localStorage.getItem('repository');

    if (token && repo && registry['github'] && typeof registry['github'].sync === 'function') {
        print(`system: pushing ${filename} to your repository [${repo}]...`);
        const success = await registry['github'].sync(filename, content);
        if (success) {
            print(`system: cloud backup complete. ${filename} pushed successfully to GitHub.`);
            return;
        } else {
            print("warning: cloud sync failed. falling back to direct browser local fallback file download.");
        }
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    print(`system: ${filename} downloaded locally successfully.`);
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
            const activeTool = registry[currentMode];
            if (activeTool && typeof activeTool.onExit === 'function') activeTool.onExit();
            
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
        if (currentMode === 'html') {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const activeTool = registry[currentMode];
            if (activeTool && typeof activeTool.handleInput === 'function') {
                await activeTool.handleInput(pastedText);
            }
            cmdInput.value = '';
            cmdInput.style.height = '26px';
        }
    });

    cmdInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Backspace' && cmdInput.selectionStart === 0 && cmdInput.selectionEnd === 0) {
            if (currentMode !== "main") {
                const activeTool = registry[currentMode];
                if (activeTool && typeof activeTool.backspaceUp === 'function') {
                    const currentInputText = cmdInput.value;
                    const previousLineText = activeTool.backspaceUp();
                    
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
            
            const input = cmdInput.value;
            cmdInput.value = '';
            cmdInput.style.height = '26px';
            
            if (input.trim() === '' && currentMode === "main") return;

            if (currentMode !== "main") {
                const activeTool = registry[currentMode];
                if (activeTool) {
                    if (input.trim().toLowerCase() === 'save') {
                        print(`${activeTool.prompt || ''}${input.toLowerCase()}`);
                        await handleGlobalSave();
                    } else if (input.trim().toLowerCase() === 'pull') {
                        print(`${activeTool.prompt || ''}${input.toLowerCase()}`);
                        await handleToolPull(currentMode);
                    } else if (typeof activeTool.handleInput === 'function') {
                        activeTool.handleInput(input);
                    }
                }
                return;
            }

            print(`${getSystemPrompt()}${input.toLowerCase()}`);
            const command = input.trim().toLowerCase();
            const baseCommand = command.split('/')[0];

            if (baseCommand === 'end') {
                const targetTool = command.split('/')[1];
                if (!targetTool) {
                    usedToolsInSession.clear();
                    Object.keys(registry).forEach(toolName => {
                        if (registry[toolName] && typeof registry[toolName].clearBuffer === 'function') {
                            registry[toolName].clearBuffer();
                        }
                    });
                    print("system: all active tool session states and tracking logs have been completely wiped.");
                } else {
                    if (usedToolsInSession.has(targetTool)) {
                        usedToolsInSession.delete(targetTool);
                        if (registry[targetTool] && typeof registry[targetTool].clearBuffer === 'function') {
                            registry[targetTool].clearBuffer();
                        }
                        print(`system: session memory logs for [${targetTool}] have been closed and destroyed.`);
                    } else {
                        print(`warning: no active session trace or buffer records found for tool "${targetTool}".`);
                    }
                }
                return;
            }

            if (baseCommand === 'pull') {
                const targetTool = command.split('/')[1];
                if (!targetTool) {
                    await handleToolPull('note');
                    await handleToolPull('calculator');
                    await handleToolPull('weather');
                    await handleToolPull('html');
                } else {
                    if (registry[targetTool]) {
                        await handleToolPull(targetTool);
                    } else {
                        print(`error: unrecognized tool "${targetTool}" for pull command.`);
                    }
                }
                return;
            }

            if (baseCommand === 'edit') {
                const targetTool = command.split('/')[1];
                if (!targetTool) {
                    print("error: specify a tool to edit, e.g. edit/note or edit/html");
                    return;
                }
                const tool = registry[targetTool];
                if (!tool || typeof tool.loadPulled !== 'function' || typeof tool.getLines !== 'function') {
                    print(`error: "${targetTool}" does not support edit mode.`);
                    return;
                }

                usedToolsInSession.add(targetTool);
                setMode(targetTool, tool.prompt || "");

                const existing = tool.getLines();
                if (existing && existing.trim() !== '') {
                    print(`system: entering ${targetTool} edit mode — existing content loaded below.`);
                    await tool.loadPulled(existing);
                } else {
                    print(`system: entering ${targetTool} edit mode — buffer is currently empty.`);
                }
                return;
            }

            if (command === 'help') {
                print("available core commands:");
                print("  help       - display this log");
                print("  clear      - erase terminal output window");
                print("  github     - configure remote github sync workspace environment");
                print("  save       - download all session logs to files (or sync to cloud repository)");
                print("  note       - start note-taking session");
                print("  calculator - start terminal calculator mode");
                print("  weather    - fetch current weather forecast table for a location (use: weather/city name)");
                print("  html       - open an interactive code buffer editor with sandbox compilation");
            } else if (command === 'clear') {
                if (outputDiv) outputDiv.textContent = '';
            } else if (command === 'save') {
                await handleGlobalSave();
            } else if (command === 'hello') {
                print('hello, this is darshseraphic, nice to meet you!');
            } else if (registry[baseCommand]) {
                usedToolsInSession.add(baseCommand);
                setMode(baseCommand, registry[baseCommand].prompt || "");
                if (typeof registry[baseCommand].onEnter === 'function') {
                    await registry[baseCommand].onEnter();
                }
                if (command.includes('/')) {
                    await registry[baseCommand].handleInput(input);
                }
            } else {
                print(`error: unrecognized command "${command}"`);
            }
        }
    });
}