// Navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
});

function copyToClipboard(id) {
    const el = document.getElementById(id);
    if(el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        el.select();
        document.execCommand('copy');
    } else {
        navigator.clipboard.writeText(el.innerText);
    }
}

// Word Counter
document.getElementById('wc-input').addEventListener('input', function() {
    const text = this.value;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;
    const lines = text === '' ? 0 : text.split('\n').length;
    
    document.getElementById('wc-words').textContent = words;
    document.getElementById('wc-chars').textContent = chars;
    document.getElementById('wc-chars-nospaces').textContent = charsNoSpaces;
    document.getElementById('wc-lines').textContent = lines;
});

// Case Converter
function convertCase(type) {
    const input = document.getElementById('cc-input');
    let text = input.value;
    if (type === 'upper') text = text.toUpperCase();
    else if (type === 'lower') text = text.toLowerCase();
    else if (type === 'title') text = text.replace(/\b\w/g, c => c.toUpperCase());
    else if (type === 'sentence') {
        text = text.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase());
    }
    input.value = text;
}

// Find Replace
function findReplace() {
    const input = document.getElementById('fr-input');
    const find = document.getElementById('fr-find').value;
    const replace = document.getElementById('fr-replace').value;
    const isCase = document.getElementById('fr-case').checked;
    
    if (!find) return;
    const flags = isCase ? 'g' : 'gi';
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    input.value = input.value.replace(regex, replace);
}

// Remove Breaks
function removeBreaks() {
    const input = document.getElementById('rlb-input');
    input.value = input.value.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, " ");
}

function removeBreaksKeepParagraphs() {
    const input = document.getElementById('rlb-input');
    input.value = input.value.replace(/(?<!\n)\n(?!\n)/g, " ");
}

// Text to Bin/Hex
function convertBinHex() {
    const text = document.getElementById('tbh-input').value;
    document.getElementById('tbh-bin').value = Array.from(text).map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    document.getElementById('tbh-hex').value = Array.from(text).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
}

// Markdown
function convertMd() {
    let text = document.getElementById('md-input').value;
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>')
               .replace(/^## (.*$)/gim, '<h2>$1</h2>')
               .replace(/^# (.*$)/gim, '<h1>$1</h1>')
               .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
               .replace(/\*(.*)\*/gim, '<i>$1</i>')
               .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')
               .replace(/\n$/gim, '<br />');
    document.getElementById('md-output').innerHTML = text;
}

// Fancy Unicode
const alphabets = {
    normal: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    mathBold: '𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗',
    fraktur: '𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ0123456789',
    script: '𝒶𝒷𝒸𝒹𝑒𝒻𝑔𝒽𝒾𝒿𝓀𝓁𝓂𝓃𝑜𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏𝒜𝐵𝒞𝒟𝐸𝐹𝒢𝐻𝐼𝒥𝒦𝐿𝑀𝒩𝒪𝒫𝒬𝑅𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵0123456789'
};

function generateFancy() {
    const text = document.getElementById('fu-input').value;
    const output = document.getElementById('fu-output');
    output.innerHTML = '';
    if(!text) return;
    
    ['mathBold', 'fraktur', 'script'].forEach(style => {
        let res = '';
        for(let char of text) {
            let idx = alphabets.normal.indexOf(char);
            if(idx !== -1) {
                res += Array.from(alphabets[style])[idx];
            } else {
                res += char;
            }
        }
        output.innerHTML += `<div class="fancy-row"><span class="fancy-text" id="fancy-${style}">${res}</span><button class="copy-btn" onclick="copyToClipboard('fancy-${style}')">📋</button></div>`;
    });
}

// Morse Code
const morseMap = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.", "G": "--.", "H": "....", "I": "..", "J": ".---", "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.", "S": "...", "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-", "Y": "-.--", "Z": "--..", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.", "0": "-----", " ": "/"
};
const revMorseMap = Object.fromEntries(Object.entries(morseMap).map(([k, v]) => [v, k]));

function translateMorse() {
    const input = document.getElementById('mc-input').value.toUpperCase();
    let res = [];
    if (input.includes('.') || input.includes('-')) {
        res = input.split(' ').map(c => revMorseMap[c] || c).join('');
    } else {
        res = Array.from(input).map(c => morseMap[c] || c).join(' ');
    }
    document.getElementById('mc-output').value = res;
}

// Number to Words
function numToWords() {
    const num = parseInt(document.getElementById('nw-input').value);
    const output = document.getElementById('nw-output');
    if (isNaN(num)) { output.textContent = '...'; return; }
    
    const a = ['','one ','two ','three ','four ', 'five ','six ','seven ','eight ','nine ','ten ','eleven ','twelve ','thirteen ','fourteen ','fifteen ','sixteen ','seventeen ','eighteen ','nineteen '];
    const b = ['', '', 'twenty','thirty','forty','fifty', 'sixty','seventy','eighty','ninety'];

    const toWords = (n) => {
        if (n === 0) return 'zero';
        let str = '';
        if (n < 0) { str = 'minus '; n = Math.abs(n); }
        if (n >= 1000000000) { str += toWords(Math.floor(n / 1000000000)) + ' billion '; n %= 1000000000; }
        if (n >= 1000000) { str += toWords(Math.floor(n / 1000000)) + ' million '; n %= 1000000; }
        if (n >= 1000) { str += toWords(Math.floor(n / 1000)) + ' thousand '; n %= 1000; }
        if (n >= 100) { str += toWords(Math.floor(n / 100)) + ' hundred '; n %= 100; }
        if (n > 0) {
            if (n < 20) str += a[n];
            else { str += b[Math.floor(n / 10)]; if (n % 10 > 0) str += '-' + a[n % 10]; }
        }
        return str.trim();
    };
    
    output.textContent = toWords(num);
}
