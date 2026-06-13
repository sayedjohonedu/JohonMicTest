'use strict';

/* ─────────────────────────────────────────────
   OPTIONS BAR AUTO-HIDE INTERACTION LOGIC STATE
   ───────────────────────────────────────────── */
let isToolbarHovered = false;
let isOptionsBarHovered = false;
let isDraggingSlider = false;

function updateOptionsBarVisibility() {
  const optionsBar = document.getElementById('options-bar');
  if (!optionsBar) return;

  // Check if any dynamic slider group is visible
  let hasVisibleSliders = false;
  const groups = ['stroke-group', 'blur-group', 'number-group', 'text-group', 'spotlight-group'];
  for (const id of groups) {
    const el = document.getElementById(id);
    if (el && el.style.display !== 'none') {
      hasVisibleSliders = true;
      break;
    }
  }

  // Check if font picker dropdown is open
  const fontDropdown = document.getElementById('font-picker-dropdown');
  const fontDropdownOpen = fontDropdown && fontDropdown.classList.contains('open');

  // Show if there is at least one active slider group AND user is interacting
  const show = hasVisibleSliders && (
    isToolbarHovered ||
    isOptionsBarHovered ||
    fontDropdownOpen ||
    isDraggingSlider
  );

  if (show) {
    optionsBar.classList.add('visible');
  } else {
    optionsBar.classList.remove('visible');
  }
}

/* ─────────────────────────────────────────────
   ACTIVE TOOL HUD CONFIGURATION
   ───────────────────────────────────────────── */
const TOOL_INFO = {
  select: { name: 'Select / Move', key: 'V' },
  crop: { name: 'Crop Image', key: '' },
  rect: { name: 'Rectangle Outline', key: 'R' },
  fillrect: { name: 'Filled Rectangle', key: 'B' },
  squarehighlight: { name: 'Highlighted Box', key: 'Q' },
  circle: { name: 'Circle Outline', key: 'C' },
  line: { name: 'Straight Line', key: 'L' },
  arrow: { name: 'Arrow', key: 'A' },
  text: { name: 'Add Text', key: 'T' },
  number: { name: 'Number Badge', key: 'N' },
  blur: { name: 'Rectangle Blur', key: 'U' },
  circleblur: { name: 'Circular Blur', key: 'J' },
  spotlight: { name: 'Spotlight Box', key: 'S' },
  circlespotlight: { name: 'Circular Spotlight', key: 'G' },
  freehand: { name: 'Freehand Pen', key: 'F' },
  highlighter: { name: 'Text Highlighter', key: 'H' },
  eraser: { name: 'Eraser', key: 'E' }
};

function updateHud(toolName) {
  const titleEl = document.getElementById('hud-mode-title');
  const shortcutEl = document.getElementById('hud-mode-shortcut');
  if (!titleEl || !shortcutEl) return;

  const info = TOOL_INFO[toolName] || { name: toolName, key: '' };
  titleEl.textContent = info.name;
  if (info.key) {
    shortcutEl.textContent = info.key;
    shortcutEl.style.display = 'inline';
  } else {
    shortcutEl.textContent = '';
    shortcutEl.style.display = 'none';
  }
}

/* ── Persist last-used substyles in localStorage ── */
const SUBSTYLE_KEY = 'mictab-lens-substyles';

function loadSubstyles() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUBSTYLE_KEY));
    if (saved) {
      if (saved.arrow)  arrowStyle = saved.arrow;
      if (saved.text)   textStyle  = saved.text;
      if (saved.blur)   blurStyle  = saved.blur;
      if (saved.font)   textFont   = saved.font;
    }
  } catch {}
}

function saveSubstyles() {
  try {
    localStorage.setItem(SUBSTYLE_KEY, JSON.stringify({
      arrow: arrowStyle,
      text:  textStyle,
      blur:  blurStyle,
      font:  textFont,
    }));
  } catch {}
}

// Load last-used substyles on startup & mark the correct sub-items active
loadSubstyles();
(function syncSubMenuUI() {
  const mapping = {
    'arrow-dropdown':       arrowStyle,
    'text-dropdown':        textStyle,
    'blur-dropdown':        blurStyle,
    'circleblur-dropdown':  blurStyle,  // shares the same blurStyle state
  };
  for (const [menuId, style] of Object.entries(mapping)) {
    const menu = document.getElementById(menuId);
    if (!menu) continue;
    menu.querySelectorAll('.sub-item').forEach(item => {
      item.classList.toggle('active', item.dataset.substyle === style);
    });
  }
  // Initialize tool selection based on localStorage
  selectTool(currentTool);
})();

/* ─────────────────────────────────────────────
   FONT PICKER — System Font Detection + UI
   ───────────────────────────────────────────── */

// Curated list of fonts to probe
const PROBE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Raleway',
  'Poppins', 'Nunito', 'Playfair Display', 'Merriweather', 'Source Sans Pro',
  'Ubuntu', 'Oswald', 'Noto Sans', 'Fira Sans', 'Work Sans',
  'San Francisco', '-apple-system', 'SF Pro Display', 'SF Pro Text',
  'Helvetica Neue', 'Helvetica', 'Arial',
  'Georgia', 'Times New Roman', 'Palatino', 'Garamond',
  'Futura', 'Gill Sans', 'Optima', 'Baskerville', 'Didot',
  'American Typewriter', 'Chalkboard SE', 'Marker Felt',
  'Copperplate', 'Papyrus', 'Comic Sans MS',
  'Segoe UI', 'Calibri', 'Cambria', 'Corbel', 'Consolas',
  'Tahoma', 'Verdana', 'Trebuchet MS', 'Impact', 'Franklin Gothic',
  'SF Mono', 'Fira Code', 'JetBrains Mono', 'Source Code Pro',
  'Courier New', 'Monaco', 'Menlo', 'Inconsolata', 'Cascadia Code',
  'Avenir', 'Avenir Next', 'Proxima Nova', 'Brandon Grotesque',
  'DIN Condensed', 'Rockwell', 'Bodoni 72', 'Hoefler Text',
];

const TEST_STRING = 'mmmmmmmmmmlli';
let detectedFonts = [];

function detectSystemFonts() {
  const canvas = document.createElement('canvas');
  canvas.width = 400; canvas.height = 40;
  const ctx = canvas.getContext('2d');
  const baseline = 'monospace';

  function measureWidth(font) {
    ctx.font = `16px ${font}, ${baseline}`;
    return ctx.measureText(TEST_STRING).width;
  }

  const baselineW = measureWidth(baseline);
  const available = [];
  for (const font of PROBE_FONTS) {
    const w = measureWidth(`"${font}"`);
    if (w !== baselineW) {
      available.push(font);
    }
  }

  if (!available.includes('Inter')) available.unshift('Inter');
  return available;
}

function syncFontPickerLabel(fontName) {
  const label = document.getElementById('font-picker-label');
  if (label) label.textContent = fontName;
  document.querySelectorAll('.font-item').forEach(item => {
    item.classList.toggle('active', item.dataset.font === fontName);
  });
}

function buildFontList(fonts) {
  const list = document.getElementById('font-picker-list');
  if (!list) return;
  list.innerHTML = '';
  for (const font of fonts) {
    const btn = document.createElement('button');
    btn.className = 'font-item';
    btn.dataset.font = font;
    btn.title = font;
    btn.innerHTML = `
      <span class="font-preview" style="font-family: '${font}', Inter, sans-serif;">Aa</span>
      <span class="font-name-label">${font}</span>
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      textFont = font;
      syncFontPickerLabel(font);
      saveSubstyles();
      localStorage.setItem('lens-text-font', font);
      if (textInputEl && typeof textInputEl._liveUpdateFont === 'function') {
        textInputEl._liveUpdateFont(font);
      }
      if (selectedIdx >= 0 && annotations[selectedIdx].type === 'text') {
        annotations[selectedIdx].fontFamily = font;
        redraw();
        window.lensEditor.markDirty();
      }
      closeFontPicker();
    });
    list.appendChild(btn);
  }
}

function openFontPicker() {
  const trigger = document.getElementById('font-picker-trigger');
  const dropdown = document.getElementById('font-picker-dropdown');
  if (!trigger || !dropdown) return;

  const rect = trigger.getBoundingClientRect();
  dropdown.style.top  = (rect.bottom + 4) + 'px';
  dropdown.style.left = Math.min(rect.left, window.innerWidth - 208 - 8) + 'px';
  dropdown.classList.add('open');
  trigger.classList.add('open');
  updateOptionsBarVisibility();

  const search = document.getElementById('font-search');
  if (search) { search.value = ''; search.focus(); filterFontList(''); }

  setTimeout(() => {
    const active = document.querySelector('.font-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, 50);
}

function closeFontPicker() {
  const trigger = document.getElementById('font-picker-trigger');
  const dropdown = document.getElementById('font-picker-dropdown');
  if (trigger) trigger.classList.remove('open');
  if (dropdown) dropdown.classList.remove('open');
  updateOptionsBarVisibility();
}

function filterFontList(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.font-item').forEach(item => {
    const match = !q || item.dataset.font.toLowerCase().includes(q);
    item.style.display = match ? '' : 'none';
  });
}

// Initialize font picker
detectedFonts = detectSystemFonts();
buildFontList(detectedFonts);
syncFontPickerLabel(textFont);

const fontPickerTrigger  = document.getElementById('font-picker-trigger');
const fontPickerDropdown = document.getElementById('font-picker-dropdown');
const fontSearch         = document.getElementById('font-search');

if (fontPickerTrigger) {
  fontPickerTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = fontPickerDropdown && fontPickerDropdown.classList.contains('open');
    if (isOpen) closeFontPicker();
    else openFontPicker();
  });
}

if (fontSearch) {
  let _fontSearchTimer = null;
  fontSearch.addEventListener('input', () => {
    clearTimeout(_fontSearchTimer);
    _fontSearchTimer = setTimeout(() => filterFontList(fontSearch.value), 250);
  });
  fontSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFontPicker();
    e.stopPropagation();
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#font-picker-wrap')) closeFontPicker();
});


function selectTool(toolName) {
  currentTool = toolName;
  localStorage.setItem('lens-current-tool', toolName);
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`[data-tool="${toolName}"]`);
  if (btn) btn.classList.add('active');

  const toolVal = toolStrokes[toolName] ?? DEFAULT_TOOL_STROKES[toolName] ?? 3;
  currentStroke = toolVal * displayScale;
  const strokeSliderEl = document.getElementById('stroke-width');
  const strokeValEl    = document.getElementById('stroke-value');
  if (strokeSliderEl) strokeSliderEl.value = toolVal;
  if (strokeValEl)    strokeValEl.textContent = toolVal + 'px';

  const cropActions = document.getElementById('crop-actions');
  if (toolName === 'crop') {
    if (!cropBox) {
      cropBox = { x: 0, y: 0, w: drawCanvas.width, h: drawCanvas.height };
      cropAvgColor = computeAverageColor();
    }
    if (cropActions) cropActions.style.display = 'flex';
  } else {
    if (cropActions) cropActions.style.display = 'none';
  }
  
  updateContextSliders();
  if (currentTool === 'select') drawCanvas.style.cursor = 'default';
  else if (currentTool === 'crop') drawCanvas.style.cursor = 'crosshair';
  else if (currentTool === 'text') drawCanvas.style.cursor = 'text';
  else if (currentTool === 'number') drawCanvas.style.cursor = 'copy';
  else if (currentTool === 'eraser') drawCanvas.style.cursor = 'not-allowed';
  else drawCanvas.style.cursor = 'crosshair';
  
  updateHud(toolName);
  redraw();
}

document.getElementById('drawing-tools').addEventListener('click', (e) => {
  if (e.target.closest('.sub-item')) return;

  const btn = e.target.closest('[data-tool]');
  if (!btn) return;
  const toolName = btn.dataset.tool;
  const dropdownId = btn.dataset.dropdown;

  if (dropdownId) {
    if (currentTool === toolName) {
      const menu = document.getElementById(dropdownId);
      const wrap = btn.closest('.tool-dropdown-wrap');
      const isOpen = menu && menu.classList.contains('open');
      document.querySelectorAll('.tool-sub-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.tool-dropdown-wrap.open').forEach(w => w.classList.remove('open'));
      if (!isOpen && menu && wrap) {
        positionMenu(menu, btn);
        menu.classList.add('open');
        wrap.classList.add('open');
      }
    } else {
      document.querySelectorAll('.tool-sub-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.tool-dropdown-wrap.open').forEach(w => w.classList.remove('open'));
      selectTool(toolName);
    }
  } else {
    document.querySelectorAll('.tool-sub-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.tool-dropdown-wrap.open').forEach(w => w.classList.remove('open'));
    selectTool(toolName);
  }
});

function positionMenu(menu, triggerBtn) {
  const rect = triggerBtn.getBoundingClientRect();
  const menuW = 150;
  const top  = rect.bottom + 4;
  const left = Math.min(rect.left, window.innerWidth - menuW - 8);
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';
}

// Blur intensity slider
const blurSlider = document.getElementById('blur-intensity');
if (blurSlider) {
  blurSlider.value = blurIntensity;
  const valEl = document.getElementById('blur-value');
  if (valEl) valEl.textContent = blurIntensity + 'px';
  blurSlider.addEventListener('input', (e) => {
    blurIntensity = parseInt(e.target.value, 10);
    localStorage.setItem('lens-blur-intensity', blurIntensity);
    const vEl = document.getElementById('blur-value');
    if (vEl) vEl.textContent = blurIntensity + 'px';
    if (selectedIdx >= 0 && (annotations[selectedIdx].type === 'blur' || annotations[selectedIdx].type === 'circleblur')) {
      annotations[selectedIdx].blurSize = blurIntensity;
      redraw();
      window.lensEditor.markDirty();
    }
  });
}

// Number size slider
const numSizeSlider = document.getElementById('number-size');
if (numSizeSlider) {
  numSizeSlider.value = numberRadius;
  const valEl = document.getElementById('number-size-value');
  if (valEl) valEl.textContent = numberRadius;
  numSizeSlider.addEventListener('input', (e) => {
    numberRadius = parseInt(e.target.value, 10);
    localStorage.setItem('lens-number-radius', numberRadius);
    const vEl = document.getElementById('number-size-value');
    if (vEl) vEl.textContent = numberRadius;
    if (selectedIdx >= 0 && annotations[selectedIdx].type === 'number') {
      annotations[selectedIdx].radius = Math.round(numberRadius * displayScale);
      redraw();
      window.lensEditor.markDirty();
    }
  });
}

// Text size slider
const textSizeSlider = document.getElementById('text-size');
if (textSizeSlider) {
  textSizeSlider.value = textFontSize;
  const valEl = document.getElementById('text-size-value');
  if (valEl) valEl.textContent = textFontSize + 'pt';
  textSizeSlider.addEventListener('input', (e) => {
    textFontSize = parseInt(e.target.value, 10);
    localStorage.setItem('lens-text-size', textFontSize);
    const vEl = document.getElementById('text-size-value');
    if (vEl) vEl.textContent = textFontSize + 'pt';
    if (selectedIdx >= 0 && annotations[selectedIdx].type === 'text') {
      annotations[selectedIdx].fontSize = Math.round(textFontSize * displayScale);
      redraw();
      window.lensEditor.markDirty();
    }
  });
}

const textGlowSlider = document.getElementById('text-glow');
if (textGlowSlider) {
  textGlowSlider.value = textGlowSize;
  const valEl = document.getElementById('text-glow-value');
  if (valEl) valEl.textContent = textGlowSize + 'px';
  textGlowSlider.addEventListener('input', (e) => {
    textGlowSize = parseInt(e.target.value, 10);
    localStorage.setItem('lens-text-glow', textGlowSize);
    const vEl = document.getElementById('text-glow-value');
    if (vEl) vEl.textContent = textGlowSize + 'px';
    if (selectedIdx >= 0 && annotations[selectedIdx].type === 'text') {
      annotations[selectedIdx].glowSize = Math.round(textGlowSize * displayScale);
      redraw();
      window.lensEditor.markDirty();
    }
  });
}

const textBoxOpacitySlider = document.getElementById('text-box-opacity');
if (textBoxOpacitySlider) {
  textBoxOpacitySlider.value = textBoxOpacity;
  const valEl = document.getElementById('text-box-opacity-value');
  if (valEl) valEl.textContent = textBoxOpacity + '%';
  textBoxOpacitySlider.addEventListener('input', (e) => {
    textBoxOpacity = parseInt(e.target.value, 10);
    localStorage.setItem('lens-text-box-opacity', textBoxOpacity);
    const vEl = document.getElementById('text-box-opacity-value');
    if (vEl) vEl.textContent = textBoxOpacity + '%';
    if (selectedIdx >= 0 && annotations[selectedIdx].type === 'text') {
      annotations[selectedIdx].boxOpacity = textBoxOpacity;
      redraw();
      window.lensEditor.markDirty();
    }
  });
}

/* ── Sub-menu item selection ── */
document.querySelectorAll('.tool-sub-menu').forEach(menu => {
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.sub-item');
    if (!item) return;
    e.stopPropagation();
    const style = item.dataset.substyle;
    menu.querySelectorAll('.sub-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    if (menu.id === 'arrow-dropdown') {
      arrowStyle = style;
      if (selectedIdx >= 0 && annotations[selectedIdx].type === 'arrow') {
        annotations[selectedIdx].arrowStyle = style;
      }
    } else if (menu.id === 'text-dropdown') {
      textStyle = style;
      if (selectedIdx >= 0 && annotations[selectedIdx].type === 'text') {
        annotations[selectedIdx].textStyle = style;
      }
      const isBox = textStyle === 'box';
      document.querySelectorAll('.box-opacity-label, .box-opacity-slider, .box-opacity-value').forEach(el => el.style.display = isBox ? 'inline-block' : 'none');
    } else if (menu.id === 'blur-dropdown' || menu.id === 'circleblur-dropdown') {
      blurStyle = style;
      if (selectedIdx >= 0 && (annotations[selectedIdx].type === 'blur' || annotations[selectedIdx].type === 'circleblur')) {
        annotations[selectedIdx].blurStyle = style;
      }
      ['blur-dropdown', 'circleblur-dropdown'].forEach(id => {
        const otherMenu = document.getElementById(id);
        if (otherMenu && otherMenu !== menu) {
          otherMenu.querySelectorAll('.sub-item').forEach(i => i.classList.remove('active'));
          const match = otherMenu.querySelector(`[data-substyle="${style}"]`);
          if (match) match.classList.add('active');
        }
      });
    }
    
    if (selectedIdx >= 0) {
      redraw();
      window.lensEditor.markDirty();
    }
    
    saveSubstyles();
    menu.classList.remove('open');
    const wrap = menu.closest('.tool-dropdown-wrap');
    if (wrap) wrap.classList.remove('open');
    const toolBtn = wrap ? wrap.querySelector('[data-tool]') : null;
    if (toolBtn) selectTool(toolBtn.dataset.tool);
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.tool-dropdown-wrap')) {
    document.querySelectorAll('.tool-sub-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.tool-dropdown-wrap.open').forEach(w => w.classList.remove('open'));
  }
});

/* ── Color Picker Collapsible Dropdown ── */
const colorTrigger  = document.getElementById('color-trigger');
const colorDropdown = document.getElementById('color-dropdown');
const colorPickerWrap = document.getElementById('color-picker');

function updateColorTrigger() {
  if (colorTrigger) colorTrigger.style.background = currentColor;
}
updateColorTrigger();

if (colorTrigger) {
  colorTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = colorDropdown.classList.contains('open');
    bgDropdown.classList.remove('open');
    if (isOpen) {
      colorDropdown.classList.remove('open');
    } else {
      const rect = colorTrigger.getBoundingClientRect();
      const dropW = 190;
      let left = rect.left + rect.width / 2 - dropW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - dropW - 8));
      colorDropdown.style.top  = (rect.bottom + 6) + 'px';
      colorDropdown.style.left = left + 'px';
      colorDropdown.classList.add('open');
    }
  });
}

document.addEventListener('click', (e) => {
  if (colorTrigger && colorDropdown && !colorTrigger.contains(e.target) && !colorDropdown.contains(e.target)) {
    colorDropdown.classList.remove('open');
  }
  if (bgTrigger && bgDropdown && !bgTrigger.contains(e.target) && !bgDropdown.contains(e.target)) {
    bgDropdown.classList.remove('open');
  }
});

colorDropdown.addEventListener('click', (e) => {
  const dot = e.target.closest('.color-dot');
  if (!dot) return;
  currentColor = dot.dataset.color;
  document.querySelectorAll('#color-dropdown .color-dot').forEach(d => d.classList.remove('active'));
  dot.classList.add('active');
  updateColorTrigger();
  if (selectedIdx >= 0) {
    annotations[selectedIdx].color = currentColor;
    redraw();
    window.lensEditor.markDirty();
  }
});

const customColorInput = document.getElementById('custom-color-input');
if (customColorInput) {
  customColorInput.addEventListener('input', (e) => {
    currentColor = e.target.value;
    document.querySelectorAll('#color-dropdown .color-dot').forEach(d => d.classList.remove('active'));
    updateColorTrigger();
    if (selectedIdx >= 0) {
      annotations[selectedIdx].color = currentColor;
      redraw();
      window.lensEditor.markDirty();
    }
  });
  customColorInput.addEventListener('change', (e) => {
    const color = e.target.value;
    currentColor = color;
    recentColors = recentColors.filter(c => c !== color);
    recentColors.unshift(color);
    if (recentColors.length > 3) recentColors.pop();
    renderRecentColors();
    updateColorTrigger();
  });
}

function renderRecentColors() {
  const container = document.getElementById('recent-colors');
  if (!container) return;
  container.innerHTML = '';
  for (const c of recentColors) {
    const dot = document.createElement('div');
    dot.className = 'color-dot' + (c === currentColor ? ' active' : '');
    dot.dataset.color = c;
    dot.style.background = c;
    container.appendChild(dot);
  }
}

/* ─────────────────────────────────────────────
   BACKGROUND IMAGE SYSTEM
   ───────────────────────────────────────────── */

const bgTrigger    = document.getElementById('bg-trigger');
const bgDropdown   = document.getElementById('bg-dropdown');
const bgControlsWrap = document.getElementById('bg-controls');
const bgToggle     = document.getElementById('bg-toggle');
const bgToggleLabel = document.getElementById('bg-toggle-label');
const bgBlurSlider = document.getElementById('bg-blur-slider');
const bgBlurValue  = document.getElementById('bg-blur-value');
const bgLayer      = document.getElementById('canvas-bg-layer');

(function loadBgThumbs() {
  document.querySelectorAll('.bg-thumb[data-bg="image"]').forEach(thumb => {
    const src = thumb.dataset.src;
    if (src) thumb.style.backgroundImage = `url(${src})`;
  });
})();

if (bgTrigger) {
  bgTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = bgDropdown.classList.contains('open');
    colorDropdown.classList.remove('open');
    if (isOpen) {
      bgDropdown.classList.remove('open');
    } else {
      const rect = bgTrigger.getBoundingClientRect();
      const dropW = 260;
      let left = rect.left + rect.width / 2 - dropW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - dropW - 8));
      bgDropdown.style.top  = (rect.bottom + 6) + 'px';
      bgDropdown.style.left = left + 'px';
      bgDropdown.classList.add('open');
    }
  });
}

if (bgToggle) {
  bgToggle.addEventListener('click', () => {
    bgEnabled = !bgEnabled;
    bgToggle.classList.toggle('on', bgEnabled);
    bgToggleLabel.textContent = bgEnabled ? 'On' : 'Off';
    bgTrigger.classList.toggle('active', bgEnabled);
    const padRow = document.getElementById('bg-padding-row');
    if (padRow) padRow.style.display = bgEnabled ? 'flex' : 'none';
    applyBackground();
  });
}

function encodeWallpaperPath(rawPath) {
  const lastSlash = rawPath.lastIndexOf('/');
  if (lastSlash === -1) return encodeURIComponent(rawPath);
  const dir  = rawPath.slice(0, lastSlash + 1);
  const file = rawPath.slice(lastSlash + 1);
  return dir + encodeURIComponent(file);
}

const ALL_WALLPAPERS = [
  "6ffdbef4-5949-42e1-bef0-826ed3a080dd.jpg", "Abstract Shapes 2.jpg", "Abstract Shapes.jpg", 
  "Chroma 1.jpg", "Chroma 2.jpg", "El Capitan.jpg", "High Sierra.jpg", "Milky Way.jpg", 
  "Mojave Day.jpg", "Mojave Night.jpg", "Poppies.jpg", "Sierra 2.jpg", "Sierra.jpg", 
  "Snow.jpg", "Yosemite.jpg", "adam-kool-ndN00KmbJ1c-unsplash.jpg", 
  "andreas-gucklhorn-mawU2PoJWfU-unsplash.jpg", "armennano-gerbera-4712871_1920.jpg", 
  "aszak-sunrise-9750192_1920.jpg", "e54c05da-7844-47cf-9581-2f56f4378f4e.jpg", 
  "himmelstraeume-flower-7543035_1920.jpg", "inspiredimages-pencils-452238_1920.jpg", 
  "macos-big-sur-abstract-grey-colour-5k-bx (1).jpg", "medienservice-texture-2917553_1920.jpg", 
  "milad-fakurian-E8Ufcyxz514-unsplash.jpg", "milad-fakurian-seA-FPPXL-M-unsplash.jpg", 
  "pexels-simon73-1323550.jpg", "richard-horvath-_nWaeTF6qo0-unsplash.jpg", 
  "waldrebell-trees-5899195_1920.jpg"
];

function shuffleWallpapers() {
  const grid = document.getElementById('bg-wallpaper-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const shuffled = [...ALL_WALLPAPERS].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 12);
  
  selected.forEach(file => {
    const div = document.createElement('div');
    div.className = 'bg-thumb';
    const src = `../assets/walpaper/${file}`;
    const encodedSrc = encodeWallpaperPath(src);
    if (bgType === 'image' && bgValue === src) {
      div.classList.add('active');
    }
    div.dataset.bg = 'image';
    div.dataset.src = src;
    div.style.backgroundImage = `url("${encodedSrc}")`;
    grid.appendChild(div);
  });
}

shuffleWallpapers();
document.addEventListener('DOMContentLoaded', () => {
  shuffleWallpapers();

  // Bind hover listeners to all tool buttons for the Active Tool HUD preview
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      const toolName = btn.dataset.tool;
      updateHud(toolName);
    });
    btn.addEventListener('mouseleave', () => {
      updateHud(currentTool);
    });
  });

  const borderBox = document.getElementById('crop-border-box');
  if (borderBox) {
    borderBox.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.classList.contains('crop-handle')) return;

      e.stopPropagation();
      e.preventDefault();
      const p = getPos(e);
      isDraggingHandle = true;
      activeHandle = 'move';
      dragOffsetX = p.x;
      dragOffsetY = p.y;
    });
  }

  document.querySelectorAll('.crop-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const p = getPos(e);
      isDraggingHandle = true;
      activeHandle = handle.dataset.handle;
      dragOffsetX = p.x;
      dragOffsetY = p.y;
    });
  });
});

const shuffleBtn = document.getElementById('bg-shuffle-btn');
if (shuffleBtn) {
  shuffleBtn.addEventListener('click', shuffleWallpapers);
}

const wallpaperGrid = document.getElementById('bg-wallpaper-grid');
if (wallpaperGrid) {
  wallpaperGrid.addEventListener('click', (e) => {
    const thumb = e.target.closest('.bg-thumb');
    if (!thumb) return;

    document.querySelectorAll('.bg-thumb').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.bg-history-thumb').forEach(t => t.classList.remove('active'));
    thumb.classList.add('active');

    bgType = 'image';
    bgValue = thumb.dataset.src;
    
    const img = new Image();
    img.onload = () => { bgImageObj = img; if (bgEnabled) applyBackground(); };
    img.src = encodeWallpaperPath(bgValue);

    if (!bgEnabled) {
      bgEnabled = true;
      bgToggle.classList.add('on');
      bgToggleLabel.textContent = 'On';
      bgTrigger.classList.add('active');
    }
    applyBackground();
  });
}

const bgUploadInput = document.getElementById('bg-upload-input');
if (bgUploadInput) {
  bgUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      customBgDataUrl = ev.target.result;
      addToBgUploadHistory(customBgDataUrl);
      bgType = 'image';
      bgValue = customBgDataUrl;
      const img = new Image();
      img.onload = () => {
        bgImageObj = img;
        if (!bgEnabled) {
          bgEnabled = true;
          bgToggle.classList.add('on');
          bgToggleLabel.textContent = 'On';
          bgTrigger.classList.add('active');
        }
        document.querySelectorAll('.bg-thumb').forEach(t => t.classList.remove('active'));
        applyBackground();
      };
      img.src = customBgDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
}

function generateRandomGradientString() {
  const isDark = Math.random() > 0.5;
  const h1 = Math.floor(Math.random() * 360);
  const h2 = (h1 + 30 + Math.random() * 60) % 360; 
  
  let s1, s2, l1, l2;
  if (isDark) {
    s1 = 50 + Math.random() * 30;
    s2 = 50 + Math.random() * 30;
    l1 = 15 + Math.random() * 15;
    l2 = 15 + Math.random() * 15;
  } else {
    s1 = 70 + Math.random() * 30;
    s2 = 70 + Math.random() * 30;
    l1 = 60 + Math.random() * 20;
    l2 = 60 + Math.random() * 20;
  }
  
  function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  const hex1 = hslToHex(h1, s1, l1);
  const hex2 = hslToHex(h2, s2, l2);
  const angle = Math.floor(Math.random() * 360);
  return `linear-gradient(${angle}deg, ${hex1} 0%, ${hex2} 100%)`;
}

const bgRandomBtn = document.getElementById('bg-random-btn');
if (bgRandomBtn) {
  bgRandomBtn.addEventListener('click', () => {
    const gradStr = generateRandomGradientString();
    customBgDataUrl = gradStr;
    addToBgGradientHistory(gradStr);
    
    bgType = 'gradient';
    bgValue = gradStr;
    
    if (!bgEnabled) {
      bgEnabled = true;
      const tgl = document.getElementById('bg-toggle');
      const tglLbl = document.getElementById('bg-toggle-label');
      if (tgl) tgl.classList.add('on');
      if (tglLbl) tglLbl.textContent = 'On';
      const trg = document.getElementById('bg-trigger');
      if (trg) trg.classList.add('active');
    }
    
    document.querySelectorAll('.bg-thumb').forEach(t => t.classList.remove('active'));
    setTimeout(() => {
      const grid = document.getElementById('bg-history-grid');
      if (grid) {
        grid.querySelectorAll('.bg-history-thumb').forEach(t => t.classList.remove('active'));
        const first = grid.querySelector('.bg-history-thumb');
        if (first) first.classList.add('active');
      }
    }, 50);
    applyBackground();
  });
}

const BG_GRADIENT_HISTORY_KEY = 'mictab-bg-grad-history';
const BG_UPLOAD_HISTORY_KEY = 'mictab-bg-upload-history';
const BG_HISTORY_MAX = 6;

function loadBgHistory(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function saveBgHistoryList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { console.warn('localStorage save failed:', e); }
}

function addToBgGradientHistory(dataUrl) {
  const list = loadBgHistory(BG_GRADIENT_HISTORY_KEY);
  if (list.includes(dataUrl)) return;
  list.unshift(dataUrl);
  while (list.length > BG_HISTORY_MAX) list.pop();
  saveBgHistoryList(BG_GRADIENT_HISTORY_KEY, list);
  renderBgGradientHistory();
}

function addToBgUploadHistory(dataUrl) {
  const list = loadBgHistory(BG_UPLOAD_HISTORY_KEY);
  if (list.includes(dataUrl)) return;
  list.unshift(dataUrl);
  while (list.length > BG_HISTORY_MAX) list.pop();
  saveBgHistoryList(BG_UPLOAD_HISTORY_KEY, list);
  renderBgUploadHistory();
}

function removeFromBgGradientHistory(idx) {
  const list = loadBgHistory(BG_GRADIENT_HISTORY_KEY);
  list.splice(idx, 1);
  saveBgHistoryList(BG_GRADIENT_HISTORY_KEY, list);
  renderBgGradientHistory();
}

function removeFromBgUploadHistory(idx) {
  const list = loadBgHistory(BG_UPLOAD_HISTORY_KEY);
  list.splice(idx, 1);
  saveBgHistoryList(BG_UPLOAD_HISTORY_KEY, list);
  renderBgUploadHistory();
}

function renderHistoryGrid(sectionId, gridId, list, type, removeHandler) {
  const section = document.getElementById(sectionId);
  const grid = document.getElementById(gridId);
  if (!section || !grid) return;
  if (list.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  grid.innerHTML = '';
  list.forEach((data, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'bg-history-thumb';
    if (data.startsWith('linear-gradient')) {
      thumb.style.background = data;
    } else {
      thumb.style.backgroundImage = `url(${data})`;
    }
    thumb.title = `Recent #${idx + 1}`;
    
    if ((bgType === 'image' || bgType === 'gradient') && bgValue === data) thumb.classList.add('active');

    thumb.addEventListener('click', (e) => {
      if (e.target.classList.contains('bg-history-remove')) return;
      customBgDataUrl = data;
      bgType = data.startsWith('linear-gradient') ? 'gradient' : 'image';
      bgValue = data;

      const applyAndToggle = () => {
        if (!bgEnabled) {
          bgEnabled = true;
          const tgl = document.getElementById('bg-toggle');
          const tglLbl = document.getElementById('bg-toggle-label');
          if (tgl) tgl.classList.add('on');
          if (tglLbl) tglLbl.textContent = 'On';
          const trg = document.getElementById('bg-trigger');
          if (trg) trg.classList.add('active');
        }
        document.querySelectorAll('.bg-thumb').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.bg-history-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        applyBackground();
      };

      if (bgType === 'image') {
        const img = new Image();
        img.onload = () => { bgImageObj = img; applyAndToggle(); };
        img.src = data.startsWith('data:') ? data : encodeWallpaperPath(data);
      } else {
        applyAndToggle();
      }
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'bg-history-remove';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeHandler(idx);
    });
    thumb.appendChild(removeBtn);
    grid.appendChild(thumb);
  });
}

function renderBgGradientHistory() {
  renderHistoryGrid('bg-gradients-section', 'bg-gradients-grid', loadBgHistory(BG_GRADIENT_HISTORY_KEY), 'gradient', removeFromBgGradientHistory);
}

function renderBgUploadHistory() {
  renderHistoryGrid('bg-uploads-section', 'bg-uploads-grid', loadBgHistory(BG_UPLOAD_HISTORY_KEY), 'image', removeFromBgUploadHistory);
}

renderBgGradientHistory();
renderBgUploadHistory();

if (bgBlurSlider) {
  bgBlurSlider.addEventListener('input', (e) => {
    bgBlurLevel = parseInt(e.target.value, 10);
    bgBlurValue.textContent = bgBlurLevel + '%';
    applyBackground();
  });
}

const bgAspectGrid = document.getElementById('bg-aspect-grid');
if (bgAspectGrid) {
  bgAspectGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.aspect-btn');
    if (!btn) return;
    bgAspectGrid.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    bgAspectRatio = btn.dataset.ratio;
    const valEl = document.getElementById('bg-aspect-value');
    if (valEl) valEl.textContent = bgAspectRatio === 'free' ? 'Free' : bgAspectRatio;

    const padRow = document.getElementById('bg-padding-row');
    if (padRow) padRow.style.display = bgEnabled ? 'flex' : 'none';

    if (bgAspectRatio !== 'free' && !bgEnabled) {
      bgEnabled = true;
      bgToggle.classList.add('on');
      bgToggleLabel.textContent = 'On';
      bgTrigger.classList.add('active');
    }
    applyBackground();
  });
}

const bgCornerSlider = document.getElementById('bg-corner-slider');
const bgCornerValue  = document.getElementById('bg-corner-value');
if (bgCornerSlider) {
  bgCornerSlider.addEventListener('input', (e) => {
    bgCornerRadius = parseInt(e.target.value, 10);
    if (bgCornerValue) bgCornerValue.textContent = bgCornerRadius + 'px';
    applyBackground();
  });
}

const bgPaddingSlider = document.getElementById('bg-padding-slider');
const bgPaddingValue  = document.getElementById('bg-padding-value');
if (bgPaddingSlider) {
  bgPaddingSlider.value = bgZoomPercent;
  if (bgPaddingValue) bgPaddingValue.textContent = bgZoomPercent + '%';
  bgPaddingSlider.addEventListener('input', (e) => {
    bgZoomPercent = parseInt(e.target.value, 10);
    if (bgPaddingValue) bgPaddingValue.textContent = bgZoomPercent + '%';
    applyBackground();
  });
}

const bgShadowSlider = document.getElementById('bg-shadow-slider');
const bgShadowValue  = document.getElementById('bg-shadow-value');
if (bgShadowSlider) {
  bgShadowSlider.addEventListener('input', (e) => {
    bgShadow = parseInt(e.target.value, 10);
    if (bgShadowValue) bgShadowValue.textContent = bgShadow + 'px';
    applyBackground();
  });
}

function parseAspectRatio(ratioStr) {
  if (!ratioStr || ratioStr === 'free') return null;
  const [w, h] = ratioStr.split(':').map(Number);
  if (!w || !h) return null;
  return w / h;
}

const FRAME_FILL = 0.88;

function computeAspectLayout(imgW, imgH, ratioStr, zoomPercent, withBg) {
  const targetAR = parseAspectRatio(ratioStr);

  if (!targetAR) {
    if (!withBg) {
      return { totalW: imgW, totalH: imgH, imgX: 0, imgY: 0, imgDrawW: imgW, imgDrawH: imgH };
    }
    const totalW = Math.round(imgW / FRAME_FILL);
    const totalH = Math.round(imgH / FRAME_FILL);
    const zoom      = Math.max(0.5, Math.min(1.5, (zoomPercent || 90) / 100));
    const imgDrawW  = Math.round(imgW * zoom);
    const imgDrawH  = Math.round(imgH * zoom);
    const imgX      = Math.round((totalW - imgDrawW) / 2);
    const imgY      = Math.round((totalH - imgDrawH) / 2);
    return { totalW, totalH, imgX, imgY, imgDrawW, imgDrawH };
  }

  const imgAR = imgW / imgH;
  let totalW, totalH;

  if (imgAR >= targetAR) {
    totalW = Math.round(imgW / FRAME_FILL);
    totalH = Math.round(totalW / targetAR);
  } else {
    totalH = Math.round(imgH / FRAME_FILL);
    totalW = Math.round(totalH * targetAR);
  }

  const zoom = Math.max(0.5, Math.min(1.5, (zoomPercent || 90) / 100));
  const maxFitW    = imgAR >= targetAR ? totalW : totalH * imgAR;
  const maxFitH    = imgAR >= targetAR ? totalW / imgAR : totalH;
  const imgDrawW   = Math.round(maxFitW * zoom);
  const imgDrawH   = Math.round(maxFitH * zoom);
  const imgX       = Math.round((totalW - imgDrawW) / 2);
  const imgY       = Math.round((totalH - imgDrawH) / 2);

  return { totalW, totalH, imgX, imgY, imgDrawW, imgDrawH };
}

function applyBackground() {
  const arFrame = document.getElementById('ar-frame');

  if (!bgEnabled) {
    bgLayer.classList.remove('active');
    canvasWrap.classList.remove('has-bg');
    const container = document.getElementById('canvas-container');
    if (container) container.style.background = '';
    canvasWrap.style.borderRadius = '';
    canvasWrap.style.boxShadow = '';
    if (arFrame) {
      arFrame.style.width = '';
      arFrame.style.height = '';
      arFrame.style.borderRadius = '';
      arFrame.classList.remove('frame-active');
    }
    bgLayer.style.borderRadius = '';
    
    // Reset canvasWrap absolute positioning
    canvasWrap.style.position = '';
    canvasWrap.style.left = '';
    canvasWrap.style.top = '';
    
    // Recompute standard fit size
    if (container) {
      const maxW = container.clientWidth - 40;
      const maxH = container.clientHeight - 40;
      const fullW = imgCanvas.width;
      const fullH = imgCanvas.height;
      
      if (fullW > 0 && fullH > 0) {
        const fitScale = Math.min(maxW / fullW, maxH / fullH, 1);
        displayW = Math.round(fullW * fitScale);
        displayH = Math.round(fullH * fitScale);
        displayScale = fullW / displayW;
        
        canvasWrap.style.width  = displayW + 'px';
        canvasWrap.style.height = displayH + 'px';
        imgCanvas.style.width   = displayW + 'px';
        imgCanvas.style.height  = displayH + 'px';
        drawCanvas.style.width  = displayW + 'px';
        drawCanvas.style.height = displayH + 'px';
      }
    }
    
    canvasWrapScale = 1;
    canvasWrap.style.transform = '';
    canvasWrap.style.transformOrigin = '';
    return;
  }

  bgLayer.classList.add('active');
  canvasWrap.classList.add('has-bg');

  const container = document.getElementById('canvas-container');
  if (container) container.style.background = 'transparent';

  if (bgType === 'solid') {
    bgLayer.style.backgroundImage = 'none';
    bgLayer.style.background = bgValue;
  } else if (bgType === 'gradient') {
    bgLayer.style.background = bgValue;
  } else if (bgType === 'image') {
    bgLayer.style.backgroundImage = `url("${encodeWallpaperPath(bgValue)}")`;
    bgLayer.style.backgroundSize = 'cover';
    bgLayer.style.backgroundPosition = 'center';
  }

  const blurPx = Math.round(bgBlurLevel * 0.5);
  bgLayer.style.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
  bgLayer.style.transform = blurPx > 0 ? 'scale(1.1)' : 'none';

  canvasWrap.style.borderRadius = bgCornerRadius + 'px';
  if (bgShadow > 0) {
    canvasWrap.style.boxShadow = `0 ${bgShadow * 0.3}px ${bgShadow}px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)`;
  } else {
    canvasWrap.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.06)';
  }

  const fullW = imgCanvas.width;
  const fullH = imgCanvas.height;

  if (arFrame && fullW > 0 && fullH > 0 && container) {
    // 1. Get container dimensions
    const maxW = container.clientWidth - 40;
    const maxH = container.clientHeight - 40;

    // 2. Compute aspect layout in full resolution
    const layout = computeAspectLayout(fullW, fullH, bgAspectRatio, bgZoomPercent, true);
    const { totalW, totalH, imgX, imgY, imgDrawW, imgDrawH } = layout;

    // 3. Scale to fit container
    const previewScale = Math.min(maxW / totalW, maxH / totalH);

    // 4. Style ar-frame to fit container perfectly
    const frameW = Math.round(totalW * previewScale);
    const frameH = Math.round(totalH * previewScale);
    arFrame.style.width        = frameW + 'px';
    arFrame.style.height       = frameH + 'px';
    arFrame.style.borderRadius = '8px';
    arFrame.classList.add('frame-active');
    bgLayer.style.borderRadius = '8px';

    // 5. Position and size canvasWrap absolutely within ar-frame
    const wrapW = Math.round(imgDrawW * previewScale);
    const wrapH = Math.round(imgDrawH * previewScale);
    canvasWrap.style.position = 'absolute';
    canvasWrap.style.left = Math.round(imgX * previewScale) + 'px';
    canvasWrap.style.top = Math.round(imgY * previewScale) + 'px';
    canvasWrap.style.width = wrapW + 'px';
    canvasWrap.style.height = wrapH + 'px';

    // Disable CSS transform scaling
    canvasWrapScale = 1;
    canvasWrap.style.transform       = '';
    canvasWrap.style.transformOrigin = '';

    // 6. Size the canvases to match the wrap size
    imgCanvas.style.width = wrapW + 'px';
    imgCanvas.style.height = wrapH + 'px';
    drawCanvas.style.width = wrapW + 'px';
    drawCanvas.style.height = wrapH + 'px';

    // 7. Update display globals so annotation coordinates are correct
    displayW = wrapW;
    displayH = wrapH;
    displayScale = fullW / displayW;
  } else if (arFrame) {
    arFrame.style.width  = '';
    arFrame.style.height = '';
    arFrame.style.borderRadius = '';
    arFrame.classList.remove('frame-active');
    bgLayer.style.borderRadius = '';
    canvasWrapScale = 1;
    canvasWrap.style.transform = '';
    canvasWrap.style.position = '';
    canvasWrap.style.left = '';
    canvasWrap.style.top = '';
  }
}

document.getElementById('stroke-width').addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  currentStroke = val * displayScale;
  toolStrokes[currentTool] = val;
  try { localStorage.setItem(TOOL_STROKE_KEY, JSON.stringify(toolStrokes)); } catch {}
  if (selectedIdx >= 0) {
    annotations[selectedIdx].stroke = currentStroke;
    redraw();
    window.lensEditor.markDirty();
  }
});

const spotSlider = document.getElementById('spotlight-darkness');
if (spotSlider) {
  spotSlider.addEventListener('input', (e) => {
    spotlightDarkness = parseInt(e.target.value, 10);
    const valEl = document.getElementById('spotlight-darkness-value');
    if (valEl) valEl.textContent = spotlightDarkness + '%';
    if (selectedIdx >= 0 && (annotations[selectedIdx].type === 'spotlight' || annotations[selectedIdx].type === 'circlespotlight')) {
      annotations[selectedIdx].darkness = spotlightDarkness;
      redraw();
      window.lensEditor.markDirty();
    }
  });
}

// Undo
document.getElementById('btn-undo').addEventListener('click', () => {
  if (!annotations.length) return;
  redoStack.push(annotations.pop());
  selectedIdx = -1;
  redraw();
});

// Redo
document.getElementById('btn-redo')?.addEventListener('click', () => {
  if (!redoStack.length) return;
  annotations.push(redoStack.pop());
  selectedIdx = annotations.length - 1;
  redraw();
  window.lensEditor.markDirty();
});

// Reset
document.getElementById('btn-reset').addEventListener('click', () => {
  annotations = [];
  redoStack = [];
  selectedIdx = -1;
  redraw();
  window.lensEditor.markClean();
  showToast('Reset to original');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (textInputEl) return;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); document.getElementById('btn-redo')?.click(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); document.getElementById('btn-undo').click(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); document.getElementById('btn-save').click(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') { document.getElementById('btn-copy').click(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx >= 0) {
    annotations.splice(selectedIdx, 1);
    redoStack = [];
    selectedIdx = -1;
    redraw();
    window.lensEditor.markDirty();
    return;
  }
  const shortcuts = { v: 'select', a: 'arrow', r: 'rect', b: 'fillrect', q: 'squarehighlight', c: 'circle', l: 'line', f: 'freehand', t: 'text', h: 'highlighter', u: 'blur', j: 'circleblur', s: 'spotlight', g: 'circlespotlight', n: 'number', e: 'eraser' };
  if (shortcuts[e.key]) {
    const btn = document.querySelector(`[data-tool="${shortcuts[e.key]}"]`);
    if (btn) btn.click();
  }
});

/* ── Crop actions ── */
document.getElementById('btn-crop-cancel')?.addEventListener('click', () => {
  cropBox = null;
  selectTool('select');
  redraw();
});

document.getElementById('btn-crop-apply')?.addEventListener('click', () => {
  if (!cropBox) return;
  
  const cx = Math.round(cropBox.x);
  const cy = Math.round(cropBox.y);
  const cw = Math.max(1, Math.round(cropBox.w));
  const ch = Math.max(1, Math.round(cropBox.h));
  
  const tmpC = document.createElement('canvas');
  tmpC.width = cw;
  tmpC.height = ch;
  const tmpCtx = tmpC.getContext('2d');

  const imgW = imgCanvas.width;
  const imgH = imgCanvas.height;
  const expandsLeft   = cx < 0;
  const expandsTop    = cy < 0;
  const expandsRight  = (cx + cw) > imgW;
  const expandsBottom = (cy + ch) > imgH;
  const isExpanding   = expandsLeft || expandsTop || expandsRight || expandsBottom;

  if (isExpanding) {
    tmpCtx.fillStyle = cropAvgColor;
    tmpCtx.fillRect(0, 0, cw, ch);

    const srcX = Math.max(0, cx);
    const srcY = Math.max(0, cy);
    const srcRight  = Math.min(imgW, cx + cw);
    const srcBottom = Math.min(imgH, cy + ch);
    const srcW = srcRight - srcX;
    const srcH = srcBottom - srcY;

    if (srcW > 0 && srcH > 0) {
      const dstX = srcX - cx;
      const dstY = srcY - cy;
      tmpCtx.drawImage(imgCanvas, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
    }
  } else {
    tmpCtx.drawImage(imgCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
  }
  
  for (const ann of annotations) {
    if (ann.x !== undefined) ann.x -= cx;
    if (ann.y !== undefined) ann.y -= cy;
    if (ann.x1 !== undefined) ann.x1 -= cx;
    if (ann.y1 !== undefined) ann.y1 -= cy;
    if (ann.x2 !== undefined) ann.x2 -= cx;
    if (ann.y2 !== undefined) ann.y2 -= cy;
    if (ann.cx !== undefined) ann.cx -= cx;
    if (ann.cy !== undefined) ann.cy -= cy;
    if (ann.points) {
      for (const p of ann.points) { p[0] -= cx; p[1] -= cy; }
    }
  }
  
  const img = new Image();
  img.onload = () => {
    originalImage = img;
    const fullW = img.naturalWidth;
    const fullH = img.naturalHeight;
    const container = document.getElementById('canvas-container');
    const maxW = container.clientWidth - 40;
    const maxH = container.clientHeight - 40;
    const fitScale = Math.min(maxW / fullW, maxH / fullH, 1);
    displayW = Math.round(fullW * fitScale);
    displayH = Math.round(fullH * fitScale);
    displayScale = fullW / displayW;
    imgCanvas.width  = fullW;  imgCanvas.height  = fullH;
    drawCanvas.width = fullW;  drawCanvas.height = fullH;
    canvasWrap.style.width  = displayW + 'px';
    canvasWrap.style.height = displayH + 'px';
    imgCanvas.style.width   = displayW + 'px';
    imgCanvas.style.height  = displayH + 'px';
    drawCanvas.style.width  = displayW + 'px';
    drawCanvas.style.height = displayH + 'px';
    imgCtx.clearRect(0, 0, fullW, fullH);
    imgCtx.drawImage(img, 0, 0, fullW, fullH);
    cropBox = null;
    selectTool('select');
    // Re-apply background layout if enabled, otherwise the standard fit was set above
    if (bgEnabled) {
      applyBackground();
    } else {
      redraw();
    }
    window.lensEditor.markDirty();
  };
  img.src = tmpC.toDataURL('image/png');
});

/* ─────────────────────────────────────────────
   MERGE CANVAS (for save / copy — no selection indicator)
   ───────────────────────────────────────────── */

function getMergedDataUrl() {
  // Force commit if text is actively being edited
  if (typeof activeTextCommit === 'function') {
    activeTextCommit();
  }

  const fullW = imgCanvas.width;
  const fullH = imgCanvas.height;

  if (bgEnabled) {
    const layout = computeAspectLayout(fullW, fullH, bgAspectRatio, bgZoomPercent, true);
    const { totalW, totalH, imgX, imgY, imgDrawW, imgDrawH } = layout;
    const cornerR = bgCornerRadius * (imgDrawW / fullW);

    const mergeCanvas = document.createElement('canvas');
    mergeCanvas.width = totalW;
    mergeCanvas.height = totalH;
    const ctx = mergeCanvas.getContext('2d');

    if (bgType === 'solid') {
      ctx.fillStyle = bgValue;
      ctx.fillRect(0, 0, totalW, totalH);
    } else if (bgType === 'gradient') {
      const gradMatch = bgValue.match(/linear-gradient\(([^,]+),\s*([^,]+\d+%),\s*([^)]+\d+%)\)/);
      if (gradMatch) {
        const angle = parseFloat(gradMatch[1]) || 135;
        const rad = (angle - 90) * Math.PI / 180;
        const cx = totalW / 2, cy = totalH / 2;
        const len = Math.sqrt(totalW * totalW + totalH * totalH) / 2;
        const x1 = cx - Math.cos(rad) * len, y1 = cy - Math.sin(rad) * len;
        const x2 = cx + Math.cos(rad) * len, y2 = cy + Math.sin(rad) * len;
        const grd = ctx.createLinearGradient(x1, y1, x2, y2);
        const c1 = gradMatch[2].trim().split(/\s+/)[0];
        const c2 = gradMatch[3].trim().split(/\s+/)[0];
        grd.addColorStop(0, c1);
        grd.addColorStop(1, c2);
        ctx.fillStyle = grd;
      } else {
        ctx.fillStyle = '#1a1a2e';
      }
      ctx.fillRect(0, 0, totalW, totalH);
    } else if (bgType === 'image' && bgImageObj) {
      ctx.save();
      const blurPx = Math.round(bgBlurLevel * 0.5);
      if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
      const iAR = bgImageObj.naturalWidth / bgImageObj.naturalHeight;
      const cAR = totalW / totalH;
      let sx = 0, sy = 0, sw = bgImageObj.naturalWidth, sh = bgImageObj.naturalHeight;
      if (iAR > cAR) {
        sw = bgImageObj.naturalHeight * cAR;
        sx = (bgImageObj.naturalWidth - sw) / 2;
      } else {
        sh = bgImageObj.naturalWidth / cAR;
        sy = (bgImageObj.naturalHeight - sh) / 2;
      }
      const over = blurPx > 0 ? blurPx * 2 : 0;
      ctx.drawImage(bgImageObj, sx, sy, sw, sh, -over, -over, totalW + over * 2, totalH + over * 2);
      ctx.restore();
    }

    ctx.save();
    if (bgShadow > 0) {
      const shadowScale = imgDrawW / fullW;
      const scaledShadow = bgShadow * shadowScale;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = scaledShadow;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = scaledShadow * 0.3;
    }
    
    roundRect(ctx, imgX, imgY, imgDrawW, imgDrawH, cornerR);
    if (bgShadow > 0) {
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    
    ctx.clip();
    ctx.drawImage(imgCanvas, 0, 0, fullW, fullH, imgX, imgY, imgDrawW, imgDrawH);
    ctx.restore();

    ctx.save();
    ctx.translate(imgX, imgY);
    const annScaleX = imgDrawW / fullW;
    const annScaleY = imgDrawH / fullH;
    ctx.scale(annScaleX, annScaleY);
    roundRect(ctx, 0, 0, fullW, fullH, cornerR / Math.min(annScaleX, annScaleY));
    ctx.clip();
    const savedSel = selectedIdx;
    selectedIdx = -1;
    renderAnnotationsComposite(ctx);
    selectedIdx = savedSel;
    ctx.restore();

    return mergeCanvas.toDataURL('image/png');
  }

  const mergeCanvas = document.createElement('canvas');
  mergeCanvas.width  = fullW;
  mergeCanvas.height = fullH;
  const ctx = mergeCanvas.getContext('2d');
  ctx.drawImage(imgCanvas, 0, 0);
  const savedSel = selectedIdx;
  selectedIdx = -1;
  renderAnnotationsComposite(ctx);
  selectedIdx = savedSel;
  return mergeCanvas.toDataURL('image/png');
}

function renderAnnotationsComposite(ctx) {
  const spotlights = annotations.filter(a => a.type === 'spotlight' || a.type === 'circlespotlight');
  if (spotlights.length > 0) {
    let maxDark = 0;
    for (const sp of spotlights) maxDark = Math.max(maxDark, (sp.darkness || spotlightDarkness));
    const dark = maxDark / 100;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;

    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${dark})`;
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    for (const sp of spotlights) {
      const sx = Math.min(sp.x, sp.x + sp.w), sy = Math.min(sp.y, sp.y + sp.h);
      const sw = Math.abs(sp.w), sh = Math.abs(sp.h);
      if (sw < 2 || sh < 2) continue;
      if (sp.type === 'spotlight') {
        const spRR = Math.max(8, Math.min(sw, sh) * 0.05);
        ctx.roundRect(sx, sy, sw, sh, spRR);
      } else {
        const erx = sw / 2, ery = sh / 2;
        const ecx = sx + erx, ecy = sy + ery;
        ctx.moveTo(ecx + Math.max(erx, 1), ecy);
        ctx.ellipse(ecx, ecy, Math.max(erx, 1), Math.max(ery, 1), 0, 0, Math.PI * 2);
      }
    }
    ctx.fill('evenodd');
    ctx.restore();

    for (const sp of spotlights) {
      const sx = Math.min(sp.x, sp.x + sp.w), sy = Math.min(sp.y, sp.y + sp.h);
      const sw = Math.abs(sp.w), sh = Math.abs(sp.h);
      if (sw < 2 || sh < 2) continue;
      ctx.save();
      ctx.strokeStyle = sp.color || 'rgba(255,255,255,0.5)';
      ctx.lineWidth = sp.stroke || 2;
      ctx.beginPath();
      if (sp.type === 'spotlight') {
        const spRR = Math.max(8, Math.min(sw, sh) * 0.05);
        ctx.roundRect(sx, sy, sw, sh, spRR);
      } else {
        const erx = sw / 2, ery = sh / 2;
        const ecx = sx + erx, ecy = sy + ery;
        ctx.ellipse(ecx, ecy, Math.max(erx, 1), Math.max(ery, 1), 0, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  for (const ann of annotations) {
    if (ann.type === 'spotlight' || ann.type === 'circlespotlight') continue;
    renderAnnotation(ctx, ann, false);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Save
document.getElementById('btn-save').addEventListener('click', async () => {
  const dataUrl = getMergedDataUrl();
  if (originFilePath && window.lensEditor.saveOverwrite) {
    const result = await window.lensEditor.saveOverwrite(dataUrl, originFilePath);
    if (result.ok) {
      window.lensEditor.markClean();
      window.lensEditor.closeEditor();
    } else {
      showToast('Save failed: ' + result.error);
    }
  } else {
    showLensSaveDialog(dataUrl);
  }
});

// Copy
document.getElementById('btn-copy').addEventListener('click', () => {
  const dataUrl = getMergedDataUrl();
  window.lensEditor.copyImage(dataUrl);
  showToast('Copied to clipboard');
});

// Screen Record
document.getElementById('btn-screen-record').addEventListener('click', () => {
  window.lensEditor.openScreenRecorder();
});

// Close
document.getElementById('btn-close').addEventListener('click', () => {
  window.lensEditor.closeEditor();
});

/* ─────────────────────────────────────────────
   SIDE PANEL
   ───────────────────────────────────────────── */

document.getElementById('btn-open-panel').addEventListener('click', () => {
  const panel = document.getElementById('side-panel');
  const isCollapsed = panel.classList.contains('collapsed');
  panel.classList.toggle('collapsed');
  if (isCollapsed) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-section').forEach(s => s.classList.remove('active'));
    document.querySelector('[data-panel="ocr"]').classList.add('active');
    document.getElementById('panel-ocr').classList.add('active');
  }
});

document.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
  });
});

/* ─────────────────────────────────────────────
   OCR
   ───────────────────────────────────────────── */

document.getElementById('btn-extract').addEventListener('click', async () => {
  const btn = document.getElementById('btn-extract');
  const label = document.getElementById('extract-label');
  btn.disabled = true;
  label.innerHTML = '<span class="spinner"></span> Scanning…';

  try {
    const lang = document.getElementById('ocr-lang').value;
    const dataUrl = imgCanvas.toDataURL('image/png');
    const result = await window.lensEditor.extractText({ dataUrl, lang });

    if (result.ok) {
      const ocrResult = document.getElementById('ocr-result');
      ocrResult.value = result.text;
      ocrResult.removeAttribute('readonly');
      document.getElementById('translate-source').value = result.text;
      showToast('Text extracted successfully');
    } else {
      document.getElementById('ocr-result').value = `Error: ${result.error}`;
    }
  } catch (err) {
    console.error('OCR error:', err);
    document.getElementById('ocr-result').value = `Error: ${err.message}`;
  } finally {
    label.textContent = 'Extract All Text';
    btn.disabled = false;
  }
});

document.getElementById('btn-copy-text').addEventListener('click', () => {
  const text = document.getElementById('ocr-result').value;
  if (text) {
    navigator.clipboard.writeText(text);
    showToast('Text copied');
  }
});

/* ─────────────────────────────────────────────
   TRANSLATION
   ───────────────────────────────────────────── */

document.getElementById('btn-translate').addEventListener('click', async () => {
  const source = document.getElementById('translate-source').value.trim();
  if (!source) { showToast('No text to translate'); return; }

  const targetLang = document.getElementById('translate-lang').value;
  const label = document.getElementById('translate-label');
  const btn   = document.getElementById('btn-translate');

  btn.disabled = true;
  label.innerHTML = '<span class="spinner"></span> Translating…';

  try {
    const result = await window.lensEditor.translate({ text: source, targetLang });
    if (result.ok) {
      document.getElementById('translate-result').textContent = result.text;
      showToast('Translation complete');
    } else {
      document.getElementById('translate-result').textContent = `Error: ${result.error}`;
    }
  } catch (err) {
    document.getElementById('translate-result').textContent = `Error: ${err.message}`;
  } finally {
    label.textContent = 'Translate';
    btn.disabled = false;
  }
});

document.getElementById('btn-copy-translation').addEventListener('click', () => {
  const text = document.getElementById('translate-result').textContent;
  if (text && text !== '—') {
    navigator.clipboard.writeText(text);
    showToast('Translation copied');
  }
});

/* ─────────────────────────────────────────────
   TOAST
   ───────────────────────────────────────────── */

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ─────────────────────────────────────────────
   LENS SAVE DIALOG
   ───────────────────────────────────────────── */

function showLensSaveDialog(dataUrl) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const defaultName = `Screenshot ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`;

  const overlay = document.createElement('div');
  overlay.id = 'lens-save-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9000',
    'background:rgba(0,0,0,0.65)',
    'backdrop-filter:blur(8px)',
    'display:flex;align-items:center;justify-content:center',
    'animation:lsDialogFade 0.15s ease',
  ].join(';');

  overlay.innerHTML = `
    <style>
      @keyframes lsDialogFade { from { opacity:0; } to { opacity:1; } }
      #lens-save-box {
        background: #13131f;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        padding: 24px;
        min-width: 380px;
        max-width: 480px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6);
      }
      #lens-save-title {
        font: 600 14px/1 'Inter', sans-serif;
        color: #f4f4fa;
        margin-bottom: 16px;
      }
      #lens-save-input-wrap {
        display: flex;
        align-items: center;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        padding: 0 12px;
        margin-bottom: 6px;
        transition: border-color 0.15s;
      }
      #lens-save-input-wrap:focus-within {
        border-color: var(--lc-accent);
        background: var(--lc-accent-bg);
      }
      #lens-save-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: #f0f0f8;
        font: 500 13px/1 'Inter', sans-serif;
        padding: 11px 0;
        user-select: text;
        -webkit-user-select: text;
      }
      #lens-save-input::selection { background: var(--lc-accent-bg); }
      #lens-save-ext {
        font: 500 13px/1 'Inter', sans-serif;
        color: #4b5563;
        padding-left: 2px;
        white-space: nowrap;
      }
      #lens-save-hint {
        font: 400 10px/1 'Inter', sans-serif;
        color: #3b3b52;
        margin-bottom: 20px;
      }
      #lens-save-error {
        font: 500 11px/1 'Inter', sans-serif;
        color: #f87171;
        min-height: 14px;
        margin-bottom: 12px;
        margin-top: -12px;
      }
      #lens-save-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .lsBtn {
        padding: 8px 16px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.05);
        color: #c0c5d0;
        font: 500 12px/1 'Inter', sans-serif;
        cursor: pointer;
        transition: all 0.12s;
      }
      .lsBtn:hover { background: rgba(255,255,255,0.1); }
      .lsBtnAccent {
        background: var(--lc-accent-bg) !important;
        border-color: var(--lc-accent-bg) !important;
        color: var(--lc-accent) !important;
      }
      .lsBtnAccent:hover { background: var(--lc-accent) !important; }
    </style>
    <div id="lens-save-box">
      <div id="lens-save-title">Save Screenshot</div>
      <div id="lens-save-input-wrap">
        <input id="lens-save-input" type="text" value="${defaultName}" spellcheck="false" autocomplete="off">
        <span id="lens-save-ext">.png</span>
      </div>
      <div id="lens-save-hint">Enter to save &middot; Escape to cancel</div>
      <div id="lens-save-error"></div>
      <div id="lens-save-actions">
        <button class="lsBtn" id="ls-cancel">Cancel</button>
        <button class="lsBtn lsBtnAccent" id="ls-save">Save to Gallery</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const input = overlay.querySelector('#lens-save-input');
  const errorEl = overlay.querySelector('#lens-save-error');

  requestAnimationFrame(() => { input.focus(); input.select(); });

  async function doSave() {
    const name = input.value.trim();
    if (!name) { errorEl.textContent = 'Name cannot be empty.'; return; }
    const saveBtn = overlay.querySelector('#ls-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      const result = await window.lensEditor.saveImageNamed(dataUrl, name);
      if (result && result.ok) {
        overlay.remove();
        window.lensEditor.markClean();
        window.lensEditor.closeEditor();
      } else {
        errorEl.textContent = 'Save failed. Please try again.';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save to Gallery';
      }
    } catch (err) {
      errorEl.textContent = 'Save error: ' + (err.message || err);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save to Gallery';
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); doSave(); }
    if (e.key === 'Escape') { e.stopPropagation(); overlay.remove(); }
  });
  overlay.querySelector('#ls-save').addEventListener('click', doSave);
  overlay.querySelector('#ls-cancel').addEventListener('click', () => overlay.remove());
}

window.lensEditor.onAutoSave(async () => {
  try {
    const dataUrl = getMergedDataUrl();
    await window.lensEditor.saveImage(dataUrl);
    console.log('[Lens] Auto-saved before new capture');
  } catch (err) {
    console.error('[Lens] Auto-save failed:', err);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !textInputEl) {
    window.lensEditor.closeEditor();
  }
});


// Hover listeners for toolbar & options bar (with a 100ms debounce to prevent transition flickering)
const toolbarEl = document.querySelector('.toolbar');
const optionsBarEl = document.getElementById('options-bar');

if (toolbarEl) {
  toolbarEl.addEventListener('mouseenter', () => {
    isToolbarHovered = true;
    updateOptionsBarVisibility();
  });
  toolbarEl.addEventListener('mouseleave', () => {
    isToolbarHovered = false;
    setTimeout(updateOptionsBarVisibility, 100);
  });
}

if (optionsBarEl) {
  optionsBarEl.addEventListener('mouseenter', () => {
    isOptionsBarHovered = true;
    updateOptionsBarVisibility();
  });
  optionsBarEl.addEventListener('mouseleave', () => {
    isOptionsBarHovered = false;
    setTimeout(updateOptionsBarVisibility, 100);
  });

  // Track slider drag state
  optionsBarEl.addEventListener('mousedown', (e) => {
    if (e.target.type === 'range') {
      isDraggingSlider = true;
    }
  });
}

document.addEventListener('mouseup', () => {
  if (isDraggingSlider) {
    isDraggingSlider = false;
    updateOptionsBarVisibility();
  }
});

// Dynamic window resize layout updates
window.addEventListener('resize', () => {
  if (imgCanvas.width > 0) {
    applyBackground();
    redraw();
  }
});

