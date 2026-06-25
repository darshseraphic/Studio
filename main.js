const outputDiv = document.getElementById('output');
const cmdInput = document.getElementById('cmd-input');
const themeToggle = document.getElementById('theme-toggle');
const promptSpan = document.querySelector('.input-line span');

const SYSTEM_PROMPT = "darshseraphic/studio>";
let currentMode = "main";
const registry = {};

// Keep track of which tools are actively running or have data in this session
const usedToolsInSession = new Set();

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
    
    // 1. Check 'note' tool
    if (usedToolsInSession.has('note') && registry['note'] && typeof registry['note'].getLines === 'function') {
        const notes = registry['note'].getLines();
        if (notes && notes.trim() !== '') { 
            download(notes, 'note.txt'); 
            savedAny = true; 
        }
    }
    
    // 2. Check 'calculator' tool
    if (usedToolsInSession.has('calculator') && registry['calculator'] && typeof registry['calculator'].getLines === 'function') {
        const calc = registry['calculator'].getLines();
        if (calc && calc.trim() !== '') { 
            download(calc, 'calculator.txt'); 
            savedAny = true; 
        }
    }

    // 3. Check 'weather' tool
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

function download(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    print(`system: ${filename} downloaded successfully.`);
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
            
            // Cleanly remove from active download queue upon manual exit
            usedToolsInSession.delete(currentMode);
            
            setMode("main", SYSTEM_PROMPT);
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

        print(`${SYSTEM_PROMPT}${input.toLowerCase()}`);
        const command = input.trim().toLowerCase();
        const baseCommand = command.split('/')[0];

        if (command === 'help') {
            print("available core commands:");
            print("  help       - display this log");
            print("  clear      - erase terminal output window");
            print("  login      - initiate github device flow");
            print("  save       - download all session logs to txt files");
            print("  note       - start note-taking session");
            print("  calculator - start terminal calculator mode");
            print("  weather    - fetch current weather forecast table for a location (use: weather/city name)");
        } else if (command === 'clear') {
            outputDiv.textContent = '';
        } else if (command === 'login') {
            print("err: client access identifier (client_id) not linked.");
        } else if (command === 'save') {
            handleGlobalSave();
        } else if (registry[baseCommand]) {
            usedToolsInSession.add(baseCommand);
            setMode(baseCommand, registry[baseCommand].prompt || "");
            await registry[baseCommand].onEnter();
            if (command.includes('/')) {
                await registry[baseCommand].handleInput(input);
            }
        } else {
            print(`error: unrecognized command "${command}"`);
        }
    }
});