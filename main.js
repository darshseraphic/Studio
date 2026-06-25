const outputDiv = document.getElementById('output');
const cmdInput = document.getElementById('cmd-input');
const themeToggle = document.getElementById('theme-toggle');
const promptSpan = document.querySelector('.input-line span');

// DYNAMIC PROMPT FUNCTION: Checks cache for username, defaults to 'guest' if not logged in
export function getSystemPrompt() {
    const username = localStorage.getItem('github_username') || 'guest';
    return `${username}/studio>`;
}

let currentMode = "main";
const registry = {};
const usedToolsInSession = new Set();

// INITIALIZE PROMPT ON BOOT: Set the initial prompt string dynamically
promptSpan.textContent = getSystemPrompt();

export function print(text) {
    const line = document.createElement('div');
    line.textContent = text;
    outputDiv.appendChild(line);
    cmdInput.scrollIntoView({ block: 'nearest' });
}

export function registerTool(name, toolModule) {
    registry[name] = toolModule;
}

export function setMode(modeName, promptText = "") {
    currentMode = modeName;
    promptSpan.textContent = promptText;
    
    if (modeName !== "main") {
        usedToolsInSession.add(modeName);
    }
}

function handleGlobalSave() {
    let savedAny = false;
    
    if (usedToolsInSession.has('note') && registry['note'] && typeof registry['note'].getLines === 'function') {
        const notes = registry['note'].getLines();
        if (notes && notes.trim() !== '') { 
            download(notes, 'note.txt'); 
            savedAny = true; 
        }
    }
    
    if (usedToolsInSession.has('calculator') && registry['calculator'] && typeof registry['calculator'].getLines === 'function') {
        const calc = registry['calculator'].getLines();
        if (calc && calc.trim() !== '') { 
            download(calc, 'calculator.txt'); 
            savedAny = true; 
        }
    }

    if (usedToolsInSession.has('weather') && registry['weather'] && typeof registry['weather'].getLines === 'function') {
        const weatherData = registry['weather'].getLines();
        if (weatherData && weatherData.trim() !== '') { 
            download(weatherData, 'weather.csv'); 
            savedAny = true; 
        }
    }
    
    if (!savedAny) {
        print("system: no active session logs or data found to download.");
    }
}

async function download(content, filename) {
    const token = localStorage.getItem('user');
    const repo = localStorage.getItem('repository');

    // Query our tool registry dynamically to eliminate circular module import errors
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

    // Default Browser fallback local save behavior
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
    if (e.target !== themeToggle) cmdInput.focus();
});

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('theme-inverse');
    cmdInput.focus(); 
});

window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (currentMode !== "main") {
            const activeTool = registry[currentMode];
            if (activeTool && activeTool.onExit) activeTool.onExit();
            usedToolsInSession.delete(currentMode);
            // Dynamic callback call here on exit:
            setMode("main", getSystemPrompt());
        }
    }
});

cmdInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const input = cmdInput.value;
        cmdInput.value = '';
        
        if (input.trim() === '' && currentMode === "main") return;

        if (currentMode !== "main") {
            const activeTool = registry[currentMode];
            if (activeTool) {
                if (input.trim().toLowerCase() === 'save') {
                    handleGlobalSave();
                } else {
                    activeTool.handleInput(input);
                }
            }
            return;
        }

        // Print using the dynamic prompt layout
        print(`${getSystemPrompt()}${input.toLowerCase()}`);
        const command = input.trim().toLowerCase();
        const baseCommand = command.split('/')[0];

        if (command === 'help') {
            print("available core commands:");
            print("  help       - display this log");
            print("  clear      - erase terminal output window");
            print("  github     - configure remote github sync workspace environment");
            print("  save       - download all session logs to files (or sync to cloud repository)");
            print("  note       - start note-taking session");
            print("  calculator - start terminal calculator mode");
            print("  weather    - fetch current weather forecast table for a location (use: weather/city name)");
        } else if (command === 'clear') {
            outputDiv.textContent = '';
        } else if (command === 'save') {
            handleGlobalSave();
        } else if (registry[baseCommand]) {
            usedToolsInSession.add(baseCommand);
            setMode(baseCommand, registry[baseCommand].prompt || "");
            await registry[baseCommand].onEnter();
            if (command.includes('/')) {
                await registry[baseCommand].handleInput(input);
            }
        } else if (command === 'hello') {
            outputDiv.textContent = 'hello, this is darshseraphic, nice to meet you!';
        } else {
            print(`error: unrecognized command "${command}"`);
        }
    }
});