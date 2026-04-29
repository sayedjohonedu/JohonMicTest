/* ===========================================================
   MicTab - Unit Converters | script.js
   iOS Cream Theme – Clean ES6
   =========================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================
     1. NAVIGATION – Horizontal Tab Bar & Panel Switching
     ========================================================== */

  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels  = document.querySelectorAll('.converter-panel');

  function switchPanel(name) {
    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.converter === name);
    });
    panels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${name}`);
    });
    // Scroll active tab into view
    const activeBtn = document.querySelector(`.tab-btn[data-converter="${name}"]`);
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.converter));
  });

  /* ==========================================================
     2. TOAST & COPY UTILITY
     ========================================================== */

  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg) {
    toastEl.textContent = msg || 'Copied!';
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const resultId = btn.dataset.result;
      const el = document.getElementById(resultId);
      if (!el) return;

      let text = '';
      if (el.classList.contains('lookup-results')) {
        // Build text from lookup cards
        const cards = el.querySelectorAll('.lookup-card');
        const parts = [];
        cards.forEach(card => {
          const label = card.querySelector('.lookup-label')?.textContent || '';
          const value = card.querySelector('.lookup-value')?.textContent || '';
          if (label && value && value !== '--') parts.push(`${label}: ${value}`);
        });
        text = parts.join(', ');
      } else {
        text = el.textContent;
      }

      if (!text || text === '--') return;

      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied!');
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1200);
      }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Copied!');
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1200);
      });
    });
  });

  /* ==========================================================
     3. SWAP UNITS UTILITY
     ========================================================== */

  function setupSwap(btnId, fromSelId, toSelId, updateFn) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const fromSel = document.getElementById(fromSelId);
      const toSel   = document.getElementById(toSelId);
      const tmp     = fromSel.value;
      fromSel.value = toSel.value;
      toSel.value   = tmp;
      if (updateFn) updateFn();
    });
  }

  /* ==========================================================
     4. REUSABLE UNIT CONVERSION ENGINE
     ========================================================== */

  /**
   * Convert a value between two units using a factor map.
   * Every factor represents "1 unit = X base-unit".
   */
  function convertByFactor(value, fromUnit, toUnit, factorMap) {
    if (value === '' || isNaN(value)) return NaN;
    const from = factorMap[fromUnit];
    const to   = factorMap[toUnit];
    if (from === undefined || to === undefined) return NaN;
    return value * (from / to);
  }

  /**
   * Format a number for display.
   */
  function fmt(n) {
    if (isNaN(n) || n === null || n === undefined) return '--';
    if (!isFinite(n)) return '∞';
    const s = parseFloat(n.toPrecision(10));
    return s.toLocaleString('en-US', { maximumFractionDigits: 8 });
  }

  /* ==========================================================
     5. LENGTH CONVERTER
     ========================================================== */

  /** Conversion factors relative to 1 meter */
  const LENGTH_MAP = {
    mm:  0.001,
    cm:  0.01,
    m:   1,
    km:  1000,
    in:  0.0254,
    ft:  0.3048,
    yd:  0.9144,
    mi:  1609.344,
    nmi: 1852,              // Nautical mile
    bit:  null,             // Data units - handled separately
    byte: null,
    kb:   null,
    mb:   null,
    gb:   null,
    tb:   null
  };

  /** Data unit factors relative to 1 byte */
  const DATA_MAP = {
    bit:  0.125,
    byte: 1,
    kb:   1024,
    mb:   1048576,
    gb:   1073741824,
    tb:   1099511627776
  };

  const DATA_UNITS = ['bit', 'byte', 'kb', 'mb', 'gb', 'tb'];
  const LENGTH_UNITS = ['mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi', 'nmi'];

  const lengthFromSel = document.getElementById('length-from-unit');
  const lengthToSel   = document.getElementById('length-to-unit');
  const lengthInput   = document.getElementById('length-value');
  const lengthResult  = document.getElementById('length-result');

  function updateLength() {
    const val = parseFloat(lengthInput.value);
    const from = lengthFromSel.value;
    const to   = lengthToSel.value;
    const fromLabel = lengthFromSel.options[lengthFromSel.selectedIndex].text;
    const toLabel   = lengthToSel.options[lengthToSel.selectedIndex].text;

    // Check if mixing data and length units
    const fromIsData = DATA_UNITS.includes(from);
    const toIsData   = DATA_UNITS.includes(to);

    if (fromIsData !== toIsData) {
      lengthResult.textContent = 'Cannot convert between length and data units';
      return;
    }

    let res;
    if (fromIsData) {
      res = convertByFactor(val, from, to, DATA_MAP);
    } else {
      res = convertByFactor(val, from, to, LENGTH_MAP);
    }

    lengthResult.textContent = isNaN(res) ? '--' : `${fmt(val)} ${fromLabel} = ${fmt(res)} ${toLabel}`;
  }

  lengthFromSel.addEventListener('change', updateLength);
  lengthToSel.addEventListener('change', updateLength);
  lengthInput.addEventListener('input', updateLength);
  setupSwap('length-swap', 'length-from-unit', 'length-to-unit', updateLength);

  /* ==========================================================
     6. WEIGHT CONVERTER
     ========================================================== */

  /** Conversion factors relative to 1 gram */
  const WEIGHT_MAP = {
    mg:  0.001,
    g:   1,
    kg:  1000,
    oz:  28.349523125,
    lb:  453.59237,
    ton: 1000000,
    ct:  0.2,              // Carat: 1 ct = 0.2 g
    st:  6350.29318        // Stone: 1 st = 6.35029318 kg
  };

  const weightFromSel = document.getElementById('weight-from-unit');
  const weightToSel   = document.getElementById('weight-to-unit');
  const weightInput   = document.getElementById('weight-value');
  const weightResult  = document.getElementById('weight-result');

  function updateWeight() {
    const val = parseFloat(weightInput.value);
    const res = convertByFactor(val, weightFromSel.value, weightToSel.value, WEIGHT_MAP);
    const fromLabel = weightFromSel.options[weightFromSel.selectedIndex].text;
    const toLabel   = weightToSel.options[weightToSel.selectedIndex].text;
    weightResult.textContent = isNaN(res) ? '--' : `${fmt(val)} ${fromLabel} = ${fmt(res)} ${toLabel}`;
  }

  weightFromSel.addEventListener('change', updateWeight);
  weightToSel.addEventListener('change', updateWeight);
  weightInput.addEventListener('input', updateWeight);
  setupSwap('weight-swap', 'weight-from-unit', 'weight-to-unit', updateWeight);

  /* ==========================================================
     7. VOLUME CONVERTER
     ========================================================== */

  /** Conversion factors relative to 1 liter */
  const VOLUME_MAP = {
    ml:    0.001,
    l:     1,
    gal:   3.785411784,
    cup:   0.2365882365,
    floz:  0.0295735295625,
    tbsp:  0.01478676478125
  };

  const volFromSel = document.getElementById('volume-from-unit');
  const volToSel   = document.getElementById('volume-to-unit');
  const volInput   = document.getElementById('volume-value');
  const volResult  = document.getElementById('volume-result');

  function updateVolume() {
    const val = parseFloat(volInput.value);
    const res = convertByFactor(val, volFromSel.value, volToSel.value, VOLUME_MAP);
    const fromLabel = volFromSel.options[volFromSel.selectedIndex].text;
    const toLabel   = volToSel.options[volToSel.selectedIndex].text;
    volResult.textContent = isNaN(res) ? '--' : `${fmt(val)} ${fromLabel} = ${fmt(res)} ${toLabel}`;
  }

  volFromSel.addEventListener('change', updateVolume);
  volToSel.addEventListener('change', updateVolume);
  volInput.addEventListener('input', updateVolume);
  setupSwap('volume-swap', 'volume-from-unit', 'volume-to-unit', updateVolume);

  /* ==========================================================
     8. TEMPERATURE CONVERTER
     ========================================================== */

  const tempFromSel = document.getElementById('temp-from-unit');
  const tempToSel   = document.getElementById('temp-to-unit');
  const tempInput   = document.getElementById('temp-value');
  const tempResult  = document.getElementById('temp-result');

  /**
   * Convert temperature between C, F, K, and R (Rankine).
   * Rankine: °R = °F + 459.67 = K × 1.8
   */
  function convertTemperature(val, from, to) {
    if (isNaN(val)) return NaN;
    if (from === to) return val;

    // First convert to Kelvin
    let kelvin;
    switch (from) {
      case 'C': kelvin = val + 273.15; break;
      case 'F': kelvin = (val + 459.67) * 5 / 9; break;
      case 'K': kelvin = val; break;
      case 'R': kelvin = val * 5 / 9; break;
      default: return NaN;
    }

    // Then convert from Kelvin to target
    switch (to) {
      case 'C': return kelvin - 273.15;
      case 'F': return kelvin * 9 / 5 - 459.67;
      case 'K': return kelvin;
      case 'R': return kelvin * 9 / 5;
      default: return NaN;
    }
  }

  function updateTemperature() {
    const val = parseFloat(tempInput.value);
    const res = convertTemperature(val, tempFromSel.value, tempToSel.value);
    const fromLabel = tempFromSel.options[tempFromSel.selectedIndex].text;
    const toLabel   = tempToSel.options[tempToSel.selectedIndex].text;
    tempResult.textContent = isNaN(res) ? '--' : `${fmt(val)} ${fromLabel} = ${fmt(res)} ${toLabel}`;
  }

  tempFromSel.addEventListener('change', updateTemperature);
  tempToSel.addEventListener('change', updateTemperature);
  tempInput.addEventListener('input', updateTemperature);
  setupSwap('temp-swap', 'temp-from-unit', 'temp-to-unit', updateTemperature);

  /* ==========================================================
     9. TIME ZONE CONVERTER
     ========================================================== */

  /** Extended IANA timezone list with more cities */
  const TIMEZONES = [
    { label: 'UTC',                                  value: 'UTC' },
    { label: '🇺🇸 New York (Eastern)',               value: 'America/New_York' },
    { label: '🇺🇸 Chicago (Central)',                value: 'America/Chicago' },
    { label: '🇺🇸 Denver (Mountain)',                value: 'America/Denver' },
    { label: '🇺🇸 Los Angeles (Pacific)',            value: 'America/Los_Angeles' },
    { label: '🇺🇸 Anchorage (Alaska)',               value: 'America/Anchorage' },
    { label: '🇺🇸 Honolulu (Hawaii)',                value: 'Pacific/Honolulu' },
    { label: '🇨🇦 Halifax (Atlantic)',                value: 'America/Halifax' },
    { label: '🇨🇦 Toronto',                           value: 'America/Toronto' },
    { label: '🇨🇦 Vancouver',                         value: 'America/Vancouver' },
    { label: '🇲🇽 Mexico City',                       value: 'America/Mexico_City' },
    { label: '🇧🇷 São Paulo',                         value: 'America/Sao_Paulo' },
    { label: '🇦🇷 Buenos Aires',                      value: 'America/Argentina/Buenos_Aires' },
    { label: '🇬🇧 London',                            value: 'Europe/London' },
    { label: '🇮🇪 Dublin',                            value: 'Europe/Dublin' },
    { label: '🇫🇷 Paris',                             value: 'Europe/Paris' },
    { label: '🇩🇪 Berlin',                            value: 'Europe/Berlin' },
    { label: '🇮🇹 Rome',                              value: 'Europe/Rome' },
    { label: '🇪🇸 Madrid',                            value: 'Europe/Madrid' },
    { label: '🇳🇱 Amsterdam',                         value: 'Europe/Amsterdam' },
    { label: '🇨🇭 Zurich',                            value: 'Europe/Zurich' },
    { label: '🇸🇪 Stockholm',                         value: 'Europe/Stockholm' },
    { label: '🇵🇱 Warsaw',                            value: 'Europe/Warsaw' },
    { label: '🇬🇷 Athens',                            value: 'Europe/Athens' },
    { label: '🇷🇺 Moscow',                            value: 'Europe/Moscow' },
    { label: '🇹🇷 Istanbul',                          value: 'Europe/Istanbul' },
    { label: '🇦🇪 Dubai',                             value: 'Asia/Dubai' },
    { label: '🇮🇳 Mumbai (Kolkata)',                  value: 'Asia/Kolkata' },
    { label: '🇮🇳 New Delhi',                         value: 'Asia/Kolkata' },
    { label: '🇧🇩 Dhaka',                             value: 'Asia/Dhaka' },
    { label: '🇹🇭 Bangkok',                           value: 'Asia/Bangkok' },
    { label: '🇸🇬 Singapore',                         value: 'Asia/Singapore' },
    { label: '🇲🇾 Kuala Lumpur',                     value: 'Asia/Kuala_Lumpur' },
    { label: '🇮🇩 Jakarta',                           value: 'Asia/Jakarta' },
    { label: '🇵🇭 Manila',                            value: 'Asia/Manila' },
    { label: '🇨🇳 Shanghai',                          value: 'Asia/Shanghai' },
    { label: '🇭🇰 Hong Kong',                         value: 'Asia/Hong_Kong' },
    { label: '🇹🇼 Taipei',                            value: 'Asia/Taipei' },
    { label: '🇯🇵 Tokyo',                             value: 'Asia/Tokyo' },
    { label: '🇰🇷 Seoul',                             value: 'Asia/Seoul' },
    { label: '🇦🇺 Sydney',                            value: 'Australia/Sydney' },
    { label: '🇦🇺 Melbourne',                         value: 'Australia/Melbourne' },
    { label: '🇳🇿 Auckland',                          value: 'Pacific/Auckland' },
    { label: '🇪🇬 Cairo',                             value: 'Africa/Cairo' },
    { label: '🇿🇦 Johannesburg',                     value: 'Africa/Johannesburg' },
    { label: '🇳🇬 Lagos',                             value: 'Africa/Lagos' },
    { label: '🇰🇪 Nairobi',                           value: 'Africa/Nairobi' }
  ];

  const tzFromSel   = document.getElementById('tz-from-zone');
  const tzToSel     = document.getElementById('tz-to-zone');
  const tzTimeInput = document.getElementById('tz-source-time');
  const tzDateInput = document.getElementById('tz-source-date');
  const tzResult    = document.getElementById('tz-result');
  const currentTimeBar = document.getElementById('current-time-bar');

  // Populate timezone dropdowns
  TIMEZONES.forEach(tz => {
    tzFromSel.innerHTML += `<option value="${tz.value}">${tz.label}</option>`;
    tzToSel.innerHTML   += `<option value="${tz.value}">${tz.label}</option>`;
  });

  // Default selections
  tzFromSel.value = 'America/New_York';
  tzToSel.value   = 'Asia/Tokyo';

  // Set today's date as default
  const today = new Date();
  tzDateInput.value = today.toISOString().split('T')[0];

  /** Show current time for both selected zones */
  function updateCurrentTimeBar() {
    const fromZone = tzFromSel.value;
    const toZone   = tzToSel.value;
    const now = new Date();

    const fromLabel = tzFromSel.options[tzFromSel.selectedIndex]?.text || fromZone;
    const toLabel   = tzToSel.options[tzToSel.selectedIndex]?.text || toZone;

    function fmtTime(zone) {
      return now.toLocaleTimeString('en-US', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    }

    function fmtDate(zone) {
      return now.toLocaleDateString('en-US', {
        timeZone: zone,
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }

    currentTimeBar.innerHTML = `
      <div class="current-time-card">
        <div class="ct-label">${fromLabel.replace(/^[^\s]+\s/, '')}</div>
        <div class="ct-time">${fmtTime(fromZone)}</div>
        <div class="ct-date">${fmtDate(fromZone)}</div>
      </div>
      <div class="current-time-card">
        <div class="ct-label">${toLabel.replace(/^[^\s]+\s/, '')}</div>
        <div class="ct-time">${fmtTime(toZone)}</div>
        <div class="ct-date">${fmtDate(toZone)}</div>
      </div>
    `;
  }

  function updateTimezone() {
    updateCurrentTimeBar();

    const timeVal  = tzTimeInput.value;
    const dateVal  = tzDateInput.value;
    const fromZone = tzFromSel.value;
    const toZone   = tzToSel.value;

    if (!timeVal || !dateVal) {
      tzResult.textContent = 'Please select both a date and time.';
      return;
    }

    const [year, month, day] = dateVal.split('-').map(Number);
    const [hour, minute]     = timeVal.split(':').map(Number);

    const sourceFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: fromZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });

    const targetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: toZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });

    const roughUTC = Date.UTC(year, month - 1, day, hour, minute, 0);

    let matchedUTC = null;
    for (let offset = -14 * 3600000; offset <= 14 * 3600000; offset += 60000) {
      const candidate = new Date(roughUTC - offset);
      const parts = sourceFormatter.formatToParts(candidate);
      const p = {};
      parts.forEach(pt => { p[pt.type] = pt.value; });

      const fHour   = parseInt(p.hour, 10);
      const fMinute = parseInt(p.minute, 10);
      const fDay    = parseInt(p.day, 10);
      const fMonth  = parseInt(p.month, 10);
      const fYear   = parseInt(p.year, 10);

      if (fYear === year && fMonth === month && fDay === day &&
          fHour === hour && fMinute === minute) {
        matchedUTC = candidate;
        break;
      }
    }

    if (!matchedUTC) {
      tzResult.textContent = 'Could not resolve the time conversion.';
      return;
    }

    const targetParts = targetFormatter.formatToParts(matchedUTC);
    const tp = {};
    targetParts.forEach(pt => { tp[pt.type] = pt.value; });

    const fromLabel = tzFromSel.options[tzFromSel.selectedIndex].text;
    const toLabel   = tzToSel.options[tzToSel.selectedIndex].text;

    tzResult.innerHTML =
      `<strong>${tp.year}-${tp.month}-${tp.day} ${tp.hour}:${tp.minute}</strong> ` +
      `<span style="color:var(--text-sec)">(${toLabel})</span><br>` +
      `<span style="font-size:0.8rem;color:var(--text-sec)">` +
      `${dateVal} ${timeVal} (${fromLabel}) → ${tp.year}-${tp.month}-${tp.day} ${tp.hour}:${tp.minute} (${toLabel})</span>`;
  }

  tzFromSel.addEventListener('change', updateTimezone);
  tzToSel.addEventListener('change', updateTimezone);
  tzTimeInput.addEventListener('input', updateTimezone);
  tzDateInput.addEventListener('change', updateTimezone);
  setupSwap('tz-swap', 'tz-from-zone', 'tz-to-zone', updateTimezone);

  // Update current time every second
  setInterval(updateCurrentTimeBar, 1000);

  /* ==========================================================
     10. COOKING UNITS CONVERTER
     ========================================================== */

  /** Conversion factors relative to 1 milliliter */
  const COOKING_MAP = {
    cup:   236.5882365,
    tbsp:  14.78676478125,
    tsp:   4.92892159375,
    ml:    1,
    floz:  29.5735295625
  };

  const cookFromSel = document.getElementById('cook-from-unit');
  const cookToSel   = document.getElementById('cook-to-unit');
  const cookInput   = document.getElementById('cook-value');
  const cookResult  = document.getElementById('cook-result');

  function updateCooking() {
    const val = parseFloat(cookInput.value);
    const res = convertByFactor(val, cookFromSel.value, cookToSel.value, COOKING_MAP);
    const fromLabel = cookFromSel.options[cookFromSel.selectedIndex].text;
    const toLabel   = cookToSel.options[cookToSel.selectedIndex].text;
    cookResult.textContent = isNaN(res) ? '--' : `${fmt(val)} ${fromLabel} = ${fmt(res)} ${toLabel}`;
  }

  cookFromSel.addEventListener('change', updateCooking);
  cookToSel.addEventListener('change', updateCooking);
  cookInput.addEventListener('input', updateCooking);
  setupSwap('cook-swap', 'cook-from-unit', 'cook-to-unit', updateCooking);

  /* ==========================================================
     10b. COOKING INGREDIENTS CONVERTER
     ========================================================== */

  /**
   * Ingredient density data.
   * Each entry: grams per cup.
   * Source: common kitchen references.
   */
  const INGREDIENT_DATA = {
    butter:         { name: 'Butter',           gPerCup: 227,   gPerTbsp: 14.19, gPerTsp: 4.73 },
    flour:          { name: 'All-Purpose Flour', gPerCup: 120,   gPerTbsp: 7.5,   gPerTsp: 2.5  },
    sugar:          { name: 'Granulated Sugar',  gPerCup: 200,   gPerTbsp: 12.5,  gPerTsp: 4.17 },
    brown_sugar:    { name: 'Brown Sugar',       gPerCup: 220,   gPerTbsp: 13.75, gPerTsp: 4.58 },
    powdered_sugar: { name: 'Powdered Sugar',    gPerCup: 120,   gPerTbsp: 7.5,   gPerTsp: 2.5  },
    cocoa:          { name: 'Cocoa Powder',      gPerCup: 85,    gPerTbsp: 5.31,  gPerTsp: 1.77 }
  };

  const ingredientTypeSel   = document.getElementById('ingredient-type');
  const ingredientFromSel   = document.getElementById('ingredient-from-unit');
  const ingredientInput     = document.getElementById('ingredient-value');
  const ingredientToSel     = document.getElementById('ingredient-to-unit');
  const ingredientResult    = document.getElementById('ingredient-result');

  function updateIngredient() {
    const val  = parseFloat(ingredientInput.value);
    const type = ingredientTypeSel.value;
    const from = ingredientFromSel.value;
    const to   = ingredientToSel.value;
    const data = INGREDIENT_DATA[type];

    if (!data || isNaN(val)) {
      ingredientResult.textContent = '--';
      return;
    }

    // Step 1: convert from volume to grams
    let grams;
    switch (from) {
      case 'cup':  grams = val * data.gPerCup; break;
      case 'tbsp': grams = val * data.gPerTbsp; break;
      case 'tsp':  grams = val * data.gPerTsp; break;
      default:     grams = val;
    }

    // Step 2: convert grams to target
    let result;
    switch (to) {
      case 'g':  result = grams; break;
      case 'oz': result = grams / 28.349523125; break;
      default:   result = grams;
    }

    const fromLabel = ingredientFromSel.options[ingredientFromSel.selectedIndex].text;
    const toLabel   = ingredientToSel.options[ingredientToSel.selectedIndex].text;
    ingredientResult.textContent = `${fmt(val)} ${fromLabel} ${data.name} = ${fmt(result)} ${toLabel}`;
  }

  ingredientTypeSel.addEventListener('change', updateIngredient);
  ingredientFromSel.addEventListener('change', updateIngredient);
  ingredientInput.addEventListener('input', updateIngredient);
  ingredientToSel.addEventListener('change', updateIngredient);

  // Cooking sub-tabs (Units vs Ingredients)
  const cookingSubTabs = document.querySelectorAll('#cooking-sub-tabs .sub-tab');
  const cookingUnitsMode = document.getElementById('cooking-units-mode');
  const cookingIngredientsMode = document.getElementById('cooking-ingredients-mode');

  cookingSubTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      cookingSubTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      if (mode === 'units') {
        cookingUnitsMode.classList.remove('hidden');
        cookingIngredientsMode.classList.add('hidden');
      } else {
        cookingUnitsMode.classList.add('hidden');
        cookingIngredientsMode.classList.remove('hidden');
      }
    });
  });

  /* ==========================================================
     11. CLOTHING SIZE CONVERTER
     ========================================================== */

  /**
   * Clothing size lookup tables.
   * Adult data: separate tables for men/women × dresses/pants
   * Children data: ages 2-12
   */
  const CLOTHING_DATA = {
    women: {
      dresses: [
        { US: '0',  UK: '4',  EU: '32', Asian: 'XS' },
        { US: '2',  UK: '6',  EU: '34', Asian: 'S'  },
        { US: '4',  UK: '8',  EU: '36', Asian: 'S'  },
        { US: '6',  UK: '10', EU: '38', Asian: 'M'  },
        { US: '8',  UK: '12', EU: '40', Asian: 'M'  },
        { US: '10', UK: '14', EU: '42', Asian: 'L'  },
        { US: '12', UK: '16', EU: '44', Asian: 'L'  },
        { US: '14', UK: '18', EU: '46', Asian: 'XL' },
        { US: '16', UK: '20', EU: '48', Asian: 'XL' },
        { US: '18', UK: '22', EU: '50', Asian: 'XXL' },
        { US: '20', UK: '24', EU: '52', Asian: 'XXL' }
      ],
      pants: [
        { US: '0',  UK: '4',  EU: '32', Asian: 'XS' },
        { US: '2',  UK: '6',  EU: '34', Asian: 'S'  },
        { US: '4',  UK: '8',  EU: '36', Asian: 'S'  },
        { US: '6',  UK: '10', EU: '38', Asian: 'M'  },
        { US: '8',  UK: '12', EU: '40', Asian: 'M'  },
        { US: '10', UK: '14', EU: '42', Asian: 'L'  },
        { US: '12', UK: '16', EU: '44', Asian: 'L'  },
        { US: '14', UK: '18', EU: '46', Asian: 'XL' },
        { US: '16', UK: '20', EU: '48', Asian: 'XL' },
        { US: '18', UK: '22', EU: '50', Asian: 'XXL' },
        { US: '20', UK: '24', EU: '52', Asian: 'XXL' }
      ]
    },
    men: {
      dresses: [
        { US: 'XS',  UK: '34', EU: '44', Asian: 'S'   },
        { US: 'S',   UK: '36', EU: '46', Asian: 'M'   },
        { US: 'M',   UK: '38', EU: '48', Asian: 'L'   },
        { US: 'L',   UK: '40', EU: '50', Asian: 'XL'  },
        { US: 'XL',  UK: '42', EU: '52', Asian: 'XXL' },
        { US: 'XXL', UK: '44', EU: '54', Asian: '3XL' },
        { US: '3XL', UK: '46', EU: '56', Asian: '4XL' }
      ],
      pants: [
        { US: '28', UK: '28', EU: '44', Asian: 'S'   },
        { US: '30', UK: '30', EU: '46', Asian: 'M'   },
        { US: '32', UK: '32', EU: '48', Asian: 'L'   },
        { US: '34', UK: '34', EU: '50', Asian: 'XL'  },
        { US: '36', UK: '36', EU: '52', Asian: 'XXL' },
        { US: '38', UK: '38', EU: '54', Asian: '3XL' },
        { US: '40', UK: '40', EU: '56', Asian: '4XL' },
        { US: '42', UK: '42', EU: '58', Asian: '5XL' }
      ]
    },
    children: {
      dresses: [
        { US: '2T',  UK: '2-3',  EU: '92',  Asian: '80'  },
        { US: '3T',  UK: '3-4',  EU: '98',  Asian: '90'  },
        { US: '4T',  UK: '4-5',  EU: '104', Asian: '100' },
        { US: '5',   UK: '5-6',  EU: '110', Asian: '110' },
        { US: '6',   UK: '6-7',  EU: '116', Asian: '120' },
        { US: '7',   UK: '7-8',  EU: '122', Asian: '130' },
        { US: '8',   UK: '8-9',  EU: '128', Asian: '140' },
        { US: '10',  UK: '9-10', EU: '140', Asian: '150' },
        { US: '12',  UK: '11-12', EU: '152', Asian: '160' }
      ],
      pants: [
        { US: '2T',  UK: '2-3',  EU: '92',  Asian: '80'  },
        { US: '3T',  UK: '3-4',  EU: '98',  Asian: '90'  },
        { US: '4T',  UK: '4-5',  EU: '104', Asian: '100' },
        { US: '5',   UK: '5-6',  EU: '110', Asian: '110' },
        { US: '6',   UK: '6-7',  EU: '116', Asian: '120' },
        { US: '7',   UK: '7-8',  EU: '122', Asian: '130' },
        { US: '8',   UK: '8-9',  EU: '128', Asian: '140' },
        { US: '10',  UK: '9-10', EU: '140', Asian: '150' },
        { US: '12',  UK: '11-12', EU: '152', Asian: '160' }
      ]
    }
  };

  let clothingGender   = 'women';
  let clothingCategory = 'dresses';
  let clothingAge      = 'adult';

  const clothingSystemSel  = document.getElementById('clothing-system');
  const clothingSizeSel    = document.getElementById('clothing-size');
  const clothingCatTabs    = document.querySelectorAll('#clothing-category-tabs .cat-tab');
  const clothingGenderTabs = document.querySelectorAll('#clothing-gender-tabs .gender-tab');
  const clothingAgeTabs    = document.querySelectorAll('#clothing-age-tabs .sub-tab');
  const clothingCatContainer   = document.getElementById('clothing-category-tabs');
  const clothingGenderContainer = document.getElementById('clothing-gender-tabs');

  function getClothingTable() {
    if (clothingAge === 'children') {
      return CLOTHING_DATA.children[clothingCategory];
    }
    return CLOTHING_DATA[clothingGender][clothingCategory];
  }

  function populateClothingSizes() {
    const system = clothingSystemSel.value;
    const table  = getClothingTable();

    clothingSizeSel.innerHTML = '';
    table.forEach((row, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = row[system];
      clothingSizeSel.appendChild(opt);
    });
    updateClothing();
  }

  function updateClothing() {
    const idx   = parseInt(clothingSizeSel.value, 10);
    const table = getClothingTable();
    if (isNaN(idx) || !table[idx]) {
      document.getElementById('cloth-us').textContent    = '--';
      document.getElementById('cloth-uk').textContent    = '--';
      document.getElementById('cloth-eu').textContent    = '--';
      document.getElementById('cloth-asian').textContent = '--';
      return;
    }
    const row = table[idx];
    document.getElementById('cloth-us').textContent    = row.US;
    document.getElementById('cloth-uk').textContent    = row.UK;
    document.getElementById('cloth-eu').textContent    = row.EU;
    document.getElementById('cloth-asian').textContent = row.Asian;
  }

  // Age tabs (Adult / Children)
  clothingAgeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      clothingAgeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      clothingAge = tab.dataset.age;

      // Show/hide gender tabs for children (children are unisex in our table)
      if (clothingAge === 'children') {
        clothingGenderContainer.style.display = 'none';
        clothingGender = 'women'; // doesn't matter, we use children data
      } else {
        clothingGenderContainer.style.display = '';
      }

      populateClothingSizes();
    });
  });

  clothingCatTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      clothingCatTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      clothingCategory = tab.dataset.category;
      populateClothingSizes();
    });
  });

  clothingGenderTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      clothingGenderTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      clothingGender = tab.dataset.gender;
      populateClothingSizes();
    });
  });

  clothingSystemSel.addEventListener('change', populateClothingSizes);
  clothingSizeSel.addEventListener('change', updateClothing);

  /* ==========================================================
     12. SHOE SIZE CONVERTER
     ========================================================== */

  const SHOE_DATA = {
    men: [
      { US: '5',    UK: '4',    EU: '37',   CM: '23.0' },
      { US: '5.5',  UK: '4.5',  EU: '37.5', CM: '23.5' },
      { US: '6',    UK: '5',    EU: '38',   CM: '24.0' },
      { US: '6.5',  UK: '5.5',  EU: '38.5', CM: '24.5' },
      { US: '7',    UK: '6',    EU: '39',   CM: '25.0' },
      { US: '7.5',  UK: '6.5',  EU: '40',   CM: '25.5' },
      { US: '8',    UK: '7',    EU: '40.5', CM: '26.0' },
      { US: '8.5',  UK: '7.5',  EU: '41',   CM: '26.5' },
      { US: '9',    UK: '8',    EU: '42',   CM: '27.0' },
      { US: '9.5',  UK: '8.5',  EU: '42.5', CM: '27.5' },
      { US: '10',   UK: '9',    EU: '43',   CM: '28.0' },
      { US: '10.5', UK: '9.5',  EU: '44',   CM: '28.5' },
      { US: '11',   UK: '10',   EU: '44.5', CM: '29.0' },
      { US: '11.5', UK: '10.5', EU: '45',   CM: '29.5' },
      { US: '12',   UK: '11',   EU: '46',   CM: '30.0' },
      { US: '13',   UK: '12',   EU: '47',   CM: '31.0' },
      { US: '14',   UK: '13',   EU: '48',   CM: '32.0' }
    ],
    women: [
      { US: '5',    UK: '2.5',  EU: '35',   CM: '22.0' },
      { US: '5.5',  UK: '3',    EU: '35.5', CM: '22.5' },
      { US: '6',    UK: '3.5',  EU: '36',   CM: '23.0' },
      { US: '6.5',  UK: '4',    EU: '37',   CM: '23.5' },
      { US: '7',    UK: '4.5',  EU: '37.5', CM: '24.0' },
      { US: '7.5',  UK: '5',    EU: '38',   CM: '24.5' },
      { US: '8',    UK: '5.5',  EU: '38.5', CM: '25.0' },
      { US: '8.5',  UK: '6',    EU: '39',   CM: '25.5' },
      { US: '9',    UK: '6.5',  EU: '40',   CM: '26.0' },
      { US: '9.5',  UK: '7',    EU: '40.5', CM: '26.5' },
      { US: '10',   UK: '7.5',  EU: '41',   CM: '27.0' },
      { US: '10.5', UK: '8',    EU: '42',   CM: '27.5' },
      { US: '11',   UK: '8.5',  EU: '42.5', CM: '28.0' },
      { US: '11.5', UK: '9',    EU: '43',   CM: '28.5' },
      { US: '12',   UK: '9.5',  EU: '44',   CM: '29.0' }
    ],
    children: [
      { US: '1C',   UK: '0.5',  EU: '16', CM: '8.0'  },
      { US: '2C',   UK: '1.5',  EU: '17', CM: '9.0'  },
      { US: '3C',   UK: '2.5',  EU: '18', CM: '10.0' },
      { US: '4C',   UK: '3.5',  EU: '19', CM: '11.0' },
      { US: '5C',   UK: '4.5',  EU: '20', CM: '12.0' },
      { US: '6C',   UK: '5.5',  EU: '22', CM: '13.0' },
      { US: '7C',   UK: '6',    EU: '23', CM: '14.0' },
      { US: '8C',   UK: '7',    EU: '24', CM: '15.0' },
      { US: '9C',   UK: '8',    EU: '25', CM: '16.0' },
      { US: '10C',  UK: '9',    EU: '27', CM: '17.0' },
      { US: '11C',  UK: '10',   EU: '28', CM: '18.0' },
      { US: '12C',  UK: '11',   EU: '29', CM: '19.0' },
      { US: '13C',  UK: '12',   EU: '30', CM: '20.0' },
      { US: '1Y',   UK: '13',   EU: '31', CM: '20.5' },
      { US: '2Y',   UK: '1',    EU: '32', CM: '21.0' },
      { US: '3Y',   UK: '2',    EU: '33', CM: '21.5' },
      { US: '4Y',   UK: '3',    EU: '34', CM: '22.0' },
      { US: '5Y',   UK: '4',    EU: '35', CM: '22.5' },
      { US: '6Y',   UK: '5',    EU: '36', CM: '23.0' }
    ]
  };

  let shoeGender = 'men';
  let shoeAge    = 'adult';

  const shoeSystemSel  = document.getElementById('shoe-system');
  const shoeSizeSel    = document.getElementById('shoe-size');
  const shoeGenderTabs = document.querySelectorAll('#shoe-gender-tabs .gender-tab');
  const shoeAgeTabs    = document.querySelectorAll('#shoe-age-tabs .sub-tab');
  const shoeGenderContainer = document.getElementById('shoe-gender-tabs');

  function getShoeTable() {
    if (shoeAge === 'children') return SHOE_DATA.children;
    return SHOE_DATA[shoeGender];
  }

  function populateShoeSizes() {
    const system = shoeSystemSel.value;
    const table  = getShoeTable();

    shoeSizeSel.innerHTML = '';
    table.forEach((row, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = row[system];
      shoeSizeSel.appendChild(opt);
    });
    updateShoe();
  }

  function updateShoe() {
    const idx   = parseInt(shoeSizeSel.value, 10);
    const table = getShoeTable();
    if (isNaN(idx) || !table[idx]) {
      document.getElementById('shoe-us').textContent = '--';
      document.getElementById('shoe-uk').textContent = '--';
      document.getElementById('shoe-eu').textContent = '--';
      document.getElementById('shoe-cm').textContent = '--';
      return;
    }
    const row = table[idx];
    document.getElementById('shoe-us').textContent = row.US;
    document.getElementById('shoe-uk').textContent = row.UK;
    document.getElementById('shoe-eu').textContent = row.EU;
    document.getElementById('shoe-cm').textContent = row.CM;
  }

  shoeAgeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      shoeAgeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      shoeAge = tab.dataset.age;

      if (shoeAge === 'children') {
        shoeGenderContainer.style.display = 'none';
      } else {
        shoeGenderContainer.style.display = '';
      }
      populateShoeSizes();
    });
  });

  shoeGenderTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      shoeGenderTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      shoeGender = tab.dataset.gender;
      populateShoeSizes();
    });
  });

  shoeSystemSel.addEventListener('change', populateShoeSizes);
  shoeSizeSel.addEventListener('change', updateShoe);

  /* ==========================================================
     13. RING SIZE CONVERTER
     ========================================================== */

  const RING_DATA = [
    { US: '3',    UK: 'F',     EU: '44',  Japan: '4',  MM: '14.0' },
    { US: '3.5',  UK: 'F.5',   EU: '45',  Japan: '5',  MM: '14.4' },
    { US: '4',    UK: 'G.5',   EU: '46',  Japan: '6',  MM: '14.8' },
    { US: '4.5',  UK: 'H.5',   EU: '47',  Japan: '7',  MM: '15.2' },
    { US: '5',    UK: 'I.5',   EU: '48',  Japan: '8',  MM: '15.6' },
    { US: '5.5',  UK: 'J.5',   EU: '49',  Japan: '9',  MM: '16.0' },
    { US: '6',    UK: 'K.5',   EU: '50',  Japan: '10', MM: '16.5' },
    { US: '6.5',  UK: 'L.5',   EU: '51',  Japan: '11', MM: '16.9' },
    { US: '7',    UK: 'M.5',   EU: '52',  Japan: '12', MM: '17.3' },
    { US: '7.5',  UK: 'N.5',   EU: '53',  Japan: '13', MM: '17.7' },
    { US: '8',    UK: 'O.5',   EU: '54',  Japan: '14', MM: '18.1' },
    { US: '8.5',  UK: 'P.5',   EU: '55',  Japan: '15', MM: '18.5' },
    { US: '9',    UK: 'Q.5',   EU: '56',  Japan: '16', MM: '18.9' },
    { US: '9.5',  UK: 'R.5',   EU: '57',  Japan: '17', MM: '19.3' },
    { US: '10',   UK: 'S.5',   EU: '58',  Japan: '18', MM: '19.7' },
    { US: '10.5', UK: 'T.5',   EU: '59',  Japan: '19', MM: '20.1' },
    { US: '11',   UK: 'U.5',   EU: '60',  Japan: '20', MM: '20.5' },
    { US: '11.5', UK: 'V.5',   EU: '61',  Japan: '21', MM: '20.9' },
    { US: '12',   UK: 'W.5',   EU: '62',  Japan: '22', MM: '21.3' },
    { US: '12.5', UK: 'X.5',   EU: '63',  Japan: '23', MM: '21.7' },
    { US: '13',   UK: 'Y.5',   EU: '64',  Japan: '24', MM: '22.1' },
    { US: '13.5', UK: 'Z.5',   EU: '65',  Japan: '25', MM: '22.5' }
  ];

  const ringSystemSel = document.getElementById('ring-system');
  const ringSizeSel   = document.getElementById('ring-size');

  function populateRingSizes() {
    const system = ringSystemSel.value;
    ringSizeSel.innerHTML = '';
    RING_DATA.forEach((row, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = row[system];
      ringSizeSel.appendChild(opt);
    });
    updateRing();
  }

  function updateRing() {
    const idx = parseInt(ringSizeSel.value, 10);
    if (isNaN(idx) || !RING_DATA[idx]) {
      document.getElementById('ring-us').textContent = '--';
      document.getElementById('ring-uk').textContent = '--';
      document.getElementById('ring-eu').textContent = '--';
      document.getElementById('ring-jp').textContent = '--';
      document.getElementById('ring-mm').textContent = '--';
      return;
    }
    const row = RING_DATA[idx];
    document.getElementById('ring-us').textContent = row.US;
    document.getElementById('ring-uk').textContent = row.UK;
    document.getElementById('ring-eu').textContent = row.EU;
    document.getElementById('ring-jp').textContent = row.Japan;
    document.getElementById('ring-mm').textContent = row.MM;
  }

  ringSystemSel.addEventListener('change', populateRingSizes);
  ringSizeSel.addEventListener('change', updateRing);

  /* ==========================================================
     14. INITIAL RENDER – Fire all converters on load
     ========================================================== */

  updateLength();
  updateWeight();
  updateVolume();
  updateTemperature();
  updateTimezone();
  updateCooking();
  updateIngredient();
  populateClothingSizes();
  populateShoeSizes();
  populateRingSizes();

});
