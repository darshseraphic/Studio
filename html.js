import { registerTool, print, setMode, getSystemPrompt } from './main.js';

let editorLines = [];
let editorElements = []; // Tracks specific row elements generated in the terminal layout

function updateLineNumberPrompt() {
    const currentLineNum = editorLines.length + 1;
    const formattedNum = String(currentLineNum).padStart(2, '0');
    htmlTool.prompt = `${formattedNum} | `;
    setMode('html', htmlTool.prompt);
}

const htmlTool = {
    helpText: "open an interactive html ide vault. type 'run' to execute, 'undo' to remove last line, 'clean' to clear, 'copy' to copy code, 'exit' to quit.",
    prompt: "01 | ",
    
    onEnter: async () => {
        print("system: entering live html IDE environment...");
        print("--------------------------------------------------");
        print("instructions: paste or type your markup code.");
        print("commands: run | undo | clean | copy | exit");
        print("--------------------------------------------------");

        // Safe tracking restoration: prevents onEnter from wiping records across switches
        updateLineNumberPrompt();
    },

    // Handles the removal of newlines and feeds text back up to main.js editor
    backspaceUp: () => {
        if (editorLines.length === 0) return null;
        
        const removedLineText = editorLines.pop();
        const removedElement = editorElements.pop();
        
        // Remove the exact line row from screen safely
        if (removedElement && removedElement.parentNode) {
            removedElement.parentNode.removeChild(removedElement);
        }
        
        updateLineNumberPrompt();
        return removedLineText;
    },

    handleInput: async (input) => {
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
            updateLineNumberPrompt();
            return;
        }

        const cleanInput = input.trim().toLowerCase();

        // REMOVE WHOLE CODE FROM THE EDITOR BUFFER & SCREEN
        if (cleanInput === 'clean') {
            editorElements.forEach(el => {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
            editorLines = [];
            editorElements = [];
            print("system: code editor buffer completely cleaned.");
            updateLineNumberPrompt();
            return;
        }

        // COPY WHOLE CODE FROM LINE 1 TO CURRENT LINE TO CLIPBOARD
        if (cleanInput === 'copy') {
            if (editorLines.length === 0) {
                print("warning: source layout buffer is empty. nothing to copy!");
            } else {
                const fullHtmlContent = editorLines.join('\n');
                try {
                    await navigator.clipboard.writeText(fullHtmlContent);
                    print("system: entire code buffer successfully copied to clipboard!");
                } catch (err) {
                    print("error: browser clipboard access denied. could not copy code automatically.");
                }
            }
            updateLineNumberPrompt();
            return;
        }

        if (cleanInput === 'undo') {
            if (editorLines.length === 0) {
                print("system: buffer is already empty. nothing left to undo.");
            } else {
                const removed = editorLines.pop();
                const removedElement = editorElements.pop();
                if (removedElement && removedElement.parentNode) {
                    removedElement.parentNode.removeChild(removedElement);
                }
                print(`system: removed line ${String(editorLines.length + 1).padStart(2, '0')}: "${removed}"`);
            }
            updateLineNumberPrompt();
            return;
        }

if (cleanInput === 'run') {
            if (editorLines.length === 0) {
                print("warning: source layout buffer is empty. write some html code first!");
                updateLineNumberPrompt();
                return;
            }

            print("system: compiling source markup and launching application sandbox...");
            const fullHtmlContent = editorLines.join('\n');
            
            // 1. Base64 encode the code to safely deliver it to the data URI inside the iframe
            const escapedHtml = btoa(unescape(encodeURIComponent(fullHtmlContent)));
            
            // 2. Build a shell document that loads the user's code inside a restricted iframe wrapper
            // Notice: 'allow-scripts' is active so animations/logic work, but omitting 'allow-same-origin'
            // completely locks the window down from touching your local storage or active session keys.
            const sandboxWrapper = `
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
                    <iframe sandbox="allow-scripts" src="data:text/html;base64,${escapedHtml}"></iframe>
                </body>
                </html>
            `;
            
            // 3. Open the sandboxed shell context in a new window tab
            const blob = new Blob([sandboxWrapper], { type: 'text/html' });
            const blobURL = URL.createObjectURL(blob);
            window.open(blobURL, '_blank');
            
            updateLineNumberPrompt();
            return;
        }

        if (cleanInput === 'exit') {
            print("system: closing IDE buffer instance.");
            setMode("main", getSystemPrompt());
            return;
        }

        // Standard single line type entry
        const currentLineNum = editorLines.length + 1;
        const formattedNum = String(currentLineNum).padStart(2, '0');
        const el = print(`${formattedNum} | ${input}`);

        editorLines.push(input);
        editorElements.push(el);
        updateLineNumberPrompt();
    },

    onExit: () => {
        print("system: exited html editor workspace.");
    },
    getLines: () => {
        return editorLines.join('\n');
    },
    // API INTERFACE FOR END COMMAND HOOKS
    clearBuffer: () => {
        editorLines = [];
        editorElements = [];
    }
};

registerTool('html', htmlTool);