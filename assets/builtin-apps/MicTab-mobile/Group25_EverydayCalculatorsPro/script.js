/* ============================================================
   MicTab - Everyday Calculators  |  script.js
   Clean, commented ES6 JavaScript — no frameworks
   iOS Cream Theme — Enhanced functionality
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================
       TAB NAVIGATION
       ========================================================== */
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels  = document.querySelectorAll('.calculator-panel');

    /**
     * Switch active tab and corresponding panel.
     * @param {string} tabId - The data-tab identifier
     */
    function switchTab(tabId) {
        tabButtons.forEach(btn => {
            const isActive = btn.dataset.tab === tabId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive);
        });
        tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `tab-${tabId}`);
        });

        // Scroll active tab into view
        const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    /* ==========================================================
       1. SCIENTIFIC CALCULATOR
       ========================================================== */

    // --- State ---
    let sciExpression   = '';      // The raw expression string built by user
    let sciDisplayExpr  = '';      // Pretty-printed expression for display
    let sciResult       = '0';     // Current result
    let sciMemory       = 0;       // Memory register
    let angleMode       = 'deg';   // 'deg' or 'rad'
    let justEvaluated   = false;   // Flag: did we just press =?
    let sciHistory      = [];      // Array of {expr, result} objects (max 10)
    let nprMode         = false;   // Flag for nPr mode (waiting for r)
    let ncrMode         = false;   // Flag for nCr mode (waiting for r)
    let nprN            = null;    // Store n for nPr
    let ncrN            = null;    // Store n for nCr

    const sciExprEl   = document.getElementById('sci-expression');
    const sciResultEl = document.getElementById('sci-result');
    const memIndEl    = document.getElementById('mem-indicator');
    const degBtn      = document.getElementById('deg-btn');
    const radBtn      = document.getElementById('rad-btn');
    const historyToggle = document.getElementById('sci-history-toggle');
    const historyList   = document.getElementById('sci-history-list');

    /** Update the calculator display */
    function sciUpdateDisplay() {
        sciExprEl.textContent  = sciDisplayExpr || '\u00A0';
        sciResultEl.textContent = sciResult;
        memIndEl.textContent    = sciMemory;
    }

    /** Add entry to history */
    function addToHistory(expr, result) {
        sciHistory.unshift({ expr, result });
        if (sciHistory.length > 10) sciHistory.pop();
        renderHistory();
    }

    /** Render history list */
    function renderHistory() {
        historyList.innerHTML = '';
        if (sciHistory.length === 0) {
            historyList.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-secondary);font-size:0.8rem;">No calculations yet</div>';
            return;
        }
        sciHistory.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'sci-history-item';
            div.innerHTML = `<span class="sci-history-expr">${item.expr}</span><span class="sci-history-val">${item.result}</span>`;
            div.addEventListener('click', () => {
                // Load result into calculator
                sciExpression = item.result;
                sciDisplayExpr = item.result;
                sciResult = item.result;
                justEvaluated = true;
                sciUpdateDisplay();
            });
            historyList.appendChild(div);
        });
    }

    /** Toggle history panel */
    historyToggle.addEventListener('click', () => {
        historyToggle.classList.toggle('open');
        historyList.classList.toggle('open');
    });

    /** Factorial helper */
    function factorial(n) {
        if (n < 0) return NaN;
        if (n === 0 || n === 1) return 1;
        if (n > 170) return Infinity;
        if (!Number.isInteger(n)) return gamma(n + 1);
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return result;
    }

    /** Gamma function approximation (Stirling) for non-integer factorial */
    function gamma(z) {
        if (z < 0.5) {
            return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
        }
        z -= 1;
        const g = 7;
        const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        let x = c[0];
        for (let i = 1; i < g + 2; i++) {
            x += c[i] / (z + i);
        }
        const t = z + g + 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }

    /** Permutation: nPr = n! / (n-r)! */
    function nPr(n, r) {
        if (n < 0 || r < 0 || r > n) return NaN;
        return factorial(n) / factorial(n - r);
    }

    /** Combination: nCr = n! / (r! * (n-r)!) */
    function nCr(n, r) {
        if (n < 0 || r < 0 || r > n) return NaN;
        return factorial(n) / (factorial(r) * factorial(n - r));
    }

    /** Safe evaluation of math expression.
     *  We replace symbolic tokens with JS Math equivalents,
     *  then use Function() to evaluate (safer than raw eval). */
    function safeEval(expr) {
        try {
            let e = expr;

            // Replace π and e constants
            e = e.replace(/π/g, `(${Math.PI})`);
            e = e.replace(/(?<![a-zA-Z])e(?![a-zA-Z+\-*/^0-9.])/g, `(${Math.E})`);

            // Replace power operator ^ with **
            e = e.replace(/\^/g, '**');

            // Replace log (base 10) and ln (natural log)
            e = e.replace(/ln\(/g, 'Math.log(');
            e = e.replace(/log\(/g, 'Math.log10(');

            // Replace sqrt
            e = e.replace(/sqrt\(/g, 'Math.sqrt(');

            // Replace inverse trig functions first (before sin/cos/tan)
            if (angleMode === 'deg') {
                e = e.replace(/asin\(/g, 'Math.asin(');
                e = e.replace(/acos\(/g, 'Math.acos(');
                e = e.replace(/atan\(/g, 'Math.atan(');
                e = e.replace(/sin\(/g, 'Math.sin((Math.PI/180)*(');
                e = e.replace(/cos\(/g, 'Math.cos((Math.PI/180)*(');
                e = e.replace(/tan\(/g, 'Math.tan((Math.PI/180)*(');
            } else {
                e = e.replace(/asin\(/g, 'Math.asin(');
                e = e.replace(/acos\(/g, 'Math.acos(');
                e = e.replace(/atan\(/g, 'Math.atan(');
                e = e.replace(/sin\(/g, 'Math.sin(');
                e = e.replace(/cos\(/g, 'Math.cos(');
                e = e.replace(/tan\(/g, 'Math.tan(');
            }

            // Handle factorial: replace patterns like 5! or (expr)!
            // We'll handle factorial via a special marker __FACT__
            // For simple number factorial, convert before eval
            e = e.replace(/(\d+(?:\.\d+)?)!/g, '__FACT__($1)');

            // For deg mode extra parens from sin/cos/tan
            if (angleMode === 'deg') {
                const sinCount = (expr.match(/sin\(/g) || []).length;
                const cosCount = (expr.match(/cos\(/g) || []).length;
                const tanCount = (expr.match(/tan\(/g) || []).length;
                const extraParens = sinCount + cosCount + tanCount;
                e += ')'.repeat(extraParens);
            }

            // Handle inverse trig: for deg mode, convert result back to degrees
            // asin/acos/atan results need to be in degrees if deg mode
            if (angleMode === 'deg') {
                e = e.replace(/Math\.asin\(/g, '((180/Math.PI)*Math.asin(');
                e = e.replace(/Math\.acos\(/g, '((180/Math.PI)*Math.acos(');
                e = e.replace(/Math\.atan\(/g, '((180/Math.PI)*Math.atan(');
                const asinCount = (expr.match(/asin\(/g) || []).length;
                const acosCount = (expr.match(/acos\(/g) || []).length;
                const atanCount = (expr.match(/atan\(/g) || []).length;
                const inverseExtraParens = asinCount + acosCount + atanCount;
                e += ')'.repeat(inverseExtraParens);
            }

            // Replace __FACT__ with factorial function call
            e = e.replace(/__FACT__/g, 'factorial');

            // Make factorial and nPr/nCr available in the eval scope
            const evalFunc = new Function('factorial', 'nPr', 'nCr',
                `"use strict"; return (${e});`
            );
            const result = evalFunc(factorial, nPr, nCr);

            if (typeof result !== 'number' || !isFinite(result)) {
                return 'Error';
            }
            // Round to avoid floating point display issues
            return parseFloat(result.toPrecision(12)).toString();
        } catch {
            return 'Error';
        }
    }

    /** Append a character/expression to the current input */
    function sciAppend(displayChar, evalStr) {
        if (justEvaluated) {
            // If we just evaluated and user types a number, start fresh
            // If user types an operator, continue from result
            if (/[0-9.]/.test(displayChar)) {
                sciExpression  = '';
                sciDisplayExpr = '';
            }
            justEvaluated = false;
        }
        sciExpression  += evalStr || displayChar;
        sciDisplayExpr += displayChar;
        // Live preview
        const preview = safeEval(sciExpression);
        if (preview !== 'Error') {
            sciResult = preview;
        }
        sciUpdateDisplay();
    }

    /** Handle scientific calculator button actions */
    function sciHandleAction(action) {
        switch (action) {
            // --- Digits ---
            case '0': case '1': case '2': case '3': case '4':
            case '5': case '6': case '7': case '8': case '9':
                sciAppend(action, action);
                break;

            case 'decimal':
                sciAppend('.', '.');
                break;

            // --- Operators ---
            case 'add':
                sciAppend(' + ', '+');
                break;
            case 'subtract':
                sciAppend(' − ', '-');
                break;
            case 'multiply':
                sciAppend(' × ', '*');
                break;
            case 'divide':
                sciAppend(' ÷ ', '/');
                break;
            case 'percent':
                sciAppend('%', '/100');
                break;
            case 'power':
                sciAppend('^', '^');
                break;

            // --- Parentheses ---
            case 'lparen':
                sciAppend('(', '(');
                break;
            case 'rparen':
                sciAppend(')', ')');
                break;

            // --- Scientific functions ---
            case 'sin':
                sciAppend('sin(', 'sin(');
                break;
            case 'cos':
                sciAppend('cos(', 'cos(');
                break;
            case 'tan':
                sciAppend('tan(', 'tan(');
                break;
            case 'asin':
                sciAppend('asin(', 'asin(');
                break;
            case 'acos':
                sciAppend('acos(', 'acos(');
                break;
            case 'atan':
                sciAppend('atan(', 'atan(');
                break;
            case 'log':
                sciAppend('log(', 'log(');
                break;
            case 'ln':
                sciAppend('ln(', 'ln(');
                break;
            case 'sqrt':
                sciAppend('√(', 'sqrt(');
                break;

            // --- Factorial ---
            case 'factorial':
                sciAppend('!', '!');
                break;

            // --- nPr and nCr ---
            case 'nPr': {
                // Store the current expression as n, then wait for r
                const currentVal = safeEval(sciExpression);
                if (currentVal !== 'Error') {
                    nprN = parseFloat(currentVal);
                    nprMode = true;
                    sciDisplayExpr = `P(${sciDisplayExpr}, `;
                    sciExpression = '';
                    justEvaluated = false;
                    sciResult = currentVal;
                    sciUpdateDisplay();
                }
                break;
            }
            case 'nCr': {
                const currentVal2 = safeEval(sciExpression);
                if (currentVal2 !== 'Error') {
                    ncrN = parseFloat(currentVal2);
                    ncrMode = true;
                    sciDisplayExpr = `C(${sciDisplayExpr}, `;
                    sciExpression = '';
                    justEvaluated = false;
                    sciResult = currentVal2;
                    sciUpdateDisplay();
                }
                break;
            }

            // --- Constants ---
            case 'pi':
                sciAppend('π', 'π');
                break;
            case 'e':
                sciAppend('e', 'e');
                break;

            // --- Negate ---
            case 'negate':
                if (sciExpression && !justEvaluated) {
                    sciExpression = `(-(${sciExpression}))`;
                    sciDisplayExpr = `-( ${sciDisplayExpr} )`;
                    const preview = safeEval(sciExpression);
                    if (preview !== 'Error') sciResult = preview;
                    sciUpdateDisplay();
                } else if (justEvaluated && sciResult !== '0') {
                    const neg = sciResult.startsWith('-') ? sciResult.slice(1) : `-${sciResult}`;
                    sciResult     = neg;
                    sciExpression = neg;
                    sciDisplayExpr = neg;
                    justEvaluated = false;
                    sciUpdateDisplay();
                }
                break;

            // --- Clear ---
            case 'clear':
                sciExpression  = '';
                sciDisplayExpr = '';
                sciResult      = '0';
                justEvaluated  = false;
                nprMode = false;
                ncrMode = false;
                nprN = null;
                ncrN = null;
                sciUpdateDisplay();
                break;

            // --- Backspace ---
            case 'backspace':
                if (sciExpression.length > 0) {
                    const funcPatterns = ['sin(', 'cos(', 'tan(', 'log(', 'sqrt(', 'asin(', 'acos(', 'atan(', 'ln(' ];
                    let removed = false;
                    for (const fp of funcPatterns) {
                        if (sciExpression.endsWith(fp)) {
                            sciExpression  = sciExpression.slice(0, -fp.length);
                            const dp = fp.replace('sqrt(', '√(');
                            sciDisplayExpr = sciDisplayExpr.slice(0, -dp.length);
                            removed = true;
                            break;
                        }
                    }
                    if (!removed) {
                        sciExpression = sciExpression.trimEnd();
                        sciExpression = sciExpression.slice(0, -1);
                        sciDisplayExpr = sciDisplayExpr.trimEnd();
                        sciDisplayExpr = sciDisplayExpr.slice(0, -1);
                    }
                    if (sciExpression.length === 0) {
                        sciResult = '0';
                    } else {
                        const preview = safeEval(sciExpression);
                        if (preview !== 'Error') sciResult = preview;
                    }
                    sciUpdateDisplay();
                }
                break;

            // --- Equals ---
            case 'equals': {
                // Handle nPr/nCr modes
                if (nprMode && nprN !== null) {
                    const r = parseFloat(safeEval(sciExpression));
                    const result = nPr(nprN, r);
                    if (!isNaN(result) && isFinite(result)) {
                        const displayExpr = sciDisplayExpr;
                        sciDisplayExpr = `P(${nprN}, ${r}) =`;
                        sciResult = parseFloat(result.toPrecision(12)).toString();
                        sciExpression = sciResult;
                        addToHistory(`nPr(${nprN}, ${r})`, sciResult);
                    } else {
                        sciResult = 'Error';
                    }
                    nprMode = false;
                    nprN = null;
                    justEvaluated = true;
                    sciUpdateDisplay();
                    break;
                }
                if (ncrMode && ncrN !== null) {
                    const r = parseFloat(safeEval(sciExpression));
                    const result = nCr(ncrN, r);
                    if (!isNaN(result) && isFinite(result)) {
                        sciDisplayExpr = `C(${ncrN}, ${r}) =`;
                        sciResult = parseFloat(result.toPrecision(12)).toString();
                        sciExpression = sciResult;
                        addToHistory(`nCr(${ncrN}, ${r})`, sciResult);
                    } else {
                        sciResult = 'Error';
                    }
                    ncrMode = false;
                    ncrN = null;
                    justEvaluated = true;
                    sciUpdateDisplay();
                    break;
                }

                const result = safeEval(sciExpression);
                if (result !== 'Error') {
                    const historyExpr = sciDisplayExpr;
                    sciDisplayExpr = sciExpression + ' =';
                    sciResult      = result;
                    sciExpression  = result;
                    justEvaluated  = true;
                    addToHistory(historyExpr, result);
                } else {
                    sciResult = 'Error';
                }
                sciUpdateDisplay();
                break;
            }

            // --- Memory ---
            case 'mc':
                sciMemory = 0;
                sciUpdateDisplay();
                break;
            case 'mr':
                sciAppend(sciMemory.toString(), sciMemory.toString());
                break;
            case 'm+': {
                const val = parseFloat(sciResult);
                if (!isNaN(val)) sciMemory += val;
                sciUpdateDisplay();
                break;
            }
            case 'm-': {
                const val2 = parseFloat(sciResult);
                if (!isNaN(val2)) sciMemory -= val2;
                sciUpdateDisplay();
                break;
            }

            default:
                break;
        }
    }

    // Bind button clicks for scientific calculator
    document.querySelectorAll('.sci-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sciHandleAction(btn.dataset.action);
        });
    });

    // Angle mode toggle
    degBtn.addEventListener('click', () => {
        angleMode = 'deg';
        degBtn.classList.add('active');
        radBtn.classList.remove('active');
    });
    radBtn.addEventListener('click', () => {
        angleMode = 'rad';
        radBtn.classList.add('active');
        degBtn.classList.remove('active');
    });

    // Keyboard support for scientific calculator (when tab is active)
    document.addEventListener('keydown', (e) => {
        const sciPanel = document.getElementById('tab-scientific');
        if (!sciPanel.classList.contains('active')) return;

        const key = e.key;
        if (/^[0-9.]$/.test(key)) {
            sciHandleAction(key === '.' ? 'decimal' : key);
        } else if (key === '+') {
            sciHandleAction('add');
        } else if (key === '-') {
            sciHandleAction('subtract');
        } else if (key === '*') {
            sciHandleAction('multiply');
        } else if (key === '/') {
            e.preventDefault();
            sciHandleAction('divide');
        } else if (key === '(') {
            sciHandleAction('lparen');
        } else if (key === ')') {
            sciHandleAction('rparen');
        } else if (key === 'Enter' || key === '=') {
            e.preventDefault();
            sciHandleAction('equals');
        } else if (key === 'Backspace') {
            sciHandleAction('backspace');
        } else if (key === 'Escape' || key === 'c' || key === 'C') {
            sciHandleAction('clear');
        } else if (key === '%') {
            sciHandleAction('percent');
        } else if (key === '^') {
            sciHandleAction('power');
        } else if (key === '!') {
            sciHandleAction('factorial');
        }
    });


    /* ==========================================================
       2. PERCENTAGE CALCULATOR
       ========================================================== */

    // Mode 1: What is X% of Y?
    document.getElementById('pct1-calc').addEventListener('click', () => {
        const x = parseFloat(document.getElementById('pct1-x').value);
        const y = parseFloat(document.getElementById('pct1-y').value);
        const resultEl = document.getElementById('pct1-result');

        if (isNaN(x) || isNaN(y)) {
            resultEl.innerHTML = '<span class="result-danger">Please enter valid numbers for both fields.</span>';
            return;
        }
        const result = (x / 100) * y;
        resultEl.innerHTML = `<span class="result-highlight">${x}%</span> of <span class="result-highlight">${y}</span> = <span class="result-highlight">${result.toFixed(4).replace(/\.?0+$/, '')}</span>`;
    });

    // Mode 2: X is what % of Y?
    document.getElementById('pct2-calc').addEventListener('click', () => {
        const x = parseFloat(document.getElementById('pct2-x').value);
        const y = parseFloat(document.getElementById('pct2-y').value);
        const resultEl = document.getElementById('pct2-result');

        if (isNaN(x) || isNaN(y)) {
            resultEl.innerHTML = '<span class="result-danger">Please enter valid numbers for both fields.</span>';
            return;
        }
        if (y === 0) {
            resultEl.innerHTML = '<span class="result-danger">Cannot divide by zero.</span>';
            return;
        }
        const result = (x / y) * 100;
        resultEl.innerHTML = `<span class="result-highlight">${x}</span> is <span class="result-highlight">${result.toFixed(4).replace(/\.?0+$/, '')}%</span> of <span class="result-highlight">${y}</span>`;
    });

    // Mode 3: Percentage Change from X to Y
    document.getElementById('pct3-calc').addEventListener('click', () => {
        const x = parseFloat(document.getElementById('pct3-x').value);
        const y = parseFloat(document.getElementById('pct3-y').value);
        const resultEl = document.getElementById('pct3-result');

        if (isNaN(x) || isNaN(y)) {
            resultEl.innerHTML = '<span class="result-danger">Please enter valid numbers for both fields.</span>';
            return;
        }
        if (x === 0) {
            resultEl.innerHTML = '<span class="result-danger">Cannot calculate change from zero.</span>';
            return;
        }
        const change = ((y - x) / Math.abs(x)) * 100;
        const direction = change >= 0 ? 'increase' : 'decrease';
        const colorClass = change >= 0 ? 'result-success' : 'result-danger';
        resultEl.innerHTML = `Percentage change from <span class="result-highlight">${x}</span> to <span class="result-highlight">${y}</span>: <span class="${colorClass}">${Math.abs(change).toFixed(4).replace(/\.?0+$/, '')}% ${direction}</span>`;
    });


    /* ==========================================================
       3. BMI CALCULATOR
       ========================================================== */

    document.getElementById('bmi-calc').addEventListener('click', () => {
        const heightCm = parseFloat(document.getElementById('bmi-height').value);
        const weightKg = parseFloat(document.getElementById('bmi-weight').value);
        const resultEl = document.getElementById('bmi-result');
        const barContainer = document.getElementById('bmi-bar-container');
        const pointer = document.getElementById('bmi-pointer');
        const idealWeightEl = document.getElementById('bmi-ideal-weight');
        const idealRangeEl = document.getElementById('bmi-ideal-range');

        if (isNaN(heightCm) || isNaN(weightKg) || heightCm <= 0 || weightKg <= 0) {
            resultEl.innerHTML = '<span class="result-danger">Please enter valid positive numbers for height and weight.</span>';
            barContainer.style.display = 'none';
            idealWeightEl.style.display = 'none';
            return;
        }

        const heightM  = heightCm / 100;
        const bmi      = weightKg / (heightM * heightM);
        const bmiRound = bmi.toFixed(1);

        // Determine category
        let category, catClass;
        if (bmi < 18.5) {
            category  = 'Underweight';
            catClass  = 'result-warning';
        } else if (bmi < 25) {
            category  = 'Normal';
            catClass  = 'result-success';
        } else if (bmi < 30) {
            category  = 'Overweight';
            catClass  = 'result-warning';
        } else {
            category  = 'Obese';
            catClass  = 'result-danger';
        }

        resultEl.innerHTML = `BMI: <span class="result-highlight">${bmiRound}</span> — <span class="${catClass}">${category}</span>`;

        // Position pointer on the visual bar
        const clampedBmi = Math.max(10, Math.min(45, bmi));
        const pct = ((clampedBmi - 10) / (45 - 10)) * 100;
        pointer.style.left = `calc(${pct}% - 2px)`;
        barContainer.style.display = 'block';

        // Ideal weight range for this height
        const idealMin = (18.5 * heightM * heightM).toFixed(1);
        const idealMax = (24.9 * heightM * heightM).toFixed(1);
        idealRangeEl.textContent = `${idealMin} — ${idealMax} kg`;
        idealWeightEl.style.display = 'block';
    });


    /* ==========================================================
       4. AGE CALCULATOR
       ========================================================== */

    /** Get zodiac sign from month and day */
    function getZodiacSign(month, day) {
        const signs = [
            { name: 'Capricorn', icon: '♑', start: [1, 1], end: [1, 19] },
            { name: 'Aquarius', icon: '♒', start: [1, 20], end: [2, 18] },
            { name: 'Pisces', icon: '♓', start: [2, 19], end: [3, 20] },
            { name: 'Aries', icon: '♈', start: [3, 21], end: [4, 19] },
            { name: 'Taurus', icon: '♉', start: [4, 20], end: [5, 20] },
            { name: 'Gemini', icon: '♊', start: [5, 21], end: [6, 20] },
            { name: 'Cancer', icon: '♋', start: [6, 21], end: [7, 22] },
            { name: 'Leo', icon: '♌', start: [7, 23], end: [8, 22] },
            { name: 'Virgo', icon: '♍', start: [8, 23], end: [9, 22] },
            { name: 'Libra', icon: '♎', start: [9, 23], end: [10, 22] },
            { name: 'Scorpio', icon: '♏', start: [10, 23], end: [11, 21] },
            { name: 'Sagittarius', icon: '♐', start: [11, 22], end: [12, 21] },
            { name: 'Capricorn', icon: '♑', start: [12, 22], end: [12, 31] }
        ];

        for (const sign of signs) {
            const [sMonth, sDay] = sign.start;
            const [eMonth, eDay] = sign.end;
            if ((month === sMonth && day >= sDay) || (month === eMonth && day <= eDay)) {
                return sign;
            }
        }
        return { name: 'Unknown', icon: '?' };
    }

    document.getElementById('age-calc').addEventListener('click', () => {
        const dobStr = document.getElementById('age-dob').value;
        const resultEl = document.getElementById('age-result');
        const zodiacContainer = document.getElementById('age-zodiac-container');
        const zodiacIcon = document.getElementById('age-zodiac-icon');
        const zodiacName = document.getElementById('age-zodiac-name');
        const birthdayCard = document.getElementById('age-birthday-card');
        const birthdayCountdown = document.getElementById('age-birthday-countdown');

        if (!dobStr) {
            resultEl.innerHTML = '<span class="result-danger">Please select your date of birth.</span>';
            zodiacContainer.style.display = 'none';
            birthdayCard.style.display = 'none';
            return;
        }

        const dob    = new Date(dobStr + 'T00:00:00');
        const today  = new Date();
        today.setHours(0, 0, 0, 0);

        if (dob > today) {
            resultEl.innerHTML = '<span class="result-danger">Date of birth cannot be in the future.</span>';
            zodiacContainer.style.display = 'none';
            birthdayCard.style.display = 'none';
            return;
        }

        // Calculate years, months, days
        let years   = today.getFullYear() - dob.getFullYear();
        let months  = today.getMonth() - dob.getMonth();
        let days    = today.getDate() - dob.getDate();

        if (days < 0) {
            months--;
            const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }

        // Total days lived
        const diffMs  = today.getTime() - dob.getTime();
        const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // Next birthday
        let nextBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (nextBirthday <= today) {
            nextBirthday = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
        }
        const daysUntilBirthday = Math.ceil((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Determine next birthday age
        const nextAge = years + 1;

        resultEl.innerHTML = `
            You are <span class="result-highlight">${years}</span> years, <span class="result-highlight">${months}</span> months, and <span class="result-highlight">${days}</span> days old.<br>
            Total days lived: <span class="result-highlight">${totalDays.toLocaleString()}</span>
        `;

        // Zodiac sign
        const zodiac = getZodiacSign(dob.getMonth() + 1, dob.getDate());
        zodiacIcon.textContent = zodiac.icon;
        zodiacName.textContent = zodiac.name;
        zodiacContainer.style.display = 'block';

        // Next birthday countdown
        if (daysUntilBirthday === 0) {
            birthdayCountdown.innerHTML = `🎉 Happy ${nextAge}${getOrdinalSuffix(nextAge)} Birthday!`;
        } else {
            birthdayCountdown.innerHTML = `<span class="result-highlight">${daysUntilBirthday}</span> day${daysUntilBirthday !== 1 ? 's' : ''} until your <span class="result-highlight">${nextAge}${getOrdinalSuffix(nextAge)}</span> birthday`;
        }
        birthdayCard.style.display = 'block';
    });

    /** Get ordinal suffix for a number */
    function getOrdinalSuffix(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    }


    /* ==========================================================
       5. DAYS BETWEEN DATES
       ========================================================== */

    document.getElementById('days-calc').addEventListener('click', () => {
        const startStr = document.getElementById('days-start').value;
        const endStr   = document.getElementById('days-end').value;
        const resultEl = document.getElementById('days-result');
        const breakdownEl = document.getElementById('days-breakdown');

        if (!startStr || !endStr) {
            resultEl.innerHTML = '<span class="result-danger">Please select both start and end dates.</span>';
            breakdownEl.style.display = 'none';
            return;
        }

        const start = new Date(startStr + 'T00:00:00');
        const end   = new Date(endStr + 'T00:00:00');

        if (start > end) {
            resultEl.innerHTML = '<span class="result-danger">Start date must be before end date.</span>';
            breakdownEl.style.display = 'none';
            return;
        }

        const diffMs   = end.getTime() - start.getTime();
        const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const weeks     = Math.floor(totalDays / 7);
        const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
        const totalMinutes = Math.floor(diffMs / (1000 * 60));

        // Calculate full months and years
        let years  = end.getFullYear() - start.getFullYear();
        let months = end.getMonth() - start.getMonth();
        let days   = end.getDate() - start.getDate();

        if (days < 0) {
            months--;
            const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }

        // Approximate total months
        const totalMonths = (years * 12) + months;

        resultEl.innerHTML = `
            Difference: <span class="result-highlight">${totalDays.toLocaleString()}</span> days<br>
            That is <span class="result-highlight">${years}</span> year${years !== 1 ? 's' : ''}, <span class="result-highlight">${months}</span> month${months !== 1 ? 's' : ''}, and <span class="result-highlight">${days}</span> day${days !== 1 ? 's' : ''}
        `;

        // Detailed breakdown
        document.getElementById('days-val-days').textContent = totalDays.toLocaleString();
        document.getElementById('days-val-weeks').textContent = weeks.toLocaleString();
        document.getElementById('days-val-months').textContent = totalMonths.toLocaleString();
        document.getElementById('days-val-hours').textContent = totalHours.toLocaleString();
        document.getElementById('days-val-minutes').textContent = totalMinutes.toLocaleString();
        breakdownEl.style.display = 'grid';
    });


    /* ==========================================================
       6. ROI CALCULATOR
       ========================================================== */

    document.getElementById('roi-calc').addEventListener('click', () => {
        const cost  = parseFloat(document.getElementById('roi-cost').value);
        const final = parseFloat(document.getElementById('roi-final').value);
        const resultEl = document.getElementById('roi-result');
        const visual   = document.getElementById('roi-visual');
        const barFill  = document.getElementById('roi-bar-fill');

        if (isNaN(cost) || isNaN(final) || cost === 0) {
            resultEl.innerHTML = '<span class="result-danger">Please enter valid numbers. Investment cost cannot be zero.</span>';
            visual.style.display = 'none';
            return;
        }

        const netProfit = final - cost;
        const roi = (netProfit / Math.abs(cost)) * 100;
        const roiRound = roi.toFixed(2);

        let profitClass, profitLabel;
        if (netProfit > 0) {
            profitClass = 'result-success';
            profitLabel = 'Profit';
        } else if (netProfit < 0) {
            profitClass = 'result-danger';
            profitLabel = 'Loss';
        } else {
            profitClass = 'result-warning';
            profitLabel = 'Break-even';
        }

        resultEl.innerHTML = `
            ROI: <span class="result-highlight">${roiRound}%</span><br>
            Net ${profitLabel}: <span class="${profitClass}">$${Math.abs(netProfit).toFixed(2)}</span>
        `;

        // Visual bar
        const clampedRoi = Math.max(-100, Math.min(200, roi));
        const barPct = ((clampedRoi + 100) / 300) * 100;

        barFill.style.left  = '50%';
        barFill.style.width = '0%';

        if (roi >= 0) {
            barFill.style.left  = '50%';
            barFill.style.width = `${Math.min(barPct - 50, 50)}%`;
            barFill.style.background = 'rgba(52, 199, 89, 0.5)';
        } else {
            const lossWidth = 50 - barPct;
            barFill.style.left  = `${barPct}%`;
            barFill.style.width = `${lossWidth}%`;
            barFill.style.background = 'rgba(255, 59, 48, 0.5)';
        }

        visual.style.display = 'block';
    });

    // Compound Interest Calculator
    document.getElementById('roi-compound-calc').addEventListener('click', () => {
        const principal = parseFloat(document.getElementById('roi-principal').value);
        const rate = parseFloat(document.getElementById('roi-rate').value);
        const periods = parseFloat(document.getElementById('roi-periods').value);
        const freq = parseInt(document.getElementById('roi-compound-freq').value);
        const resultEl = document.getElementById('roi-compound-result');

        if (isNaN(principal) || isNaN(rate) || isNaN(periods) || isNaN(freq) ||
            principal <= 0 || rate <= 0 || periods <= 0 || freq <= 0) {
            resultEl.innerHTML = '<span class="result-danger">Please enter valid positive numbers for all fields.</span>';
            return;
        }

        // A = P(1 + r/n)^(nt)
        const r = rate / 100;
        const amount = principal * Math.pow(1 + r / freq, freq * periods);
        const interest = amount - principal;
        const effectiveRate = ((amount / principal) - 1) * 100;

        resultEl.innerHTML = `
            Future Value: <span class="result-highlight">$${amount.toFixed(2)}</span><br>
            Total Interest: <span class="result-success">$${interest.toFixed(2)}</span><br>
            Effective Rate: <span class="result-highlight">${effectiveRate.toFixed(2)}%</span><br>
            Total Return: <span class="result-highlight">${((amount / principal - 1) * 100).toFixed(2)}%</span>
        `;
    });


    /* ==========================================================
       7. ELECTRICITY COST ESTIMATOR
       ========================================================== */

    document.getElementById('elec-calc').addEventListener('click', () => {
        const wattage = parseFloat(document.getElementById('elec-wattage').value);
        const hours   = parseFloat(document.getElementById('elec-hours').value);
        const price   = parseFloat(document.getElementById('elec-price').value);
        const resultEl = document.getElementById('elec-result');
        const costGrid = document.getElementById('elec-cost-grid');

        if (isNaN(wattage) || isNaN(hours) || isNaN(price) || wattage <= 0 || hours <= 0 || price <= 0) {
            resultEl.innerHTML = '<span class="result-danger">Please enter valid positive numbers for all fields.</span>';
            costGrid.style.display = 'none';
            return;
        }

        // kWh per day = (wattage * hours) / 1000
        const kWhPerDay    = (wattage * hours) / 1000;
        const dailyCost    = kWhPerDay * price;
        const monthlyCost  = dailyCost * 30;
        const yearlyCost   = dailyCost * 365;

        const fmt = (n) => `$${n.toFixed(2)}`;

        resultEl.innerHTML = `
            Energy consumption: <span class="result-highlight">${kWhPerDay.toFixed(2)} kWh/day</span>
        `;

        // Cost projection cards
        document.getElementById('elec-daily').textContent = fmt(dailyCost);
        document.getElementById('elec-monthly').textContent = fmt(monthlyCost);
        document.getElementById('elec-yearly').textContent = fmt(yearlyCost);
        costGrid.style.display = 'grid';
    });


    /* ==========================================================
       8. UNIT PRICE COMPARISON
       ========================================================== */

    // Ounce conversion: 1 gram = 0.035274 ounces
    const GRAMS_PER_OUNCE = 28.3495;

    document.getElementById('up-calc').addEventListener('click', () => {
        const price1 = parseFloat(document.getElementById('up1-price').value);
        const qty1   = parseFloat(document.getElementById('up1-qty').value);
        const price2 = parseFloat(document.getElementById('up2-price').value);
        const qty2   = parseFloat(document.getElementById('up2-qty').value);
        const resultEl = document.getElementById('up-result');

        if (isNaN(price1) || isNaN(qty1) || isNaN(price2) || isNaN(qty2) ||
            qty1 <= 0 || qty2 <= 0 || price1 < 0 || price2 < 0) {
            resultEl.innerHTML = '<span class="result-danger">Please enter valid positive numbers for all fields.</span>';
            return;
        }

        const unitPrice1 = price1 / qty1;
        const unitPrice2 = price2 / qty2;

        const cheaper1 = unitPrice1 < unitPrice2;
        const cheaper2 = unitPrice2 < unitPrice1;
        const equal    = unitPrice1 === unitPrice2;

        let item1Class = equal ? '' : (cheaper1 ? 'cheaper' : '');
        let item2Class = equal ? '' : (cheaper2 ? 'cheaper' : '');

        // Per 100g and per ounce calculations
        const per100g1 = (price1 / qty1) * 100;
        const per100g2 = (price2 / qty2) * 100;
        const qtyOz1 = qty1 / GRAMS_PER_OUNCE;
        const qtyOz2 = qty2 / GRAMS_PER_OUNCE;
        const perOz1 = price1 / qtyOz1;
        const perOz2 = price2 / qtyOz2;

        const fmtPer = (n) => `$${n.toFixed(4)}`;

        resultEl.innerHTML = `
            <div class="up-item-result ${item1Class}">
                <strong>Item 1:</strong> <span class="result-highlight">${fmtPer(unitPrice1)}</span> per unit
                ${cheaper1 ? ' ✓ Better deal' : ''}
                <div class="up-extra-info">
                    Per 100g: <span class="result-highlight">${fmtPer(per100g1)}</span> · Per oz: <span class="result-highlight">${fmtPer(perOz1)}</span>
                </div>
            </div>
            <div class="up-item-result ${item2Class}">
                <strong>Item 2:</strong> <span class="result-highlight">${fmtPer(unitPrice2)}</span> per unit
                ${cheaper2 ? ' ✓ Better deal' : ''}
                <div class="up-extra-info">
                    Per 100g: <span class="result-highlight">${fmtPer(per100g2)}</span> · Per oz: <span class="result-highlight">${fmtPer(perOz2)}</span>
                </div>
            </div>
            ${equal ? '<span class="result-warning">Both items have the same unit price.</span>' : ''}
        `;
    });


    /* ==========================================================
       INIT — set default display
       ========================================================== */
    sciUpdateDisplay();
    renderHistory();

}); // end DOMContentLoaded
