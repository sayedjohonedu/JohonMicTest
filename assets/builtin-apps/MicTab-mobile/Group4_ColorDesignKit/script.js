document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

// Copy buttons
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if(input && input.value) {
            navigator.clipboard.writeText(input.value);
            const orig = btn.innerText;
            btn.innerText = 'Copied!';
            setTimeout(() => btn.innerText = orig, 1500);
        }
    });
});

// Color Picker
const pickerInput = document.getElementById('picker-input');
const pickerHex = document.getElementById('picker-hex');
const pickerRgb = document.getElementById('picker-rgb');
const pickerPreview = document.getElementById('picker-preview');

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
}

pickerInput.addEventListener('input', (e) => {
    const val = e.target.value;
    pickerHex.value = val;
    pickerRgb.value = hexToRgb(val);
    pickerPreview.style.background = val;
});
pickerHex.value = pickerInput.value;
pickerRgb.value = hexToRgb(pickerInput.value);

// Palette Generator
const genPaletteBtn = document.getElementById('gen-palette-btn');
const paletteColors = document.getElementById('palette-colors');

function randomHex() {
    return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
}

function getLuminance(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

genPaletteBtn.addEventListener('click', () => {
    paletteColors.innerHTML = '';
    for(let i=0; i<5; i++) {
        const c = randomHex();
        const div = document.createElement('div');
        div.className = 'palette-color';
        div.style.backgroundColor = c;
        div.style.color = getLuminance(c) > 0.5 ? '#000' : '#fff';
        div.style.textShadow = getLuminance(c) > 0.5 ? 'none' : '0 1px 3px rgba(0,0,0,0.3)';
        
        div.innerHTML = `<span>${c}</span> <span>Copy</span>`;
        div.addEventListener('click', () => {
            navigator.clipboard.writeText(c);
            const originalHtml = div.innerHTML;
            div.innerHTML = `<span>${c}</span> <span>Copied!</span>`;
            setTimeout(() => div.innerHTML = originalHtml, 1000);
        });
        paletteColors.appendChild(div);
    }
});
genPaletteBtn.click();

// Text Shadow Generator
const tsX = document.getElementById('ts-x');
const tsY = document.getElementById('ts-y');
const tsBlur = document.getElementById('ts-blur');
const tsColor = document.getElementById('ts-color');
const tsPreview = document.getElementById('ts-preview');
const tsCode = document.getElementById('ts-code');

function updateShadow() {
    const shadow = `${tsX.value}px ${tsY.value}px ${tsBlur.value}px ${tsColor.value}`;
    tsPreview.style.textShadow = shadow;
    tsCode.value = `text-shadow: ${shadow};`;
}

[tsX, tsY, tsBlur, tsColor].forEach(el => el.addEventListener('input', updateShadow));
updateShadow();

// Color Blindness Simulator
const cbFile = document.getElementById('cb-file');
const cbCanvas = document.getElementById('cb-canvas');
const cbType = document.getElementById('cb-type');
const ctx = cbCanvas.getContext('2d');
let originalImage = null;

cbFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('cb-dropzone').querySelector('.dropzone-label').innerText = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            drawCB();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

cbType.addEventListener('change', drawCB);

function drawCB() {
    if (!originalImage) return;
    const w = cbCanvas.width = originalImage.width;
    const h = cbCanvas.height = originalImage.height;
    ctx.drawImage(originalImage, 0, 0);
    
    if (cbType.value === 'normal') return;
    
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i+1], b = data[i+2];
        let nr = r, ng = g, nb = b;
        
        if (cbType.value === 'protanopia') {
            nr = 0.567*r + 0.433*g;
            ng = 0.558*r + 0.442*g;
            nb = 0.242*g + 0.758*b;
        } else if (cbType.value === 'deuteranopia') {
            nr = 0.625*r + 0.375*g;
            ng = 0.7*r + 0.3*g;
            nb = 0.3*g + 0.7*b;
        } else if (cbType.value === 'tritanopia') {
            nr = 0.95*r + 0.05*g;
            ng = 0.433*g + 0.567*b;
            nb = 0.475*g + 0.525*b;
        }
        
        data[i] = nr;
        data[i+1] = ng;
        data[i+2] = nb;
    }
    ctx.putImageData(imageData, 0, 0);
}