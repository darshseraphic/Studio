import { registerTool, print, setMode, getSystemPrompt, fileBuffers, getFullFilePath } from './main.js';

let editingFile = "";
let editorLines = [];
let editorElements = [];

// Stateful tracking handle for intercepting terminal inputs during file creation prompts
let pendingCreationFile = ""; 

function updateLineNumberPrompt() {
    const currentLineNum = editorLines.length + 1;
    const formattedNum = String(currentLineNum).padStart(2, '0');
    editorTool.prompt = `${formattedNum} | `;
    setMode('editor', editorTool.prompt);
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
        print("commands:     save | run | clean | copy | exit");
        print("----------------------------------------------------------------------");
        updateLineNumberPrompt();
    },

    handleInput: async (input) => {
        const cleanInput = input.trim();
        const lowerInput = cleanInput.toLowerCase();

        // 1. INTERCEPT SEQUENCE: Handle file missing [Yes/no] confirmation loop
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
                print(`The file is not exist in the specific repository or directory. Would you like to create ${pendingCreationFile}, [Yes/no]?`);
            }
            return;
        }

        // --- Intercept Section: Handle Multi-line Pasting Strings ---
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

        // 2. INTERCEPT SEQUENCE: File parsing initialization & matrix guardrails
        if (lowerInput.startsWith('editor/') || lowerInput.startsWith('edit/')) {
            const prefixLen = lowerInput.startsWith('editor/') ? 7 : 5;
            const filename = cleanInput.substring(prefixLen).trim();
            if (!filename) {
                print("error: specify valid file path arguments. example: edit/filename");
                return;
            }

            // A. Guardrail Check: Universal File Extension Matrix Assessment
            const parts = filename.split('.');
            const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
            const knownExtensions = ['txt', 'md', 'js', 'html', 'css', 'json', 'py', 'sh', 'ts', 'jsx', 'tsx', 'yml', 'yaml', 'c', 'cpp', 'h'];
            
            if (!ext || !knownExtensions.includes(ext)) {
                print("This extension isn't in the matrix, try different one");
                editingFile = "";
                editorLines = [];
                editorElements = [];
                setMode("main", getSystemPrompt());
                return;
            }

            // B. Structural Check: Verify file layout data logs exist
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
                // Interactive trigger prompt for missing file assets
                print(`The file is not exist in the specific repository or directory. Would you like to create ${filename}, [Yes/no]?`);
                pendingCreationFile = filename;
                setMode('editor', '> '); 
                return;
            } else {
                print(`system: changing focus context targeting -> ${filename}`);
                loadContentIntoView(filename, content);
                return;
            }
        }

        // 3. CORE PROCESSING ENGINE: Base Workspace Commands Context Actions
        if (lowerInput === 'exit') {
            print("system: closing universal text buffer workspace instance.");
            setMode("main", getSystemPrompt());
            return;
        }

        if (lowerInput === 'clean') {
            editorElements.forEach(el => {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            });
            editorLines = [];
            editorElements = [];
            if (editingFile) fileBuffers[editingFile] = [];
            print("system: active plaintext document editor buffer wiped clean.");
            updateLineNumberPrompt();
            return;
        }

        if (lowerInput === 'copy') {
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
            updateLineNumberPrompt();
            return;
        }

        if (lowerInput === 'save') {
            if (!editingFile) {
                print("error: cannot execute write sync sequence. No active file target context bound.");
                updateLineNumberPrompt();
                return;
            }
            fileBuffers[editingFile] = [...editorLines];
            const { registry } = await import('./main.js');
            if (registry['github'] && typeof registry['github'].sync === 'function') {
                const fullPath = getFullFilePath(editingFile);
                print(`system: streaming serialized code structural lines up to remote endpoint: [${fullPath}]...`);
                const success = await registry['github'].sync(fullPath, editorLines.join('\n'));
                if (success) {
                    print(`system: backup execution sequence complete. cloud synchronization fully validated.`);
                } else {
                    print("error: target communication endpoint pipeline dropped compilation streams.");
                }
            } else {
                print("warning: active github authentication or cloud link profiles are offline.");
            }
            updateLineNumberPrompt();
            return;
        }

        if (lowerInput === 'run') {
            if (editorLines.length === 0) {
                print("warning: source layout buffer data tracks are empty. Write code metrics first.");
                updateLineNumberPrompt();
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
            updateLineNumberPrompt();
            return;
        }

        // --- Default Section: Core Line Input Entry Serialization ---
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

    onExit: () => {
        print("system: universal text editor workspace memory suspended safely.");
        editingFile = "";
        editorLines = [];
        editorElements = [];
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