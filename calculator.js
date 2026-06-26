import { registerTool, print } from './main.js';

let calcSessionLines = JSON.parse(localStorage.getItem('calculator')) || [];

const calculator = {
    helpText: "start terminal calculator mode",
    prompt: "calc>",
    onEnter: () => {
        calcSessionLines = [];
        localStorage.removeItem('calculator');
        print("system: calculator mode activated. enter math expressions. press CTRL + E to exit, type 'save' to download.");
    },
    handleInput: (input) => {
        print(`calc>${input}`);
        if (input.trim() === '') return;
        
        const result = evaluateExpression(input);
        print(result);
        calcSessionLines.push(`calc>${input}\n${result}`);
        localStorage.setItem('calculator', JSON.stringify(calcSessionLines));
    },
    onExit: () => {
        print("system: exited calculator mode.");
    },
    getLines: () => {
        return calcSessionLines.join('\n');
    },
    loadPulled: (content) => {
        const lines = content.split(/\r\n|\r|\n/);
        calcSessionLines = [];
        for (let i = 0; i < lines.length; i += 2) {
            const inputLine = lines[i];
            const resultLine = lines[i + 1] !== undefined ? lines[i + 1] : '';
            if (inputLine === undefined || inputLine === '') continue;
            print(inputLine);
            print(resultLine);
            calcSessionLines.push(`${inputLine}\n${resultLine}`);
        }
        localStorage.setItem('calculator', JSON.stringify(calcSessionLines));
    },
    clearBuffer: () => {
        calcSessionLines = [];
        localStorage.removeItem('calculator');
    }
};

function evaluateExpression(expression) {
    try {

        const clean = expression.replace(/\s+/g, '');
    
        if (!/^[0-9+\-*/.]+$/.test(clean)) {
            return "error: invalid characters";
        }

        const tokens = clean.match(/(\d+\.?\d*)|([\+\-\*\/])/g);
        if (!tokens) return "error: invalid expression";

        const intermediateValues = [];
        let currentOp = null;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if (['*', '/'].includes(token)) {
                currentOp = token;
            } else if (['+', '-'].includes(token)) {
                intermediateValues.push(token);
            } else {
                // It's a number
                const num = parseFloat(token);
                if (isNaN(num)) return "error: invalid number";

                if (currentOp === '*') {
                    const lastNum = intermediateValues.pop();
                    intermediateValues.push(lastNum * num);
                    currentOp = null;
                } else if (currentOp === '/') {
                    const lastNum = intermediateValues.pop();
                    if (num === 0) return "error: division by zero";
                    intermediateValues.push(lastNum / num);
                    currentOp = null;
                } else {
                    intermediateValues.push(num);
                }
            }
        }

        let total = intermediateValues[0];
        if (typeof total !== 'number') return "error: invalid starting value";

        for (let i = 1; i < intermediateValues.length; i += 2) {
            const op = intermediateValues[i];
            const nextNum = intermediateValues[i + 1];
            
            if (typeof nextNum !== 'number') return "error: malformed expression";

            if (op === '+') {
                total += nextNum;
            } else if (op === '-') {
                total -= nextNum;
            }
        }

        if (isNaN(total) || !isFinite(total)) {
            return "error: invalid evaluation";
        }

        const absTotal = Math.abs(total);
        if (absTotal >= 1e11 || (absTotal > 0 && absTotal < 1e-5)) {
            return total.toExponential(6); 
        }

        return total.toString();
    } catch {
        return "error: invalid expression";
    }
}

registerTool('calculator', calculator);