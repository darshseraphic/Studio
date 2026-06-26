import { registerTool, print } from './main.js';
let noteSessionLines = JSON.parse(localStorage.getItem('note')) || [];
const noteTool = {
    helpText: "start note-taking session",
    prompt: "",
    onEnter: () => {
        noteSessionLines = [];
        localStorage.removeItem('note');
        print("system: note mode activated. press CTRL + E to exit, type 'save' to download.");
        print("");
    },
    handleInput: (input) => {
        print(`${input}`);
        noteSessionLines.push(input);
        localStorage.setItem('note', JSON.stringify(noteSessionLines));
    },
    onExit: () => {
        print("system: exited note mode.");
    },
    getLines: () => {
        return noteSessionLines.join('\n');
    },
    loadPulled: (content) => {
        const lines = content.split(/\r\n|\r|\n/);
        noteSessionLines = lines;
        lines.forEach(line => print(line));
        localStorage.setItem('note', JSON.stringify(noteSessionLines));
    },
    clearBuffer: () => {
        noteSessionLines = [];
        localStorage.removeItem('note');
    }
};

registerTool('note', noteTool);