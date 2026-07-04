import { registerTool, print, setMode, getSystemPrompt, fileBuffers, getFullFilePath } from './main.js';

let editingFile = "";
let editorLines = [];
let editorElements = [];
let pendingCreationFile = ""; 

function updateLineNumberPrompt() {
    const currentLineNum = editorLines.length + 1;
    const formattedNum = String(currentLineNum).padStart(2, '0');
    editorTool.prompt = `${formattedNum} | `;
    setMode('editor', editorTool.prompt);
}

function refreshEditorView() {
    editorElements.forEach(el => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    editorElements = [];

    editorLines.forEach((line, idx) => {
        const formattedNum = String(idx + 1).padStart(2, '0');
        const el = print(`${formattedNum} | ${line}`);
        editorElements.push(el);
    });
    updateLineNumberPrompt();
}

function loadContentIntoView(filename, content) {
    editorElements.forEach(el => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    
    editingFile = filename;
    editorLines = [];
    editorElements = [];

    if (content) {
        const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalized.split('\n');
        lines.forEach((line, idx) => {
            const formattedNum = String(idx + 1).padStart(2, '0');
            const el = print(`${formattedNum} | ${line}`);
            editorLines.push(line);
            editorElements.push(el);
        });
    }
    
    if (editingFile) {
        fileBuffers[editingFile] = [...editorLines];
    }
    updateLineNumberPrompt();
}

export const editorTool = {
    helpText: "universal plaintext file editor. commands: save | run | clean | copy | exit. load via: editor/filename",
    prompt: "01 | ",
    
    onEnter: async () => {
        print("system: entering universal text editing micro-kernel workspace environment...");
        print("----------------------------------------------------------------------");
        print("instructions: enter text line-by-line, paste code blocks directly,");
        print("              or target a file workspace by executing: editor/filename");
        print("commands:     save | run | clean | copy | exit (run from main prompt)");
        print("----------------------------------------------------------------------");
        updateLineNumberPrompt();
    },

    handleInput: async (input) => {
        const cleanInput = input.trim();
        const lowerInput = cleanInput.toLowerCase();

        if (pendingCreationFile) {
            if (lowerInput === 'yes' || lowerInput === 'y') {
                print(`system: changing focus context targeting -> ${pendingCreationFile}`);
                print(`system: target workspace log is blank. initialized empty context tracking.`);
                loadContentIntoView(pendingCreationFile, "");
                pendingCreationFile = "";
            } else if (lowerInput === 'no' || lowerInput === 'n') {
                print("system: file creation sequence terminated.");
                pendingCreationFile = "";
                editingFile = "";
                editorLines = [];
                editorElements = [];
                setMode("main", getSystemPrompt());
            } else {
                print(`The file does not exist in the specified repository or directory. Would you like to create ${pendingCreationFile} [Yes/no]?`);
            }
            return;
        }

        if (input.includes('\n') || input.includes('\r')) {
            const normalizedInput = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const lines = normalizedInput.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line === '' && i === lines.length - 1) continue; 
                
                const currentLineNum = editorLines.length + 1;
                const formattedNum = String(currentLineNum).padStart(2, '0');
                const el = print(`${formattedNum} | ${line}`);
                
                editorLines.push(line);
                editorElements.push(el);
            }
            if (editingFile) {
                fileBuffers[editingFile] = [...editorLines];
            }
            updateLineNumberPrompt();
            return;
        }

        if (lowerInput.startsWith('editor/') || lowerInput.startsWith('edit/')) {
            const prefixLen = lowerInput.startsWith('editor/') ? 7 : 5;
            const filename = cleanInput.substring(prefixLen).trim();
            if (!filename) {
                print("error: specify valid file path arguments. example: edit/filename");
                return;
            }

            if (filename === 'description') {
                print(`system: changing focus context targeting -> repository description`);
                let content = "";
                if (fileBuffers['description']) {
                    content = fileBuffers['description'].join('\n');
                }
                loadContentIntoView('description', content);
                return;
            }

            const parts = filename.split('.');
            const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
            const knownExtensions = [
                'txt', 'md', 'html', 'css', 'js', 'json', 'ts', 'jsx', 'tsx', 
                'py', 'rb', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'sh', 
                'dart', 'yml', 'yaml', 'h'
            ];
            
            if (!ext || !knownExtensions.includes(ext)) {
                print("error: this file extension is not supported by the environment system matrix.");
                print(`accepted matrix models: ${knownExtensions.join(', ')}`);
                editingFile = "";
                editorLines = [];
                editorElements = [];
                setMode("main", getSystemPrompt());
                return;
            }

            let content = null;
            if (fileBuffers[filename]) {
                content = fileBuffers[filename].join('\n');
            } else {
                const { registry } = await import('./main.js');
                if (registry['github'] && typeof registry['github'].pull === 'function') {
                    const fullPath = getFullFilePath(filename);
                    print(`system: pulling file logs from workspace repository: [${fullPath}]...`);
                    content = await registry['github'].pull(fullPath);
                }
            }

            if (content === null) {
                print(`The file does not exist in the specified repository or directory. Would you like to create ${filename} [Yes/no]?`);
                pendingCreationFile = filename;
                setMode('editor', '> '); 
                return;
            } else {
                print(`system: changing focus context targeting -> ${filename}`);
                loadContentIntoView(filename, content);
                return;
            }
        }

        const currentLineNum = editorLines.length + 1;
        const formattedNum = String(currentLineNum).padStart(2, '0');
        const el = print(`${formattedNum} | ${input}`);

        editorLines.push(input);
        editorElements.push(el);

        if (editingFile) {
            fileBuffers[editingFile] = [...editorLines];
        }
        updateLineNumberPrompt();
    },

    backspaceUp: () => {
        if (editorLines.length > 0) {
            const lastLine = editorLines.pop();
            const lastEl = editorElements.pop();
            if (lastEl && lastEl.parentNode) lastEl.parentNode.removeChild(lastEl);
            updateLineNumberPrompt();
            return lastLine;
        }
        return null;
    },

    onExit: (frameworkInput) => {
        let activeInputText = typeof frameworkInput === 'string' ? frameworkInput : null;
        if (activeInputText === null) {
            const activeEl = document.activeElement;
            let inputEl = null;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable'))) {
                inputEl = activeEl;
            } else {
                inputEl = document.querySelector('input') || document.querySelector('textarea') || document.querySelector('[contenteditable]');
            }
            if (inputEl) {
                activeInputText = inputEl.value !== undefined ? inputEl.value : inputEl.textContent;
            }
        }

        if (activeInputText === null || activeInputText === undefined) {
            activeInputText = "";
        }

        const currentPrompt = editorTool.prompt;
        if (activeInputText.startsWith(currentPrompt)) {
            activeInputText = activeInputText.substring(currentPrompt.length);
        }

        const cleanInput = activeInputText.trim().toLowerCase();
        const commands = ['save', 'run', 'clean', 'copy', 'exit'];

        if (commands.includes(cleanInput)) {
            print("system: universal text editor workspace memory suspended safely.");
            pendingCreationFile = "";
            return;
        }

        const currentLineNum = editorLines.length + 1;
        const formattedNum = String(currentLineNum).padStart(2, '0');
        const el = print(`${formattedNum} | ${activeInputText}`);
        if (el && el.parentNode) {
            if (editorElements.length > 0) {
                const lastEditorEl = editorElements[editorElements.length - 1];
                if (lastEditorEl && lastEditorEl.nextSibling && lastEditorEl.parentNode === el.parentNode) {
                    el.parentNode.insertBefore(el, lastEditorEl.nextSibling);
                }
            } else {
                const systemMsgEl = el.previousSibling;
                if (systemMsgEl) {
                    el.parentNode.insertBefore(el, systemMsgEl);
                }
            }
        }
        
        editorLines.push(activeInputText);
        editorElements.push(el);

        if (editingFile) {
            fileBuffers[editingFile] = [...editorLines];
        }

        print("system: universal text editor workspace memory suspended safely.");
        pendingCreationFile = "";
    },
    getLines: () => {
        return editorLines.join('\n');
    },
    clearBuffer: () => {
        editorLines = [];
        editorElements = [];
    }
};

registerTool('editor', editorTool);
registerTool('save', {
    onEnter: async () => {
        if (!editingFile) {
            print("error: cannot execute write sync sequence. No active file target context bound.");
            setMode("main", getSystemPrompt());
            return;
        }
        fileBuffers[editingFile] = [...editorLines];

        if (editingFile === 'description') {
            const activeRepo = localStorage.getItem('repository');
            if (!activeRepo) {
                print("error: no active repository detected.");
                setMode("main", getSystemPrompt());
                return;
            }
            const token = localStorage.getItem('user');
            const username = localStorage.getItem('github_username');
            try {
                print("system: streaming description updates to remote repository profile...");
                const res = await fetch(`https://api.github.com/repos/${username}/${activeRepo}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github+json'
                    },
                    body: JSON.stringify({ description: editorLines.join('\n') })
                });
                if (res.ok) {
                    print("system: repository description updated successfully in the cloud.");
                } else {
                    print("error: failed to update repository description.");
                }
            } catch (e) {
                print("error: network communication error updating description.");
            }
            setMode("main", getSystemPrompt());
            return;
        }

        const { registry } = await import('./main.js');
        if (registry['github'] && typeof registry['github'].sync === 'function') {
            const fullPath = getFullFilePath(editingFile);
            print(`system: streaming serialized code structural lines up to remote endpoint: [${fullPath}]...`);
            const success = await registry['github'].sync(fullPath, editorLines.join('\n'), "Initial commit");
            if (success) {
                print(`system: backup execution sequence complete. cloud synchronization fully validated.`);
            } else {
                print("error: target communication endpoint pipeline dropped compilation streams.");
            }
        } else {
            print("warning: active github authentication or cloud link profiles are offline.");
        }
        setMode("main", getSystemPrompt());
    },
    handleInput: async () => {}
});

registerTool('run', {
    onEnter: async () => {
        if (editorLines.length === 0) {
            print("warning: source layout buffer data tracks are empty. Write code metrics first.");
            setMode("main", getSystemPrompt());
            return;
        }
        print("system: packing components into localized isolated sandbox iframe layer...");
        const codeStructure = editorLines.join('\n');
        const escapedContent = btoa(unescape(encodeURIComponent(codeStructure)));
        const isHtml = editingFile && editingFile.toLowerCase().endsWith('.html');
        
        let sandboxWrapper = "";
        if (isHtml) {
            sandboxWrapper = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Application Sandbox Preview</title>
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
                    <title>Universal Preview - ${editingFile || 'Untitled Buffer'}</title>
                    <style>
                        html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #121212; color: #e0e0e0; font-family: 'Courier New', Courier, monospace; }
                        .header { background: #1a1a1a; padding: 10px 20px; border-bottom: 1px solid #333; font-size: 12px; color: #888; }
                        pre { margin: 0; padding: 20px; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.6; }
                    </style>
                </head>
                <body>
                    <div class="header">Target Workspace Node: ${editingFile || 'Untitled plain text snippet'} | Runtime View</div>
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
        setMode("main", getSystemPrompt());
    },
    handleInput: async () => {}
});

registerTool('clean', {
    onEnter: async () => {
        editorElements.forEach(el => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        editorLines = [];
        editorElements = [];
        if (editingFile) fileBuffers[editingFile] = [];
        print("system: active plaintext document editor buffer wiped clean.");
        setMode("main", getSystemPrompt());
    },
    handleInput: async () => {}
});

registerTool('copy', {
    onEnter: async () => {
        if (editorLines.length === 0) {
            print("warning: current working buffer tracks are completely empty.");
        } else {
            try {
                await navigator.clipboard.writeText(editorLines.join('\n'));
                print("system: current buffer data structure copied safely to systemic clipboard framework.");
            } catch (err) {
                print("error: structural browser clipboard read/write access permissions denied.");
            }
        }
        setMode("main", getSystemPrompt());
    },
    handleInput: async () => {}
});

registerTool('exit', {
    onEnter: async () => {
        editorElements.forEach(el => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        print("system: closing universal text buffer workspace instance.");
        editingFile = "";
        editorLines = [];
        editorElements = [];
        setMode("main", getSystemPrompt());
    },
    handleInput: async () => {}
});