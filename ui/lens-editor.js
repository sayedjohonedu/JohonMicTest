'use strict';

/* ═══════════════════════════════════════════════════════
   MicTab Lens Editor — Annotation + OCR + Translation
   ═══════════════════════════════════════════════════════ */

// ── Canvas refs ──
const imgCanvas  = document.getElementById('img-canvas');
const drawCanvas = document.getElementById('draw-canvas');
const imgCtx     = imgCanvas.getContext('2d');
const drawCtx    = drawCanvas.getContext('2d');
const canvasWrap = document.getElementById('canvas-wrap');

// ── State ──
let originalImage = null;
let annotations   = [];
let currentTool   = 'select';
let currentColor  = '#ef4444';
let currentStroke = 3;
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
let blurIntensity    = 12;   // pixelate block size
let numberRadius     = 14;   // number badge radius (CSS pixels, before displayScale)
let recentColors     = [];   // last 3 custom colors
let arrowStyle       = 'standard'; // 'standard' | 'fancy' | 'curved'
let textStyle        = 'standard'; // 'standard' | 'outlined' | 'box' | 'mono'
let blurStyle        = 'pixelate'; // 'pixelate' | 'smooth' | 'blackout'
let textFontSize     = 16;         // text tool font size (px at displayScale)
// ── Background state ──
let bgEnabled       = false;
let bgBlurLevel     = 30;    // 0–100 (percentage mapped to px)
let bgType          = 'solid';   // 'solid' | 'image' | 'gradient'
let bgValue         = '#1a1a2e'; // color, src, or gradient CSS
let bgImageObj      = null;      // loaded Image for image backgrounds
let customBgDataUrl = null;      // data URL for user-uploaded background
let spotlightDarkness = 55;  // spotlight overlay opacity (10–90%)
// ── Aspect Ratio state ──
let bgAspectRatio   = 'free';    // 'free' | '16:9' | '1:1' | '4:3' | '9:16' | '4:5' | '3:2' | '21:9'
let bgPadPercent    = 6;         // padding percentage (2–25%)

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

    // Scale annotation stroke so it looks correct at any resolution
    currentStroke = Math.round(3 * displayScale);
    const slider = document.getElementById('stroke-width');
    if (slider) slider.value = currentStroke;
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
    renderAnnotation(drawCtx, annotations[i], i === selectedIdx);
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
      drawArrow(ctx, ann.x1, ann.y1, ann.x2, ann.y2, ann.stroke, ann.arrowStyle || 'standard');
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
      ctx.lineTo(ann.x2, ann.y2);
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
      const fontFam = isMono ? '"SF Mono", "Fira Code", "Consolas", monospace' : 'Inter, sans-serif';
      ctx.font = `600 ${fs}px ${fontFam}`;
      const tm = ctx.measureText(ann.text);
      const pad = Math.round(fs * 0.3);

      if (ts === 'box') {
        // Rounded pill with background
        const bx = ann.x - pad * 1.5, by = ann.y - fs + 1;
        const bw = tm.width + pad * 3, bh = fs + pad * 2;
        const r = Math.min(6, bh / 2);
        ctx.fillStyle = ann.color;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, r);
        ctx.fill();
        // White text on colored background
        ctx.fillStyle = '#fff';
        ctx.fillText(ann.text, ann.x, ann.y + pad);
      } else if (ts === 'outlined') {
        // Stroke text (no fill bg)
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = Math.max(2, fs / 12);
        ctx.lineJoin = 'round';
        ctx.strokeText(ann.text, ann.x, ann.y + pad);
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text, ann.x, ann.y + pad);
        // Add subtle outer glow
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.fillText(ann.text, ann.x, ann.y + pad);
        ctx.shadowBlur = 0;
      } else {
        // Standard + Mono: dark bg shadow + colored text
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const tbr = Math.min(6, (fs + pad * 2) / 2);
        ctx.beginPath();
        ctx.roundRect(ann.x - pad, ann.y - fs + 1, tm.width + pad * 2, fs + pad * 2, tbr);
        ctx.fill();
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text, ann.x, ann.y + pad);
      }
      break;
    }
    case 'blur': {
      const bx = Math.min(ann.x, ann.x + ann.w), by = Math.min(ann.y, ann.y + ann.h);
      const bw = Math.abs(ann.w), bh = Math.abs(ann.h);
      if (bw < 2 || bh < 2) break;
      const bStyle = ann.blurStyle || 'pixelate';

      const blurRR = Math.max(6, Math.min(bw, bh) * 0.04);
      if (bStyle === 'blackout') {
        // Solid black fill
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, blurRR);
        ctx.fill();
      } else if (bStyle === 'smooth') {
        // Gaussian blur via CanvasFilter — clipped to rounded rect
        const bs = (ann.blurSize || 12) * 1.5;
        const srcData = imgCtx.getImageData(bx, by, bw, bh);
        const tmpC = document.createElement('canvas');
        tmpC.width = bw; tmpC.height = bh;
        const tmpX = tmpC.getContext('2d');
        tmpX.putImageData(srcData, 0, 0);
        const smW = Math.max(1, Math.round(bw / Math.max(2, bs / 4)));
        const smH = Math.max(1, Math.round(bh / Math.max(2, bs / 4)));
        const smC = document.createElement('canvas');
        smC.width = smW; smC.height = smH;
        const smX = smC.getContext('2d');
        smX.imageSmoothingEnabled = true;
        smX.imageSmoothingQuality = 'high';
        smX.drawImage(tmpC, 0, 0, smW, smH);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, blurRR);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(smC, 0, 0, smW, smH, bx, by, bw, bh);
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
      // Pixelate an elliptical region
      const ebx = Math.min(ann.x, ann.x + ann.w), eby = Math.min(ann.y, ann.y + ann.h);
      const ebw = Math.abs(ann.w), ebh = Math.abs(ann.h);
      if (ebw < 2 || ebh < 2) break;
      const ebs = ann.blurSize || 12;
      const erx = ebw / 2, ery = ebh / 2;
      const ecx = ebx + erx, ecy = eby + ery;
      // Clip to ellipse
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ecx, ecy, Math.max(erx, 1), Math.max(ery, 1), 0, 0, Math.PI * 2);
      ctx.clip();
      // Pixelate inside
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
  }
  ctx.restore();
}

/* ── Bounding box for any annotation ── */
function getAnnBounds(ann) {
  switch (ann.type) {
    case 'rect': case 'fillrect': case 'squarehighlight': case 'circle': case 'blur': case 'circleblur': case 'spotlight': case 'circlespotlight': {
      const x = Math.min(ann.x, ann.x + ann.w), y = Math.min(ann.y, ann.y + ann.h);
      return { x, y, w: Math.abs(ann.w), h: Math.abs(ann.h) };
    }
    case 'arrow': case 'line': {
      const x = Math.min(ann.x1, ann.x2), y = Math.min(ann.y1, ann.y2);
      return { x, y, w: Math.abs(ann.x2 - ann.x1), h: Math.abs(ann.y2 - ann.y1) };
    }
    case 'text': {
      const fs = ann.fontSize || 16;
      const ts = ann.textStyle || 'standard';
      const isMono = (ts === 'mono');
      const fontFam = isMono ? '"SF Mono", "Fira Code", "Consolas", monospace' : 'Inter, sans-serif';
      drawCtx.font = `600 ${fs}px ${fontFam}`;
      const tw = drawCtx.measureText(ann.text).width;
      const pad = Math.round(fs * 0.3);
      if (ts === 'box') {
        return { x: ann.x - pad * 1.5, y: ann.y - fs + 1, w: tw + pad * 3, h: fs + pad * 2 };
      }
      return { x: ann.x - pad, y: ann.y - fs, w: tw + pad * 2, h: fs + pad * 2 };
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

/* ── Hit-test: is point (px,py) inside annotation? ── */
function hitTest(ann, px, py) {
  const m = 6; // margin
  const b = getAnnBounds(ann);
  if (!b) return false;
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

function drawArrow(ctx, x1, y1, x2, y2, stroke, style) {
  style = style || 'standard';
  const dx = x2 - x1, dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const len = Math.sqrt(dx * dx + dy * dy);
  const headLen = Math.max(stroke * 4, 14);

  if (style === 'fancy') {
    // ── Tapered arrow: thin tail → thick head (CleanShot X "Fancy") ──
    const shaftEnd = len - headLen * 0.8;
    if (shaftEnd > 0) {
      const steps = Math.max(Math.round(len / 3), 12);
      ctx.lineCap = 'round';
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const px0 = shaftEnd * t0, px1 = Math.min(shaftEnd, shaftEnd * t1);
        const w = Math.max(1.5, stroke * 0.3 + (stroke * 1.2) * (px0 / shaftEnd));
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x1 + px0 * Math.cos(angle), y1 + px0 * Math.sin(angle));
        ctx.lineTo(x1 + px1 * Math.cos(angle), y1 + px1 * Math.sin(angle));
        ctx.stroke();
      }
    }
    // Large filled arrowhead
    const hW = headLen * 0.45;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle) + hW * Math.sin(angle),
               y2 - headLen * Math.sin(angle) - hW * Math.cos(angle));
    ctx.lineTo(x2 - headLen * 0.65 * Math.cos(angle), y2 - headLen * 0.65 * Math.sin(angle));
    ctx.lineTo(x2 - headLen * Math.cos(angle) - hW * Math.sin(angle),
               y2 - headLen * Math.sin(angle) + hW * Math.cos(angle));
    ctx.closePath();
    ctx.fill();

  } else if (style === 'curved') {
    // ── Curved arrow with quadratic Bezier ──
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const perp = len * 0.25;
    const cpx = mx + perp * Math.sin(angle), cpy = my - perp * Math.cos(angle);
    // Compute tangent at curve endpoint (derivative of quadratic Bezier at t=1)
    const endAngle = Math.atan2(y2 - cpy, x2 - cpx);
    // Shaft: draw curve stopping short of the tip along the curve's tangent
    const shaftEndX = x2 - headLen * 0.5 * Math.cos(endAngle);
    const shaftEndY = y2 - headLen * 0.5 * Math.sin(endAngle);
    ctx.lineWidth = Math.max(stroke, 2.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpx, cpy, shaftEndX, shaftEndY);
    ctx.stroke();
    // Arrowhead at tip, oriented along curve tangent
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(endAngle - Math.PI / 7), y2 - headLen * Math.sin(endAngle - Math.PI / 7));
    ctx.lineTo(x2 - headLen * Math.cos(endAngle + Math.PI / 7), y2 - headLen * Math.sin(endAngle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();

  } else {
    // ── Standard: bold uniform shaft + filled head ──
    ctx.lineWidth = Math.max(stroke, 2.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - headLen * 0.7 * Math.cos(angle), y2 - headLen * 0.7 * Math.sin(angle));
    ctx.stroke();
    // Filled arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7), y2 - headLen * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7), y2 - headLen * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  }
}

/* ─────────────────────────────────────────────
   DRAWING / SELECTION HANDLERS
   ───────────────────────────────────────────── */

function getPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  // Map CSS display coordinates → full-res canvas coordinates
  return {
    x: (e.clientX - rect.left) * displayScale,
    y: (e.clientY - rect.top)  * displayScale,
  };
}

/* Helper: move annotation by dx,dy */
function moveAnnotation(ann, dx, dy) {
  switch (ann.type) {
    case 'rect': case 'fillrect': case 'squarehighlight': case 'circle': case 'blur': case 'circleblur': case 'spotlight': case 'circlespotlight':
      ann.x += dx; ann.y += dy; break;
    case 'arrow': case 'line':
      ann.x1 += dx; ann.y1 += dy; ann.x2 += dx; ann.y2 += dy; break;
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
  selectedIdx = annotations.length - 1;
}

drawCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const p = getPos(e);

  // 1) Always try hit-test first (regardless of tool)
  const hitIdx = hitTestAll(p.x, p.y);

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
      selectedIdx = -1;
      redraw();
      window.lensEditor.markDirty();
      showToast('Annotation removed');
    }
    return;
  }

  // 4) Drawing tools — if clicking on existing annotation, select it instead
  if (hitIdx >= 0) {
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
  const p = getPos(e);

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
    // Hover cursor
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
    return;
  }

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
  // End drag
  if (isDragging) {
    isDragging = false;
    drawCanvas.style.cursor = 'grab';
    window.lensEditor.markDirty();
    return;
  }

  if (!isDrawing) return;
  isDrawing = false;
  const p = getPos(e);

  let ann = null;
  switch (currentTool) {
    case 'arrow':
      ann = { type: 'arrow', x1: drawStartX, y1: drawStartY, x2: p.x, y2: p.y, color: currentColor, stroke: currentStroke, arrowStyle };
      break;
    case 'rect':
      ann = { type: 'rect', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke };
      break;
    case 'fillrect':
      ann = { type: 'fillrect', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke };
      break;
    case 'squarehighlight':
      ann = { type: 'squarehighlight', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke };
      break;
    case 'circle':
      ann = { type: 'circle', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke };
      break;
    case 'line':
      ann = { type: 'line', x1: drawStartX, y1: drawStartY, x2: p.x, y2: p.y, color: currentColor, stroke: currentStroke };
      break;
    case 'freehand':
      freehandPoints.push([p.x, p.y]);
      ann = { type: 'freehand', points: [...freehandPoints], color: currentColor, stroke: currentStroke };
      break;
    case 'highlighter':
      freehandPoints.push([p.x, p.y]);
      ann = { type: 'highlighter', points: [...freehandPoints], color: currentColor, stroke: currentStroke };
      break;
    case 'blur':
      ann = { type: 'blur', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke, blurSize: blurIntensity, blurStyle };
      break;
    case 'circleblur':
      ann = { type: 'circleblur', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke, blurSize: blurIntensity };
      break;
    case 'spotlight':
      ann = { type: 'spotlight', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke, darkness: spotlightDarkness };
      break;
    case 'circlespotlight':
      ann = { type: 'circlespotlight', x: drawStartX, y: drawStartY, w: p.x - drawStartX, h: p.y - drawStartY, color: currentColor, stroke: currentStroke, darkness: spotlightDarkness };
      break;
  }

  if (ann) {
    annotations.push(ann);
    selectedIdx = annotations.length - 1; // Auto-select new annotation
    redraw();
    window.lensEditor.markDirty();
  }
  freehandPoints = [];
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

  const existingText = editIdx !== undefined ? annotations[editIdx].text : '';
  const existingColor = editIdx !== undefined ? annotations[editIdx].color : currentColor;
  const existingFs = editIdx !== undefined ? Math.round((annotations[editIdx].fontSize || 16) / displayScale) : textFontSize;
  const isMono = textStyle === 'mono';
  const fontFam = isMono ? '"SF Mono", "Fira Code", "Consolas", monospace' : 'Inter, sans-serif';

  // x,y are in canvas (full-res) space — convert to CSS for positioning
  const cssX = x / displayScale;
  const cssY = y / displayScale;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = existingText;
  input.placeholder = 'Type text…';
  input.style.cssText = `
    position:absolute; z-index:100; left:${cssX}px; top:${cssY - existingFs * 0.8}px;
    font: 600 ${existingFs}px ${fontFam}; color:${existingColor};
    background:rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.2);
    border-radius:6px; padding:6px 10px; outline:none; min-width:140px;
    backdrop-filter:blur(4px);
  `;
  canvasWrap.appendChild(input);
  textInputEl = input;
  setTimeout(() => input.focus(), 50);

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const txt = input.value.trim();
    if (editIdx !== undefined) {
      // Update existing
      if (txt) {
        annotations[editIdx].text = txt;
      } else {
        annotations.splice(editIdx, 1);
        selectedIdx = -1;
      }
    } else if (txt) {
      annotations.push({ type: 'text', x, y: y + 6 * displayScale, text: txt, color: currentColor, stroke: currentStroke, fontSize: Math.round(textFontSize * displayScale), textStyle });
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
    if (e.key === 'Enter') commit();
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
    }
  } catch {}
}

function saveSubstyles() {
  try {
    localStorage.setItem(SUBSTYLE_KEY, JSON.stringify({
      arrow: arrowStyle,
      text:  textStyle,
      blur:  blurStyle,
    }));
  } catch {}
}

// Load last-used substyles on startup & mark the correct sub-items active
loadSubstyles();
(function syncSubMenuUI() {
  const mapping = {
    'arrow-dropdown': arrowStyle,
    'text-dropdown':  textStyle,
    'blur-dropdown':  blurStyle,
  };
  for (const [menuId, style] of Object.entries(mapping)) {
    const menu = document.getElementById(menuId);
    if (!menu) continue;
    menu.querySelectorAll('.sub-item').forEach(item => {
      item.classList.toggle('active', item.dataset.substyle === style);
    });
  }
})();

/** Helper: select a tool (update UI + state) */
function selectTool(toolName) {
  currentTool = toolName;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`[data-tool="${toolName}"]`);
  if (btn) btn.classList.add('active');
  updateContextSliders();
  if (currentTool === 'select') drawCanvas.style.cursor = 'default';
  else if (currentTool === 'text') drawCanvas.style.cursor = 'text';
  else if (currentTool === 'number') drawCanvas.style.cursor = 'copy';
  else if (currentTool === 'eraser') drawCanvas.style.cursor = 'not-allowed';
  else drawCanvas.style.cursor = 'crosshair';
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
  blurSlider.addEventListener('input', (e) => {
    blurIntensity = parseInt(e.target.value, 10);
    const valEl = document.getElementById('blur-value');
    if (valEl) valEl.textContent = blurIntensity + 'px';
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
  numSizeSlider.addEventListener('input', (e) => {
    numberRadius = parseInt(e.target.value, 10);
    const valEl = document.getElementById('number-size-value');
    if (valEl) valEl.textContent = numberRadius;
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
  textSizeSlider.addEventListener('input', (e) => {
    textFontSize = parseInt(e.target.value, 10);
    const valEl = document.getElementById('text-size-value');
    if (valEl) valEl.textContent = textFontSize + 'pt';
    // Live-update selected text annotation
    if (selectedIdx >= 0 && annotations[selectedIdx].type === 'text') {
      annotations[selectedIdx].fontSize = Math.round(textFontSize * displayScale);
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
    if (menu.id === 'arrow-dropdown')     arrowStyle = style;
    else if (menu.id === 'text-dropdown') textStyle  = style;
    else if (menu.id === 'blur-dropdown') blurStyle  = style;
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
    applyBackground();
  });
}

// Bg thumb selection
document.getElementById('bg-thumb-grid').addEventListener('click', (e) => {
  const thumb = e.target.closest('.bg-thumb');
  if (!thumb) return;

  document.querySelectorAll('.bg-thumb').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.bg-history-thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');

  const type = thumb.dataset.bg;
  if (type === 'solid') {
    bgType = 'solid';
    bgValue = thumb.dataset.color;
    bgImageObj = null;
  } else if (type === 'gradient') {
    bgType = 'gradient';
    bgValue = thumb.dataset.gradient;
    bgImageObj = null;
  } else if (type === 'image') {
    bgType = 'image';
    bgValue = thumb.dataset.src;
    // Load the image for export
    const img = new Image();
    img.onload = () => { bgImageObj = img; if (bgEnabled) applyBackground(); };
    img.src = bgValue;
  }

  // Auto-enable bg when user picks a background
  if (!bgEnabled) {
    bgEnabled = true;
    bgToggle.classList.add('on');
    bgToggleLabel.textContent = 'On';
    bgTrigger.classList.add('active');
  }
  applyBackground();
});

// Custom upload
const bgUploadInput = document.getElementById('bg-upload-input');
if (bgUploadInput) {
  bgUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      customBgDataUrl = ev.target.result;
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
        // Save to upload history
        addToBgHistory(customBgDataUrl);
        applyBackground();
      };
      img.src = customBgDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/* ── Background Upload History (localStorage) ── */
const BG_HISTORY_KEY = 'mictab-bg-history';
const BG_HISTORY_MAX = 10; // max saved backgrounds

function loadBgHistory() {
  try {
    return JSON.parse(localStorage.getItem(BG_HISTORY_KEY)) || [];
  } catch { return []; }
}

function saveBgHistoryList(list) {
  try {
    localStorage.setItem(BG_HISTORY_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[BG History] localStorage save failed:', e);
  }
}

function addToBgHistory(dataUrl) {
  const list = loadBgHistory();
  // Avoid duplicates (same data URL)
  if (list.includes(dataUrl)) return;
  list.unshift(dataUrl);
  // Trim to max
  while (list.length > BG_HISTORY_MAX) list.pop();
  saveBgHistoryList(list);
  renderBgHistory();
}

function removeFromBgHistory(idx) {
  const list = loadBgHistory();
  list.splice(idx, 1);
  saveBgHistoryList(list);
  renderBgHistory();
}

function renderBgHistory() {
  const section = document.getElementById('bg-history-section');
  const grid = document.getElementById('bg-history-grid');
  if (!section || !grid) return;
  const list = loadBgHistory();
  if (list.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  grid.innerHTML = '';
  list.forEach((dataUrl, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'bg-history-thumb';
    thumb.style.backgroundImage = `url(${dataUrl})`;
    thumb.title = `Upload #${idx + 1}`;
    // If this is the currently active background, mark active
    if (bgType === 'image' && bgValue === dataUrl) thumb.classList.add('active');

    // Click to apply
    thumb.addEventListener('click', (e) => {
      if (e.target.classList.contains('bg-history-remove')) return;
      customBgDataUrl = dataUrl;
      bgType = 'image';
      bgValue = dataUrl;
      const img = new Image();
      img.onload = () => {
        bgImageObj = img;
        if (!bgEnabled) {
          bgEnabled = true;
          const tgl = document.getElementById('bg-toggle');
          const tglLbl = document.getElementById('bg-toggle-label');
          if (tgl) tgl.classList.add('on');
          if (tglLbl) tglLbl.textContent = 'On';
          const trg = document.getElementById('bg-trigger');
          if (trg) trg.classList.add('active');
        }
        // Deselect presets
        document.querySelectorAll('.bg-thumb').forEach(t => t.classList.remove('active'));
        // Mark this history thumb active
        grid.querySelectorAll('.bg-history-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        applyBackground();
      };
      img.src = dataUrl;
    });

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'bg-history-remove';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove from history';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromBgHistory(idx);
    });
    thumb.appendChild(removeBtn);

    grid.appendChild(thumb);
  });
}

// Render history on load
renderBgHistory();

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

// Padding slider
const bgPaddingSlider = document.getElementById('bg-padding-slider');
const bgPaddingValue  = document.getElementById('bg-padding-value');
if (bgPaddingSlider) {
  bgPaddingSlider.addEventListener('input', (e) => {
    bgPadPercent = parseInt(e.target.value, 10);
    if (bgPaddingValue) bgPaddingValue.textContent = bgPadPercent + '%';
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

/** Compute the output canvas & image placement for a given aspect ratio */
function computeAspectLayout(imgW, imgH, ratioStr, padPercent) {
  const pad = padPercent / 100;
  const targetAR = parseAspectRatio(ratioStr);

  if (!targetAR) {
    // Free: same as before — just add padding around the image
    const padPx = Math.round(Math.max(imgW, imgH) * pad);
    return {
      totalW: imgW + padPx * 2,
      totalH: imgH + padPx * 2,
      imgX: padPx,
      imgY: padPx,
      imgDrawW: imgW,
      imgDrawH: imgH,
    };
  }

  // Target aspect ratio: compute the minimum canvas that fits the image
  // with at least `pad` fraction of padding on every side
  const imgAR = imgW / imgH;
  let totalW, totalH, imgDrawW, imgDrawH;

  // The image occupies (1 - 2*pad) fraction of the canvas in each dimension
  const usable = 1 - 2 * pad;

  if (imgAR >= targetAR) {
    // Image is wider than the target ratio — width is the constraining axis
    imgDrawW = imgW;
    totalW = Math.round(imgW / usable);
    totalH = Math.round(totalW / targetAR);
    imgDrawH = imgH;
  } else {
    // Image is taller than the target ratio — height is the constraining axis
    imgDrawH = imgH;
    totalH = Math.round(imgH / usable);
    totalW = Math.round(totalH * targetAR);
    imgDrawW = imgW;
  }

  // Ensure the image actually fits inside the canvas with padding
  // (the other dimension might need more space)
  const maxImgW = Math.round(totalW * usable);
  const maxImgH = Math.round(totalH * usable);
  if (imgDrawW > maxImgW || imgDrawH > maxImgH) {
    const fitScale = Math.min(maxImgW / imgDrawW, maxImgH / imgDrawH);
    imgDrawW = Math.round(imgDrawW * fitScale);
    imgDrawH = Math.round(imgDrawH * fitScale);
  }

  // Center the image
  const imgX = Math.round((totalW - imgDrawW) / 2);
  const imgY = Math.round((totalH - imgDrawH) / 2);

  return { totalW, totalH, imgX, imgY, imgDrawW, imgDrawH };
}

function applyBackground() {
  if (!bgEnabled) {
    bgLayer.classList.remove('active');
    canvasWrap.classList.remove('has-bg');
    // Restore checkerboard pattern
    const container = document.getElementById('canvas-container');
    container.style.background = '';
    return;
  }

  bgLayer.classList.add('active');
  canvasWrap.classList.add('has-bg');

  // Hide the default checkerboard
  const container = document.getElementById('canvas-container');
  container.style.background = 'transparent';

  // Set bg layer content
  if (bgType === 'solid') {
    bgLayer.style.backgroundImage = 'none';
    bgLayer.style.background = bgValue;
  } else if (bgType === 'gradient') {
    bgLayer.style.background = bgValue;
  } else if (bgType === 'image') {
    bgLayer.style.backgroundImage = `url(${bgValue})`;
    bgLayer.style.backgroundSize = 'cover';
    bgLayer.style.backgroundPosition = 'center';
  }

  // Apply Gaussian blur
  const blurPx = Math.round(bgBlurLevel * 0.5); // 0%→0px, 100%→50px
  bgLayer.style.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
  // Scale up slightly to hide blur edge artifacts
  bgLayer.style.transform = blurPx > 0 ? 'scale(1.1)' : 'none';
}

// Stroke width
document.getElementById('stroke-width').addEventListener('input', (e) => {
  currentStroke = parseInt(e.target.value, 10);
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
  annotations.pop();
  selectedIdx = -1;
  redraw();
});

// Reset
document.getElementById('btn-reset').addEventListener('click', () => {
  annotations = [];
  selectedIdx = -1;
  redraw();
  window.lensEditor.markClean();
  showToast('Reset to original');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (textInputEl) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { document.getElementById('btn-undo').click(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); document.getElementById('btn-save').click(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') { document.getElementById('btn-copy').click(); return; }
  // Delete selected annotation
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx >= 0) {
    annotations.splice(selectedIdx, 1);
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

function getMergedDataUrl() {
  const fullW = imgCanvas.width;
  const fullH = imgCanvas.height;

  // If background is enabled, create a canvas with aspect ratio + padding
  if (bgEnabled) {
    const layout = computeAspectLayout(fullW, fullH, bgAspectRatio, bgPadPercent);
    const { totalW, totalH, imgX, imgY, imgDrawW, imgDrawH } = layout;
    const cornerR = Math.round(Math.max(imgDrawW, imgDrawH) * 0.012); // corner radius

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
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = Math.round(minPad * 0.6);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(minPad * 0.15);
    roundRect(ctx, imgX, imgY, imgDrawW, imgDrawH, cornerR);
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
