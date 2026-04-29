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

const unitData = {
    length: {
        units: { mm: 1, cm: 10, m: 1000, km: 1000000, 'in': 25.4, ft: 304.8, yd: 914.4, mi: 1609344 },
        labels: { mm: 'Millimeters', cm: 'Centimeters', m: 'Meters', km: 'Kilometers', 'in': 'Inches', ft: 'Feet', yd: 'Yards', mi: 'Miles' }
    },
    weight: {
        units: { mg: 1, g: 1000, kg: 1000000, oz: 28349.5, lb: 453592 },
        labels: { mg: 'Milligrams', g: 'Grams', kg: 'Kilograms', oz: 'Ounces', lb: 'Pounds' }
    },
    volume: {
        units: { ml: 1, l: 1000, gal: 3785.41, qt: 946.353, pt: 473.176, cup: 240 },
        labels: { ml: 'Milliliters', l: 'Liters', gal: 'Gallons (US)', qt: 'Quarts (US)', pt: 'Pints (US)', cup: 'Cups' }
    },
    cooking: {
        units: { tsp: 1, tbsp: 3, fl_oz: 6, cup: 48, pt: 96, qt: 192, gal: 768 },
        labels: { tsp: 'Teaspoon', tbsp: 'Tablespoon', fl_oz: 'Fluid Ounce', cup: 'Cup', pt: 'Pint', qt: 'Quart', gal: 'Gallon' }
    }
};

// Generate converter UI with instant live feedback
document.querySelectorAll('.converter-box').forEach(box => {
    const type = box.dataset.type;
    const data = unitData[type];
    
    let options = '';
    for (const [key, label] of Object.entries(data.labels)) {
        options += `<option value="${key}">${label}</option>`;
    }
    
    box.innerHTML = `
        <div class="grid-layout">
            <div class="result-card" style="box-shadow:none; padding:10px; background:#f2f2f7;">
                <input type="number" class="cv-val1" placeholder="Value" oninput="calcUnit('${type}', this)" style="margin-bottom:10px;">
                <select class="cv-unit1" onchange="calcUnit('${type}', this)" style="margin-bottom:0;">${options}</select>
            </div>
            <div class="result-card" style="box-shadow:none; padding:10px; background:#f2f2f7;">
                <input type="number" class="cv-val2" placeholder="Result" readonly style="margin-bottom:10px;">
                <select class="cv-unit2" onchange="calcUnit('${type}', this)" style="margin-bottom:0;">${options}</select>
            </div>
        </div>
    `;
    
    // Set second select to the second option if possible to make it look active
    const selects = box.querySelectorAll('select');
    if(selects.length >= 2 && selects[1].options.length > 1) {
        selects[1].selectedIndex = 1;
    }
});

function calcUnit(type, element) {
    // Find the parent converter-box to scope our queries
    const box = element.closest('.converter-box');
    const v1 = parseFloat(box.querySelector('.cv-val1').value);
    const u1 = box.querySelector('.cv-unit1').value;
    const u2 = box.querySelector('.cv-unit2').value;
    
    if(isNaN(v1)) {
        box.querySelector('.cv-val2').value = '';
        return;
    }
    
    const baseVal = v1 * unitData[type].units[u1];
    const res = baseVal / unitData[type].units[u2];
    box.querySelector('.cv-val2').value = parseFloat(res.toFixed(6));
}

// Temperature
function calcTemp() {
    const val = parseFloat(document.getElementById('temp-val').value);
    const from = document.getElementById('temp-from').value;
    const to = document.getElementById('temp-to').value;
    
    if(isNaN(val)) {
        document.getElementById('temp-res').value = '';
        return;
    }
    
    let c = 0;
    if(from === 'c') c = val;
    else if(from === 'f') c = (val - 32) * 5/9;
    else if(from === 'k') c = val - 273.15;
    
    let res = 0;
    if(to === 'c') res = c;
    else if(to === 'f') res = (c * 9/5) + 32;
    else if(to === 'k') res = c + 273.15;
    
    document.getElementById('temp-res').value = parseFloat(res.toFixed(4));
}

// Timezone
function calcTime() {
    const now = new Date();
    document.getElementById('tz-local').value = now.toLocaleString();
    
    const target = document.getElementById('tz-target').value;
    const res = now.toLocaleString("en-US", {timeZone: target});
    document.getElementById('tz-res').textContent = res;
}

// Init local time display
setInterval(() => {
    document.getElementById('tz-local').value = new Date().toLocaleString();
    if (document.getElementById('conv-time').classList.contains('active')) {
        calcTime();
    }
}, 1000);
