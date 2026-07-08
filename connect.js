import './main.js';

const tools = [
    'calculator.js',
    'weather.js',
    'github.js',
    'editor.js',
    'time.js',
    'bhagvad-geeta.js',
    'bible.js',
    'cat.js'
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