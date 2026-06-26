import { registerTool, print, setMode, getSystemPrompt } from './main.js';

const timeTool = {
    helpText: "display the exact current system date and time.",
    prompt: "",
    
    onEnter: async () => {
        const now = new Date();
        const options = { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: true 
        };
        const formattedTime = now.toLocaleString(undefined, options);
        
        print(`system time: ${formattedTime}`);
        setMode("main", getSystemPrompt());
    },

    handleInput: async (input) => {
        setMode("main", getSystemPrompt());
    }
};

registerTool('time', timeTool);