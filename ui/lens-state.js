'use strict';

/* ═══════════════════════════════════════════════════════
   MicTab Lens Editor — Annotation + OCR + Translation
   ═══════════════════════════════════════════════════════ */

/* ── Theme synchronisation ── */
function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); }
window.lensEditor.getConfig().then(c => { if (c && c.theme) applyTheme(c.theme); }).catch(() => {});
window.lensEditor.onConfigUpdate(c => { if (c && c.theme) applyTheme(c.theme); });

// ── Canvas refs ──
const imgCanvas  = document.getElementById('img-canvas');
const drawCanvas = document.getElementById('draw-canvas');
const imgCtx     = imgCanvas.getContext('2d');
const drawCtx    = drawCanvas.getContext('2d');
const canvasWrap = document.getElementById('canvas-wrap');

// ── State ──
let originalImage = null;
let annotations   = [];
let redoStack     = [];
let currentTool   = localStorage.getItem('lens-current-tool') || 'rect';
let currentColor  = '#ef4444';
let currentStroke = 3;

// Per-tool stroke memory: each tool independently remembers its last size
const TOOL_STROKE_KEY = 'lens-tool-strokes';
const DEFAULT_TOOL_STROKES = {
  select: 3, crop: 3, rect: 3, fillrect: 3, squarehighlight: 3,
  circle: 3, line: 3, arrow: 3, text: 2, freehand: 4, highlighter: 8,
  blur: 2, circleblur: 2, spotlight: 2, circlespotlight: 2,
  eraser: 3, number: 2,
};
let toolStrokes = { ...DEFAULT_TOOL_STROKES };
try {
  const saved = JSON.parse(localStorage.getItem(TOOL_STROKE_KEY));
  if (saved && typeof saved === 'object') Object.assign(toolStrokes, saved);
} catch {}
let isDrawing     = false;
let drawStartX    = 0, drawStartY = 0;
let freehandPoints = [];
let textInputEl   = null;
let activeTextCommit = null; // force-commit open text before saving/copying
// ── Layer/Selection state ──
let selectedIdx   = -1;
let isDragging    = false;
let dragOffsetX   = 0, dragOffsetY = 0;
// ── Display scaling (maps CSS display size → full-res canvas) ──
let displayScale  = 1;   // canvas pixels per CSS pixel
let displayW      = 0;   // CSS display width
let displayH      = 0;   // CSS display height
// ── New tool state ──
let blurIntensity    = parseInt(localStorage.getItem('lens-blur-intensity'), 10);
if (isNaN(blurIntensity)) blurIntensity = 12;   // pixelate block size
let numberRadius     = parseInt(localStorage.getItem('lens-number-radius'), 10);
if (isNaN(numberRadius)) numberRadius = 10;   // number badge radius (CSS pixels, before displayScale)
let recentColors     = [];   // last 3 custom colors
let arrowStyle       = 'standard'; // 'standard' | 'fancy' | 'curved'
let textStyle        = 'standard'; // 'standard' | 'outlined' | 'box' | 'mono'
let blurStyle        = 'pixelate'; // 'pixelate' | 'smooth' | 'blackout'
let textFontSize     = parseInt(localStorage.getItem('lens-text-size'), 10);
if (isNaN(textFontSize)) textFontSize = 16;         // text tool font size (px at displayScale)
let textGlowSize     = parseInt(localStorage.getItem('lens-text-glow'), 10);
if (isNaN(textGlowSize)) textGlowSize = 0;          // text glow size (px at displayScale)
let textBoxOpacity   = parseInt(localStorage.getItem('lens-text-box-opacity'), 10);
if (isNaN(textBoxOpacity)) textBoxOpacity = 3;
let textFont         = localStorage.getItem('lens-text-font') || 'Inter';  // chosen font family name
// ── Crop state ──
let cropBox = null;
let cropActiveHandle = null;
let cropAvgColor = '#888888'; // average color of image, used for expand-beyond fill
// ── Background state ──
let bgEnabled       = false;
let bgBlurLevel     = 30;    // 0–100 (percentage mapped to px)
let bgType          = 'solid';   // 'solid' | 'image' | 'gradient'
let bgValue         = '#1a1a2e'; // color, src, or gradient CSS
let canvasWrapScale = 1;         // CSS transform:scale on canvas-wrap (zoom preview)
let bgImageObj      = null;      // loaded Image for image backgrounds
let customBgDataUrl = null;      // data URL for user-uploaded background
let spotlightDarkness = 55;  // spotlight overlay opacity (10–90%)
// ── Aspect Ratio state ──
let bgAspectRatio   = 'free';    // 'free' | '16:9' | '1:1' | '4:3' | '9:16' | '4:5' | '3:2' | '21:9'
let bgZoomPercent   = 90;        // zoom: 50–100 (100=screenshot fills AR frame, lower=more background)
let bgCornerRadius  = 12;        // 0-48px
let bgShadow        = 40;        // 0-80px

/** Get next available number — fills gaps (1,2,3 → delete 2 → next is 2) */
function getNextNumber() {
  const used = new Set(annotations.filter(a => a.type === 'number').map(a => a.num));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

// ── Gallery Edit Mode: track origin file path for in-place save ──
let originFilePath = null; // set when opened from gallery
if (window.lensEditor.onSetOriginPath) {
  window.lensEditor.onSetOriginPath((filePath) => {
    originFilePath = filePath;
    console.log('[Lens] Gallery edit mode — will overwrite:', filePath);
    // Show a subtle banner so user knows this is an overwrite save
    showToast('Gallery edit — Save will overwrite original');
  });
}

// ── Image Loading ──
// Strategy: keep canvas at FULL original resolution so saves/copies/OCR
// are always high quality.  Use CSS to scale it down visually.
window.lensEditor.onLoadImage((dataUrl) => {
  const img = new Image();
  img.onload = () => {
    originalImage = img;

    const fullW = img.naturalWidth;
    const fullH = img.naturalHeight;

    // Calculate the CSS display size (fit inside container)
    const container = document.getElementById('canvas-container');
    const maxW = container.clientWidth - 40;
    const maxH = container.clientHeight - 40;

    const fitScale = Math.min(maxW / fullW, maxH / fullH, 1);
    displayW = Math.round(fullW * fitScale);
    displayH = Math.round(fullH * fitScale);
    displayScale = fullW / displayW;  // how many canvas px per CSS px

    // Canvas resolution = full original resolution
    imgCanvas.width  = fullW;  imgCanvas.height  = fullH;
    drawCanvas.width = fullW;  drawCanvas.height = fullH;

    // CSS display size = scaled-down
    canvasWrap.style.width  = displayW + 'px';
    canvasWrap.style.height = displayH + 'px';
    imgCanvas.style.width   = displayW + 'px';
    imgCanvas.style.height  = displayH + 'px';
    drawCanvas.style.width  = displayW + 'px';
    drawCanvas.style.height = displayH + 'px';

    // Draw at full resolution — no quality loss
    imgCtx.drawImage(img, 0, 0, fullW, fullH);

    // Scale annotation stroke from the current tool's remembered size
    const initToolVal = toolStrokes[currentTool] ?? DEFAULT_TOOL_STROKES[currentTool] ?? 3;
    currentStroke = initToolVal * displayScale;
    const slider = document.getElementById('stroke-width');
    if (slider) slider.value = initToolVal;
    const strokeValEl = document.getElementById('stroke-value');
    if (strokeValEl) strokeValEl.textContent = initToolVal + 'px';

    // Reset cropBox because canvas dimensions just changed
    cropBox = null;
    if (currentTool === 'crop') {
      cropBox = { x: 0, y: 0, w: drawCanvas.width, h: drawCanvas.height };
      cropAvgColor = computeAverageColor();
    }
    redraw();
  };
  img.src = dataUrl;
});
