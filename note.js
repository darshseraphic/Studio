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
    }
};

registerTool('note', noteTool);

onExit: () => {
    noteSessionLines = [];
    print("system: exited note mode.");
}

// Add this property directly inside your noteTool object
clearBuffer: () => {
    noteSessionLines = [];
    localStorage.removeItem('note');
}