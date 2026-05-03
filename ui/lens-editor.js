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
let bgZoomPercent   = 85;        // zoom: 50–100 (100=screenshot fills AR frame, lower=more background)
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
      const padX = Math.min(40 * displayScale, drawCanvas.width * 0.1);
      const padY = Math.min(40 * displayScale, drawCanvas.height * 0.1);
      cropBox = { x: padX, y: padY, w: drawCanvas.width - padX*2, h: drawCanvas.height - padY*2 };
    }
    redraw();
  };
  img.src = dataUrl;
});

/* ─────────────────────────────────────────────
   ANNOTATION RENDERING
   ───────────────────────────────────────────── */

function redraw() {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // ── Composite all spotlight/circlespotlight annotations into ONE overlay ──
  const spotlights = [];
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    if (a.type === 'spotlight' || a.type === 'circlespotlight') spotlights.push(a);
  }
  if (spotlights.length > 0) {
    // Use the max darkness across all spotlight annotations
    let maxDark = 0;
    for (const sp of spotlights) maxDark = Math.max(maxDark, (sp.darkness || spotlightDarkness));
    const dark = maxDark / 100;
    const cw = drawCanvas.width, ch = drawCanvas.height;

    drawCtx.save();
    drawCtx.fillStyle = `rgba(0,0,0,${dark})`;
    drawCtx.beginPath();
    drawCtx.rect(0, 0, cw, ch);  // outer rect

    // Cut out ALL spotlight regions (additive reveal)
    for (const sp of spotlights) {
      const sx = Math.min(sp.x, sp.x + sp.w), sy = Math.min(sp.y, sp.y + sp.h);
      const sw = Math.abs(sp.w), sh = Math.abs(sp.h);
      if (sw < 2 || sh < 2) continue;
      if (sp.type === 'spotlight') {
        const spRR = Math.max(8, Math.min(sw, sh) * 0.05);
        drawCtx.roundRect(sx, sy, sw, sh, spRR);
      } else {
        // circlespotlight — ellipse cutout
        const erx = sw / 2, ery = sh / 2;
        const ecx = sx + erx, ecy = sy + ery;
        drawCtx.moveTo(ecx + Math.max(erx, 1), ecy);
        drawCtx.ellipse(ecx, ecy, Math.max(erx, 1), Math.max(ery, 1), 0, 0, Math.PI * 2);
      }
    }
    drawCtx.fill('evenodd');
    drawCtx.restore();

    // Draw borders for each spotlight
    for (const sp of spotlights) {
      const sx = Math.min(sp.x, sp.x + sp.w), sy = Math.min(sp.y, sp.y + sp.h);
      const sw = Math.abs(sp.w), sh = Math.abs(sp.h);
      if (sw < 2 || sh < 2) continue;
      drawCtx.save();
      drawCtx.strokeStyle = sp.color || 'rgba(255,255,255,0.5)';
      drawCtx.lineWidth = sp.stroke || 2;
      drawCtx.beginPath();
      if (sp.type === 'spotlight') {
        const spRR = Math.max(8, Math.min(sw, sh) * 0.05);
        drawCtx.roundRect(sx, sy, sw, sh, spRR);
      } else {
        const erx = sw / 2, ery = sh / 2;
        const ecx = sx + erx, ecy = sy + ery;
        drawCtx.ellipse(ecx, ecy, Math.max(erx, 1), Math.max(ery, 1), 0, 0, Math.PI * 2);
      }
      drawCtx.stroke();
      drawCtx.restore();
    }
  }

  // ── Render all non-spotlight annotations ──
  // Pass 1: blur/circleblur always drawn first so all other annotations sit on top
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    if (a.type === 'blur' || a.type === 'circleblur') {
      renderAnnotation(drawCtx, a, i === selectedIdx);
    }
  }
  // Pass 2: all other non-spotlight annotations on top of blur layers
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    if (a.type === 'spotlight' || a.type === 'circlespotlight') {
      // Only draw selection indicator for spotlights (overlay already drawn above)
      if (i === selectedIdx) {
        drawCtx.save();
        drawCtx.strokeStyle = '#60a5fa';
        drawCtx.lineWidth = 1.5;
        drawCtx.setLineDash([4, 3]);
        const b = getAnnBounds(a);
        if (b) {
          drawCtx.beginPath();
          drawCtx.roundRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8, 6);
          drawCtx.stroke();
        }
        drawCtx.setLineDash([]);
        drawCtx.restore();
      }
      continue;
    }
    if (a.type === 'blur' || a.type === 'circleblur') continue; // already drawn in pass 1
    renderAnnotation(drawCtx, a, i === selectedIdx);
  }
  
  // ── Render Crop Overlay ──
  if (currentTool === 'crop' && cropBox) {
    const cw = drawCanvas.width, ch = drawCanvas.height;
    drawCtx.save();
    drawCtx.fillStyle = 'rgba(0,0,0,0.6)';
    drawCtx.beginPath();
    drawCtx.rect(0, 0, cw, ch);
    drawCtx.rect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
    drawCtx.fill('evenodd');
    
    drawCtx.strokeStyle = '#2563eb';
    drawCtx.lineWidth = 2 * displayScale;
    drawCtx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);

    const handles = getCropHandles();
    for (const h of handles) {
      drawCtx.beginPath();
      drawCtx.arc(h.x, h.y, 8 * displayScale, 0, 2*Math.PI);
      drawCtx.fillStyle = '#ffffff';
      drawCtx.fill();
      drawCtx.lineWidth = 2 * displayScale;
      drawCtx.strokeStyle = '#2563eb';
      drawCtx.stroke();
    }
    drawCtx.restore();
  }

  updateContextSliders();
}

/** Show/hide context sliders based on selected annotation + active tool */
function updateContextSliders() {
  const blurGroup = document.getElementById('blur-group');
  const numGroup  = document.getElementById('number-group');
  const spotGroup = document.getElementById('spotlight-group');
  const textGroup = document.getElementById('text-group');
  const sel = selectedIdx >= 0 ? annotations[selectedIdx] : null;
  const showBlur = currentTool === 'blur' || currentTool === 'circleblur'
    || (sel && (sel.type === 'blur' || sel.type === 'circleblur'));
  const showNum = currentTool === 'number' || (sel && sel.type === 'number');
  const showSpot = currentTool === 'spotlight' || currentTool === 'circlespotlight'
    || (sel && (sel.type === 'spotlight' || sel.type === 'circlespotlight'));
  const showText = currentTool === 'text' || (sel && sel.type === 'text');
  if (blurGroup) blurGroup.style.display = showBlur ? 'flex' : 'none';
  if (numGroup) numGroup.style.display = showNum ? 'flex' : 'none';
  if (spotGroup) spotGroup.style.display = showSpot ? 'flex' : 'none';
  if (textGroup) textGroup.style.display = showText ? 'flex' : 'none';
  // Sync slider values to selected annotation
  if (sel && sel.type === 'number' && numGroup) {
    const r = Math.round(sel.radius / displayScale);
    const slider = document.getElementById('number-size');
    const valEl = document.getElementById('number-size-value');
    if (slider) slider.value = r;
    if (valEl) valEl.textContent = r;
  }
  if (sel && (sel.type === 'blur' || sel.type === 'circleblur') && blurGroup) {
    const slider = document.getElementById('blur-intensity');
    const valEl = document.getElementById('blur-value');
    if (slider) slider.value = sel.blurSize || 12;
    if (valEl) valEl.textContent = (sel.blurSize || 12) + 'px';
  }
  if (sel && (sel.type === 'spotlight' || sel.type === 'circlespotlight') && spotGroup) {
    const slider = document.getElementById('spotlight-darkness');
    const valEl = document.getElementById('spotlight-darkness-value');
    if (slider) slider.value = sel.darkness || 55;
    if (valEl) valEl.textContent = (sel.darkness || 55) + '%';
  }
  if (sel && sel.type === 'text' && textGroup) {
    const fsPx = Math.round((sel.fontSize || 16) / displayScale);
    const slider = document.getElementById('text-size');
    const valEl = document.getElementById('text-size-value');
    if (slider) slider.value = fsPx;
    if (valEl) valEl.textContent = fsPx + 'pt';

    const glowPx = Math.round((sel.glowSize !== undefined ? sel.glowSize : textGlowSize * displayScale) / displayScale);
    const glowSlider = document.getElementById('text-glow');
    const glowValEl = document.getElementById('text-glow-value');
    if (glowSlider) glowSlider.value = glowPx;
    if (glowValEl) glowValEl.textContent = glowPx + 'px';

    const boxOpacitySlider = document.getElementById('text-box-opacity');
    const boxOpacityValEl = document.getElementById('text-box-opacity-value');
    if (boxOpacitySlider) boxOpacitySlider.value = sel.boxOpacity !== undefined ? sel.boxOpacity : textBoxOpacity;
    if (boxOpacityValEl) boxOpacityValEl.textContent = (sel.boxOpacity !== undefined ? sel.boxOpacity : textBoxOpacity) + '%';
    const textStyleMenu = sel.textStyle || textStyle;
    const isBox = textStyleMenu === 'box';
    document.querySelectorAll('.box-opacity-label, .box-opacity-slider, .box-opacity-value').forEach(el => el.style.display = isBox ? 'inline-block' : 'none');
  } else if (!sel && currentTool === 'text' && textGroup) {
    const glowSlider = document.getElementById('text-glow');
    const glowValEl = document.getElementById('text-glow-value');
    if (glowSlider) glowSlider.value = textGlowSize;
    if (glowValEl) glowValEl.textContent = textGlowSize + 'px';
    const boxOpacitySlider = document.getElementById('text-box-opacity');
    const boxOpacityValEl = document.getElementById('text-box-opacity-value');
    if (boxOpacitySlider) boxOpacitySlider.value = textBoxOpacity;
    if (boxOpacityValEl) boxOpacityValEl.textContent = textBoxOpacity + '%';
    const isBox = textStyle === 'box';
    document.querySelectorAll('.box-opacity-label, .box-opacity-slider, .box-opacity-value').forEach(el => el.style.display = isBox ? 'inline-block' : 'none');
  }
  // Sync font picker label to the active annotation's font or the tool-level textFont
  if (showText) {
    const activeFont = (sel && sel.type === 'text' && sel.fontFamily) ? sel.fontFamily : textFont;
    syncFontPickerLabel(activeFont);
  }
}

function renderAnnotation(ctx, ann, isSelected) {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle   = ann.color;
  ctx.lineWidth   = ann.stroke;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  switch (ann.type) {
    case 'arrow':
      drawArrow(ctx, ann.x1, ann.y1, ann.x2, ann.y2, ann.stroke, ann.arrowStyle || 'standard', ann.cx, ann.cy);
      break;
    case 'rect': {
      const rr = Math.max(6, ann.stroke * 2);
      ctx.beginPath();
      ctx.roundRect(ann.x, ann.y, ann.w, ann.h, rr);
      ctx.stroke();
      break;
    }
    case 'fillrect': {
      const frr = Math.max(6, ann.stroke * 2);
      ctx.beginPath();
      ctx.roundRect(ann.x, ann.y, ann.w, ann.h, frr);
      ctx.fill();
      break;
    }
    case 'squarehighlight': {
      // Semi-transparent filled rectangle highlight using selected color
      const shrr = Math.max(6, ann.stroke * 2);
      ctx.globalAlpha = 0.30;
      ctx.beginPath();
      ctx.roundRect(ann.x, ann.y, ann.w, ann.h, shrr);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = Math.max(2, ann.stroke * 0.8);
      ctx.beginPath();
      ctx.roundRect(ann.x, ann.y, ann.w, ann.h, shrr);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'circle': {
      const rx = Math.abs(ann.w) / 2, ry = Math.abs(ann.h) / 2;
      const cx = ann.x + ann.w / 2, cy = ann.y + ann.h / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx,1), Math.max(ry,1), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'line':
      ctx.beginPath();
      ctx.moveTo(ann.x1, ann.y1);
      ctx.quadraticCurveTo(ann.cx !== undefined ? ann.cx : (ann.x1 + ann.x2) / 2, ann.cy !== undefined ? ann.cy : (ann.y1 + ann.y2) / 2, ann.x2, ann.y2);
      ctx.stroke();
      break;
    case 'freehand':
      if (ann.points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(ann.points[0][0], ann.points[0][1]);
      for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i][0], ann.points[i][1]);
      ctx.stroke();
      break;
    case 'highlighter':
      if (ann.points.length < 2) break;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = ann.stroke * 4;
      ctx.beginPath();
      ctx.moveTo(ann.points[0][0], ann.points[0][1]);
      for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i][0], ann.points[i][1]);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    case 'text': {
      const fs = ann.fontSize || 16;
      const ts = ann.textStyle || 'standard';
      const isMono = (ts === 'mono');
      // Use per-annotation fontFamily if set, else fall back to tool-level textFont
      const storedFont = ann.fontFamily || textFont;
      const fontFam = isMono ? '"SF Mono", "Fira Code", "Consolas", monospace'
                             : `"${storedFont}", Inter, -apple-system, sans-serif`;
      ctx.font = `600 ${fs}px ${fontFam}`;


      const lines = ann.text.split('\n');
      let maxW = 0;
      for (const line of lines) {
        maxW = Math.max(maxW, ctx.measureText(line).width);
      }
      
      const pad = Math.round(fs * 0.3);
      const lineHeight = fs * 1.2;
      const glowPx = ann.glowSize !== undefined ? ann.glowSize : textGlowSize * displayScale;

      if (ts === 'box') {
        const boxOp = ann.boxOpacity !== undefined ? ann.boxOpacity : textBoxOpacity;
        ctx.fillStyle = `rgba(0, 0, 0, ${boxOp / 100})`;
        const totalHeight = fs * lines.length + pad * 2 + (lines.length - 1) * fs * 0.2;
        const tbr = Math.min(6, totalHeight / 2);
        ctx.beginPath();
        ctx.roundRect(ann.x - pad, ann.y - fs + 1, maxW + pad * 2, totalHeight, tbr);
        ctx.fill();
        
        ctx.shadowColor = ann.color;
        ctx.shadowBlur = glowPx;
        ctx.fillStyle = ann.color;
        lines.forEach((line, i) => {
          ctx.fillText(line, ann.x, ann.y + pad + i * lineHeight);
        });
        ctx.shadowBlur = 0;
      } else if (ts === 'outlined') {
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = Math.max(2, fs / 12);
        ctx.lineJoin = 'round';
        lines.forEach((line, i) => {
          ctx.strokeText(line, ann.x, ann.y + pad + i * lineHeight);
        });
        ctx.fillStyle = '#fff';
        lines.forEach((line, i) => {
          ctx.fillText(line, ann.x, ann.y + pad + i * lineHeight);
        });
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = glowPx;
        lines.forEach((line, i) => {
          ctx.fillText(line, ann.x, ann.y + pad + i * lineHeight);
        });
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const totalHeight = fs * lines.length + pad * 2 + (lines.length - 1) * fs * 0.2;
        const tbr = Math.min(6, totalHeight / 2);
        ctx.beginPath();
        ctx.roundRect(ann.x - pad, ann.y - fs + 1, maxW + pad * 2, totalHeight, tbr);
        ctx.fill();
        
        ctx.shadowColor = ann.color;
        ctx.shadowBlur = glowPx;
        ctx.fillStyle = ann.color;
        lines.forEach((line, i) => {
          ctx.fillText(line, ann.x, ann.y + pad + i * lineHeight);
        });
        ctx.shadowBlur = 0;
      }
      break;
    }
    case 'blur': {
      const bx = Math.min(ann.x, ann.x + ann.w), by = Math.min(ann.y, ann.y + ann.h);
      const bw = Math.abs(ann.w), bh = Math.abs(ann.h);
      if (bw < 2 || bh < 2) break;
      const bStyle = ann.blurStyle || 'pixelate';

      const blurRR = 6; // subtle fixed corner radius
      if (bStyle === 'blackout') {
        // Solid black fill
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, blurRR);
        ctx.fill();
      } else if (bStyle === 'smooth') {
        // True Gaussian blur using canvas filter API
        const bs = (ann.blurSize || 12);
        // Scale slider value to a strong, visible blur radius
        const blurPx = Math.max(4, Math.round(bs * 1.8));
        // Padding ensures the blur kernel has real pixels at the region edges
        // (avoids the dark/transparent-border artifact)
        const pad = Math.min(blurPx * 2, 80);

        // Step 1: grab raw pixels (enlarged by pad on all sides) from the source image
        const srcX = Math.max(0, bx - pad);
        const srcY = Math.max(0, by - pad);
        const srcW = Math.min(imgCanvas.width  - srcX, bw + pad * 2);
        const srcH = Math.min(imgCanvas.height - srcY, bh + pad * 2);
        const srcData = imgCtx.getImageData(srcX, srcY, srcW, srcH);

        // Step 2: put padded source into a temp canvas
        const tmpC = document.createElement('canvas');
        tmpC.width = srcW; tmpC.height = srcH;
        const tmpX = tmpC.getContext('2d');
        tmpX.putImageData(srcData, 0, 0);

        // Step 3: apply Gaussian blur into a same-size blur canvas
        const blurC = document.createElement('canvas');
        blurC.width = srcW; blurC.height = srcH;
        const blurX = blurC.getContext('2d');
        blurX.filter = `blur(${Math.min(blurPx, 100)}px)`;
        blurX.drawImage(tmpC, 0, 0);

        // Step 4: paint the blurred result clipped to the rounded rect,
        // offset so the padded region aligns with bx/by
        const offX = bx - srcX;
        const offY = by - srcY;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, blurRR);
        ctx.clip();
        ctx.drawImage(blurC, offX, offY, bw, bh, bx, by, bw, bh);
        ctx.restore();

      } else {
        // Pixelate (default) — clipped to rounded rect
        const bs = ann.blurSize || 12;
        const srcData = imgCtx.getImageData(bx, by, bw, bh);
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = bw; tmpCanvas.height = bh;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.putImageData(srcData, 0, 0);
        const smallW = Math.max(1, Math.round(bw / bs));
        const smallH = Math.max(1, Math.round(bh / bs));
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = smallW; smallCanvas.height = smallH;
        const smallCtx = smallCanvas.getContext('2d');
        smallCtx.imageSmoothingEnabled = false;
        smallCtx.drawImage(tmpCanvas, 0, 0, smallW, smallH);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, blurRR);
        ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(smallCanvas, 0, 0, smallW, smallH, bx, by, bw, bh);
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
      }
      // Dashed border (rounded)
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, blurRR);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'spotlight':
    case 'circlespotlight':
      // Rendered compositely in redraw() — skip individual rendering
      break;
    case 'number': {
      const r = ann.radius || Math.round(14 * displayScale);
      ctx.beginPath();
      ctx.arc(ann.cx, ann.cy, r, 0, Math.PI * 2);
      ctx.fillStyle = ann.color;
      ctx.fill();
      // Number text
      const numFs = Math.round(r * 1.2);
      ctx.font = `700 ${numFs}px Inter, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ann.num), ann.cx, ann.cy + 1);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      break;
    }
    case 'circleblur': {
      // Elliptical blur — supports pixelate / smooth / blackout (same as rect blur)
      const ebx = Math.min(ann.x, ann.x + ann.w), eby = Math.min(ann.y, ann.y + ann.h);
      const ebw = Math.abs(ann.w), ebh = Math.abs(ann.h);
      if (ebw < 2 || ebh < 2) break;
      const ebStyle = ann.blurStyle || 'pixelate';
      const ebs = ann.blurSize || 12;
      const erx = ebw / 2, ery = ebh / 2;
      const ecx = ebx + erx, ecy = eby + ery;

      // Clip to ellipse
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ecx, ecy, Math.max(erx, 1), Math.max(ery, 1), 0, 0, Math.PI * 2);
      ctx.clip();

      if (ebStyle === 'blackout') {
        ctx.fillStyle = '#000';
        ctx.fillRect(ebx, eby, ebw, ebh);
      } else if (ebStyle === 'smooth') {
        // Gaussian blur for circleblur — same padded-source technique
        const blurPx = Math.max(4, Math.round(ebs * 1.8));
        const pad = Math.min(blurPx * 2, 80);

        const srcX2 = Math.max(0, ebx - pad);
        const srcY2 = Math.max(0, eby - pad);
        const srcW2 = Math.min(imgCanvas.width  - srcX2, ebw + pad * 2);
        const srcH2 = Math.min(imgCanvas.height - srcY2, ebh + pad * 2);
        const srcData2 = imgCtx.getImageData(srcX2, srcY2, srcW2, srcH2);

        const tmpC2 = document.createElement('canvas');
        tmpC2.width = srcW2; tmpC2.height = srcH2;
        const tmpX2 = tmpC2.getContext('2d');
        tmpX2.putImageData(srcData2, 0, 0);

        const blurC2 = document.createElement('canvas');
        blurC2.width = srcW2; blurC2.height = srcH2;
        const blurX2 = blurC2.getContext('2d');
        blurX2.filter = `blur(${Math.min(blurPx, 100)}px)`;
        blurX2.drawImage(tmpC2, 0, 0);

        const offX2 = ebx - srcX2;
        const offY2 = eby - srcY2;
        ctx.drawImage(blurC2, offX2, offY2, ebw, ebh, ebx, eby, ebw, ebh);
      } else {
        // Pixelate (default)
        const srcData2 = imgCtx.getImageData(ebx, eby, ebw, ebh);
        const tmpC2 = document.createElement('canvas');
        tmpC2.width = ebw; tmpC2.height = ebh;
        const tmpX2 = tmpC2.getContext('2d');
        tmpX2.putImageData(srcData2, 0, 0);
        const smW2 = Math.max(1, Math.round(ebw / ebs));
        const smH2 = Math.max(1, Math.round(ebh / ebs));
        const smC2 = document.createElement('canvas');
        smC2.width = smW2; smC2.height = smH2;
        const smX2 = smC2.getContext('2d');
        smX2.imageSmoothingEnabled = false;
        smX2.drawImage(tmpC2, 0, 0, smW2, smH2);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(smC2, 0, 0, smW2, smH2, ebx, eby, ebw, ebh);
        ctx.imageSmoothingEnabled = true;
      }
      ctx.restore();

      // Ellipse border
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(ecx, ecy, Math.max(erx, 1), Math.max(ery, 1), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
  }

  // Selection indicator
  if (isSelected) {
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    const b = getAnnBounds(ann);
    if (b) {
      ctx.beginPath();
      ctx.roundRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8, 6);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    drawHandles(ctx, ann);
  }
  ctx.restore();
}

function getHandles(ann) {
  const handles = [];
  if (ann.type === 'arrow' || ann.type === 'line') {
    handles.push({ id: 'start', x: ann.x1, y: ann.y1, cursor: 'crosshair' });
    handles.push({ id: 'end', x: ann.x2, y: ann.y2, cursor: 'crosshair' });
    const cx = ann.cx !== undefined ? ann.cx : (ann.x1 + ann.x2) / 2;
    const cy = ann.cy !== undefined ? ann.cy : (ann.y1 + ann.y2) / 2;
    handles.push({ id: 'middle', x: cx, y: cy, cursor: 'move' });
  } else if (['rect', 'fillrect', 'squarehighlight', 'circle', 'blur', 'circleblur', 'spotlight', 'circlespotlight'].includes(ann.type)) {
    const x = Math.min(ann.x, ann.x + ann.w);
    const y = Math.min(ann.y, ann.y + ann.h);
    const w = Math.abs(ann.w);
    const h = Math.abs(ann.h);
    handles.push({ id: 'tl', x: x, y: y, cursor: 'nwse-resize' });
    handles.push({ id: 'tr', x: x + w, y: y, cursor: 'nesw-resize' });
    handles.push({ id: 'bl', x: x, y: y + h, cursor: 'nesw-resize' });
    handles.push({ id: 'br', x: x + w, y: y + h, cursor: 'nwse-resize' });
  }
  return handles;
}

function drawHandles(ctx, ann) {
  const handles = getHandles(ann);
  for (const h of handles) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2563eb';
    ctx.stroke();
  }
}

function hitTestHandles(ann, x, y) {
  if (!ann) return null;
  const handles = getHandles(ann);
  const HIT_RADIUS = 24;
  for (const h of handles) {
    const dx = h.x - x;
    const dy = h.y - y;
    if (Math.sqrt(dx*dx + dy*dy) <= HIT_RADIUS) {
      return h;
    }
  }
  return null;
}

function getCropHandles() {
  if (!cropBox) return [];
  const {x, y, w, h} = cropBox;
  const mx = x + w/2;
  const my = y + h/2;
  return [
    {id:'tl', x, y, cursor:'nwse-resize'},
    {id:'tr', x:x+w, y, cursor:'nesw-resize'},
    {id:'bl', x, y:y+h, cursor:'nesw-resize'},
    {id:'br', x:x+w, y:y+h, cursor:'nwse-resize'},
    {id:'t', x:mx, y, cursor:'ns-resize'},
    {id:'b', x:mx, y:y+h, cursor:'ns-resize'},
    {id:'l', x, y:my, cursor:'ew-resize'},
    {id:'r', x:x+w, y:my, cursor:'ew-resize'}
  ];
}

function hitTestCropHandles(px, py) {
  if (!cropBox) return null;
  const handles = getCropHandles();
  for (const h of handles) {
    const dx = h.x - px, dy = h.y - py;
    if (Math.sqrt(dx*dx + dy*dy) <= 24 * displayScale) return h;
  }
  if (px >= cropBox.x && px <= cropBox.x + cropBox.w && py >= cropBox.y && py <= cropBox.y + cropBox.h) {
    return { id: 'move', cursor: 'move' };
  }
  return null;
}

/* ── Bounding box for any annotation ── */
function getAnnBounds(ann) {
  switch (ann.type) {
    case 'rect': case 'fillrect': case 'squarehighlight': case 'circle': case 'blur': case 'circleblur': case 'spotlight': case 'circlespotlight': {
      const x = Math.min(ann.x, ann.x + ann.w), y = Math.min(ann.y, ann.y + ann.h);
      return { x, y, w: Math.abs(ann.w), h: Math.abs(ann.h) };
    }
    case 'arrow': case 'line': {
      const cx = ann.cx !== undefined ? ann.cx : (ann.x1 + ann.x2) / 2;
      const cy = ann.cy !== undefined ? ann.cy : (ann.y1 + ann.y2) / 2;
      const minX = Math.min(ann.x1, ann.x2, cx);
      const maxX = Math.max(ann.x1, ann.x2, cx);
      const minY = Math.min(ann.y1, ann.y2, cy);
      const maxY = Math.max(ann.y1, ann.y2, cy);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'text': {
      const fs = ann.fontSize || 16;
      const ts = ann.textStyle || 'standard';
      const isMono = (ts === 'mono');
      const fontFam = isMono ? '"SF Mono", "Fira Code", "Consolas", monospace' : 'Inter, sans-serif';
      drawCtx.font = `600 ${fs}px ${fontFam}`;
      
      const lines = ann.text.split('\n');
      let maxW = 0;
      for (const line of lines) {
        maxW = Math.max(maxW, drawCtx.measureText(line).width);
      }
      
      const pad = Math.round(fs * 0.3);
      const h = fs * lines.length + pad * 2 + (lines.length - 1) * fs * 0.2;
      
      if (ts === 'box') {
        return { x: ann.x - pad * 1.5, y: ann.y - fs + 1, w: maxW + pad * 3, h: h };
      }
      return { x: ann.x - pad, y: ann.y - fs, w: maxW + pad * 2, h: h };
    }
    case 'freehand': case 'highlighter': {
      if (!ann.points.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of ann.points) { minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'number': {
      const r = ann.radius || Math.round(16 * displayScale);
      return { x: ann.cx - r, y: ann.cy - r, w: r * 2, h: r * 2 };
    }
  }
  return null;
}

/* Helper for line/curve distance */
function distSqToSegment(px, py, vx, vy, wx, wy) {
  const l2 = (vx - wx)**2 + (vy - wy)**2;
  if (l2 === 0) return (px - vx)**2 + (py - vy)**2;
  let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = vx + t * (wx - vx);
  const projY = vy + t * (wy - wy);
  return (px - projX)**2 + (py - projY)**2;
}

/* ── Hit-test: is point (px,py) inside annotation? ── */
function hitTest(ann, px, py) {
  const m = 6; // margin
  const b = getAnnBounds(ann);
  if (!b) return false;

  if (ann.type === 'rect') {
    const inOuter = px >= b.x - m && px <= b.x + b.w + m && py >= b.y - m && py <= b.y + b.h + m;
    if (!inOuter) return false;
    
    const hitArea = m + (ann.stroke || 4);
    if (b.w > hitArea * 2 && b.h > hitArea * 2) {
      const inInner = px > b.x + hitArea && px < b.x + b.w - hitArea &&
                      py > b.y + hitArea && py < b.y + b.h - hitArea;
      if (inInner) return false;
    }
    return true;
  }

  if (ann.type === 'circle') {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const rx = b.w / 2;
    const ry = b.h / 2;

    if (rx === 0 || ry === 0) return false;

    const dx = px - cx;
    const dy = py - cy;
    
    const outerRx = rx + m;
    const outerRy = ry + m;
    const outerDistSq = (dx * dx) / (outerRx * outerRx) + (dy * dy) / (outerRy * outerRy);
    if (outerDistSq > 1) return false;
    
    const hitArea = m + (ann.stroke || 4);
    const innerRx = rx - hitArea;
    const innerRy = ry - hitArea;
    
    if (innerRx > 0 && innerRy > 0) {
      const innerDistSq = (dx * dx) / (innerRx * innerRx) + (dy * dy) / (innerRy * innerRy);
      if (innerDistSq < 1) return false;
    }
    return true;
  }

  if (ann.type === 'arrow' || ann.type === 'line') {
    const inOuter = px >= b.x - m && px <= b.x + b.w + m && py >= b.y - m && py <= b.y + b.h + m;
    if (!inOuter) return false;

    const cx = ann.cx !== undefined ? ann.cx : (ann.x1 + ann.x2) / 2;
    const cy = ann.cy !== undefined ? ann.cy : (ann.y1 + ann.y2) / 2;
    
    let minDistSq = Infinity;
    const steps = 20;
    let lastX = ann.x1;
    let lastY = ann.y1;
    
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const curX = mt * mt * ann.x1 + 2 * mt * t * cx + t * t * ann.x2;
      const curY = mt * mt * ann.y1 + 2 * mt * t * cy + t * t * ann.y2;
      
      const distSq = distSqToSegment(px, py, lastX, lastY, curX, curY);
      if (distSq < minDistSq) minDistSq = distSq;
      
      lastX = curX;
      lastY = curY;
    }
    
    const hitRadius = (ann.stroke || 4) + 8; // 8px extended selection zone
    return minDistSq <= hitRadius * hitRadius;
  }

  if (ann.type === 'freehand' || ann.type === 'highlighter') {
    const inOuter = px >= b.x - m && px <= b.x + b.w + m && py >= b.y - m && py <= b.y + b.h + m;
    if (!inOuter) return false;

    if (!ann.points || ann.points.length === 0) return false;
    let minDistSq = Infinity;
    for (let i = 1; i < ann.points.length; i++) {
      const vx = ann.points[i-1][0];
      const vy = ann.points[i-1][1];
      const wx = ann.points[i][0];
      const wy = ann.points[i][1];
      const distSq = distSqToSegment(px, py, vx, vy, wx, wy);
      if (distSq < minDistSq) minDistSq = distSq;
    }
    
    const baseStroke = ann.type === 'highlighter' ? ann.stroke * 4 : (ann.stroke || 4);
    const hitRadius = (baseStroke / 2) + 8;
    return minDistSq <= hitRadius * hitRadius;
  }

  // Expand bounds by margin
  return px >= b.x - m && px <= b.x + b.w + m && py >= b.y - m && py <= b.y + b.h + m;
}

function hitTestAll(px, py) {
  // Reverse order — topmost (last) first
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (hitTest(annotations[i], px, py)) return i;
  }
  return -1;
}

function drawArrow(ctx, x1, y1, x2, y2, stroke, style, cx, cy) {
  style = style || 'standard';
  if (cx === undefined) cx = (x1 + x2) / 2;
  if (cy === undefined) cy = (y1 + y2) / 2;

  const unscaled = stroke / (displayScale || 1);
  const mappedUnscaled = 7 + ((unscaled - 1) / 11) * 53;
  const baseStroke = mappedUnscaled * (displayScale || 1); 
  const headLen = Math.max(baseStroke * 4, 20);

  // Bezier evaluation helpers
  const getB = (t) => {
    const mt = 1 - t;
    return {
      x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
      y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2
    };
  };

  const endAngle = Math.atan2(y2 - cy, x2 - cx);
  const startAngle = Math.atan2(y1 - cy, x1 - cx);

  // Calculate curve length approximately
  const stepsForLen = 20;
  let len = 0;
  let lastP = {x: x1, y: y1};
  for (let i = 1; i <= stepsForLen; i++) {
    const p = getB(i / stepsForLen);
    len += Math.hypot(p.x - lastP.x, p.y - lastP.y);
    lastP = p;
  }

  if (style === 'fancy') {
    const shaftEndLen = Math.max(0.1, len - headLen * 0.8);
    const steps = Math.max(Math.round(len / 3), 12);
    ctx.lineCap = 'round';
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      // Map linear distance to t
      const pt0 = getB(t0 * (shaftEndLen / len));
      const pt1 = getB(Math.min(1, t1 * (shaftEndLen / len)));
      const w = Math.max(2, baseStroke * 0.3 + (baseStroke * 1.2) * t0);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pt0.x, pt0.y);
      ctx.lineTo(pt1.x, pt1.y);
      ctx.stroke();
    }
    // Large filled arrowhead
    const hW = headLen * 0.55;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(endAngle) + hW * Math.sin(endAngle),
               y2 - headLen * Math.sin(endAngle) - hW * Math.cos(endAngle));
    ctx.lineTo(x2 - headLen * 0.65 * Math.cos(endAngle), y2 - headLen * 0.65 * Math.sin(endAngle));
    ctx.lineTo(x2 - headLen * Math.cos(endAngle) - hW * Math.sin(endAngle),
               y2 - headLen * Math.sin(endAngle) + hW * Math.cos(endAngle));
    ctx.closePath();
    ctx.fill();

  } else if (style === 'double') {
    ctx.lineWidth = Math.max(baseStroke, 3);
    const tailAngle = startAngle;
    
    // Draw shaft leaving space for both heads
    const startT = Math.min(0.4, (headLen * 0.7) / len);
    const endT = Math.max(0.6, 1 - (headLen * 0.7) / len);
    const pStart = getB(startT);
    const pEnd = getB(endT);
    
    ctx.beginPath();
    ctx.moveTo(pStart.x, pStart.y);
    ctx.quadraticCurveTo(cx, cy, pEnd.x, pEnd.y);
    ctx.stroke();
    
    // Head 1 (at x2, y2)
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(endAngle - Math.PI / 7), y2 - headLen * Math.sin(endAngle - Math.PI / 7));
    ctx.lineTo(x2 - headLen * Math.cos(endAngle + Math.PI / 7), y2 - headLen * Math.sin(endAngle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
    
    // Head 2 (at x1, y1)
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - headLen * Math.cos(tailAngle - Math.PI / 7), y1 - headLen * Math.sin(tailAngle - Math.PI / 7));
    ctx.lineTo(x1 - headLen * Math.cos(tailAngle + Math.PI / 7), y1 - headLen * Math.sin(tailAngle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();

  } else {
    // Standard and curved
    ctx.lineWidth = Math.max(baseStroke, 3);
    const endT = Math.max(0.1, 1 - (headLen * 0.5) / len);
    const pEnd = getB(endT);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, pEnd.x, pEnd.y);
    ctx.stroke();

    // Filled arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(endAngle - Math.PI / 7), y2 - headLen * Math.sin(endAngle - Math.PI / 7));
    ctx.lineTo(x2 - headLen * Math.cos(endAngle + Math.PI / 7), y2 - headLen * Math.sin(endAngle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  }
}

/* ─────────────────────────────────────────────
   DRAWING / SELECTION HANDLERS
   ───────────────────────────────────────────── */

function getPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  // Map CSS display coordinates → full-res canvas coordinates.
  // Divide by canvasWrapScale to compensate for CSS zoom transform on canvas-wrap.
  return {
    x: (e.clientX - rect.left) / canvasWrapScale * displayScale,
    y: (e.clientY - rect.top)  / canvasWrapScale * displayScale,
  };
}

function applyShiftConstraint(p, e) {
  if (!e.shiftKey) return p;
  const dx = p.x - drawStartX;
  const dy = p.y - drawStartY;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  
  if (['rect', 'fillrect', 'squarehighlight', 'circle', 'blur', 'circleblur', 'spotlight', 'circlespotlight'].includes(currentTool)) {
    const size = Math.max(adx, ady);
    return {
      x: drawStartX + (Math.sign(dx) || 1) * size,
      y: drawStartY + (Math.sign(dy) || 1) * size
    };
  } else if (['line', 'arrow'].includes(currentTool)) {
    if (adx > ady * 2) {
      return { x: p.x, y: drawStartY };
    } else if (ady > adx * 2) {
      return { x: drawStartX, y: p.y };
    } else {
      const size = Math.max(adx, ady);
      return {
        x: drawStartX + (Math.sign(dx) || 1) * size,
        y: drawStartY + (Math.sign(dy) || 1) * size
      };
    }
  }
  return p;
}

/* Helper: move annotation by dx,dy */
function moveAnnotation(ann, dx, dy) {
  switch (ann.type) {
    case 'rect': case 'fillrect': case 'squarehighlight': case 'circle': case 'blur': case 'circleblur': case 'spotlight': case 'circlespotlight':
      ann.x += dx; ann.y += dy; break;
    case 'arrow': case 'line':
      ann.x1 += dx; ann.y1 += dy; ann.x2 += dx; ann.y2 += dy;
      if (ann.cx !== undefined) { ann.cx += dx; ann.cy += dy; }
      break;
    case 'text':
      ann.x += dx; ann.y += dy; break;
    case 'freehand': case 'highlighter':
      for (const pt of ann.points) { pt[0] += dx; pt[1] += dy; } break;
    case 'number':
      ann.cx += dx; ann.cy += dy; break;
  }
}

/* Helper: bring annotation to top of stack */
function bringToFront(idx) {
  if (idx < 0 || idx >= annotations.length) return;
  const ann = annotations.splice(idx, 1)[0];
  annotations.push(ann);
  redoStack = [];
  selectedIdx = annotations.length - 1;
}

let isDraggingHandle = false;
let activeHandle = null;
let lastTextClickTime = 0;
let lastTextClickAnn = null;

drawCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const p = getPos(e);

  if (currentTool === 'crop') {
    const handleHit = hitTestCropHandles(p.x, p.y);
    if (handleHit) {
      isDraggingHandle = true;
      activeHandle = handleHit.id;
      dragOffsetX = p.x;
      dragOffsetY = p.y;
    } else {
      // Allow clicking outside to quickly set a new crop box start point?
      // For now, if they click outside handles in crop mode, we could just reset it.
    }
    return;
  }

  // 0) Check if clicking a handle of the currently selected annotation
  if (selectedIdx >= 0) {
    const handleHit = hitTestHandles(annotations[selectedIdx], p.x, p.y);
    if (handleHit) {
      isDraggingHandle = true;
      activeHandle = handleHit.id;
      return; // Skip other logic
    }
  }

  // 1) Always try hit-test first (regardless of tool)
  const hitIdx = hitTestAll(p.x, p.y);

  // Manual double-click detection for text editing
  const now = Date.now();
  if (hitIdx >= 0 && annotations[hitIdx].type === 'text') {
    const clickedAnn = annotations[hitIdx];
    if (now - lastTextClickTime < 400 && lastTextClickAnn === clickedAnn) {
      selectedIdx = hitIdx;
      bringToFront(hitIdx);
      editExistingText(annotations.length - 1);
      lastTextClickTime = 0;
      lastTextClickAnn = null;
      return; // Prevent further mousedown logic
    }
    lastTextClickTime = now;
    lastTextClickAnn = clickedAnn;
  } else {
    lastTextClickTime = 0;
    lastTextClickAnn = null;
  }

  // 2) Select tool — only select/move, never draw
  if (currentTool === 'select') {
    if (hitIdx >= 0) {
      selectedIdx = hitIdx;
      bringToFront(hitIdx);
      isDragging = true;
      dragOffsetX = p.x;
      dragOffsetY = p.y;
      drawCanvas.style.cursor = 'grabbing';
      redraw();
    } else {
      selectedIdx = -1;
      redraw();
    }
    return;
  }

  // 3) Text tool — click to place
  if (currentTool === 'text') {
    if (hitIdx >= 0 && annotations[hitIdx].type === 'text') {
      selectedIdx = hitIdx;
      bringToFront(hitIdx);
      isDragging = true;
      dragOffsetX = p.x;
      dragOffsetY = p.y;
      redraw();
    } else {
      selectedIdx = -1;
      showTextInput(p.x, p.y);
    }
    return;
  }

  // 3b) Number tool — click to place numbered badge
  if (currentTool === 'number') {
    if (hitIdx >= 0 && annotations[hitIdx].type === 'number') {
      selectedIdx = hitIdx;
      bringToFront(hitIdx);
      isDragging = true;
      dragOffsetX = p.x;
      dragOffsetY = p.y;
      redraw();
    } else {
      selectedIdx = -1;
      const r = Math.round(numberRadius * displayScale);
      annotations.push({ type: 'number', cx: p.x, cy: p.y, num: getNextNumber(), color: currentColor, stroke: currentStroke, radius: r });
      redoStack = [];
      selectedIdx = annotations.length - 1;
      redraw();
      window.lensEditor.markDirty();
    }
    return;
  }

  // 3c) Eraser tool — click to remove annotation under cursor
  if (currentTool === 'eraser') {
    if (hitIdx >= 0) {
      // If removing a number, recalculate counter
      const removed = annotations[hitIdx];
      annotations.splice(hitIdx, 1);
      redoStack = [];
      selectedIdx = -1;
      redraw();
      window.lensEditor.markDirty();
      showToast('Annotation removed');
    }
    return;
  }

  // 4) Drawing tools — if clicking on existing annotation, select it instead
  if (hitIdx >= 0) {
    const clickedAnn = annotations[hitIdx];
    const isBlurType = clickedAnn.type === 'blur' || clickedAnn.type === 'circleblur';
    // For blur/circleblur: first click only selects; a second click (already selected) starts drag.
    // This prevents accidental moves when the user wants to draw on top of a blur layer.
    if (isBlurType && selectedIdx !== hitIdx) {
      // First click → just select, do NOT drag
      selectedIdx = hitIdx;
      redraw();
      return;
    }
    selectedIdx = hitIdx;
    bringToFront(hitIdx);
    isDragging = true;
    dragOffsetX = p.x;
    dragOffsetY = p.y;
    drawCanvas.style.cursor = 'grabbing';
    redraw();
    return;
  }

  // 5) Start drawing new annotation
  selectedIdx = -1;
  isDrawing = true;
  drawStartX = p.x;
  drawStartY = p.y;
  if (currentTool === 'freehand' || currentTool === 'highlighter') {
    freehandPoints = [[p.x, p.y]];
  }
  redraw();
});

drawCanvas.addEventListener('mousemove', (e) => {
  let p = getPos(e);

  // Resizing/Reorienting a selected annotation or Crop Box
  if (isDraggingHandle) {
    if (currentTool === 'crop' && cropBox) {
      if (activeHandle === 'move') {
        const dx = p.x - dragOffsetX;
        const dy = p.y - dragOffsetY;
        cropBox.x += dx;
        cropBox.y += dy;
        dragOffsetX = p.x;
        dragOffsetY = p.y;
      } else {
        const currentX1 = cropBox.x;
        const currentY1 = cropBox.y;
        const currentX2 = currentX1 + cropBox.w;
        const currentY2 = currentY1 + cropBox.h;
        
        let newX1 = currentX1; let newY1 = currentY1;
        let newX2 = currentX2; let newY2 = currentY2;

        if (activeHandle.includes('l')) newX1 = p.x;
        if (activeHandle.includes('r')) newX2 = p.x;
        if (activeHandle.includes('t')) newY1 = p.y;
        if (activeHandle.includes('b')) newY2 = p.y;

        cropBox.x = Math.min(newX1, newX2);
        cropBox.y = Math.min(newY1, newY2);
        cropBox.w = Math.abs(newX2 - newX1);
        cropBox.h = Math.abs(newY2 - newY1);
      }
      redraw();
      return;
    }

    if (selectedIdx >= 0) {
      const ann = annotations[selectedIdx];
    if (activeHandle === 'start') {
      ann.x1 = p.x; ann.y1 = p.y;
    } else if (activeHandle === 'end') {
      ann.x2 = p.x; ann.y2 = p.y;
    } else if (activeHandle === 'middle') {
      ann.cx = p.x; ann.cy = p.y;
    } else if (['tl', 'tr', 'bl', 'br'].includes(activeHandle)) {
      const currentX1 = ann.w < 0 ? ann.x + ann.w : ann.x;
      const currentY1 = ann.h < 0 ? ann.y + ann.h : ann.y;
      const currentX2 = currentX1 + Math.abs(ann.w);
      const currentY2 = currentY1 + Math.abs(ann.h);
      
      let newX1 = currentX1; let newY1 = currentY1;
      let newX2 = currentX2; let newY2 = currentY2;

      if (activeHandle === 'tl') { newX1 = p.x; newY1 = p.y; }
      if (activeHandle === 'tr') { newX2 = p.x; newY1 = p.y; }
      if (activeHandle === 'bl') { newX1 = p.x; newY2 = p.y; }
      if (activeHandle === 'br') { newX2 = p.x; newY2 = p.y; }

      ann.x = newX1;
      ann.y = newY1;
      ann.w = newX2 - newX1;
      ann.h = newY2 - newY1;
    }
    redraw();
    return;
  }
  }
  // Moving a selected annotation
  if (isDragging && selectedIdx >= 0) {
    const dx = p.x - dragOffsetX;
    const dy = p.y - dragOffsetY;
    moveAnnotation(annotations[selectedIdx], dx, dy);
    dragOffsetX = p.x;
    dragOffsetY = p.y;
    redraw();
    return;
  }

  // Drawing preview
  if (!isDrawing) {
    if (currentTool === 'crop') {
      const hit = hitTestCropHandles(p.x, p.y);
      drawCanvas.style.cursor = hit ? hit.cursor : 'crosshair';
      return;
    }

    // Hover cursor
    let handleHit = null;
    if (selectedIdx >= 0) {
      handleHit = hitTestHandles(annotations[selectedIdx], p.x, p.y);
    }
    if (handleHit) {
      drawCanvas.style.cursor = handleHit.cursor;
    } else {
      const hit = hitTestAll(p.x, p.y);
      if (hit >= 0) {
        drawCanvas.style.cursor = currentTool === 'eraser' ? 'pointer' : 'grab';
      } else if (currentTool === 'select') {
        drawCanvas.style.cursor = 'default';
      } else if (currentTool === 'text') {
        drawCanvas.style.cursor = 'text';
      } else if (currentTool === 'number') {
        drawCanvas.style.cursor = 'copy';
      } else if (currentTool === 'eraser') {
        drawCanvas.style.cursor = 'not-allowed';
      } else {
        drawCanvas.style.cursor = 'crosshair';
      }
    }
    return;
  }

  p = applyShiftConstraint(p, e);
  redraw();
  drawCtx.save();
  drawCtx.strokeStyle = currentColor;
  drawCtx.fillStyle   = currentColor;
  drawCtx.lineWidth   = currentStroke;
  drawCtx.lineCap     = 'round';
  drawCtx.lineJoin    = 'round';

  switch (currentTool) {
    case 'arrow':
      drawArrow(drawCtx, drawStartX, drawStartY, p.x, p.y, currentStroke, arrowStyle);
      break;
    case 'rect': {
      const prr = Math.max(6, currentStroke * 2);
      drawCtx.beginPath();
      drawCtx.roundRect(drawStartX, drawStartY, p.x - drawStartX, p.y - drawStartY, prr);
      drawCtx.stroke();
      break;
    }
    case 'fillrect': {
      const pfrr = Math.max(6, currentStroke * 2);
      drawCtx.beginPath();
      drawCtx.roundRect(drawStartX, drawStartY, p.x - drawStartX, p.y - drawStartY, pfrr);
      drawCtx.fill();
      break;
    }
    case 'squarehighlight': {
      const shrr = Math.max(6, currentStroke * 2);
      drawCtx.globalAlpha = 0.30;
      drawCtx.beginPath();
      drawCtx.roundRect(drawStartX, drawStartY, p.x - drawStartX, p.y - drawStartY, shrr);
      drawCtx.fill();
      drawCtx.globalAlpha = 0.7;
      drawCtx.lineWidth = Math.max(2, currentStroke * 0.8);
      drawCtx.beginPath();
      drawCtx.roundRect(drawStartX, drawStartY, p.x - drawStartX, p.y - drawStartY, shrr);
      drawCtx.stroke();
      drawCtx.globalAlpha = 1;
      break;
    }
    case 'circle': {
      const w = p.x - drawStartX, h = p.y - drawStartY;
      const rx = Math.abs(w) / 2, ry = Math.abs(h) / 2;
      const cx = drawStartX + w / 2, cy = drawStartY + h / 2;
      drawCtx.beginPath();
      drawCtx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      drawCtx.stroke();
      break;
    }
    case 'line':
      drawCtx.beginPath();
      drawCtx.moveTo(drawStartX, drawStartY);
      drawCtx.lineTo(p.x, p.y);
      drawCtx.stroke();
      break;
    case 'freehand':
      freehandPoints.push([p.x, p.y]);
      drawCtx.beginPath();
      drawCtx.moveTo(freehandPoints[0][0], freehandPoints[0][1]);
      for (let i = 1; i < freehandPoints.length; i++) drawCtx.lineTo(freehandPoints[i][0], freehandPoints[i][1]);
      drawCtx.stroke();
      break;
    case 'highlighter':
      freehandPoints.push([p.x, p.y]);
      drawCtx.globalAlpha = 0.35;
      drawCtx.lineWidth = currentStroke * 4;
      drawCtx.beginPath();
      drawCtx.moveTo(freehandPoints[0][0], freehandPoints[0][1]);
      for (let i = 1; i < freehandPoints.length; i++) drawCtx.lineTo(freehandPoints[i][0], freehandPoints[i][1]);
      drawCtx.stroke();
      break;
    case 'blur': {
      // Preview: dashed rectangle outline
      const bw = p.x - drawStartX, bh = p.y - drawStartY;
      const pbrr = Math.max(6, Math.min(Math.abs(bw), Math.abs(bh)) * 0.04);
      drawCtx.strokeStyle = 'rgba(255,255,255,0.4)';
      drawCtx.lineWidth = 1.5;
      drawCtx.setLineDash([6, 4]);
      drawCtx.beginPath();
      drawCtx.roundRect(drawStartX, drawStartY, bw, bh, pbrr);
      drawCtx.stroke();
      drawCtx.setLineDash([]);
      // Pixelation label
      drawCtx.fillStyle = 'rgba(0,0,0,0.6)';
      const lblX = Math.min(drawStartX, p.x), lblY = Math.min(drawStartY, p.y) - 8 * displayScale;
      drawCtx.font = `500 ${Math.round(11 * displayScale)}px Inter, sans-serif`;
      const blurLabel = blurStyle === 'smooth' ? 'Blur' : blurStyle === 'blackout' ? 'Black Out' : 'Pixelate';
      drawCtx.fillText(blurLabel, lblX, lblY);
      break;
    }
    case 'circleblur': {
      // Preview: dashed ellipse outline
      const cbw = p.x - drawStartX, cbh = p.y - drawStartY;
      const cbrx = Math.abs(cbw) / 2, cbry = Math.abs(cbh) / 2;
      const cbcx = drawStartX + cbw / 2, cbcy = drawStartY + cbh / 2;
      drawCtx.strokeStyle = 'rgba(255,255,255,0.4)';
      drawCtx.lineWidth = 1.5;
      drawCtx.setLineDash([6, 4]);
      drawCtx.beginPath();
      drawCtx.ellipse(cbcx, cbcy, Math.max(cbrx, 1), Math.max(cbry, 1), 0, 0, Math.PI * 2);
      drawCtx.stroke();
      drawCtx.setLineDash([]);
      break;
    }
    case 'spotlight':
    case 'circlespotlight': {
      // Composite preview: include existing spotlights + the one being drawn
      // First clear the existing spotlight overlay that redraw() painted
      // (we need to re-draw the entire composite with the new preview cutout)
      const pcw = drawCtx.canvas.width, pch = drawCtx.canvas.height;
      drawCtx.clearRect(0, 0, pcw, pch);

      // Collect existing spotlight annotations
      const existingSpots = annotations.filter(a => a.type === 'spotlight' || a.type === 'circlespotlight');
      const previewDark = spotlightDarkness / 100;

      // Build single overlay with ALL cutouts (existing + preview)
      drawCtx.fillStyle = `rgba(0,0,0,${previewDark})`;
      drawCtx.beginPath();
      drawCtx.rect(0, 0, pcw, pch);

      // Cut out existing spotlight regions
      for (const sp of existingSpots) {
        const esx = Math.min(sp.x, sp.x + sp.w), esy = Math.min(sp.y, sp.y + sp.h);
        const esw = Math.abs(sp.w), esh = Math.abs(sp.h);
        if (esw < 2 || esh < 2) continue;
        if (sp.type === 'spotlight') {
          const espRR = Math.max(8, Math.min(esw, esh) * 0.05);
          drawCtx.roundRect(esx, esy, esw, esh, espRR);
        } else {
          const eerx = esw / 2, eery = esh / 2;
          const eecx = esx + eerx, eecy = esy + eery;
          drawCtx.moveTo(eecx + Math.max(eerx, 1), eecy);
          drawCtx.ellipse(eecx, eecy, Math.max(eerx, 1), Math.max(eery, 1), 0, 0, Math.PI * 2);
        }
      }

      // Cut out the preview region being drawn
      if (currentTool === 'spotlight') {
        const psw = p.x - drawStartX, psh = p.y - drawStartY;
        const psx = Math.min(drawStartX, p.x), psy = Math.min(drawStartY, p.y);
        const paw = Math.abs(psw), pah = Math.abs(psh);
        const pspRR = Math.max(8, Math.min(paw, pah) * 0.05);
        drawCtx.roundRect(psx, psy, paw, pah, pspRR);
      } else {
        const pcsw = p.x - drawStartX, pcsh = p.y - drawStartY;
        const pcsrx = Math.abs(pcsw) / 2, pcsry = Math.abs(pcsh) / 2;
        const pcscx = drawStartX + pcsw / 2, pcscy = drawStartY + pcsh / 2;
        drawCtx.moveTo(pcscx + Math.max(pcsrx, 1), pcscy);
        drawCtx.ellipse(pcscx, pcscy, Math.max(pcsrx, 1), Math.max(pcsry, 1), 0, 0, Math.PI * 2);
      }

      drawCtx.fill('evenodd');

      // Draw borders for existing spotlights
      for (const sp of existingSpots) {
        const esx = Math.min(sp.x, sp.x + sp.w), esy = Math.min(sp.y, sp.y + sp.h);
        const esw = Math.abs(sp.w), esh = Math.abs(sp.h);
        if (esw < 2 || esh < 2) continue;
        drawCtx.save();
        drawCtx.strokeStyle = sp.color || 'rgba(255,255,255,0.5)';
        drawCtx.lineWidth = sp.stroke || 2;
        drawCtx.beginPath();
        if (sp.type === 'spotlight') {
          const espRR = Math.max(8, Math.min(esw, esh) * 0.05);
          drawCtx.roundRect(esx, esy, esw, esh, espRR);
        } else {
          const eerx = esw / 2, eery = esh / 2;
          const eecx = esx + eerx, eecy = esy + eery;
          drawCtx.ellipse(eecx, eecy, Math.max(eerx, 1), Math.max(eery, 1), 0, 0, Math.PI * 2);
        }
        drawCtx.stroke();
        drawCtx.restore();
      }

      // Draw border for the preview being drawn
      drawCtx.strokeStyle = currentColor;
      drawCtx.lineWidth = currentStroke;
      drawCtx.beginPath();
      if (currentTool === 'spotlight') {
        const psw = p.x - drawStartX, psh = p.y - drawStartY;
        const psx = Math.min(drawStartX, p.x), psy = Math.min(drawStartY, p.y);
        const paw = Math.abs(psw), pah = Math.abs(psh);
        const pspRR = Math.max(8, Math.min(paw, pah) * 0.05);
        drawCtx.roundRect(psx, psy, paw, pah, pspRR);
      } else {
        const pcsw = p.x - drawStartX, pcsh = p.y - drawStartY;
        const pcsrx = Math.abs(pcsw) / 2, pcsry = Math.abs(pcsh) / 2;
        const pcscx = drawStartX + pcsw / 2, pcscy = drawStartY + pcsh / 2;
        drawCtx.ellipse(pcscx, pcscy, Math.max(pcsrx, 1), Math.max(pcsry, 1), 0, 0, Math.PI * 2);
      }
      drawCtx.stroke();

      // Re-render non-spotlight annotations on top of the overlay
      for (let i = 0; i < annotations.length; i++) {
        const a = annotations[i];
        if (a.type === 'spotlight' || a.type === 'circlespotlight') continue;
        renderAnnotation(drawCtx, a, i === selectedIdx);
      }
      break;
    }
  }
  drawCtx.restore();
});

drawCanvas.addEventListener('mouseup', (e) => {
  e.stopPropagation(); // handled here — don't let window.mouseup double-fire
  let p = getPos(e);
  p = applyShiftConstraint(p, e);
  releaseDragOrDraw(p.x, p.y);
});


/* ── Sticky-drag fix: release on window mouseup if cursor left canvas ──
   Clamps position to the canvas boundary so the element settles at the edge. */
function clampToCanvas(x, y) {
  return {
    x: Math.max(0, Math.min(drawCanvas.width,  x)),
    y: Math.max(0, Math.min(drawCanvas.height, y)),
  };
}

function releaseDragOrDraw(rawX, rawY) {
  // End handle drag
  if (isDraggingHandle) {
    isDraggingHandle = false;
    activeHandle = null;
    redraw();
    window.lensEditor.markDirty();
    drawCanvas.style.cursor = currentTool === 'select' ? 'default' : 'crosshair';
    return;
  }

  // End annotation drag — clamp to canvas boundary
  if (isDragging) {
    isDragging = false;
    if (selectedIdx >= 0) {
      const ann = annotations[selectedIdx];
      const bounds = getAnnBounds(ann);
      if (bounds) {
        // Clamp so the element doesn't escape the canvas
        const clamped = clampToCanvas(rawX, rawY);
        const dx = clamped.x - (rawX);
        const dy = clamped.y - (rawY);
        // Nudge the annotation back inside if needed
        if (ann.x !== undefined)  { ann.x = Math.max(0, Math.min(drawCanvas.width,  ann.x));  }
        if (ann.y !== undefined)  { ann.y = Math.max(0, Math.min(drawCanvas.height, ann.y));  }
        if (ann.x1 !== undefined) { ann.x1 = Math.max(0, Math.min(drawCanvas.width,  ann.x1)); }
        if (ann.y1 !== undefined) { ann.y1 = Math.max(0, Math.min(drawCanvas.height, ann.y1)); }
        if (ann.x2 !== undefined) { ann.x2 = Math.max(0, Math.min(drawCanvas.width,  ann.x2)); }
        if (ann.y2 !== undefined) { ann.y2 = Math.max(0, Math.min(drawCanvas.height, ann.y2)); }
      }
    }
    redraw();
    window.lensEditor.markDirty();
    drawCanvas.style.cursor = currentTool === 'select' ? 'default' : 'crosshair';
    return;
  }

  // End drawing — commit whatever was drawn, clamped to canvas edge
  if (isDrawing) {
    isDrawing = false;
    const p = clampToCanvas(rawX, rawY);

    const dragDist = Math.hypot(p.x - drawStartX, p.y - drawStartY);
    if (currentTool !== 'text' && currentTool !== 'number' && dragDist < 5) {
      freehandPoints = [];
      redraw();
      return;
    }

    let ann = null;
    switch (currentTool) {
      case 'arrow':        ann = { type: 'arrow', x1: drawStartX, y1: drawStartY, x2: p.x, y2: p.y, color: currentColor, stroke: currentStroke, arrowStyle }; break;
      case 'rect':         ann = { type: 'rect', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke }; break;
      case 'fillrect':     ann = { type: 'fillrect', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke }; break;
      case 'squarehighlight': ann = { type: 'squarehighlight', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke }; break;
      case 'circle':       ann = { type: 'circle', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke }; break;
      case 'line':         ann = { type: 'line', x1: drawStartX, y1: drawStartY, x2: p.x, y2: p.y, color: currentColor, stroke: currentStroke }; break;
      case 'freehand':     freehandPoints.push([p.x, p.y]); ann = { type: 'freehand', points: [...freehandPoints], color: currentColor, stroke: currentStroke }; break;
      case 'highlighter':  freehandPoints.push([p.x, p.y]); ann = { type: 'highlighter', points: [...freehandPoints], color: currentColor, stroke: currentStroke }; break;
      case 'blur':         ann = { type: 'blur', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke, blurSize: blurIntensity, blurStyle }; break;
      case 'circleblur':   ann = { type: 'circleblur', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke, blurSize: blurIntensity, blurStyle }; break;
      case 'spotlight':    ann = { type: 'spotlight', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke, darkness: spotlightDarkness }; break;
      case 'circlespotlight': ann = { type: 'circlespotlight', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke, darkness: spotlightDarkness }; break;
    }
    if (ann) {
      annotations.push(ann);
      redoStack = [];
      selectedIdx = annotations.length - 1;
      redraw();
      window.lensEditor.markDirty();
    }
    freehandPoints = [];
  }
}

// Global mouseup — fires even if mouse is released outside the canvas / window
window.addEventListener('mouseup', (e) => {
  if (!isDragging && !isDraggingHandle && !isDrawing) return;
  // Convert client coords to canvas coords
  const rect = drawCanvas.getBoundingClientRect();
  const rawX = (e.clientX - rect.left) * displayScale;
  const rawY = (e.clientY - rect.top)  * displayScale;
  releaseDragOrDraw(rawX, rawY);
});



/* ── Double-click to re-edit text ── */
drawCanvas.addEventListener('dblclick', (e) => {
  const p = getPos(e);
  const hitIdx = hitTestAll(p.x, p.y);
  if (hitIdx >= 0 && annotations[hitIdx].type === 'text') {
    selectedIdx = hitIdx;
    editExistingText(hitIdx);
  }
});

/* ── Text Tool: create new ── */
function showTextInput(x, y, editIdx) {
  if (textInputEl) { textInputEl.remove(); textInputEl = null; }
  drawCanvas.style.pointerEvents = 'none';

  const existingText  = editIdx !== undefined ? annotations[editIdx].text  : '';
  const existingColor = editIdx !== undefined ? annotations[editIdx].color : currentColor;
  const existingFs    = editIdx !== undefined ? Math.round((annotations[editIdx].fontSize || 16) / displayScale) : textFontSize;
  const existingFont  = editIdx !== undefined ? (annotations[editIdx].fontFamily || textFont) : textFont;
  const isMono = textStyle === 'mono';
  const fontFam = isMono ? '"SF Mono", "Fira Code", "Consolas", monospace'
                         : `"${existingFont}", Inter, -apple-system, sans-serif`;

  // x,y are in canvas (full-res) space — convert to CSS for positioning
  const cssX = x / displayScale;
  const cssY = y / displayScale;

  const input = document.createElement('textarea');
  input.value = existingText;
  input.placeholder = 'Type text… (Shift+Enter for newline)';
  input.rows = existingText.split('\n').length;
  input.style.cssText = `
    position:absolute; z-index:100; left:${cssX}px; top:${cssY - existingFs * 0.8}px;
    font: 600 ${existingFs}px ${fontFam}; color:${existingColor};
    background:rgba(0,0,0,0.03); border:1px solid rgba(255,255,255,0.05);
    border-radius:6px; padding:6px 10px; outline:none; min-width:20px;
    backdrop-filter:blur(4px); resize:none; overflow:hidden; white-space:pre;
    field-sizing: content;
  `;
  canvasWrap.appendChild(input);
  textInputEl = input;
  
  const adjustSize = () => {
    input.style.width = 'auto';
    input.style.height = 'auto';
    input.style.width = (input.scrollWidth + 2) + 'px';
    input.style.height = (input.scrollHeight + 2) + 'px';
  };
  
  setTimeout(() => {
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
    adjustSize();
  }, 50);

  input.addEventListener('input', () => {
    const lines = input.value.split('\n').length;
    input.rows = lines > 0 ? lines : 1;
    adjustSize();
  });

  // Live-update font when user changes the font picker while textarea is open
  const liveUpdateFont = (newFont) => {
    const isMonoNow = textStyle === 'mono';
    const newFam = isMonoNow ? '"SF Mono", "Fira Code", "Consolas", monospace'
                             : `"${newFont}", Inter, -apple-system, sans-serif`;
    input.style.fontFamily = newFam;
  };
  input._liveUpdateFont = liveUpdateFont;

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    input._liveUpdateFont = null;
    const txt = input.value.trim();
    const activeFont = textFont; // capture current value at commit time
    if (editIdx !== undefined) {
      // Update existing
      if (txt) {
        annotations[editIdx].text = txt;
        annotations[editIdx].fontFamily = activeFont;
      } else {
        annotations.splice(editIdx, 1);
        redoStack = [];
        selectedIdx = -1;
      }
    } else if (txt) {
      annotations.push({ type: 'text', x, y: y + 6 * displayScale, text: txt, color: currentColor, stroke: currentStroke, fontSize: Math.round(textFontSize * displayScale), textStyle, glowSize: Math.round(textGlowSize * displayScale), boxOpacity: textBoxOpacity, fontFamily: activeFont });
      redoStack = [];
      selectedIdx = annotations.length - 1;
    }
    redraw();
    window.lensEditor.markDirty();
    input.remove();
    textInputEl = null;
    drawCanvas.style.pointerEvents = 'auto';
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') { committed = true; input.remove(); textInputEl = null; drawCanvas.style.pointerEvents = 'auto'; }
  });
  input.addEventListener('blur', () => setTimeout(commit, 100));
}

function editExistingText(idx) {
  const ann = annotations[idx];
  const b = getAnnBounds(ann);
  if (!b) return;
  showTextInput(ann.x, ann.y, idx);
}

/* ─────────────────────────────────────────────
   TOOLBAR BINDINGS
   ───────────────────────────────────────────── */

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

// Curated list of fonts to probe — includes macOS system fonts, Windows,
// popular web-safe fonts, and common coding/design fonts.
const PROBE_FONTS = [
  // Web / Google Fonts (often pre-loaded)
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Raleway',
  'Poppins', 'Nunito', 'Playfair Display', 'Merriweather', 'Source Sans Pro',
  'Ubuntu', 'Oswald', 'Noto Sans', 'Fira Sans', 'Work Sans',
  // macOS system fonts
  'San Francisco', '-apple-system', 'SF Pro Display', 'SF Pro Text',
  'Helvetica Neue', 'Helvetica', 'Arial',
  'Georgia', 'Times New Roman', 'Palatino', 'Garamond',
  'Futura', 'Gill Sans', 'Optima', 'Baskerville', 'Didot',
  'American Typewriter', 'Chalkboard SE', 'Marker Felt',
  'Copperplate', 'Papyrus', 'Comic Sans MS',
  // Windows system fonts
  'Segoe UI', 'Calibri', 'Cambria', 'Corbel', 'Consolas',
  'Tahoma', 'Verdana', 'Trebuchet MS', 'Impact', 'Franklin Gothic',
  // Monospace
  'SF Mono', 'Fira Code', 'JetBrains Mono', 'Source Code Pro',
  'Courier New', 'Monaco', 'Menlo', 'Inconsolata', 'Cascadia Code',
  // Design / Display
  'Avenir', 'Avenir Next', 'Proxima Nova', 'Brandon Grotesque',
  'DIN Condensed', 'Rockwell', 'Bodoni 72', 'Hoefler Text',
];

// Baseline font to compare against — if a font renders like the test
// baseline, it's not installed. We check with a known-different string.
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

  // Always include Inter (bundled via Google Fonts) and the system fallback
  if (!available.includes('Inter')) available.unshift('Inter');

  return available;
}

// Helper: update the font picker trigger label and active item in the list
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
    // Show name label + preview of font
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
      // Live-update open textarea if any
      if (textInputEl && typeof textInputEl._liveUpdateFont === 'function') {
        textInputEl._liveUpdateFont(font);
      }
      // Live-update selected text annotation
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

  // Position below trigger
  const rect = trigger.getBoundingClientRect();
  dropdown.style.top  = (rect.bottom + 4) + 'px';
  dropdown.style.left = Math.min(rect.left, window.innerWidth - 208 - 8) + 'px';
  dropdown.classList.add('open');
  trigger.classList.add('open');

  // Focus search
  const search = document.getElementById('font-search');
  if (search) { search.value = ''; search.focus(); filterFontList(''); }

  // Scroll active item into view
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
  fontSearch.addEventListener('input', () => filterFontList(fontSearch.value));
  fontSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFontPicker();
    e.stopPropagation(); // prevent canvas keyboard shortcuts
  });
}

// Close font picker on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#font-picker-wrap')) closeFontPicker();
});


function selectTool(toolName) {
  currentTool = toolName;
  localStorage.setItem('lens-current-tool', toolName);
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`[data-tool="${toolName}"]`);
  if (btn) btn.classList.add('active');

  // Restore this tool's remembered stroke width
  const toolVal = toolStrokes[toolName] ?? DEFAULT_TOOL_STROKES[toolName] ?? 3;
  currentStroke = toolVal * displayScale;
  const strokeSliderEl = document.getElementById('stroke-width');
  const strokeValEl    = document.getElementById('stroke-value');
  if (strokeSliderEl) strokeSliderEl.value = toolVal;
  if (strokeValEl)    strokeValEl.textContent = toolVal + 'px';

  const cropActions = document.getElementById('crop-actions');
  if (toolName === 'crop') {
    if (!cropBox) {
      // Default crop box with padding
      const padX = Math.min(40 * displayScale, drawCanvas.width * 0.1);
      const padY = Math.min(40 * displayScale, drawCanvas.height * 0.1);
      cropBox = { x: padX, y: padY, w: drawCanvas.width - padX*2, h: drawCanvas.height - padY*2 };
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
  
  redraw();
}

// Tool selection — single handler for all tool buttons including has-dropdown ones
document.getElementById('drawing-tools').addEventListener('click', (e) => {
  // Sub-item clicks are handled by the sub-menu handler below
  if (e.target.closest('.sub-item')) return;

  const btn = e.target.closest('[data-tool]');
  if (!btn) return;
  const toolName = btn.dataset.tool;
  const dropdownId = btn.dataset.dropdown;

  if (dropdownId) {
    // Has a dropdown — first click: select tool. Second click: toggle dropdown.
    if (currentTool === toolName) {
      // Already active → open/close dropdown
      const menu = document.getElementById(dropdownId);
      const wrap = btn.closest('.tool-dropdown-wrap');
      const isOpen = menu && menu.classList.contains('open');
      // Close all other open menus
      document.querySelectorAll('.tool-sub-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.tool-dropdown-wrap.open').forEach(w => w.classList.remove('open'));
      if (!isOpen && menu && wrap) {
        positionMenu(menu, btn);
        menu.classList.add('open');
        wrap.classList.add('open');
      }
    } else {
      // Not yet active → select it, close any open dropdown
      document.querySelectorAll('.tool-sub-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.tool-dropdown-wrap.open').forEach(w => w.classList.remove('open'));
      selectTool(toolName);
    }
  } else {
    // Normal tool — just select it and close any open dropdown
    document.querySelectorAll('.tool-sub-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.tool-dropdown-wrap.open').forEach(w => w.classList.remove('open'));
    selectTool(toolName);
  }
});

/** Position a fixed dropdown below its trigger button */
function positionMenu(menu, triggerBtn) {
  const rect = triggerBtn.getBoundingClientRect();
  const menuW = 150; // approximate — will be clamped after display
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
    // Live-update selected blur/circleblur annotation
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
    // Live-update selected number annotation
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
    // Live-update selected text annotation
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
    // Live-update selected text annotation
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
    // Mark active
    menu.querySelectorAll('.sub-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    // Update state
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
      // Live-update if a blur or circleblur annotation is selected
      if (selectedIdx >= 0 && (annotations[selectedIdx].type === 'blur' || annotations[selectedIdx].type === 'circleblur')) {
        annotations[selectedIdx].blurStyle = style;
      }
      // Keep both dropdowns in sync visually
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
    
    // Persist
    saveSubstyles();
    // Close menu
    menu.classList.remove('open');
    const wrap = menu.closest('.tool-dropdown-wrap');
    if (wrap) wrap.classList.remove('open');
    // Ensure the parent tool is selected
    const toolBtn = wrap ? wrap.querySelector('[data-tool]') : null;
    if (toolBtn) selectTool(toolBtn.dataset.tool);
  });
});

// Close all dropdowns on outside click
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

// Set initial trigger color
function updateColorTrigger() {
  if (colorTrigger) colorTrigger.style.background = currentColor;
}
updateColorTrigger();

// Toggle dropdown
if (colorTrigger) {
  colorTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = colorPickerWrap.classList.contains('open');
    // Close bg dropdown if open
    document.getElementById('bg-controls').classList.remove('open');
    if (isOpen) {
      colorPickerWrap.classList.remove('open');
    } else {
      const rect = colorTrigger.getBoundingClientRect();
      const dropW = 190;
      let left = rect.left + rect.width / 2 - dropW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - dropW - 8));
      colorDropdown.style.top  = (rect.bottom + 6) + 'px';
      colorDropdown.style.left = left + 'px';
      colorPickerWrap.classList.add('open');
    }
  });
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!colorPickerWrap.contains(e.target)) colorPickerWrap.classList.remove('open');
  const bgWrap = document.getElementById('bg-controls');
  if (!bgWrap.contains(e.target)) bgWrap.classList.remove('open');
});

// Color selection (preset dots inside dropdown)
colorDropdown.addEventListener('click', (e) => {
  const dot = e.target.closest('.color-dot');
  if (!dot) return;
  currentColor = dot.dataset.color;
  document.querySelectorAll('#color-dropdown .color-dot').forEach(d => d.classList.remove('active'));
  dot.classList.add('active');
  updateColorTrigger();
  // Update color of selected annotation
  if (selectedIdx >= 0) {
    annotations[selectedIdx].color = currentColor;
    redraw();
    window.lensEditor.markDirty();
  }
});

// Custom color wheel
const customColorInput = document.getElementById('custom-color-input');
if (customColorInput) {
  // Live preview while dragging
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
  // Save to recent colors only on final pick
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

// Load preset image thumbnails
(function loadBgThumbs() {
  document.querySelectorAll('.bg-thumb[data-bg="image"]').forEach(thumb => {
    const src = thumb.dataset.src;
    if (src) thumb.style.backgroundImage = `url(${src})`;
  });
})();

// Toggle BG dropdown
if (bgTrigger) {
  bgTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = bgControlsWrap.classList.contains('open');
    // Close color dropdown if open
    colorPickerWrap.classList.remove('open');
    if (isOpen) {
      bgControlsWrap.classList.remove('open');
    } else {
      // Position the fixed dropdown below the trigger button
      const rect = bgTrigger.getBoundingClientRect();
      const dropW = 260;
      let left = rect.left + rect.width / 2 - dropW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - dropW - 8));
      bgDropdown.style.top  = (rect.bottom + 6) + 'px';
      bgDropdown.style.left = left + 'px';
      bgControlsWrap.classList.add('open');
    }
  });
}

// Toggle on/off
if (bgToggle) {
  bgToggle.addEventListener('click', () => {
    bgEnabled = !bgEnabled;
    bgToggle.classList.toggle('on', bgEnabled);
    bgToggleLabel.textContent = bgEnabled ? 'On' : 'Off';
    bgTrigger.classList.toggle('active', bgEnabled);
    // Show zoom slider whenever BG is on (free or AR)
    const padRow = document.getElementById('bg-padding-row');
    if (padRow) padRow.style.display = bgEnabled ? 'flex' : 'none';
    applyBackground();
  });
}

/** Encode a wallpaper file path so spaces/parens/special chars work in CSS url() and img.src */
function encodeWallpaperPath(rawPath) {
  // Split at last '/' so only the filename gets encoded, not the directory separators
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
    const src = `../assets/walpaper/${file}`;          // raw path — used for active-state comparison
    const encodedSrc = encodeWallpaperPath(src);       // encoded path — safe for CSS url() and img.src
    if (bgType === 'image' && bgValue === src) {
      div.classList.add('active');
    }
    div.dataset.bg = 'image';
    div.dataset.src = src;                             // keep raw for bgValue comparison
    div.style.backgroundImage = `url("${encodedSrc}")`;
    grid.appendChild(div);
  });
}

// Initial shuffle
shuffleWallpapers();
document.addEventListener('DOMContentLoaded', () => {
  shuffleWallpapers();
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
    img.src = encodeWallpaperPath(bgValue);  // encode so spaces/parens in filenames load correctly

    if (!bgEnabled) {
      bgEnabled = true;
      bgToggle.classList.add('on');
      bgToggleLabel.textContent = 'On';
      bgTrigger.classList.add('active');
    }
    applyBackground();
  });
}

// Custom upload
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
        // Deselect all presets
        document.querySelectorAll('.bg-thumb').forEach(t => t.classList.remove('active'));
        applyBackground();
      };
      img.src = customBgDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // allow uploading the same file again
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


/* ── Background History (localStorage) ── */
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
        // data: URLs are already safe; file paths need encoding for spaces/parens
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

// Render history on load
renderBgGradientHistory();
renderBgUploadHistory();

// Blur slider
if (bgBlurSlider) {
  bgBlurSlider.addEventListener('input', (e) => {
    bgBlurLevel = parseInt(e.target.value, 10);
    bgBlurValue.textContent = bgBlurLevel + '%';
    applyBackground();
  });
}

/* ── Aspect Ratio Buttons ── */
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

    // Zoom slider: show whenever BG is enabled (not just when AR ≠ free)
    const padRow = document.getElementById('bg-padding-row');
    if (padRow) padRow.style.display = bgEnabled ? 'flex' : 'none';

    // Auto-enable BG when user picks a non-free aspect ratio
    if (bgAspectRatio !== 'free' && !bgEnabled) {
      bgEnabled = true;
      bgToggle.classList.add('on');
      bgToggleLabel.textContent = 'On';
      bgTrigger.classList.add('active');
    }
    applyBackground();
  });
}

// Corner Radius slider
const bgCornerSlider = document.getElementById('bg-corner-slider');
const bgCornerValue  = document.getElementById('bg-corner-value');
if (bgCornerSlider) {
  bgCornerSlider.addEventListener('input', (e) => {
    bgCornerRadius = parseInt(e.target.value, 10);
    if (bgCornerValue) bgCornerValue.textContent = bgCornerRadius + 'px';
    applyBackground();
  });
}

// Zoom slider (controls screenshot scale within AR frame)
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

// Shadow slider
const bgShadowSlider = document.getElementById('bg-shadow-slider');
const bgShadowValue  = document.getElementById('bg-shadow-value');
if (bgShadowSlider) {
  bgShadowSlider.addEventListener('input', (e) => {
    bgShadow = parseInt(e.target.value, 10);
    if (bgShadowValue) bgShadowValue.textContent = bgShadow + 'px';
    applyBackground();
  });
}

/** Parse aspect ratio string → numeric value (w/h), or null for 'free' */
function parseAspectRatio(ratioStr) {
  if (!ratioStr || ratioStr === 'free') return null;
  const [w, h] = ratioStr.split(':').map(Number);
  if (!w || !h) return null;
  return w / h;
}

// Fixed fill ratio: frame is always sized so screenshot fills this fraction at neutral zoom
const FRAME_FILL = 0.70;

/**
 * Compute the FIXED frame size (ignores zoom — frame never changes with zoom).
 * Also computes max screenshot size that fits in the frame at zoom=100%.
 * The caller then applies zoomPercent to scale the screenshot within the fixed frame.
 * withBg=false → free AR returns original image size (no border, no export inflation).
 */
function computeAspectLayout(imgW, imgH, ratioStr, zoomPercent, withBg) {
  const targetAR = parseAspectRatio(ratioStr);

  // --- Free AR ---
  if (!targetAR) {
    if (!withBg) {
      return { totalW: imgW, totalH: imgH, imgX: 0, imgY: 0, imgDrawW: imgW, imgDrawH: imgH };
    }
    // Frame is fixed: screenshot fills FRAME_FILL of the frame at neutral zoom
    const totalW = Math.round(imgW / FRAME_FILL);
    const totalH = Math.round(imgH / FRAME_FILL);
    // At zoomPercent the screenshot draws at zoom% of its natural size
    const zoom      = Math.max(0.5, Math.min(1.5, (zoomPercent || 85) / 100));
    const imgDrawW  = Math.round(imgW * zoom);
    const imgDrawH  = Math.round(imgH * zoom);
    const imgX      = Math.round((totalW - imgDrawW) / 2);
    const imgY      = Math.round((totalH - imgDrawH) / 2);
    return { totalW, totalH, imgX, imgY, imgDrawW, imgDrawH };
  }

  // --- Specific AR ---
  const imgAR = imgW / imgH;
  let totalW, totalH;

  // Frame is fixed (sized so screenshot at FRAME_FILL occupies `fill` fraction)
  if (imgAR >= targetAR) {
    totalW = Math.round(imgW / FRAME_FILL);
    totalH = Math.round(totalW / targetAR);
  } else {
    totalH = Math.round(imgH / FRAME_FILL);
    totalW = Math.round(totalH * targetAR);
  }

  // Screenshot drawn at zoomPercent% of the frame's usable area
  const zoom = Math.max(0.5, Math.min(1.5, (zoomPercent || 85) / 100));
  // Max fit size (screenshot aspect maintained, fills the constraining axis of frame)
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
    container.style.background = '';
    canvasWrap.style.borderRadius = '';
    canvasWrap.style.boxShadow = '';
    if (arFrame) { arFrame.style.width = ''; arFrame.style.height = ''; arFrame.style.borderRadius = ''; }
    canvasWrapScale = 1;
    canvasWrap.style.transform = '';
    canvasWrap.style.transformOrigin = '';
    return;
  }

  bgLayer.classList.add('active');
  canvasWrap.classList.add('has-bg');

  const container = document.getElementById('canvas-container');
  container.style.background = 'transparent';

  // Set bg layer content
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

  // Blur on the bg layer
  const blurPx = Math.round(bgBlurLevel * 0.5);
  bgLayer.style.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
  bgLayer.style.transform = blurPx > 0 ? 'scale(1.1)' : 'none';

  // Corner radius + shadow on the screenshot (canvas-wrap)
  canvasWrap.style.borderRadius = bgCornerRadius + 'px';
  if (bgShadow > 0) {
    canvasWrap.style.boxShadow = `0 ${bgShadow * 0.3}px ${bgShadow}px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)`;
  } else {
    canvasWrap.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.06)';
  }

  // ── Fixed frame + zoom preview ──
  // ar-frame is FIXED (sized by FRAME_FILL ratio, independent of zoom slider)
  // canvas-wrap is scaled via CSS transform so screenshot appears larger/smaller
  if (arFrame && displayW > 0 && displayH > 0) {
    // Frame size: always computed at zoom=100% (FRAME_FILL determines border)
    const frameLayout = computeAspectLayout(displayW, displayH, bgAspectRatio, 100, true);
    arFrame.style.width        = frameLayout.totalW + 'px';
    arFrame.style.height       = frameLayout.totalH + 'px';
    arFrame.style.borderRadius = '8px';
    bgLayer.style.borderRadius = '8px';

    // CSS scale: make canvas-wrap appear at zoom% of its max fit in the frame
    // maxFit for display: for free AR, maxFit = displayW (at zoom=100 screenshot = displayW)
    // We want: displayed screenshot width = displayW * zoom/100
    // canvasWrap natural width = displayW, so scale = zoom/100
    canvasWrapScale = Math.max(0.3, Math.min(1.5, bgZoomPercent / 100));
    canvasWrap.style.transform       = `scale(${canvasWrapScale})`;
    canvasWrap.style.transformOrigin = 'center center';
  } else if (arFrame) {
    arFrame.style.width  = '';
    arFrame.style.height = '';
    arFrame.style.borderRadius = '';
    bgLayer.style.borderRadius = '';
    canvasWrapScale = 1;
    canvasWrap.style.transform = '';
  }
}

// Stroke width — per-tool independent memory
document.getElementById('stroke-width').addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  currentStroke = val * displayScale;
  // Save per-tool
  toolStrokes[currentTool] = val;
  try { localStorage.setItem(TOOL_STROKE_KEY, JSON.stringify(toolStrokes)); } catch {}
  if (selectedIdx >= 0) {
    annotations[selectedIdx].stroke = currentStroke;
    redraw();
    window.lensEditor.markDirty();
  }
});

// Spotlight darkness slider
const spotSlider = document.getElementById('spotlight-darkness');
if (spotSlider) {
  spotSlider.addEventListener('input', (e) => {
    spotlightDarkness = parseInt(e.target.value, 10);
    const valEl = document.getElementById('spotlight-darkness-value');
    if (valEl) valEl.textContent = spotlightDarkness + '%';
    // Live-update selected spotlight annotation
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
  // Delete selected annotation
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

/* ─────────────────────────────────────────────
   MERGE CANVAS (for save / copy — no selection indicator)
   ───────────────────────────────────────────── */

// Crop actions
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
  tmpCtx.drawImage(imgCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
  
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
    redraw();
    window.lensEditor.markDirty();
  };
  img.src = tmpC.toDataURL('image/png');
});

/* ─────────────────────────────────────────────
   MERGE CANVAS (for save / copy — no selection indicator)
   ───────────────────────────────────────────── */

function getMergedDataUrl() {
  const fullW = imgCanvas.width;
  const fullH = imgCanvas.height;

  // If background is enabled, create a canvas with aspect ratio + padding
  if (bgEnabled) {
    const layout = computeAspectLayout(fullW, fullH, bgAspectRatio, bgZoomPercent, true);
    const { totalW, totalH, imgX, imgY, imgDrawW, imgDrawH } = layout;
    
    // Scale corner radius based on the image size vs display size to match preview proportions
    const cornerR = bgCornerRadius * (imgDrawW / parseFloat(canvasWrap.style.width || imgDrawW)); 

    const mergeCanvas = document.createElement('canvas');
    mergeCanvas.width = totalW;
    mergeCanvas.height = totalH;
    const ctx = mergeCanvas.getContext('2d');

    // Draw background
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
      // Draw with blur — cover the output canvas
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

    // Determine minimum padding (for shadow offset calculation)
    const minPad = Math.min(imgX, imgY);

    // Draw screenshot with rounded corners + shadow
    ctx.save();
    if (bgShadow > 0) {
      // Scale shadow based on image size vs display size to match preview proportions
      const shadowScale = imgDrawW / parseFloat(canvasWrap.style.width || imgDrawW);
      const scaledShadow = bgShadow * shadowScale;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = scaledShadow;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = scaledShadow * 0.3;
    }
    
    roundRect(ctx, imgX, imgY, imgDrawW, imgDrawH, cornerR);
    if (bgShadow > 0) {
      // Fill to cast shadow behind the actual image draw
      ctx.fillStyle = '#000';
      ctx.fill();
      // Clear shadow properties before drawing image to avoid double shadowing
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    
    // Now clip and draw image
    ctx.clip();
    ctx.drawImage(imgCanvas, 0, 0, fullW, fullH, imgX, imgY, imgDrawW, imgDrawH);
    ctx.restore();

    // Draw annotations on top (with composite spotlight rendering)
    ctx.save();
    ctx.translate(imgX, imgY);
    // Scale annotations if image was resized to fit the aspect ratio
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

  // No background — original behavior
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

/** Render all annotations with composite spotlight logic onto a given context */
function renderAnnotationsComposite(ctx) {
  // Composite all spotlight/circlespotlight into ONE overlay
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

  // Render non-spotlight annotations
  for (const ann of annotations) {
    if (ann.type === 'spotlight' || ann.type === 'circlespotlight') continue;
    renderAnnotation(ctx, ann, false);
  }
}

/** Helper: draw a rounded rectangle path */
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
    // Gallery edit mode — overwrite the original file in-place
    const result = await window.lensEditor.saveOverwrite(dataUrl, originFilePath);
    if (result.ok) {
      window.lensEditor.markClean();
      // Close editor — gallery will auto-refresh and reopen the image
      window.lensEditor.closeEditor();
    } else {
      showToast('Save failed: ' + result.error);
    }
  } else {
    // Normal mode — save new file, gallery opens automatically from main process
    const filePath = await window.lensEditor.saveImage(dataUrl);
    window.lensEditor.markClean();
    // Close editor — gallery is being opened by main process
    window.lensEditor.closeEditor();
  }
});

// Copy
document.getElementById('btn-copy').addEventListener('click', () => {
  const dataUrl = getMergedDataUrl();
  window.lensEditor.copyImage(dataUrl);
  showToast('Copied to clipboard');
});

// Screen Record — open the recorder selection overlay and close the editor
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

// "Extract Text" toolbar button — toggle the side panel open/closed
// Also activates the OCR tab when opening
document.getElementById('btn-open-panel').addEventListener('click', () => {
  const panel = document.getElementById('side-panel');
  const isCollapsed = panel.classList.contains('collapsed');
  panel.classList.toggle('collapsed');
  if (isCollapsed) {
    // Switch to OCR tab whenever panel is opened via this button
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-section').forEach(s => s.classList.remove('active'));
    document.querySelector('[data-panel="ocr"]').classList.add('active');
    document.getElementById('panel-ocr').classList.add('active');
  }
});

// Panel tabs
document.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
  });
});



/* ─────────────────────────────────────────────
   OCR — via IPC (Tesseract.js runs in main process)
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

// Copy extracted text
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

// Copy translation
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
   AUTO-SAVE (triggered by main process when user re-captures)
   ───────────────────────────────────────────── */

window.lensEditor.onAutoSave(async () => {
  try {
    const dataUrl = getMergedDataUrl();
    await window.lensEditor.saveImage(dataUrl);
    console.log('[Lens] Auto-saved before new capture');
  } catch (err) {
    console.error('[Lens] Auto-save failed:', err);
  }
});

/* ── Escape key closes editor ── */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !textInputEl) {
    window.lensEditor.closeEditor();
  }
});
