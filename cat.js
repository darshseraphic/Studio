import { registerTool, print } from './main.js';

const cat = {
    helpText: "fetch random cat facts or list breeds (use: cat/random or cat/breeds/[page])",
    prompt: "cat>",
    onEnter: async () => {
        print("system: cat mode activated. type 'random', 'breeds', or 'breeds/[page_number]'. press CTRL + E to exit.");
    },
    handleInput: async (input) => {
        print(`cat>${input}`);
        
        let cleanInput = input.trim();
        if (cleanInput === '') return;

        let command = cleanInput.toLowerCase();
        if (command.startsWith('cat/')) {
            command = command.substring(4);
        }

        if (command === 'random') {
            print("system: fetching a random cat fact...");
            try {
                const response = await fetch('https://catfact.ninja/fact');
                if (!response.ok) throw new Error();
                const data = await response.json();
                
                if (data && data.fact) {
                    print(data.fact);
                } else {
                    print("error: malformed cat fact response structure.");
                }
            } catch (err) {
                print("error: failed to fetch cat fact.");
            }
        } 
        else if (command === 'breeds' || command.startsWith('breeds/')) {
            let page = 1;
            if (command.startsWith('breeds/')) {
                const parts = command.split('/');
                page = parseInt(parts[1]) || 1;
            }

            print(`system: fetching cat breeds database payload (page ${page})...`);
            try {
                const response = await fetch(`https://catfact.ninja/breeds?page=${page}`);
                if (!response.ok) throw new Error();
                const data = await response.json();

                if (data && Array.isArray(data.data)) {
                    if (data.data.length === 0) {
                        print(`system: no breed entries found on page ${page}.`);
                        return;
                    }
                    
                    data.data.forEach(item => {
                        print(`breed: ${item.breed}`);
                        print(`country: ${item.country || 'Unknown'}`);
                        print('');
                    });
                } else {
                    print("error: malformed cat breeds payload mapping data.");
                }
            } catch (err) {
                print("error: failed to fetch cat breeds structural array.");
            }
        } 
        else {
            print("error: unrecognized command configuration. use 'random', 'breeds', or 'breeds/[page]'");
        }
    },
    onExit: () => {
        print("system: exited cat mode session context.");
    }
};

registerTool('cat', cat);