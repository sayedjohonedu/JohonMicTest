// Tab Navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

// Password Generator
document.getElementById('pwd-len').addEventListener('input', (e) => {
    document.getElementById('pwd-len-val').textContent = e.target.value;
});

function generatePassword() {
    const len = parseInt(document.getElementById('pwd-len').value);
    const up = document.getElementById('pwd-up').checked;
    const low = document.getElementById('pwd-low').checked;
    const num = document.getElementById('pwd-num').checked;
    const sym = document.getElementById('pwd-sym').checked;

    const uppers = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowers = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()_+~`|}{[]:;?><,./-=";

    let charset = "";
    if (up) charset += uppers;
    if (low) charset += lowers;
    if (num) charset += numbers;
    if (sym) charset += symbols;

    if (!charset) {
        document.getElementById('pwd-res').textContent = "Please select at least one character set.";
        return;
    }

    let password = "";
    for (let i = 0; i < len; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
    }
    document.getElementById('pwd-res').textContent = password;
}

// JSON Formatter
function formatJSON() {
    const input = document.getElementById('json-input').value;
    try {
        const parsed = JSON.parse(input);
        document.getElementById('json-res').textContent = JSON.stringify(parsed, null, 4);
    } catch (e) {
        document.getElementById('json-res').textContent = "Invalid JSON: " + e.message;
    }
}

function minifyJSON() {
    const input = document.getElementById('json-input').value;
    try {
        const parsed = JSON.parse(input);
        document.getElementById('json-res').textContent = JSON.stringify(parsed);
    } catch (e) {
        document.getElementById('json-res').textContent = "Invalid JSON: " + e.message;
    }
}

// HTML to Markdown (Basic Offline implementation)
function convertHTMLToMD() {
    let html = document.getElementById('html-input').value;
    // Simple naive regex replacements
    let md = html
        .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
        .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
        .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
        .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<b>(.*?)<\/b>/gi, '**$1**')
        .replace(/<em>(.*?)<\/em>/gi, '*$1*')
        .replace(/<i>(.*?)<\/i>/gi, '*$1*')
        .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
        .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<ul>/gi, '\n')
        .replace(/<\/ul>/gi, '\n')
        .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
        .replace(/<[^>]*>?/gm, ''); // remove remaining tags
    
    document.getElementById('md-res').textContent = md.trim();
}

// CC Validator (Luhn)
function isValidLuhn(num) {
    let digits = num.replace(/\D/g, '');
    if (!digits) return false;
    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = parseInt(digits[i], 10);
        if (alternate) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alternate = !alternate;
    }
    return sum % 10 === 0;
}

function validateCC() {
    const text = document.getElementById('cc-input').value;
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    let output = "";
    lines.forEach(line => {
        let clean = line.replace(/\s+/g, '');
        let valid = isValidLuhn(clean);
        output += `${clean} - ${valid ? 'VALID' : 'INVALID'}\n`;
    });
    document.getElementById('cc-res').textContent = output || "No input provided.";
}

// IBAN Validator (Basic)
function validateIBAN() {
    let iban = document.getElementById('iban-input').value.replace(/\s/g, '').toUpperCase();
    if (!iban) {
        document.getElementById('iban-res').textContent = "Please enter an IBAN.";
        return;
    }
    const rearranged = iban.substring(4) + iban.substring(0, 4);
    const numeric = rearranged.split('').map(c => {
        const code = c.charCodeAt(0);
        return (code >= 65 && code <= 90) ? (code - 55).toString() : c;
    }).join('');
    
    let remainder = numeric;
    while (remainder.length > 2) {
        let block = remainder.slice(0, 9);
        remainder = parseInt(block, 10) % 97 + remainder.slice(block.length);
    }
    let isValid = parseInt(remainder, 10) % 97 === 1;
    document.getElementById('iban-res').textContent = isValid ? "VALID IBAN" : "INVALID IBAN";
}

// BIN Generator
function generateBIN() {
    const prefix = document.getElementById('bin-input').value.replace(/\D/g, '');
    const count = parseInt(document.getElementById('bin-count').value) || 10;
    if (!prefix) {
        document.getElementById('bin-res').textContent = "Enter a valid prefix.";
        return;
    }
    
    let output = [];
    for(let i=0; i<count; i++){
        let partial = prefix;
        while(partial.length < 15) {
            partial += Math.floor(Math.random() * 10).toString();
        }
        // calc luhn digit
        let sum = 0;
        let alternate = true;
        for (let j = partial.length - 1; j >= 0; j--) {
            let n = parseInt(partial[j], 10);
            if (alternate) {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alternate = !alternate;
        }
        let checkDigit = (10 - (sum % 10)) % 10;
        let cc = partial + checkDigit;
        
        let mm = Math.floor(Math.random() * 12) + 1;
        mm = mm < 10 ? '0' + mm : mm;
        let yyyy = new Date().getFullYear() + Math.floor(Math.random() * 6);
        let cvv = Math.floor(Math.random() * 900) + 100;
        
        output.push(`${cc}|${mm}|${yyyy}|${cvv}`);
    }
    document.getElementById('bin-res').textContent = output.join('\n');
}

function copyBIN() {
    const text = document.getElementById('bin-res').textContent;
    if(text && text !== 'Enter a valid prefix.') {
        navigator.clipboard.writeText(text);
        const btn = document.getElementById('copy-bin-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy All', 2000);
    }
}
