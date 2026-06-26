import './main.js';

const tools = [
    'note.js',
    'calculator.js',
    'weather.js',
    'github.js',
    'html.js',
    'time.js'
];

async function loadTools() {
    for (const tool of tools) {
        try {
            await import(`./${tool}`);
        } catch (error) {
            console.error(error);
        }
    }
}

loadTools();