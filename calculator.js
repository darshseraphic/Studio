import { registerTool, print } from './main.js';

let calcSessionLines = JSON.parse(localStorage.getItem('calculator')) || [];
// Persistent multi-layered Casio system variables configuration (Handles Complex {re, im} Objects natively)
let rawVars = JSON.parse(localStorage.getItem('calc_variables')) || { A: 0, B: 0, C: 0, D: 0, X: 0, Y: 0, M: 0, ANS: 0 };
let variables = {};

// Defensive normalization layer protecting variable allocations from previous single-scalar tracking architectures
for (let key in rawVars) {
    if (rawVars[key] && typeof rawVars[key] === 'object' && 're' in rawVars[key]) {
        variables[key] = rawVars[key];
    } else {
        variables[key] = { re: Number(rawVars[key]) || 0, im: 0 };
    }
}

// Dedicated internal routine to print an isolated, individual help layout matrix
// Comprehensive multi-layered documentation layout matrix for the Casio fx-570ES Plus Emulation Build
function showHelp() {
    print("=================================================================================================");
    print("               CASIO fx-570ES PLUS : MASTER SYSTEM OPERATIONAL DOCUMENTATION GRID                ");
    print("=================================================================================================");
    print("  Welcome to the advanced terminal emulator environment. This platform mirrors the core execution");
    print("  engines of the physical engineering calculator. Below is the detailed structural blueprint.");
    print("");
    print("  ---------------------------------------------------------------------------------------------");
    print("  [1] COMPREHENSIVE COMPLEX ARITHMETIC ENGINE (CMPLX MODE)");
    print("  ---------------------------------------------------------------------------------------------");
    print("  * NATIVE COMPLEX SUPPORT: The token parser natively tracks imaginary units via 'i' (where i^2 = -1).");
    print("  * OPERATIONAL BEHAVIOR  : Real and imaginary parts are bound dynamically during mathematical steps.");
    print("  * EXAMPLES & SYNTAX    :");
    print("    - Rectangular Form Multiplication : (2 + 3i) * (1 - 2i)   --> Outputs: 8 - i");
    print("    - Negative Domain Roots           : sqrt(-4)             --> Outputs: 2i");
    print("    - Complex Exponentiation          : i^i                  --> Outputs: 0.2078795764");
    print("    - Polar Coordinate Transformation : pol(3, 4)            --> Prints: 5∠0.927295 rad");
    print("                                                                 Outputs Magnitude: 5");
    print("");
    print("  ---------------------------------------------------------------------------------------------");
    print("  [2] MULTI-BASE DIGITAL LOGIC ARCHITECTURE (BASE-N MODE)");
    print("  ---------------------------------------------------------------------------------------------");
    print("  * RADIX PREFIX CONVENTIONS: Hexadecimal entries require '0x' and Binary entries require '0b'.");
    print("  * EVALUATION CHANNEL      : Computes standard inner expressions before parsing radix mappings.");
    print("  * EXAMPLES & SYNTAX    :");
    print("    - Base-2 Binary Conversion        : base:bin(10 + 5)     --> Outputs: 0b1111");
    print("    - Base-16 Hexadecimal Conversion  : base:hex(255)        --> Outputs: 0xFF");
    print("    - Bitwise Logical AND Sequencer   : base:and(0b1010, 0b1100) --> Outputs Base-10 Integer: 8");
    print("    - Bitwise Logical XOR Sequencer   : base:xor(0x0F, 0xF0) --> Outputs Base-10 Integer: 255");
    print("    - Bitwise NOT Bit-Inversion Flip  : base:not(0)          --> Outputs: -1");
    print("");
    print("  ---------------------------------------------------------------------------------------------");
    print("  [3] SYSTEMATIC INTERPOLATION ROOT SOLVERS (EQN MODE)");
    print("  ---------------------------------------------------------------------------------------------");
    print("  * QUADRATIC SOLVER PIPELINE: Solves ax^2 + bx + c = 0. Natively handles imaginary discriminant arrays.");
    print("    - Syntax: solve:quadratic(a, b, c)  | Example: solve:quadratic(1, -5, 6) -> X1 = 3, X2 = 2");
    print("  * MATRIX CRAMER LINEAR SOLVER: Solves intersecting spatial systems of simultaneous vectors.");
    print("    - 2x2 Equations ([ [a1,b1,c1], [a2,b2,c2] ]) -> Maps: aX + bY = c");
    print("      Example: solve:linear([[1,1,6],[1,-1,2]])              --> Outputs: X = 4, Y = 2");
    print("    - 3x3 Equations ([ [a1,b1,c1,d1], [a2,b2,c2,d2], [a3,b3,c3,d3] ]) -> Maps: aX + bY + cZ = d");
    print("      Example: solve:linear([[1,1,1,6],[0,2,5,-4],[2,5,-1,27]]) --> Outputs: X=5, Y=3, Z=-2");
    print("");
    print("  ---------------------------------------------------------------------------------------------");
    print("  [4] DYNAMIC FUNCTION VALUE TRACING GRID (TABLE MODE)");
    print("  ---------------------------------------------------------------------------------------------");
    print("  * OPERATION MATRIX: Tracks formula changes by generating an array layout over stepped boundaries.");
    print("  * PARAMETER SYNTAX: table(algebraic_expression, start_X, end_X, incremental_step)");
    print("  * EXAMPLE & OUTPUT PROFILE:");
    print("    - Input Expression: table(X^2 + 1, 1, 3, 0.5)");
    print("    - Rendered Table Matrix Output:");
    print("         |       X       |      f(X)     |");
    print("         |--------------------------------|");
    print("         | 1.0000        | 2              |");
    print("         | 1.5000        | 3.25           |");
    print("         | 2.0000        | 5              |");
    print("         | 2.5000        | 7.25           |");
    print("         | 3.0000        | 10             |");
    print("");
    print("  ---------------------------------------------------------------------------------------------");
    print("  [5] LEAST-SQUARES DESCRIPTIVE REGRESSION ANALYSIS (STAT MODE)");
    print("  ---------------------------------------------------------------------------------------------");
    print("  * DESCRIPTIVE DATA SUMMARY : Evaluates datasets for fundamental data scattering distributions.");
    print("    - Syntax: stat:summary([x1, x2, x3...])");
    print("    - Example: stat:summary([10, 12, 23, 24, 32]) --> Outputs: Count, Mean, StdDev, Min, Max");
    print("  * LINEAR REGRESSION MODELING: Fits coordinate pairs to a straight least-squares trendline.");
    print("    - Syntax: stat:reg([[x1, y1], [x2, y2]...])");
    print("    - Example: stat:reg([[1, 2], [2, 4], [3, 5]])  --> Outputs Formula: Y = 1.5 * X + 0.66666");
    print("");
    print("  ---------------------------------------------------------------------------------------------");
    print("  [6] NUMERICAL HIGHER CALCULUS CALCULATOR CIRCUITS");
    print("  ---------------------------------------------------------------------------------------------");
    print("  * DERIVATIVE APPROXIMATION : Computes central difference profiles where h = 1e-5.");
    print("    - Syntax: diff(expression, target_value) | Example: diff(X^3, 2) --> Outputs: 12.000001");
    print("  * DEFINITE INTEGRATION     : Simulates continuous bounding areas via a 1000-interval Simpson's Rule.");
    print("    - Syntax: int(expression, start, end)    | Example: int(X^2, 0, 3) --> Outputs: 9");
    print("");
    print("  ---------------------------------------------------------------------------------------------");
    print("  [7] MULTI-DIMENSIONAL ARRAY CHANNELS (MAT & VEC MODES)");
    print("  ---------------------------------------------------------------------------------------------");
    print("  * MATRIX DETERMINANTS & INVERSIONS: Supports dimensional array execution matrix grids up to 3x3.");
    print("    - Determinant Example: mat:det([[1, 2], [3, 4]])                   --> Outputs: -2");
    print("    - Inversion Example  : mat:inv([[1, 2], [3, 4]])                   --> Outputs: [-2, 1]\\n[1.5, -0.5]");
    print("    - Matrix Multiply    : mat:mul([[1, 2]], [[3], [4]])               --> Outputs: [11]");
    print("  * SPATIAL VECTOR MATHEMATICS     : Processes geometric positions inside Cartesian 3D frameworks.");
    print("    - Dot Product Vector Sequence: vec:dot([1, 2, 3], [4, 5, 6])       --> Outputs Scalar: 32");
    print("    - Cross Product Coordinate   : vec:cross([1, 0, 0], [0, 1, 0])     --> Outputs Vector: [0, 0, 1]");
    print("");
    print("  ---------------------------------------------------------------------------------------------");
    print("  [8] CORE UTILITY REGISTERS & CONTROL SIGNALS");
    print("  ---------------------------------------------------------------------------------------------");
    print("  * VARIABLE STORAGE ASSIGNMENTS: Save values into A, B, C, D, X, Y, or M using the '=' operator.");
    print("    - Example: X = 5 * pi  |  A = sin(X) + 2i");
    print("  * LAST ANSWER REGISTER        : The final computed expression result is cached in 'ANS' automatically.");
    print("  * SESSION TERMINATION         : Press 'CTRL + E' at any time to exit the 'calc>' runtime safely.");
    print("=================================================================================================");
}

const calculator = {
    helpText: "start engineering scientific calculator environment",
    prompt: "calc>",
    onEnter: () => {
        calcSessionLines = [];
        localStorage.removeItem('calculator');
        print("--------------------------------------------------------------------------------");
        print("  CASIO fx-570ES PLUS : COMPREHENSIVE TERMINAL EMULATION PIPELINE ONLINE       ");
        print("  Type 'help' to print the interactive multi-layered function operation layout matrix. ");
        print("  Press CTRL + E at any point to terminate session safely.                      ");
        print("--------------------------------------------------------------------------------");
    },
    handleInput: (input) => {
        const cleanInput = input.trim();
        if (cleanInput === '') return;
        
        if (cleanInput.toLowerCase() === 'help') {
            print(`calc>${input}`);
            showHelp();
            return;
        }

        print(`calc>${input}`);

        // Variable Assignment Interceptor Stream
        const assignMatch = cleanInput.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (assignMatch) {
            const varName = assignMatch[1].toUpperCase();
            const expr = assignMatch[2];
            if (!variables.hasOwnProperty(varName)) {
                const errMsg = `error: '${varName}' is not an active system register channel (A, B, C, D, X, Y, M).`;
                print(errMsg);
                calcSessionLines.push(`calc>${input}\n${errMsg}`);
                return;
            }
            try {
                const tokens = tokenize(expr);
                const val = parseAndEvaluate(tokens);
                variables[varName] = val;
                localStorage.setItem('calc_variables', JSON.stringify(variables));
                const resText = `${varName} = ${formatComplexResult(val)}`;
                print(resText);
                calcSessionLines.push(`calc>${input}\n${resText}`);
            } catch (e) {
                print(`error: ${e.message}`);
            }
            return;
        }

        // Multi-Base Digital Logic Interceptor System Routing (BASE-N)
        if (cleanInput.toLowerCase().startsWith('base:')) {
            try {
                const innerExpression = cleanInput.substring(cleanInput.indexOf('(') + 1, cleanInput.lastIndexOf(')'));
                const baseCommand = cleanInput.split(':')[1].split('(')[0].trim().toLowerCase();
                
                if (['bin', 'hex', 'oct', 'dec'].includes(baseCommand)) {
                    const evaluatedValue = parseAndEvaluate(tokenize(innerExpression));
                    const scalarInt = Math.floor(evaluatedValue.re);
                    
                    if (baseCommand === 'bin') print(`0b${(scalarInt >>> 0).toString(2)}`);
                    if (baseCommand === 'hex') print(`0x${(scalarInt >>> 0).toString(16).toUpperCase()}`);
                    if (baseCommand === 'oct') print(`0o${(scalarInt >>> 0).toString(8)}`);
                    if (baseCommand === 'dec') print(scalarInt.toString(10));
                } else if (['and', 'or', 'xor'].includes(baseCommand)) {
                    const splitComma = findArgSeparatorComma(innerExpression);
                    const valA = Math.floor(parseAndEvaluate(tokenize(innerExpression.substring(0, splitComma))).re);
                    const valB = Math.floor(parseAndEvaluate(tokenize(innerExpression.substring(splitComma + 1))).re);
                    
                    if (baseCommand === 'and') print((valA & valB).toString(10));
                    if (baseCommand === 'or')  print((valA | valB).toString(10));
                    if (baseCommand === 'xor') print((valA ^ valB).toString(10));
                } else if (baseCommand === 'not') {
                    const scalarVal = Math.floor(parseAndEvaluate(tokenize(innerExpression)).re);
                    print((~scalarVal).toString(10));
                } else {
                    print(`error: base-n command operations pipeline tracking mismatch on '${baseCommand}'`);
                }
            } catch (e) {
                print(`base-n processing fault: ${e.message}`);
            }
            return;
        }

        // Automated Equations Root Solvers Suite Interceptor System Routing (EQN)
        if (cleanInput.toLowerCase().startsWith('solve:')) {
            try {
                const innerArgs = cleanInput.substring(cleanInput.indexOf('(') + 1, cleanInput.lastIndexOf(')'));
                const eqnCommand = cleanInput.split(':')[1].split('(')[0].trim().toLowerCase();

                if (eqnCommand === 'quadratic') {
                    const params = innerArgs.split(',').map(p => parseAndEvaluate(tokenize(p.trim())).re);
                    if (params.length !== 3) throw new Error("quadratic systems require exactly three scalar coefficient variables (a, b, c).");
                    const [a, b, c] = params;
                    if (a === 0) throw new Error("coefficient 'a' cannot evaluate to 0 in quadratic bounds matrices.");
                    
                    const disc = b*b - 4*a*c;
                    if (disc >= 0) {
                        const r1 = (-b + Math.sqrt(disc)) / (2*a);
                        const r2 = (-b - Math.sqrt(disc)) / (2*a);
                        print(`X1 = ${formatSingleNumber(r1)}\nX2 = ${formatSingleNumber(r2)}`);
                    } else {
                        const realPart = -b / (2*a);
                        const imagPart = Math.sqrt(-disc) / (2*a);
                        print(`X1 = ${formatSingleNumber(realPart)} + ${formatSingleNumber(imagPart)}i\nX2 = ${formatSingleNumber(realPart)} - ${formatSingleNumber(imagPart)}i`);
                    }
                } else if (eqnCommand === 'linear') {
                    const matrixGrid = JSON.parse(innerArgs);
                    if (matrixGrid.length === 2 && matrixGrid[0].length === 3) {
                        // 2x2 Linear System Cramer's Solver implementation
                        const [a1, b1, c1] = matrixGrid[0];
                        const [a2, b2, c2] = matrixGrid[1];
                        const det = a1*b2 - b1*a2;
                        if (det === 0) throw new Error("coefficient structure returns a determinant of zero; matrix maps infinite or null vectors.");
                        const x = (c1*b2 - b1*c2) / det;
                        const y = (a1*c2 - c1*a2) / det;
                        print(`X = ${formatSingleNumber(x)}, Y = ${formatSingleNumber(y)}`);
                    } else if (matrixGrid.length === 3 && matrixGrid[0].length === 4) {
                        // 3x3 Linear System Cramer's Solver implementation
                        const detMain = matDet3x3([
                            [matrixGrid[0][0], matrixGrid[0][1], matrixGrid[0][2]],
                            [matrixGrid[1][0], matrixGrid[1][1], matrixGrid[1][2]],
                            [matrixGrid[2][0], matrixGrid[2][1], matrixGrid[2][2]]
                        ]);
                        if (detMain === 0) throw new Error("3x3 system matrix mapping has singular determinant configuration profiles.");
                        
                        const detX = matDet3x3([
                            [matrixGrid[0][3], matrixGrid[0][1], matrixGrid[0][2]],
                            [matrixGrid[1][3], matrixGrid[1][1], matrixGrid[1][2]],
                            [matrixGrid[2][3], matrixGrid[2][1], matrixGrid[2][2]]
                        ]);
                        const detY = matDet3x3([
                            [matrixGrid[0][0], matrixGrid[0][3], matrixGrid[0][2]],
                            [matrixGrid[1][0], matrixGrid[1][3], matrixGrid[1][2]],
                            [matrixGrid[2][0], matrixGrid[2][3], matrixGrid[2][2]]
                        ]);
                        const detZ = matDet3x3([
                            [matrixGrid[0][0], matrixGrid[0][1], matrixGrid[0][3]],
                            [matrixGrid[1][0], matrixGrid[1][1], matrixGrid[1][3]],
                            [matrixGrid[2][0], matrixGrid[2][1], matrixGrid[2][3]]
                        ]);
                        print(`X = ${formatSingleNumber(detX/detMain)}\nY = ${formatSingleNumber(detY/detMain)}\nZ = ${formatSingleNumber(detZ/detMain)}`);
                    } else {
                        throw new Error("unsupported equation structures layout bounds; provide a 2x3 or 3x4 array matrix grid mapping.");
                    }
                }
            } catch (e) {
                print(`equation solver execution fault: ${e.message}`);
            }
            return;
        }

        // Casio Value Table Tracing System Interceptor Routing (TABLE)
        if (cleanInput.toLowerCase().startsWith('table(')) {
            const match = cleanInput.match(/^table\((.+),\s*(.+),\s*(.+),\s*(.+)\)$/i);
            if (!match) {
                print("error: malformed functional sequence parameters; use: table(expr, start, end, step)");
                return;
            }
            try {
                const exprStr = match[1];
                const startRange = parseAndEvaluate(tokenize(match[2])).re;
                const endRange = parseAndEvaluate(tokenize(match[3])).re;
                const stepVal = parseAndEvaluate(tokenize(match[4])).re;
                
                if (stepVal <= 0) throw new Error("step incremental scalar interval rules must evaluate greater than zero bounds thresholds.");
                
                print("|       X       |      f(X)     |");
                print("|--------------------------------|");
                for (let x = startRange; x <= endRange + (stepVal / 100); x += stepVal) {
                    const outY = parseAndEvaluate(tokenize(exprStr), { re: x, im: 0 });
                    print(`| ${x.toFixed(4).padEnd(13)} | ${formatComplexResult(outY).padEnd(14)} |`);
                }
            } catch (e) {
                print(`table tracing matrix calculation fault: ${e.message}`);
            }
            return;
        }

        // Statistical Evaluation and Linear Data Regressions Interceptor (STAT)
        if (cleanInput.toLowerCase().startsWith('stat:')) {
            try {
                const innerArgs = cleanInput.substring(cleanInput.indexOf('(') + 1, cleanInput.lastIndexOf(')'));
                const statCommand = cleanInput.split(':')[1].split('(')[0].trim().toLowerCase();
                const itemsParsed = JSON.parse(innerArgs);

                if (statCommand === 'summary') {
                    if (!Array.isArray(itemsParsed) || itemsParsed.length === 0) throw new Error("stat arrays must hold at least one valid scalar entity index matrix.");
                    const n = itemsParsed.length;
                    const sum = itemsParsed.reduce((a, b) => a + b, 0);
                    const mean = sum / n;
                    const variance = itemsParsed.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n > 1 ? n - 1 : 1);
                    const stdDev = Math.sqrt(variance);
                    print(`Count  : ${n}\nMean   : ${formatSingleNumber(mean)}\nStdDev : ${formatSingleNumber(stdDev)}\nMin    : ${formatSingleNumber(Math.min(...itemsParsed))}\nMax    : ${formatSingleNumber(Math.max(...itemsParsed))}`);
                } else if (statCommand === 'reg') {
                    if (!Array.isArray(itemsParsed) || itemsParsed.length < 2) throw new Error("least-squares calculations require matching sets mapping coordinates matrix pairs.");
                    const n = itemsParsed.length;
                    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                    for (let pt of itemsParsed) {
                        const [x, y] = pt;
                        sumX += x; sumY += y;
                        sumXY += (x * y); sumX2 += (x * x);
                    }
                    const slopeM = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
                    const interceptB = (sumY - slopeM * sumX) / n;
                    print(`Regression Formula Model Line Fit:\nY = ${formatSingleNumber(slopeM)} * X + ${formatSingleNumber(interceptB)}`);
                }
            } catch (e) {
                print(`statistical tracking matrix parsing exception: ${e.message}`);
            }
            return;
        }

        // Specialized Numerical Calculus Matrix Routing
        if (cleanInput.toLowerCase().startsWith('diff(')) {
            const match = cleanInput.match(/^diff\((.+),\s*(.+)\)$/i);
            if (!match) {
                print("error: malformed differentiation parameters. Syntax template: diff(expr, target_value)");
                return;
            }
            try {
                const exprStr = match[1];
                const xVal = parseAndEvaluate(tokenize(match[2])).re;
                const h = 1e-5;
                const y2 = parseAndEvaluate(tokenize(exprStr), { re: xVal + h, im: 0 }).re;
                const y1 = parseAndEvaluate(tokenize(exprStr), { re: xVal - h, im: 0 }).re;
                const derivative = (y2 - y1) / (2 * h);
                variables['ANS'] = { re: derivative, im: 0 };
                const out = formatSingleNumber(derivative);
                print(out);
                calcSessionLines.push(`calc>${input}\n${out}`);
            } catch(e) {
                print(`differentiation pipeline fault: ${e.message}`);
            }
            return;
        }

        if (cleanInput.toLowerCase().startsWith('int(')) {
            const match = cleanInput.match(/^int\((.+),\s*(.+),\s*(.+)\)$/i);
            if (!match) {
                print("error: malformed integration parameters. Syntax template: int(expr, start, end)");
                return;
            }
            try {
                const exprStr = match[1];
                const a = parseAndEvaluate(tokenize(match[2])).re;
                const b = parseAndEvaluate(tokenize(match[3])).re;
                const n = 1000;
                const h = (b - a) / n;
                let sum = parseAndEvaluate(tokenize(exprStr), { re: a, im: 0 }).re + parseAndEvaluate(tokenize(exprStr), { re: b, im: 0 }).re;
                for (let i = 1; i < n; i++) {
                    const x = a + i * h;
                    const y = parseAndEvaluate(tokenize(exprStr), { re: x, im: 0 }).re;
                    sum += (i % 2 === 0 ? 2 : 4) * y;
                }
                const integral = (h / 3) * sum;
                variables['ANS'] = { re: integral, im: 0 };
                const out = formatSingleNumber(integral);
                print(out);
                calcSessionLines.push(`calc>${input}\n${out}`);
            } catch(e) {
                print(`integration pipeline fault: ${e.message}`);
            }
            return;
        }

        // Multi-dimensional Linear Matrix Routing
        if (cleanInput.toLowerCase().startsWith('mat:')) {
            const parts = cleanInput.split(':');
            const cmd = parts[1].split('(')[0].trim().toLowerCase();
            const openIdx = cleanInput.indexOf('(');
            const closeIdx = cleanInput.lastIndexOf(')');
            if (openIdx === -1 || closeIdx === -1) {
                print("error: matrix argument boundary tokens not found.");
                return;
            }
            const argStr = cleanInput.substring(openIdx + 1, closeIdx);
            try {
                if (cmd === 'det') {
                    const mat = JSON.parse(argStr);
                    const d = matDet2x3Or3x3(mat);
                    variables['ANS'] = { re: d, im: 0 };
                    print(formatSingleNumber(d));
                } else if (cmd === 'inv') {
                    const mat = JSON.parse(argStr);
                    print(formatMatrix(matInv(mat)));
                } else if (cmd === 'add' || cmd === 'mul') {
                    let commaIdx = findArgSeparatorComma(argStr);
                    if (commaIdx === -1) {
                        print("error: tracking array boundary separation matrix mismatch.");
                        return;
                    }
                    const matA = JSON.parse(argStr.substring(0, commaIdx));
                    const matB = JSON.parse(argStr.substring(commaIdx + 1));
                    if (cmd === 'add') print(formatMatrix(matAdd(matA, matB)));
                    if (cmd === 'mul') print(formatMatrix(matMul(matA, matB)));
                }
            } catch(e) {
                print(`matrix evaluation error: ${e.message}`);
            }
            return;
        }

        // Spatial Vector Domain Configuration Routing
        if (cleanInput.toLowerCase().startsWith('vec:')) {
            const parts = cleanInput.split(':');
            const cmd = parts[1].split('(')[0].trim().toLowerCase();
            const openIdx = cleanInput.indexOf('(');
            const closeIdx = cleanInput.lastIndexOf(')');
            if (openIdx === -1 || closeIdx === -1) {
                print("error: vector argument boundary tokens not found.");
                return;
            }
            const argStr = cleanInput.substring(openIdx + 1, closeIdx);
            try {
                if (cmd === 'mag') {
                    const v = JSON.parse(argStr);
                    const m = Math.sqrt(v.reduce((sum, val) => sum + val*val, 0));
                    variables['ANS'] = { re: m, im: 0 };
                    print(formatSingleNumber(m));
                } else if (cmd === 'dot' || cmd === 'cross') {
                    let commaIdx = findArgSeparatorComma(argStr);
                    if (commaIdx === -1) {
                        print("error: vector dimension array partition mismatch.");
                        return;
                    }
                    const vA = JSON.parse(argStr.substring(0, commaIdx));
                    const vB = JSON.parse(argStr.substring(commaIdx + 1));
                    if (vA.length !== 3 || vB.length !== 3) throw new Error("vector math registers restricted to 3D standard spaces.");
                    
                    if (cmd === 'dot') {
                        const dot = vA[0]*vB[0] + vA[1]*vB[1] + vA[2]*vB[2];
                        variables['ANS'] = { re: dot, im: 0 };
                        print(formatSingleNumber(dot));
                    } else {
                        const cross = [
                            vA[1]*vB[2] - vA[2]*vB[1],
                            vA[2]*vB[0] - vA[0]*vB[2],
                            vA[0]*vB[1] - vA[1]*vB[0]
                        ];
                        print("[" + cross.map(v => formatSingleNumber(v)).join(", ") + "]");
                    }
                }
            } catch(e) {
                print(`vector structural configuration error: ${e.message}`);
            }
            return;
        }

        // General Engineering Mathematical Calculation String Pipeline
        const result = evaluateExpression(cleanInput);
        print(result);
        calcSessionLines.push(`calc>${input}\n${result}`);
        localStorage.setItem('calculator', JSON.stringify(calcSessionLines));
    },
    onExit: () => {
        print("system: exited scientific calculator execution environment mode context.");
    },
    getLines: () => {
        return calcSessionLines.join('\\n');
    },
    loadPulled: (content) => {
        const lines = content.split(/\\r\\n|\\r|\\n/);
        calcSessionLines = [];
        for (let i = 0; i < lines.length; i += 2) {
            const inputLine = lines[i];
            const resultLine = lines[i + 1] !== undefined ? lines[i + 1] : '';
            if (inputLine === undefined || inputLine === '') continue;
            print(inputLine);
            print(resultLine);
            calcSessionLines.push(`${inputLine}\\n${resultLine}`);
        }
        localStorage.setItem('calculator', JSON.stringify(calcSessionLines));
    },
    clearBuffer: () => {
        calcSessionLines = [];
        localStorage.removeItem('calculator');
    }
};

function tokenize(str) {
    const tokens = [];
    let i = 0;
    while (i < str.length) {
        let c = str[i];
        if (/\s/.test(c)) { i++; continue; }
        
        // Literal multi-base input matching systems (0x Hex and 0b Binary interceptors)
        if (c === '0' && i + 1 < str.length && (str[i+1].toLowerCase() === 'x' || str[i+1].toLowerCase() === 'b')) {
            let notationMode = str[i+1].toLowerCase();
            let parsedStr = "0" + str[i+1];
            i += 2;
            if (notationMode === 'x') {
                while (i < str.length && /[0-9A-Fa-f]/.test(str[i])) { parsedStr += str[i]; i++; }
                tokens.push({ type: 'NUMBER', value: parseInt(parsedStr.substring(2), 16) });
            } else {
                while (i < str.length && /[01]/.test(str[i])) { parsedStr += str[i]; i++; }
                tokens.push({ type: 'NUMBER', value: parseInt(parsedStr.substring(2), 2) });
            }
            continue;
        }

        if (/[0-9.]/.test(c)) {
            let numStr = "";
            while (i < str.length && /[0-9.]/.test(str[i])) { numStr += str[i]; i++; }
            tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
            continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            let word = "";
            while (i < str.length && /[A-Za-z0-9_]/.test(str[i])) { word += str[i]; i++; }
            tokens.push({ type: 'WORD', value: word });
            continue;
        }
        if (['+', '-', '*', '/', '^', '(', ')'].includes(c)) {
            tokens.push({ type: 'OPERATOR', value: c });
            i++;
            continue;
        }
        tokens.push({ type: 'UNKNOWN', value: c });
        i++;
    }
    return tokens;
}

function parseAndEvaluate(tokens, customX = null) {
    let position = 0;
    const peek = () => tokens[position];
    const consume = () => tokens[position++];

    function complexMake(re, im = 0) { return { re, im }; }

    function parseExpression() {
        let val = parseTerm();
        while (peek() && (peek().value === '+' || peek().value === '-')) {
            let op = consume().value;
            let nextVal = parseTerm();
            if (op === '+') {
                val = complexMake(val.re + nextVal.re, val.im + nextVal.im);
            } else {
                val = complexMake(val.re - nextVal.re, val.im - nextVal.im);
            }
        }
        return val;
    }

    function parseTerm() {
        let val = parsePower();
        while (peek() && (peek().value === '*' || peek().value === '/')) {
            let op = consume().value;
            let nextVal = parsePower();
            if (op === '*') {
                val = complexMake(val.re * nextVal.re - val.im * nextVal.im, val.re * nextVal.im + val.im * nextVal.re);
            } else {
                const denom = nextVal.re * nextVal.re + nextVal.im * nextVal.im;
                if (denom === 0) throw new Error("division by zero complex boundaries.");
                val = complexMake((val.re * nextVal.re + val.im * nextVal.im) / denom, (val.im * nextVal.re - val.re * nextVal.im) / denom);
            }
        }
        return val;
    }

    function parsePower() {
        let val = parseFactor();
        while (peek() && peek().value === '^') {
            consume();
            let nextVal = parsePower();
            
            if (val.im === 0 && nextVal.im === 0) {
                if (val.re < 0 && !Number.isInteger(nextVal.re)) {
                    // Fall through intentionally to comprehensive polar configuration rules below
                } else {
                    val = complexMake(Math.pow(val.re, nextVal.re), 0);
                    continue;
                }
            }
            // General complex mathematical exponentiation pipeline mapping sequence: a^b = e^(b * ln(a))
            let r = Math.sqrt(val.re * val.re + val.im * val.im);
            if (r === 0) {
                val = (nextVal.re === 0 && nextVal.im === 0) ? complexMake(1, 0) : complexMake(0, 0);
                continue;
            }
            let theta = Math.atan2(val.im, val.re);
            let ln_re = Math.log(r);
            let ln_im = theta;
            let g_re = nextVal.re * ln_re - nextVal.im * ln_im;
            let g_im = nextVal.re * ln_im + nextVal.im * ln_re;
            let magMultiplier = Math.exp(g_re);
            val = complexMake(magMultiplier * Math.cos(g_im), magMultiplier * Math.sin(g_im));
        }
        return val;
    }

    function parseFactor() {
        let t = peek();
        if (!t) throw new Error("malformed sequence end processing expression tree.");

        if (t.value === '-') { 
            consume(); 
            let inner = parseFactor(); 
            return complexMake(-inner.re, -inner.im); 
        }
        if (t.value === '+') { consume(); return parseFactor(); }
        
        if (t.type === 'NUMBER') {
            let numToken = consume();
            // Lookahead interceptor resolving implicit structural imaginary linkages (e.g. 3i, 2.5i)
            if (peek() && peek().type === 'WORD' && peek().value.toLowerCase() === 'i') {
                consume();
                return complexMake(0, numToken.value);
            }
            return complexMake(numToken.value, 0);
        }

        if (t.value === '(') {
            consume();
            let val = parseExpression();
            let closing = consume();
            if (!closing || closing.value !== ')') throw new Error("mismatched syntax parsing tree boundaries: missing closing parenthesis");
            return val;
        }

        if (t.type === 'WORD') {
            let word = consume().value;
            let lowerWord = word.toLowerCase();

            if (lowerWord === 'i') return complexMake(0, 1);

            if (peek() && peek().value === '(') {
                consume();
                
                // Track functions requiring dual parameters split by standard commas
                if (lowerWord === 'pol') {
                    let reVal = parseExpression().re;
                    if (consume().value !== ',') throw new Error("pol operation coordinates require explicit comma partitions.");
                    let imVal = parseExpression().re;
                    if (consume().value !== ')') throw new Error("unclosed parameters tracking bound inside coordinate transformation.");
                    let r = Math.sqrt(reVal*reVal + imVal*imVal);
                    let theta = Math.atan2(imVal, reVal);
                    print(`${formatSingleNumber(r)}∠${formatSingleNumber(theta)} rad`);
                    return complexMake(r, theta);
                }

                let val = parseExpression();
                let closing = consume();
                if (!closing || closing.value !== ')') throw new Error(`unclosed scientific arithmetic scope bounds context for function: ${word}`);

                switch (lowerWord) {
                    case 'sin': 
                        return complexMake(Math.sin(val.re) * Math.cosh(val.im), Math.cos(val.re) * Math.sinh(val.im));
                    case 'cos': 
                        return complexMake(Math.cos(val.re) * Math.cosh(val.im), -Math.sin(val.re) * Math.sinh(val.im));
                    case 'tan': 
                        // tan(z) = sin(z)/cos(z) evaluation tracking routing pipelines
                        let s = complexMake(Math.sin(val.re) * Math.cosh(val.im), Math.cos(val.re) * Math.sinh(val.im));
                        let c = complexMake(Math.cos(val.re) * Math.cosh(val.im), -Math.sin(val.re) * Math.sinh(val.im));
                        let den = c.re * c.re + c.im * c.im;
                        return complexMake((s.re * c.re + s.im * c.im) / den, (s.im * c.re - s.re * c.im) / den);
                    case 'asin': return complexMake(Math.asin(val.re), 0);
                    case 'acos': return complexMake(Math.acos(val.re), 0);
                    case 'atan': return complexMake(Math.atan(val.re), 0);
                    case 'ln': 
                        let r_ln = Math.sqrt(val.re*val.re + val.im*val.im);
                        return complexMake(Math.log(r_ln), Math.atan2(val.im, val.re));
                    case 'log': return complexMake(Math.log10(val.re), 0);
                    case 'sqrt': 
                        if (val.im === 0 && val.re < 0) return complexMake(0, Math.sqrt(-val.re));
                        let r_sq = Math.sqrt(val.re*val.re + val.im*val.im);
                        let re_sq = Math.sqrt((r_sq + val.re) / 2);
                        let im_sq = Math.sign(val.im || 1) * Math.sqrt((r_sq - val.re) / 2);
                        return complexMake(re_sq, im_sq);
                    case 'abs': return complexMake(Math.sqrt(val.re * val.re + val.im * val.im), 0);
                    case 'fact': return complexMake(calculateFactorial(val.re), 0);
                    default: throw new Error(`unrecognized algebraic computation node function string: ${word}`);
                }
            }

            if (lowerWord === 'pi') return complexMake(Math.PI, 0);
            if (lowerWord === 'e') return complexMake(Math.E, 0);

            let varKey = word.toUpperCase();
            if (varKey === 'X' && customX !== null) return customX;
            if (variables.hasOwnProperty(varKey)) return variables[varKey];

            throw new Error(`unregistered algebraic literal data mapping node variable: ${word}`);
        }

        throw new Error(`unhandled syntax character token state: ${t.value}`);
    }

    return parseExpression();
}

function calculateFactorial(n) {
    if (n < 0 || !Number.isInteger(n)) throw new Error("factorial calculations restrict domain variables exclusively to positive integer values.");
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
}

function findArgSeparatorComma(str) {
    let bracketLevel = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '[') bracketLevel++;
        if (str[i] === ']') bracketLevel--;
        if (str[i] === ',' && bracketLevel === 0) return i;
    }
    return -1;
}

function matDet2x3Or3x3(m) {
    if (!Array.isArray(m) || !Array.isArray(m[0])) throw new Error("invalid matrix format representation framework.");
    const dim = m.length;
    if (dim !== m[0].length) throw new Error("determinants calculations require matrix structures layout models to execute as perfect squares.");
    if (dim === 2) return m[0][0]*m[1][1] - m[0][1]*m[1][0];
    if (dim === 3) return matDet3x3(m);
    throw new Error("matrix operational configurations locked strictly down up to maximum parameters limits constraint rules of 3x3 array shapes.");
}

function matDet3x3(m) {
    return m[0][0]*(m[1][1]*m[2][2] - m[1][2]*m[2][1]) -
           m[0][1]*(m[1][0]*m[2][2] - m[1][2]*m[2][0]) +
           m[0][2]*(m[1][0]*m[2][1] - m[1][1]*m[2][0]);
}

function matInv(m) {
    const d = matDet2x3Or3x3(m);
    if (d === 0) throw new Error("matrix is singular (determinant = 0). Spatial inversion operations cannot map properly.");
    const dim = m.length;
    if (dim === 2) {
        return [
            [m[1][1]/d, -m[0][1]/d],
            [-m[1][0]/d, m[0][0]/d]
        ];
    }
    if (dim === 3) {
        return [
            [
                (m[1][1]*m[2][2] - m[1][2]*m[2][1])/d,
                -(m[0][1]*m[2][2] - m[0][2]*m[2][1])/d,
                (m[0][1]*m[1][2] - m[0][2]*m[1][1])/d
            ],
            [
                -(m[1][0]*m[2][2] - m[1][2]*m[2][0])/d,
                (m[0][0]*m[2][2] - m[0][2]*m[2][0])/d,
                -(m[0][0]*m[1][2] - m[0][2]*m[1][0])/d
            ],
            [
                (m[1][0]*m[2][1] - m[1][1]*m[2][0])/d,
                -(m[0][0]*m[2][1] - m[0][1]*m[2][0])/d,
                (m[0][0]*m[1][1] - m[0][1]*m[1][0])/d
            ]
        ];
    }
    throw new Error("matrix inversion layout rules restrict arrays exclusively up to 3x3 dimensions.");
}

function matAdd(A, B) {
    if (A.length !== B.length || A[0].length !== B[0].length) throw new Error("matrix layouts must map identical grid dimensions.");
    return A.map((row, i) => row.map((val, j) => val + B[i][j]));
}

function matMul(A, B) {
    if (A[0].length !== B.length) throw new Error("inner array dimensions properties mismatch configuration error for executing matrix multiplication.");
    const res = Array(A.length).fill(0).map(() => Array(B[0].length).fill(0));
    for (let i = 0; i < A.length; i++) {
        for (let j = 0; j < B[0].length; j++) {
            let sum = 0;
            for (let k = 0; k < A[0].length; k++) sum += A[i][k] * B[k][j];
            res[i][j] = sum;
        }
    }
    return res;
}

function formatMatrix(m) {
    return m.map(row => "[" + row.map(v => formatSingleNumber(v)).join(", ") + "]").join("\\n");
}

function evaluateExpression(expression) {
    const clean = expression.replace(/\s+/g, '');
    if (clean === '') return '';
    try {
        const tokens = tokenize(clean);
        const res = parseAndEvaluate(tokens);
        variables['ANS'] = res;
        localStorage.setItem('calc_variables', JSON.stringify(variables));
        return formatComplexResult(res);
    } catch(e) {
        return `error: ${e.message}`;
    }
}

function formatComplexResult(complexObj) {
    if (complexObj.im === 0) return formatSingleNumber(complexObj.re);
    
    const realStr = formatSingleNumber(complexObj.re);
    const imagStr = formatSingleNumber(Math.abs(complexObj.im));
    const opSign = complexObj.im > 0 ? "+" : "-";
    
    if (complexObj.re === 0) {
        return `${complexObj.im > 0 ? "" : "-"}${imagStr === "1" ? "" : imagStr}i`;
    }
    return `${realStr} ${opSign} ${imagStr === "1" ? "" : imagStr}i`;
}

function formatSingleNumber(total) {
    if (isNaN(total) || !isFinite(total)) return "error: invalid engineering calculation limits execution results.";
    const absTotal = Math.abs(total);
    if (absTotal >= 1e11 || (absTotal > 0 && absTotal < 1e-5)) return total.toExponential(6);
    return Number(total.toFixed(10)).toString();
}

registerTool('calculator', calculator);