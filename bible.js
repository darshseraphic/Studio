import { registerTool, print, getSystemPrompt, setMode } from './main.js';

function getBiblePrompt() {
    const username = localStorage.getItem('github_username') || 'guest';
    return `${username}/bible>`;
}

function printBibleHelp() {
    print("bible command maps:");
    print("  [book]/[chapter]:[verse]   - fetch a specific verse, e.g. john/3:16");
    print("  help                       - show this command list");
    print("  exit                       - leave bible reader and return to the default prompt");
}

const bibleTool = {
    helpText: "read the Bible by book, chapter, and verse (use: bible then type book/chapter:verse, e.g. john/3:16)",
    prompt: "bible>",

    onEnter: async () => {
        setMode('bible', getBiblePrompt());
        print("system: bible reader activated.");
        print("type a book, chapter, and verse number as book/chapter:verse, e.g. john/3:16. type 'exit' or press CTRL + E to leave.");
    },

    handleInput: async (input) => {
        const cleanInput = input.trim();
        const lowerInput = cleanInput.toLowerCase();

        if (lowerInput === '' || lowerInput === 'bible' || lowerInput === 'bible/' || lowerInput === 'scripture') {
            return;
        }

        print(`${getBiblePrompt()}${cleanInput}`);

        if (lowerInput === 'exit') {
            setMode('main', getSystemPrompt());
            return;
        }

        if (lowerInput === 'help') {
            printBibleHelp();
            return;
        }

        const parts = cleanInput.split('/');
        if (parts.length !== 2) {
            print("error: invalid format. please use book/chapter:verse, e.g. john/3:16");
            return;
        }

        const book = parts[0].trim();
        const chapVerseStr = parts[1].trim();

        const subParts = chapVerseStr.split(':');
        if (subParts.length !== 2 || !/^\d+$/.test(subParts[0].trim()) || !/^\d+$/.test(subParts[1].trim())) {
            print("error: invalid format. please use book/chapter:verse, e.g. john/3:16");
            return;
        }

        const chapter = subParts[0].trim();
        const verse = subParts[1].trim();

        print(`system: fetching ${book} chapter ${chapter}, verse ${verse}...`);
        const encodedBook = encodeURIComponent(book);
        const directUrl = `https://bible-api.com/${encodedBook}+${chapter}:${verse}`;
        let data = null;

        try {
            const res = await fetch(directUrl);
            if (!res.ok) {
                print(`error: unable to retrieve ${book} ${chapter}:${verse}. status ${res.status}.`);
                return;
            }
            data = await res.json();
        } catch (err) {
            print(`error: failed to fetch bible data. ${err.message || err}`);
            return;
        }

        if (!data || !data.text || !data.reference) {
            print("error: malformed bible data payload.");
            return;
        }

        const cleanWrap = (text, maxChars = 70, indent = "      ") => {
            if (!text) return "";
            return text
                .split('\n')
                .map(paragraph => {
                    const trimmed = paragraph.trim();
                    if (!trimmed) return "";

                    const words = trimmed.split(/\s+/);
                    let lines = [];
                    let currentLine = "";

                    words.forEach(word => {
                        if (currentLine.length + word.length + 1 > maxChars) {
                            lines.push(currentLine.trim());
                            currentLine = word + " ";
                        } else {
                            currentLine += word + " ";
                        }
                    });
                    if (currentLine) lines.push(currentLine.trim());
                    return lines.join('\n' + indent);
                })
                .join('\n' + indent);
        };

        print("");
        print("================================================================================");
        print(`  REFERENCE: ${data.reference.toUpperCase()}`);
        print("================================================================================");
        print("");

        print(`  ${cleanWrap(data.text, 74, "  ")}`);
        print("");

        print("================================================================================");
    },

    onExit: () => {
        print("system: exited bible reader.");
    }
};

registerTool('bible', bibleTool);