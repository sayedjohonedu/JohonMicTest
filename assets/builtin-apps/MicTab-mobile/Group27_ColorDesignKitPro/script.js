/* ==========================================================
   MicTab - Color & Design Kit  |  script.js
   All sub-application logic wrapped in DOMContentLoaded
   ========================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================
     UTILITIES
     ========================================================== */

  /**
   * Show a brief toast notification (replaces alert)
   */
  function showToast(msg) {
    const existing = document.querySelector('.mictab-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'mictab-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  /**
   * Copy text to clipboard and show toast
   */
  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied!');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Copied!');
    });
  }

  /**
   * localStorage helpers with try/catch for private browsing
   */
  function lsGet(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* Silently fail in private browsing */
    }
  }

  /* ==========================================================
     COLOR CONVERSION FUNCTIONS
     ========================================================== */

  /**
   * Parse a HEX string (#RRGGBB or #RGB) into {r, g, b} (0-255)
   */
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return { r, g, b };
  }

  /**
   * Convert {r, g, b} (0-255) to HEX string #RRGGBB
   */
  function rgbToHex(r, g, b) {
    const toHex = (c) => {
      const h = Math.max(0, Math.min(255, Math.round(c))).toString(16);
      return h.length === 1 ? '0' + h : h;
    };
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  /**
   * Convert {r, g, b} (0-255) to {h, s, l} (h: 0-360, s: 0-100, l: 0-100)
   */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  /**
   * Convert {h, s, l} to {r, g, b} (0-255)
   */
  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  /**
   * Convert HSL to HEX
   */
  function hslToHex(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  /**
   * Convert RGB to CMYK
   */
  function rgbToCmyk(r, g, b) {
    if (r === 0 && g === 0 && b === 0) {
      return { c: 0, m: 0, y: 0, k: 100 };
    }
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const k = 1 - Math.max(rr, gg, bb);
    const c = (1 - rr - k) / (1 - k);
    const m = (1 - gg - k) / (1 - k);
    const y = (1 - bb - k) / (1 - k);
    return {
      c: Math.round(c * 100),
      m: Math.round(m * 100),
      y: Math.round(y * 100),
      k: Math.round(k * 100)
    };
  }

  /**
   * Determine if a color is light (for text contrast)
   */
  function isLight(hex) {
    const { r, g, b } = hexToRgb(hex);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 150;
  }

  /**
   * Calculate relative luminance (WCAG 2.0)
   */
  function relativeLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  /**
   * Calculate WCAG contrast ratio between two RGB colors
   */
  function contrastRatio(rgb1, rgb2) {
    const l1 = relativeLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = relativeLuminance(rgb2.r, rgb2.g, rgb2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Get WCAG rating from contrast ratio
   */
  function wcagRating(ratio) {
    if (ratio >= 7) return { label: 'AAA', className: 'pass-aaa' };
    if (ratio >= 4.5) return { label: 'AA', className: 'pass-aa' };
    return { label: 'Fail', className: 'fail' };
  }

  /* ==========================================================
     TAB NAVIGATION
     ========================================================== */

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  /* ==========================================================
     1. COLOR PICKER
     ========================================================== */

  const cpNative = document.getElementById('cp-native-input');
  const cpSwatch = document.getElementById('cp-swatch');
  const cpHexInput = document.getElementById('cp-hex');
  const cpRgbInput = document.getElementById('cp-rgb');
  const cpHslInput = document.getElementById('cp-hsl');
  const cpCmykInput = document.getElementById('cp-cmyk');
  const cpCompRow = document.getElementById('cp-complementary');
  const cpAnalogRow = document.getElementById('cp-analogous');
  const cpTriadRow = document.getElementById('cp-triadic');
  const cpSplitCompRow = document.getElementById('cp-split-comp');
  const cpTetradicRow = document.getElementById('cp-tetradic');
  const cpSaveFavBtn = document.getElementById('cp-save-fav');
  const cpFavoritesContainer = document.getElementById('cp-favorites');
  const cpRecentContainer = document.getElementById('cp-recent');

  /* localStorage keys */
  const CP_FAV_KEY = 'mictab-cp-favorites';
  const CP_RECENT_KEY = 'mictab-cp-recent';
  let cpFavorites = lsGet(CP_FAV_KEY, []);
  let cpRecentColors = lsGet(CP_RECENT_KEY, []);

  /** Update all color picker displays from a hex value */
  function updateColorPicker(hex, addToRecent = true) {
    hex = hex.charAt(0) === '#' ? hex : '#' + hex;
    if (hex.length === 4) {
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }

    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);

    /* Update swatch */
    cpSwatch.style.background = hex;
    cpNative.value = hex;

    /* Update value inputs */
    cpHexInput.value = hex.toUpperCase();
    cpRgbInput.value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    cpHslInput.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    cpCmykInput.value = `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`;

    /* Harmonies */
    renderHarmony(cpCompRow, getComplementary(hsl));
    renderHarmony(cpAnalogRow, getAnalogous(hsl));
    renderHarmony(cpTriadRow, getTriadic(hsl));
    renderHarmony(cpSplitCompRow, getSplitComplementary(hsl));
    renderHarmony(cpTetradicRow, getTetradic(hsl));

    /* Add to recent colors */
    if (addToRecent) {
      addRecentColor(hex);
    }
  }

  /** Get complementary color (opposite on color wheel) */
  function getComplementary(hsl) {
    return [hslToHex(hsl.h, hsl.s, hsl.l), hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l)];
  }

  /** Get analogous colors (±30 degrees) */
  function getAnalogous(hsl) {
    return [
      hslToHex((hsl.h - 30 + 360) % 360, hsl.s, hsl.l),
      hslToHex(hsl.h, hsl.s, hsl.l),
      hslToHex((hsl.h + 30) % 360, hsl.s, hsl.l)
    ];
  }

  /** Get triadic colors (120 degrees apart) */
  function getTriadic(hsl) {
    return [
      hslToHex(hsl.h, hsl.s, hsl.l),
      hslToHex((hsl.h + 120) % 360, hsl.s, hsl.l),
      hslToHex((hsl.h + 240) % 360, hsl.s, hsl.l)
    ];
  }

  /** Get split-complementary colors (base + ±150 degrees) */
  function getSplitComplementary(hsl) {
    return [
      hslToHex(hsl.h, hsl.s, hsl.l),
      hslToHex((hsl.h + 150) % 360, hsl.s, hsl.l),
      hslToHex((hsl.h + 210) % 360, hsl.s, hsl.l)
    ];
  }

  /** Get tetradic colors (4 colors, 90 degrees apart) */
  function getTetradic(hsl) {
    return [
      hslToHex(hsl.h, hsl.s, hsl.l),
      hslToHex((hsl.h + 90) % 360, hsl.s, hsl.l),
      hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l),
      hslToHex((hsl.h + 270) % 360, hsl.s, hsl.l)
    ];
  }

  /** Render harmony swatches into a container */
  function renderHarmony(container, colors) {
    container.innerHTML = '';
    colors.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = 'cp-harmony-swatch';
      swatch.style.background = c;
      swatch.textContent = c.toUpperCase();
      swatch.style.color = isLight(c) ? '#1C1C1E' : '#fff';
      swatch.title = 'Click to copy ' + c.toUpperCase();
      swatch.addEventListener('click', () => copyText(c.toUpperCase()));
      container.appendChild(swatch);
    });
  }

  /* ---- Favorites ---- */
  function addFavorite(hex) {
    hex = hex.toUpperCase();
    if (cpFavorites.includes(hex)) {
      showToast('Already in favorites!');
      return;
    }
    cpFavorites.unshift(hex);
    if (cpFavorites.length > 20) cpFavorites.pop();
    lsSet(CP_FAV_KEY, cpFavorites);
    renderFavorites();
    showToast('Added to favorites!');
  }

  function removeFavorite(hex) {
    cpFavorites = cpFavorites.filter(f => f !== hex);
    lsSet(CP_FAV_KEY, cpFavorites);
    renderFavorites();
  }

  function renderFavorites() {
    cpFavoritesContainer.innerHTML = '';
    if (cpFavorites.length === 0) {
      cpFavoritesContainer.innerHTML = '<span class="cp-empty-state">No favorites yet</span>';
      return;
    }
    cpFavorites.forEach(hex => {
      const swatch = document.createElement('div');
      swatch.className = 'cp-fav-swatch remove-btn';
      swatch.style.background = hex;
      swatch.title = hex + ' — click to use, hover × to remove';
      swatch.addEventListener('click', (e) => {
        if (e.offsetX > swatch.offsetWidth - 16 && e.offsetY < 16) {
          removeFavorite(hex);
        } else {
          updateColorPicker(hex, false);
        }
      });
      cpFavoritesContainer.appendChild(swatch);
    });
  }

  /* ---- Recent Colors ---- */
  function addRecentColor(hex) {
    hex = hex.toUpperCase();
    cpRecentColors = cpRecentColors.filter(c => c !== hex);
    cpRecentColors.unshift(hex);
    if (cpRecentColors.length > 12) cpRecentColors.pop();
    lsSet(CP_RECENT_KEY, cpRecentColors);
    renderRecentColors();
  }

  function renderRecentColors() {
    cpRecentContainer.innerHTML = '';
    if (cpRecentColors.length === 0) {
      cpRecentContainer.innerHTML = '<span class="cp-empty-state">No recent colors</span>';
      return;
    }
    cpRecentColors.forEach(hex => {
      const swatch = document.createElement('div');
      swatch.className = 'cp-recent-swatch';
      swatch.style.background = hex;
      swatch.title = hex + ' — click to use';
      swatch.addEventListener('click', () => updateColorPicker(hex, false));
      cpRecentContainer.appendChild(swatch);
    });
  }

  /* Native color input change */
  cpNative.addEventListener('input', (e) => {
    updateColorPicker(e.target.value);
  });

  /* Save to favorites button */
  cpSaveFavBtn.addEventListener('click', () => {
    addFavorite(cpHexInput.value);
  });

  /* Copy buttons for HEX/RGB/HSL/CMYK */
  document.querySelectorAll('.cp-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        copyText(input.value);
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 800);
      }
    });
  });

  /* Initialize color picker */
  renderFavorites();
  renderRecentColors();
  updateColorPicker('#007AFF', false);

  /* ==========================================================
     2. PALETTE GENERATOR
     ========================================================== */

  const pgPalette = document.getElementById('pg-palette');
  const pgGenerateBtn = document.getElementById('pg-generate');
  const pgCopyAllBtn = document.getElementById('pg-copy-all');
  const pgSavePaletteBtn = document.getElementById('pg-save-palette');
  const pgModeBtns = document.querySelectorAll('.pg-mode-btn');
  const pgSavedList = document.getElementById('pg-saved-list');

  const PG_SAVED_KEY = 'mictab-pg-saved';
  let pgCurrentMode = 'random';
  let pgColors = [];
  let pgSavedPalettes = lsGet(PG_SAVED_KEY, []);

  /** Generate a single random hex color */
  function randomHex() {
    return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  }

  /** Generate color based on mode */
  function generateColor(mode, baseHue) {
    switch (mode) {
      case 'shades': {
        const h = baseHue !== undefined ? baseHue : Math.floor(Math.random() * 360);
        const s = 50 + Math.floor(Math.random() * 30);
        const l = 20 + Math.floor(Math.random() * 60);
        return hslToHex(h, s, l);
      }
      case 'pastels': {
        const h = Math.floor(Math.random() * 360);
        const s = 40 + Math.floor(Math.random() * 30);
        const l = 75 + Math.floor(Math.random() * 15);
        return hslToHex(h, s, l);
      }
      case 'vibrant': {
        const h = Math.floor(Math.random() * 360);
        const s = 80 + Math.floor(Math.random() * 20);
        const l = 45 + Math.floor(Math.random() * 20);
        return hslToHex(h, s, l);
      }
      case 'split-comp': {
        /* Generated at palette level — individual call falls back to base hue */
        const h = baseHue !== undefined ? baseHue : Math.floor(Math.random() * 360);
        return hslToHex(h, 60 + Math.floor(Math.random() * 30), 40 + Math.floor(Math.random() * 30));
      }
      case 'tetradic': {
        const h = baseHue !== undefined ? baseHue : Math.floor(Math.random() * 360);
        return hslToHex(h, 60 + Math.floor(Math.random() * 30), 40 + Math.floor(Math.random() * 30));
      }
      default:
        return randomHex();
    }
  }

  /** Generate full 5-color palette, respecting locks */
  function generatePalette() {
    const baseHue = Math.floor(Math.random() * 360);

    for (let i = 0; i < 5; i++) {
      if (!pgColors[i] || !pgColors[i].locked) {
        let hex;
        if (pgCurrentMode === 'split-comp') {
          /* Split-complementary: base, comp+30, comp-30, analog+30, analog-30 */
          const offsets = [0, 150, 210, 30, 330];
          const h = (baseHue + offsets[i]) % 360;
          hex = hslToHex(h, 55 + Math.floor(Math.random() * 30), 40 + Math.floor(Math.random() * 30));
        } else if (pgCurrentMode === 'tetradic') {
          /* Tetradic: 4 hues 90° apart + one neutral */
          const offsets = [0, 90, 180, 270, 45];
          const h = (baseHue + offsets[i]) % 360;
          hex = hslToHex(h, 55 + Math.floor(Math.random() * 30), 40 + Math.floor(Math.random() * 30));
        } else {
          hex = generateColor(pgCurrentMode, baseHue);
        }
        pgColors[i] = {
          hex: hex,
          locked: pgColors[i] ? pgColors[i].locked : false
        };
      }
    }

    renderPalette();
  }

  /** Render palette blocks */
  function renderPalette() {
    pgPalette.innerHTML = '';
    pgColors.forEach((item, idx) => {
      const block = document.createElement('div');
      block.className = 'pg-color-block' + (item.locked ? ' locked' : '');
      block.style.background = item.hex;

      const textColor = isLight(item.hex) ? '#1C1C1E' : '#fff';

      const hexLabel = document.createElement('div');
      hexLabel.className = 'pg-color-hex';
      hexLabel.style.color = textColor;
      hexLabel.textContent = item.hex.toUpperCase();

      const actions = document.createElement('div');
      actions.className = 'pg-color-actions';

      const lockBtn = document.createElement('button');
      lockBtn.className = 'pg-lock-btn';
      lockBtn.textContent = item.locked ? '🔒' : '🔓';
      lockBtn.title = item.locked ? 'Unlock color' : 'Lock color';
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pgColors[idx].locked = !pgColors[idx].locked;
        renderPalette();
      });

      actions.appendChild(lockBtn);

      block.appendChild(hexLabel);
      block.appendChild(actions);

      /* Click to copy hex */
      block.addEventListener('click', (e) => {
        if (e.target === lockBtn) return;
        copyText(item.hex.toUpperCase());
      });

      pgPalette.appendChild(block);
    });
  }

  /* ---- Saved Palettes ---- */
  function savePalette() {
    const hexes = pgColors.map(c => c.hex.toUpperCase());
    pgSavedPalettes.unshift(hexes);
    if (pgSavedPalettes.length > 10) pgSavedPalettes.pop();
    lsSet(PG_SAVED_KEY, pgSavedPalettes);
    renderSavedPalettes();
    showToast('Palette saved!');
  }

  function loadPalette(hexes) {
    pgColors = hexes.map(h => ({ hex: h.toLowerCase(), locked: false }));
    renderPalette();
    showToast('Palette loaded!');
  }

  function deletePalette(index) {
    pgSavedPalettes.splice(index, 1);
    lsSet(PG_SAVED_KEY, pgSavedPalettes);
    renderSavedPalettes();
  }

  function renderSavedPalettes() {
    pgSavedList.innerHTML = '';
    if (pgSavedPalettes.length === 0) {
      pgSavedList.innerHTML = '<span class="cp-empty-state">No saved palettes</span>';
      return;
    }
    pgSavedPalettes.forEach((hexes, idx) => {
      const item = document.createElement('div');
      item.className = 'pg-saved-item';

      hexes.forEach(hex => {
        const swatch = document.createElement('div');
        swatch.className = 'pg-saved-swatch';
        swatch.style.background = hex;
        swatch.title = hex;
        item.appendChild(swatch);
      });

      const actions = document.createElement('div');
      actions.className = 'pg-saved-item-actions';

      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', () => loadPalette(hexes));

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => copyText(hexes.join(', ')));

      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.className = 'delete-btn';
      delBtn.addEventListener('click', () => deletePalette(idx));

      actions.appendChild(loadBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(delBtn);
      item.appendChild(actions);

      pgSavedList.appendChild(item);
    });
  }

  /* Mode button switching */
  pgModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pgModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pgCurrentMode = btn.dataset.mode;
    });
  });

  /* Generate button */
  pgGenerateBtn.addEventListener('click', generatePalette);

  /* Copy All button */
  pgCopyAllBtn.addEventListener('click', () => {
    const allHex = pgColors.map(c => c.hex.toUpperCase()).join(', ');
    copyText(allHex);
  });

  /* Save palette button */
  pgSavePaletteBtn.addEventListener('click', savePalette);

  /* Initial palette generation */
  renderSavedPalettes();
  generatePalette();

  /* ==========================================================
     3. TEXT SHADOW GENERATOR
     ========================================================== */

  const tsLayersContainer = document.getElementById('ts-layers');
  const tsAddBtn = document.getElementById('ts-add-layer');
  const tsPreview = document.getElementById('ts-preview');
  const tsPreviewText = document.getElementById('ts-preview-text');
  const tsCssOutput = document.getElementById('ts-css-output');
  const tsCopyCssBtn = document.getElementById('ts-copy-css');
  const tsPresetBtns = document.querySelectorAll('.ts-preset-btn');

  let tsLayers = [];
  let tsLayerIdCounter = 0;

  /* ---- Shadow Presets ---- */
  const TS_PRESETS = {
    neon: [
      { x: 0, y: 0, blur: 7, color: '#007AFF' },
      { x: 0, y: 0, blur: 14, color: '#007AFF' },
      { x: 0, y: 0, blur: 28, color: '#007AFF' },
      { x: 0, y: 0, blur: 56, color: '#007AFF' }
    ],
    retro: [
      { x: 2, y: 2, blur: 0, color: '#FF9500' },
      { x: 4, y: 4, blur: 0, color: '#FF3B30' },
      { x: 6, y: 6, blur: 0, color: '#5856D6' }
    ],
    hard: [
      { x: 4, y: 4, blur: 0, color: '#1C1C1E' }
    ],
    long: [
      { x: 1, y: 1, blur: 0, color: '#8E8E93' },
      { x: 2, y: 2, blur: 0, color: '#8E8E93' },
      { x: 3, y: 3, blur: 0, color: '#8E8E93' },
      { x: 4, y: 4, blur: 0, color: '#8E8E93' },
      { x: 5, y: 5, blur: 0, color: '#8E8E93' },
      { x: 6, y: 6, blur: 0, color: '#8E8E93' },
      { x: 7, y: 7, blur: 0, color: '#8E8E93' },
      { x: 8, y: 8, blur: 0, color: '#C7C7CC' },
    ],
    none: []
  };

  /** Apply a preset */
  function applyPreset(presetName) {
    const preset = TS_PRESETS[presetName];
    if (!preset) return;

    tsLayers = [];
    tsLayerIdCounter = 0;

    preset.forEach(p => {
      tsLayers.push({ id: tsLayerIdCounter++, x: p.x, y: p.y, blur: p.blur, color: p.color });
    });

    /* Clear active states on preset buttons, set the active one */
    tsPresetBtns.forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.ts-preset-btn[data-preset="${presetName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    renderShadowLayers();
    updateTextShadow();
  }

  /* Preset button handlers */
  tsPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
    });
  });

  /** Add a shadow layer */
  function addShadowLayer(x = 2, y = 2, blur = 4, color = '#1C1C1E') {
    const id = tsLayerIdCounter++;
    tsLayers.push({ id, x, y, blur, color });

    /* Clear active preset indicator since user is manually editing */
    tsPresetBtns.forEach(b => b.classList.remove('active'));

    renderShadowLayers();
    updateTextShadow();
  }

  /** Remove a shadow layer by id */
  function removeShadowLayer(id) {
    tsLayers = tsLayers.filter(l => l.id !== id);
    renderShadowLayers();
    updateTextShadow();
  }

  /** Render shadow layer controls */
  function renderShadowLayers() {
    tsLayersContainer.innerHTML = '';

    tsLayers.forEach((layer, idx) => {
      const div = document.createElement('div');
      div.className = 'ts-layer';

      div.innerHTML = `
        <div class="ts-layer-header">
          <span class="ts-layer-title">Shadow ${idx + 1}</span>
          <button class="ts-remove-layer" data-id="${layer.id}">&times;</button>
        </div>
        <div class="ts-slider-row">
          <label>X-Offset</label>
          <input type="range" min="-20" max="20" value="${layer.x}" data-id="${layer.id}" data-prop="x">
          <span class="ts-val">${layer.x}px</span>
        </div>
        <div class="ts-slider-row">
          <label>Y-Offset</label>
          <input type="range" min="-20" max="20" value="${layer.y}" data-id="${layer.id}" data-prop="y">
          <span class="ts-val">${layer.y}px</span>
        </div>
        <div class="ts-slider-row">
          <label>Blur</label>
          <input type="range" min="0" max="60" value="${layer.blur}" data-id="${layer.id}" data-prop="blur">
          <span class="ts-val">${layer.blur}px</span>
        </div>
        <div class="ts-slider-row">
          <label>Color</label>
          <input type="color" value="${layer.color}" data-id="${layer.id}" data-prop="color">
        </div>
      `;

      div.querySelector('.ts-remove-layer').addEventListener('click', (e) => {
        const lid = parseInt(e.target.dataset.id);
        removeShadowLayer(lid);
      });

      div.querySelectorAll('input[type="range"]').forEach(slider => {
        slider.addEventListener('input', (e) => {
          const lid = parseInt(e.target.dataset.id);
          const prop = e.target.dataset.prop;
          const val = parseInt(e.target.value);
          const layerObj = tsLayers.find(l => l.id === lid);
          if (layerObj) {
            layerObj[prop] = val;
            e.target.nextElementSibling.textContent = val + 'px';
            updateTextShadow();
          }
        });
      });

      div.querySelectorAll('input[type="color"]').forEach(picker => {
        picker.addEventListener('input', (e) => {
          const lid = parseInt(e.target.dataset.id);
          const layerObj = tsLayers.find(l => l.id === lid);
          if (layerObj) {
            layerObj.color = e.target.value;
            updateTextShadow();
          }
        });
      });

      tsLayersContainer.appendChild(div);
    });
  }

  /** Build text-shadow string and update preview + output */
  function updateTextShadow() {
    if (tsLayers.length === 0) {
      tsPreview.style.textShadow = 'none';
      tsCssOutput.textContent = 'text-shadow: none;';
      return;
    }

    const shadows = tsLayers.map(l =>
      `${l.x}px ${l.y}px ${l.blur}px ${l.color}`
    );

    const cssValue = shadows.join(',\n    ');
    tsPreview.style.textShadow = shadows.join(', ');
    tsCssOutput.textContent = `text-shadow:\n    ${cssValue};`;
  }

  /* Preview text input */
  tsPreviewText.addEventListener('input', (e) => {
    tsPreview.textContent = e.target.value || 'MicTab Design';
  });

  /* Add layer button */
  tsAddBtn.addEventListener('click', () => {
    addShadowLayer(2, 2, 4, '#1C1C1E');
  });

  /* Copy CSS button */
  tsCopyCssBtn.addEventListener('click', () => {
    copyText(tsCssOutput.textContent);
  });

  /* Initialize with neon preset */
  applyPreset('neon');

  /* ==========================================================
     4. COLOR BLINDNESS SIMULATOR
     ========================================================== */

  /* ---- Color Blindness Transformation Matrices ---- */
  const CB_MATRICES = {
    protanopia: [
      [0.567, 0.433, 0],
      [0.558, 0.442, 0],
      [0,     0.242, 0.758]
    ],
    deuteranopia: [
      [0.625, 0.375, 0],
      [0.7,   0.3,   0],
      [0,     0.3,   0.7]
    ],
    tritanopia: [
      [0.95,  0.05,  0],
      [0,     0.433, 0.567],
      [0,     0.475, 0.525]
    ],
    achromatopsia: [
      [0.299, 0.587, 0.114],
      [0.299, 0.587, 0.114],
      [0.299, 0.587, 0.114]
    ]
  };

  /**
   * Apply a color blindness matrix to an RGB color
   */
  function applyCBMatrix(matrix, r, g, b) {
    const nr = matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b;
    const ng = matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b;
    const nb = matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b;
    return {
      r: Math.max(0, Math.min(255, Math.round(nr))),
      g: Math.max(0, Math.min(255, Math.round(ng))),
      b: Math.max(0, Math.min(255, Math.round(nb)))
    };
  }

  /* ---- Mode toggle ---- */
  const cbModeBtns = document.querySelectorAll('.cb-mode-btn');
  const cbColorMode = document.getElementById('cb-color-mode');
  const cbImageMode = document.getElementById('cb-image-mode');

  cbModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cbModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.cbmode;
      cbColorMode.classList.toggle('active', mode === 'color');
      cbImageMode.classList.toggle('active', mode === 'image');
    });
  });

  /* ---- Color Input Mode ---- */
  const cbColorInput = document.getElementById('cb-color-input');
  const cbColorHex = document.getElementById('cb-color-hex');
  const cbOrigSwatch = document.getElementById('cb-orig-swatch');
  const cbOrigLabel = document.getElementById('cb-orig-label');
  const cbProtanSwatch = document.getElementById('cb-protan-swatch');
  const cbProtanLabel = document.getElementById('cb-protan-label');
  const cbDeutanSwatch = document.getElementById('cb-deutan-swatch');
  const cbDeutanLabel = document.getElementById('cb-deutan-label');
  const cbTritanSwatch = document.getElementById('cb-tritan-swatch');
  const cbTritanLabel = document.getElementById('cb-tritan-label');
  const cbAchromaSwatch = document.getElementById('cb-achroma-swatch');
  const cbAchromaLabel = document.getElementById('cb-achroma-label');
  const cbContrastGrid = document.getElementById('cb-contrast-grid');

  /** Update WCAG contrast checker */
  function updateContrastChecker(hex) {
    const rgb = hexToRgb(hex);
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };

    const ratioWhite = contrastRatio(rgb, white);
    const ratioBlack = contrastRatio(rgb, black);

    /* Also check contrast of CB-simulated colors against white */
    const protan = applyCBMatrix(CB_MATRICES.protanopia, rgb.r, rgb.g, rgb.b);
    const deutan = applyCBMatrix(CB_MATRICES.deuteranopia, rgb.r, rgb.g, rgb.b);
    const tritan = applyCBMatrix(CB_MATRICES.tritanopia, rgb.r, rgb.g, rgb.b);
    const achroma = applyCBMatrix(CB_MATRICES.achromatopsia, rgb.r, rgb.g, rgb.b);

    const ratioProtanWhite = contrastRatio(protan, white);
    const ratioDeutanWhite = contrastRatio(deutan, white);
    const ratioTritanWhite = contrastRatio(tritan, white);
    const ratioAchromaWhite = contrastRatio(achroma, white);

    const checks = [
      { label: 'vs White', ratio: ratioWhite, bg: hex },
      { label: 'vs Black', ratio: ratioBlack, bg: hex },
      { label: 'Protan. vs W', ratio: ratioProtanWhite, bg: rgbToHex(protan.r, protan.g, protan.b) },
      { label: 'Deutan. vs W', ratio: ratioDeutanWhite, bg: rgbToHex(deutan.r, deutan.g, deutan.b) },
      { label: 'Tritan. vs W', ratio: ratioTritanWhite, bg: rgbToHex(tritan.r, tritan.g, tritan.b) },
      { label: 'Achrom. vs W', ratio: ratioAchromaWhite, bg: rgbToHex(achroma.r, achroma.g, achroma.b) }
    ];

    cbContrastGrid.innerHTML = '';
    checks.forEach(check => {
      const row = document.createElement('div');
      row.className = 'cb-contrast-row';

      const label = document.createElement('span');
      label.className = 'cb-contrast-label';
      label.textContent = check.label;

      const preview = document.createElement('div');
      preview.className = 'cb-contrast-preview';
      const swatch = document.createElement('div');
      swatch.className = 'cb-contrast-preview-swatch';
      swatch.style.background = check.bg;
      preview.appendChild(swatch);

      const ratioSpan = document.createElement('span');
      ratioSpan.className = 'cb-contrast-ratio';
      ratioSpan.textContent = check.ratio.toFixed(2) + ':1';

      const rating = wcagRating(check.ratio);
      const badge = document.createElement('span');
      badge.className = 'cb-contrast-badge ' + rating.className;
      badge.textContent = rating.label;

      row.appendChild(label);
      row.appendChild(preview);
      row.appendChild(ratioSpan);
      row.appendChild(badge);
      cbContrastGrid.appendChild(row);
    });
  }

  /** Update color blindness simulation for a single color */
  function updateCBColor(hex) {
    const rgb = hexToRgb(hex);
    cbColorHex.textContent = hex.toUpperCase();

    /* Original */
    cbOrigSwatch.style.background = hex;
    cbOrigLabel.textContent = `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`;

    /* Protanopia */
    const protan = applyCBMatrix(CB_MATRICES.protanopia, rgb.r, rgb.g, rgb.b);
    const protanHex = rgbToHex(protan.r, protan.g, protan.b);
    cbProtanSwatch.style.background = protanHex;
    cbProtanLabel.textContent = `RGB(${protan.r}, ${protan.g}, ${protan.b})`;

    /* Deuteranopia */
    const deutan = applyCBMatrix(CB_MATRICES.deuteranopia, rgb.r, rgb.g, rgb.b);
    const deutanHex = rgbToHex(deutan.r, deutan.g, deutan.b);
    cbDeutanSwatch.style.background = deutanHex;
    cbDeutanLabel.textContent = `RGB(${deutan.r}, ${deutan.g}, ${deutan.b})`;

    /* Tritanopia */
    const tritan = applyCBMatrix(CB_MATRICES.tritanopia, rgb.r, rgb.g, rgb.b);
    const tritanHex = rgbToHex(tritan.r, tritan.g, tritan.b);
    cbTritanSwatch.style.background = tritanHex;
    cbTritanLabel.textContent = `RGB(${tritan.r}, ${tritan.g}, ${tritan.b})`;

    /* Achromatopsia */
    const achroma = applyCBMatrix(CB_MATRICES.achromatopsia, rgb.r, rgb.g, rgb.b);
    const achromaHex = rgbToHex(achroma.r, achroma.g, achroma.b);
    cbAchromaSwatch.style.background = achromaHex;
    cbAchromaLabel.textContent = `RGB(${achroma.r}, ${achroma.g}, ${achroma.b})`;

    /* Update contrast checker */
    updateContrastChecker(hex);
  }

  cbColorInput.addEventListener('input', (e) => {
    updateCBColor(e.target.value);
  });

  /* Initialize color blindness color mode */
  updateCBColor('#007AFF');

  /* ---- Image Upload Mode ---- */
  const cbImageFile = document.getElementById('cb-image-file');
  const canvasOrig = document.getElementById('cb-canvas-orig');
  const canvasProtan = document.getElementById('cb-canvas-protan');
  const canvasDeutan = document.getElementById('cb-canvas-deutan');
  const canvasTritan = document.getElementById('cb-canvas-tritan');
  const canvasAchroma = document.getElementById('cb-canvas-achroma');
  const ctxOrig = canvasOrig.getContext('2d');
  const ctxProtan = canvasProtan.getContext('2d');
  const ctxDeutan = canvasDeutan.getContext('2d');
  const ctxTritan = canvasTritan.getContext('2d');
  const ctxAchroma = canvasAchroma.getContext('2d');

  /**
   * Process an uploaded image through all CB simulations
   */
  function processImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 400;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          const scale = MAX_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        [canvasOrig, canvasProtan, canvasDeutan, canvasTritan, canvasAchroma].forEach(c => {
          c.width = w;
          c.height = h;
        });

        ctxOrig.drawImage(img, 0, 0, w, h);
        const imageData = ctxOrig.getImageData(0, 0, w, h);
        const pixels = imageData.data;

        const protanData = ctxProtan.createImageData(w, h);
        const deutanData = ctxDeutan.createImageData(w, h);
        const tritanData = ctxTritan.createImageData(w, h);
        const achromaData = ctxAchroma.createImageData(w, h);

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          const p = applyCBMatrix(CB_MATRICES.protanopia, r, g, b);
          protanData.data[i]     = p.r;
          protanData.data[i + 1] = p.g;
          protanData.data[i + 2] = p.b;
          protanData.data[i + 3] = a;

          const d = applyCBMatrix(CB_MATRICES.deuteranopia, r, g, b);
          deutanData.data[i]     = d.r;
          deutanData.data[i + 1] = d.g;
          deutanData.data[i + 2] = d.b;
          deutanData.data[i + 3] = a;

          const t = applyCBMatrix(CB_MATRICES.tritanopia, r, g, b);
          tritanData.data[i]     = t.r;
          tritanData.data[i + 1] = t.g;
          tritanData.data[i + 2] = t.b;
          tritanData.data[i + 3] = a;

          const ac = applyCBMatrix(CB_MATRICES.achromatopsia, r, g, b);
          achromaData.data[i]     = ac.r;
          achromaData.data[i + 1] = ac.g;
          achromaData.data[i + 2] = ac.b;
          achromaData.data[i + 3] = a;
        }

        ctxProtan.putImageData(protanData, 0, 0);
        ctxDeutan.putImageData(deutanData, 0, 0);
        ctxTritan.putImageData(tritanData, 0, 0);
        ctxAchroma.putImageData(achromaData, 0, 0);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  cbImageFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      processImage(file);
    }
  });

  /* ==========================================================
     KEYBOARD SHORTCUT: Space to regenerate palette
     ========================================================== */
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.getElementById('palette-gen').classList.contains('active')) {
      const activeEl = document.activeElement;
      if (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA') {
        e.preventDefault();
        generatePalette();
      }
    }
  });

}); /* end DOMContentLoaded */
