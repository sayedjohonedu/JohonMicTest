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

// Scientific Calculator
let scExpr = "";
function sc(val) {
    scExpr += val;
    document.getElementById('sc-disp').value = scExpr;
}
function scClear() {
    scExpr = "";
    document.getElementById('sc-disp').value = "";
}
function scEval() {
    try {
        const res = new Function(`return ${scExpr}`)();
        scExpr = res.toString();
        document.getElementById('sc-disp').value = scExpr;
    } catch(e) {
        document.getElementById('sc-disp').value = "Error";
        scExpr = "";
    }
}

// Live Feedback Setups
['pc-1a', 'pc-1b'].forEach(id => document.getElementById(id).addEventListener('input', calcPct1));
['pc-2a', 'pc-2b'].forEach(id => document.getElementById(id).addEventListener('input', calcPct2));
['bmi-w', 'bmi-h'].forEach(id => document.getElementById(id).addEventListener('input', calcBMI));
['age-dob'].forEach(id => document.getElementById(id).addEventListener('input', calcAge));
['dbd-1', 'dbd-2'].forEach(id => document.getElementById(id).addEventListener('input', calcDays));
['roi-inv', 'roi-ret'].forEach(id => document.getElementById(id).addEventListener('input', calcROI));
['el-w', 'el-h', 'el-c'].forEach(id => document.getElementById(id).addEventListener('input', calcElec));
['up-pa', 'up-qa', 'up-pb', 'up-qb'].forEach(id => document.getElementById(id).addEventListener('input', calcUP));


// Percentage
function calcPct1() {
    const a = parseFloat(document.getElementById('pc-1a').value);
    const b = parseFloat(document.getElementById('pc-1b').value);
    if(isNaN(a) || isNaN(b)) {
        document.getElementById('pc-1res').textContent = '0.00';
        return;
    }
    document.getElementById('pc-1res').textContent = (a / 100 * b).toFixed(2);
}
function calcPct2() {
    const a = parseFloat(document.getElementById('pc-2a').value);
    const b = parseFloat(document.getElementById('pc-2b').value);
    if(isNaN(a) || isNaN(b) || b === 0) {
        document.getElementById('pc-2res').textContent = '0.00%';
        return;
    }
    document.getElementById('pc-2res').textContent = ((a / b) * 100).toFixed(2) + '%';
}

// BMI
function calcBMI() {
    const w = parseFloat(document.getElementById('bmi-w').value);
    const h = parseFloat(document.getElementById('bmi-h').value) / 100;
    if(isNaN(w) || isNaN(h) || h === 0) {
        document.getElementById('bmi-res').textContent = '0.00';
        document.getElementById('bmi-cat').textContent = '...';
        return;
    }
    const bmi = w / (h * h);
    document.getElementById('bmi-res').textContent = bmi.toFixed(2);
    let cat = 'Normal';
    if(bmi < 18.5) cat = 'Underweight';
    else if(bmi >= 25 && bmi < 30) cat = 'Overweight';
    else if(bmi >= 30) cat = 'Obese';
    document.getElementById('bmi-cat').textContent = cat;
}

// Age
function calcAge() {
    const dob = new Date(document.getElementById('age-dob').value);
    if(isNaN(dob)) {
        document.getElementById('age-res').textContent = '...';
        return;
    }
    const diff = new Date(Date.now() - dob.getTime());
    const years = diff.getUTCFullYear() - 1970;
    const months = diff.getUTCMonth();
    const days = diff.getUTCDate() - 1;
    document.getElementById('age-res').textContent = `${years} years, ${months} months, ${days} days`;
}

// Days Between
function calcDays() {
    const d1 = new Date(document.getElementById('dbd-1').value);
    const d2 = new Date(document.getElementById('dbd-2').value);
    if(isNaN(d1) || isNaN(d2)) {
        document.getElementById('dbd-res').textContent = '0';
        return;
    }
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    document.getElementById('dbd-res').textContent = diffDays;
}

// ROI
function calcROI() {
    const inv = parseFloat(document.getElementById('roi-inv').value);
    const ret = parseFloat(document.getElementById('roi-ret').value);
    if(isNaN(inv) || isNaN(ret) || inv === 0) {
        document.getElementById('roi-res').textContent = '0.00';
        document.getElementById('roi-prof').textContent = '0.00';
        return;
    }
    const roi = ((ret - inv) / inv) * 100;
    document.getElementById('roi-res').textContent = roi.toFixed(2);
    document.getElementById('roi-prof').textContent = (ret - inv).toFixed(2);
}

// Electricity
function calcElec() {
    const w = parseFloat(document.getElementById('el-w').value);
    const h = parseFloat(document.getElementById('el-h').value);
    const c = parseFloat(document.getElementById('el-c').value);
    if(isNaN(w) || isNaN(h) || isNaN(c)) {
        document.getElementById('el-res').textContent = '$0.00';
        return;
    }
    const kwhPerDay = (w * h) / 1000;
    const costPerMonth = kwhPerDay * 30 * c;
    document.getElementById('el-res').textContent = '$' + costPerMonth.toFixed(2);
}

// Unit Price
function calcUP() {
    const pa = parseFloat(document.getElementById('up-pa').value);
    const qa = parseFloat(document.getElementById('up-qa').value);
    const pb = parseFloat(document.getElementById('up-pb').value);
    const qb = parseFloat(document.getElementById('up-qb').value);
    if(isNaN(pa) || isNaN(qa) || isNaN(pb) || isNaN(qb) || qa === 0 || qb === 0) {
        document.getElementById('up-res').textContent = '...';
        return;
    }
    
    const ua = pa / qa;
    const ub = pb / qb;
    let res = `Item A: ${ua.toFixed(4)}/unit, Item B: ${ub.toFixed(4)}/unit. `;
    if(ua < ub) res += 'Item A is cheaper.';
    else if(ub < ua) res += 'Item B is cheaper.';
    else res += 'Both are the same price per unit.';
    
    document.getElementById('up-res').textContent = res;
}