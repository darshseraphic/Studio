import { registerTool, print, getSystemPrompt, setMode } from './main.js';

function getGeetaPrompt() {
    const username = localStorage.getItem('github_username') || 'guest';
    return `${username}/bhagvad/geeta>`;
}

function printGeetaHelp() {
    print("bhagvad geeta command maps:");
    print("  [chapter]/[shlok]          - fetch a specific shlok, e.g. 1/1");
    print("  help                       - show this command list");
    print("  exit                       - leave bhagvad geeta and return to the default prompt");
}

const bhagvadGeeta = {
    helpText: "read the Bhagavad Geeta by chapter and shlok (use: bhagvad/geeta then type chapter/shlok, e.g. 1/1)",
    prompt: "bhagvad/geeta>",

    onEnter: async () => {
        setMode('bhagvad', getGeetaPrompt());
        print("system: bhagvad geeta reader activated.");
        print("type a chapter and shlok number as chapter/shlok, e.g. 1/1. type 'exit' or press CTRL + E to leave.");
    },

    handleInput: async (input) => {
        const cleanInput = input.trim();
        const lowerInput = cleanInput.toLowerCase();

        if (lowerInput === '' || lowerInput === 'geeta' || lowerInput === 'geeta/' || lowerInput === 'bhagvad' || lowerInput === 'bhagvad/geeta' || lowerInput === 'bhagvad/geeta/') {
            return;
        }

        print(`${getGeetaPrompt()}${cleanInput}`);

        if (lowerInput === 'exit') {
            setMode('main', getSystemPrompt());
            return;
        }

        if (lowerInput === 'help') {
            printGeetaHelp();
            return;
        }

        const parts = cleanInput.split('/').map(p => p.trim()).filter(p => p !== '');
        if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
            print("error: invalid format. please use chapter/shlok, e.g. 1/1");
            return;
        }

        const chapter = parts[0];
        const shlok = parts[1];

        print(`system: fetching chapter ${chapter}, shlok ${shlok}...`);

        const directUrl = `https://vedicscriptures.github.io/slok/${chapter}/${shlok}`;
        let data = null;

        try {
            const res = await fetch(directUrl);
            if (!res.ok) {
                print(`error: unable to retrieve chapter ${chapter}, shlok ${shlok}. status ${res.status}.`);
                return;
            }
            data = await res.json();
        } catch (err) {
            print(`error: failed to fetch shlok data. ${err.message || err}`);
            return;
        }

        if (!data || !data.slok) {
            print("error: malformed shlok data payload.");
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

        const chunkAndWrap = (text, maxChars = 70, indent = "      ") => {
            if (!text) return "";
            
            const sentences = text.trim().replace(/\s+/g, ' ').split(/(?<=\.)\s+/);
            let paragraphs = [];
            
            for (let i = 0; i < sentences.length; i += 2) {
                const pair = sentences.slice(i, i + 2).join(" ");
                if (pair.trim()) paragraphs.push(pair.trim());
            }

            return paragraphs
                .map(para => {
                    const words = para.split(/\s+/);
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
                .join('\n\n' + indent);
        };

        print("");
        print("================================================================================");
        print(`  CHAPTER ${data.chapter}, VERSE ${data.verse}`);
        print("================================================================================");
        print("");

        print("  [ ORIGINAL SANSKRIT VERSE ]");
        print("  --------------------------------------------------");
        print(`  ${cleanWrap(data.slok, 74, "  ")}`);
        print("");

        if (data.transliteration) {
            print("  [ TRANSLITERATION ]");
            print("  --------------------------------------------------");
            print(`  ${cleanWrap(data.transliteration, 74, "  ")}`);
            print("");
        }

        print("  [ TRANSLATIONS & COMMENTARIES ]");
        print("  --------------------------------------------------");
        print("");

        const contentTypes = [
            { key: 'ht', label: 'Hindi Translation' },
            { key: 'et', label: 'English Translation' },
            { key: 'hc', label: 'Hindi Commentary' },
            { key: 'ec', label: 'English Commentary' },
            { key: 'sc', label: 'Sanskrit Commentary' }
        ];

        const allowedAuthors = [
            "Swami Adidevananda",
            "Shri Purohit Swami",
            "A.C. Bhaktivedanta Swami Prabhupada"
        ];

        for (const key in data) {
            if (data[key] && typeof data[key] === 'object' && data[key].author) {
                const item = data[key];

                if (!allowedAuthors.includes(item.author.trim())) {
                    continue;
                }

                let authorHeaderPrinted = false;

                contentTypes.forEach(type => {
                    if (item[type.key]) {
                        if (!authorHeaderPrinted) {
                            print(`  • ${item.author.toUpperCase()}`);
                            authorHeaderPrinted = true;
                        }
                        print(`    [${type.label}]`);
                        print(`      ${chunkAndWrap(item[type.key], 70, "      ")}`);
                        print("");
                    }
                });
            }
        }

        print("================================================================================");
    },

    onExit: () => {
        print("system: exited bhagvad geeta reader.");
    }
};

registerTool('bhagvad', bhagvadGeeta);