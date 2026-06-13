'use strict';

/* ─────────────────────────────────────────────
   DRAWING / SELECTION HANDLERS
   ───────────────────────────────────────────── */

function getPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    x: rect.width ? (e.clientX - rect.left) * (drawCanvas.width / rect.width) : 0,
    y: rect.height ? (e.clientY - rect.top) * (drawCanvas.height / rect.height) : 0,
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
    if (isBlurType && selectedIdx !== hitIdx) {
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
      const pcw = drawCtx.canvas.width, pch = drawCtx.canvas.height;
      drawCtx.clearRect(0, 0, pcw, pch);

      const existingSpots = annotations.filter(a => a.type === 'spotlight' || a.type === 'circlespotlight');
      const previewDark = spotlightDarkness / 100;

      drawCtx.fillStyle = `rgba(0,0,0,${previewDark})`;
      drawCtx.beginPath();
      drawCtx.rect(0, 0, pcw, pch);

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
  e.stopPropagation();
  let p = getPos(e);
  p = applyShiftConstraint(p, e);
  releaseDragOrDraw(p.x, p.y);
});

/* ── Sticky-drag fix: release on window mouseup if cursor left canvas ── */
function clampToCanvas(x, y) {
  return {
    x: Math.max(0, Math.min(drawCanvas.width,  x)),
    y: Math.max(0, Math.min(drawCanvas.height, y)),
  };
}

function releaseDragOrDraw(rawX, rawY) {
  if (isDraggingHandle) {
    isDraggingHandle = false;
    activeHandle = null;
    redraw();
    window.lensEditor.markDirty();
    drawCanvas.style.cursor = currentTool === 'select' ? 'default' : 'crosshair';
    return;
  }

  if (isDragging) {
    isDragging = false;
    if (selectedIdx >= 0) {
      const ann = annotations[selectedIdx];
      const bounds = getAnnBounds(ann);
      if (bounds) {
        const clamped = clampToCanvas(rawX, rawY);
        const dx = clamped.x - rawX;
        const dy = clamped.y - rawY;
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
  const rect = drawCanvas.getBoundingClientRect();
  const rawX = rect.width ? (e.clientX - rect.left) * (drawCanvas.width / rect.width) : 0;
  const rawY = rect.height ? (e.clientY - rect.top) * (drawCanvas.height / rect.height) : 0;
  releaseDragOrDraw(rawX, rawY);
});

// Global mousemove — allows crop handles to be dragged beyond canvas edges
document.addEventListener('mousemove', (e) => {
  if (!isDraggingHandle || currentTool !== 'crop' || !cropBox) return;
  const rect = drawCanvas.getBoundingClientRect();
  const p = {
    x: rect.width ? (e.clientX - rect.left) * (drawCanvas.width / rect.width) : 0,
    y: rect.height ? (e.clientY - rect.top) * (drawCanvas.height / rect.height) : 0,
  };

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
    activeTextCommit = null;
    input._liveUpdateFont = null;
    const txt = input.value.trim();
    const activeFont = textFont;
    if (editIdx !== undefined) {
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

  activeTextCommit = commit;

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') { committed = true; activeTextCommit = null; input.remove(); textInputEl = null; drawCanvas.style.pointerEvents = 'auto'; }
  });
  input.addEventListener('blur', () => setTimeout(commit, 100));
}

function editExistingText(idx) {
  const ann = annotations[idx];
  const b = getAnnBounds(ann);
  if (!b) return;
  showTextInput(ann.x, ann.y, idx);
}
