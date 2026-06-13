'use strict';

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
  const cropOverlay = document.getElementById('crop-overlay');
  if (currentTool === 'crop' && cropBox) {
    const cw = drawCanvas.width, ch = drawCanvas.height;
    
    // Draw dark overlay inside the canvas boundaries
    drawCtx.save();
    drawCtx.fillStyle = 'rgba(0,0,0,0.6)';
    drawCtx.beginPath();
    drawCtx.rect(0, 0, cw, ch);
    // Clip the crop box to canvas bounds for the evenodd cutout
    const clipX = Math.max(0, cropBox.x);
    const clipY = Math.max(0, cropBox.y);
    const clipW = Math.min(cw, cropBox.x + cropBox.w) - clipX;
    const clipH = Math.min(ch, cropBox.y + cropBox.h) - clipY;
    if (clipW > 0 && clipH > 0) {
      drawCtx.rect(clipX, clipY, clipW, clipH);
    }
    drawCtx.fill('evenodd');
    drawCtx.restore();

    // Now update the HTML crop overlay
    if (cropOverlay) {
      cropOverlay.style.display = 'block';
      canvasWrap.classList.add('crop-active');

      const scale = displayScale;
      const cssX = cropBox.x / scale;
      const cssY = cropBox.y / scale;
      const cssW = cropBox.w / scale;
      const cssH = cropBox.h / scale;
      const ccw = displayW;
      const cch = displayH;

      // Update border box
      const borderBox = document.getElementById('crop-border-box');
      if (borderBox) {
        borderBox.style.left = cssX + 'px';
        borderBox.style.top = cssY + 'px';
        borderBox.style.width = cssW + 'px';
        borderBox.style.height = cssH + 'px';
      }

      // Average color strips
      const exLeft   = Math.max(0, -cssX);
      const exTop    = Math.max(0, -cssY);
      const exRight  = Math.max(0, (cssX + cssW) - ccw);
      const exBottom = Math.max(0, (cssY + cssH) - cch);

      const stripLeft = document.getElementById('crop-strip-left');
      if (stripLeft) {
        if (exLeft > 0) {
          stripLeft.style.display = 'block';
          stripLeft.style.left = cssX + 'px';
          stripLeft.style.top = cssY + 'px';
          stripLeft.style.width = exLeft + 'px';
          stripLeft.style.height = cssH + 'px';
          stripLeft.style.backgroundColor = cropAvgColor;
        } else {
          stripLeft.style.display = 'none';
        }
      }

      const stripRight = document.getElementById('crop-strip-right');
      if (stripRight) {
        if (exRight > 0) {
          stripRight.style.display = 'block';
          stripRight.style.left = ccw + 'px';
          stripRight.style.top = cssY + 'px';
          stripRight.style.width = exRight + 'px';
          stripRight.style.height = cssH + 'px';
          stripRight.style.backgroundColor = cropAvgColor;
        } else {
          stripRight.style.display = 'none';
        }
      }

      const stripTop = document.getElementById('crop-strip-top');
      if (stripTop) {
        if (exTop > 0) {
          stripTop.style.display = 'block';
          stripTop.style.left = Math.max(0, cssX) + 'px';
          stripTop.style.top = cssY + 'px';
          stripTop.style.width = Math.min(cssW, ccw - Math.max(0, cssX) + exLeft) + 'px';
          stripTop.style.height = exTop + 'px';
          stripTop.style.backgroundColor = cropAvgColor;
        } else {
          stripTop.style.display = 'none';
        }
      }

      const stripBottom = document.getElementById('crop-strip-bottom');
      if (stripBottom) {
        if (exBottom > 0) {
          stripBottom.style.display = 'block';
          stripBottom.style.left = Math.max(0, cssX) + 'px';
          stripBottom.style.top = cch + 'px';
          stripBottom.style.width = Math.min(cssW, ccw - Math.max(0, cssX) + exLeft) + 'px';
          stripBottom.style.height = exBottom + 'px';
          stripBottom.style.backgroundColor = cropAvgColor;
        } else {
          stripBottom.style.display = 'none';
        }
      }
    }
  } else {
    if (cropOverlay) {
      cropOverlay.style.display = 'none';
    }
    canvasWrap.classList.remove('crop-active');
  }

  updateContextSliders();
}

/** Show/hide context sliders based on selected annotation + active tool */
function updateContextSliders() {
  const strokeGroup = document.getElementById('stroke-group');
  const blurGroup   = document.getElementById('blur-group');
  const numGroup    = document.getElementById('number-group');
  const spotGroup   = document.getElementById('spotlight-group');
  const textGroup   = document.getElementById('text-group');
  const sel = selectedIdx >= 0 ? annotations[selectedIdx] : null;

  const showStroke = ['rect', 'fillrect', 'squarehighlight', 'circle', 'line', 'arrow', 'freehand', 'highlighter', 'spotlight', 'circlespotlight'].includes(currentTool)
    || (sel && ['rect', 'fillrect', 'squarehighlight', 'circle', 'line', 'arrow', 'freehand', 'highlighter', 'spotlight', 'circlespotlight'].includes(sel.type));
  const showBlur = currentTool === 'blur' || currentTool === 'circleblur'
    || (sel && (sel.type === 'blur' || sel.type === 'circleblur'));
  const showNum = currentTool === 'number' || (sel && sel.type === 'number');
  const showSpot = currentTool === 'spotlight' || currentTool === 'circlespotlight'
    || (sel && (sel.type === 'spotlight' || sel.type === 'circlespotlight'));
  const showText = currentTool === 'text' || (sel && sel.type === 'text');

  if (strokeGroup) strokeGroup.style.display = showStroke ? 'flex' : 'none';
  if (blurGroup) blurGroup.style.display = showBlur ? 'flex' : 'none';
  if (numGroup) numGroup.style.display = showNum ? 'flex' : 'none';
  if (spotGroup) spotGroup.style.display = showSpot ? 'flex' : 'none';
  if (textGroup) textGroup.style.display = showText ? 'flex' : 'none';

  // Sync slider values to selected annotation
  if (sel && ['rect', 'fillrect', 'squarehighlight', 'circle', 'line', 'arrow', 'freehand', 'highlighter', 'spotlight', 'circlespotlight'].includes(sel.type) && strokeGroup) {
    const s = Math.round(sel.stroke / displayScale);
    const slider = document.getElementById('stroke-width');
    const valEl = document.getElementById('stroke-value');
    if (slider) slider.value = s;
    if (valEl) valEl.textContent = s + 'px';
  }
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

  // Update Options Bar dynamic show/hide state
  if (typeof updateOptionsBarVisibility === 'function') {
    updateOptionsBarVisibility();
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

/** Compute the average color of the current image canvas */
function computeAverageColor() {
  try {
    const w = imgCanvas.width, h = imgCanvas.height;
    // Sample at reduced resolution for performance
    const sampleSize = 64;
    const tmpC = document.createElement('canvas');
    tmpC.width = sampleSize; tmpC.height = sampleSize;
    const tmpX = tmpC.getContext('2d');
    tmpX.drawImage(imgCanvas, 0, 0, sampleSize, sampleSize);
    const data = tmpX.getImageData(0, 0, sampleSize, sampleSize).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i+1]; b += data[i+2]; count++;
    }
    if (count === 0) return '#888888';
    return `rgb(${Math.round(r/count)}, ${Math.round(g/count)}, ${Math.round(b/count)})`;
  } catch (e) {
    return '#888888';
  }
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
