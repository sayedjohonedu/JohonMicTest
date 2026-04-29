'use strict';
/* ═══════════════════════════════════════════════════════════
   MicTab Video Editor — Core Engine
   Canvas pipeline, state, segments, zoom, waveform, undo
   ═══════════════════════════════════════════════════════════ */

/* ── State ── */
const S = {
  filePath: '', videoW: 0, videoH: 0, duration: 0,
  segments: [],        // {id, startSec, endSec, isDeleted}
  zoomKeyframes: [],   // {timeSec, scale}
  currentTime: 0, playing: false, speed: 1,
  selectedSegId: null,  // currently selected segment
  viewport: { radius: 0, padding: 0, shadow: 0, bg: 'none', aspectRatio: 'original', bgMode: 'color', blurIntensity: 30, bgImageSrc: '' },
  tlZoom: 100,  // px per second for timeline
  tool: 'select', // select | split | zoom
  history: [], historyIdx: -1,
  autoZoomApplied: false,
};

/* ── Helpers ── */
function genId() { return Math.random().toString(36).substr(2, 9); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function smoothstep(a, b, t) { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function fmtTime(s) {
  if (!s || !isFinite(s)) return '00:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}
function fmtTimeFull(s) {
  if (!s || !isFinite(s)) return '00:00:00';
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

/* ── Undo / Redo ── */
function snapshot() {
  const snap = JSON.stringify({ segments: S.segments, zoomKeyframes: S.zoomKeyframes, viewport: S.viewport });
  S.history = S.history.slice(0, S.historyIdx + 1);
  S.history.push(snap);
  if (S.history.length > 80) S.history.shift();
  S.historyIdx = S.history.length - 1;
}
function undo() {
  if (S.historyIdx <= 0) return false;
  S.historyIdx--;
  const d = JSON.parse(S.history[S.historyIdx]);
  S.segments = d.segments; S.zoomKeyframes = d.zoomKeyframes; S.viewport = d.viewport;
  return true;
}
function redo() {
  if (S.historyIdx >= S.history.length - 1) return false;
  S.historyIdx++;
  const d = JSON.parse(S.history[S.historyIdx]);
  S.segments = d.segments; S.zoomKeyframes = d.zoomKeyframes; S.viewport = d.viewport;
  return true;
}

/* ── Segment Operations ── */
function initSegments(dur) {
  S.duration = dur;
  S.segments = [{ id: genId(), startSec: 0, endSec: dur, isDeleted: false }];
  S.zoomKeyframes = [];
  S.history = []; S.historyIdx = -1;
  snapshot();
}

function splitAtTime(timeSec) {
  const t = clamp(timeSec, 0.05, S.duration - 0.05);
  const idx = S.segments.findIndex(s => t > s.startSec + 0.05 && t < s.endSec - 0.05);
  if (idx < 0) return false;
  const seg = S.segments[idx];
  const left = { id: genId(), startSec: seg.startSec, endSec: t, isDeleted: seg.isDeleted };
  const right = { id: genId(), startSec: t, endSec: seg.endSec, isDeleted: seg.isDeleted };
  S.segments.splice(idx, 1, left, right);
  snapshot();
  return true;
}

function toggleDeleteSegment(segId) {
  const seg = S.segments.find(s => s.id === segId);
  if (!seg) return;
  seg.isDeleted = !seg.isDeleted;
  snapshot();
}

function resizeBoundary(leftId, rightId, newTimeSec, initialCut) {
  const leftIdx = S.segments.findIndex(s => s.id === leftId);
  const rightIdx = S.segments.findIndex(s => s.id === rightId);
  if (leftIdx < 0 || rightIdx < 0) return;
  const left = S.segments[leftIdx];
  const right = S.segments[rightIdx];

  // If one of them is already deleted, just adjust their shared boundary (shrinking/growing the gap)
  if (left.isDeleted || right.isDeleted) {
    const minT = left.isDeleted ? left.startSec : left.startSec + 0.05;
    const maxT = right.isDeleted ? right.endSec : right.endSec - 0.05;
    const t = clamp(newTimeSec, minT, maxT);
    left.endSec = t;
    right.startSec = t;
    return;
  }

  // BOTH ARE ACTIVE. We want a Ripple Edit.
  // We need to maintain a gap between them to represent the trimmed video.
  
  // First, check if we already inserted a gap between left and right during this drag session
  let gap = null;
  if (rightIdx === leftIdx + 2 && S.segments[leftIdx + 1].isDeleted) {
    gap = S.segments[leftIdx + 1];
  } else if (rightIdx === leftIdx + 1) {
    // We haven't inserted a gap yet. Let's insert one with 0 duration at the initial cut point.
    if (initialCut === undefined) initialCut = left.endSec;
    gap = { id: genId(), startSec: initialCut, endSec: initialCut, isDeleted: true };
    S.segments.splice(leftIdx + 1, 0, gap);
  } else {
    return; // Shouldn't happen
  }

  if (initialCut === undefined) initialCut = left.endSec;

  // Clamp t to prevent shrinking segments too much
  let t = clamp(newTimeSec, left.startSec + 0.05, right.endSec - 0.05);

  if (t < initialCut) {
    // Shorten left, gap covers the removed part
    left.endSec = t;
    gap.startSec = t;
    gap.endSec = initialCut;
    right.startSec = initialCut;
  } else if (t > initialCut) {
    // Shorten right, gap covers the removed part
    left.endSec = initialCut;
    gap.startSec = initialCut;
    gap.endSec = t;
    right.startSec = t;
  } else {
    left.endSec = t;
    gap.startSec = t;
    gap.endSec = t;
    right.startSec = t;
  }
}

/* ── Zoom Regions (replaces old keyframe diamonds) ── */
// Each region: {id, startSec, durationSec, scale, targetX, targetY}
// targetX/Y are 0-1 normalized coordinates on the video

// Check if a time range overlaps any existing zoom region
function zoomRegionOverlapsExisting(startSec, durationSec) {
  const endSec = startSec + durationSec;
  for (const r of S.zoomKeyframes) {
    const rEnd = r.startSec + r.durationSec;
    // Overlap = regions share any time range
    if (startSec < rEnd && endSec > r.startSec) return r;
  }
  return null;
}

function addZoomRegion(startSec, durationSec, scale, targetX, targetY) {
  let dur = durationSec || 5;

  // Check if click is inside an existing region
  const insideExisting = S.zoomKeyframes.find(r => startSec >= r.startSec && startSec < r.startSec + r.durationSec);
  if (insideExisting) return null;

  // Check if it overlaps a region to the right, and if so, shrink duration
  for (const r of S.zoomKeyframes) {
    if (r.startSec > startSec && r.startSec < startSec + dur) {
      dur = r.startSec - startSec;
    }
  }

  // Ensure minimum duration
  if (dur < 0.5) dur = 0.5;

  // Final check to block if the minimum duration still causes overlap
  if (zoomRegionOverlapsExisting(startSec, dur)) return null;

  const region = {
    id: genId(), startSec, durationSec: dur,
    scale: scale || 2, targetX: targetX || 0.5, targetY: targetY || 0.5
  };
  S.zoomKeyframes.push(region);
  S.zoomKeyframes.sort((a, b) => a.startSec - b.startSec);
  snapshot();
  return region;
}
function removeZoomRegion(id) {
  S.zoomKeyframes = S.zoomKeyframes.filter(r => r.id !== id);
  snapshot();
}
function updateZoomRegion(id, updates) {
  const r = S.zoomKeyframes.find(z => z.id === id);
  if (r) Object.assign(r, updates);
}

// Split a zoom region into two at the given time
function splitZoomRegion(id, timeSec) {
  const r = S.zoomKeyframes.find(z => z.id === id);
  if (!r) return false;
  const end = r.startSec + r.durationSec;
  // Must be inside the region with enough margin on both sides
  if (timeSec <= r.startSec + 0.2 || timeSec >= end - 0.2) return false;

  // Left half keeps original id
  const leftDur = timeSec - r.startSec;
  // Right half gets new id
  const rightDur = end - timeSec;
  const rightRegion = {
    id: genId(), startSec: timeSec, durationSec: rightDur,
    scale: r.scale, targetX: r.targetX, targetY: r.targetY
  };
  r.durationSec = leftDur;
  S.zoomKeyframes.push(rightRegion);
  S.zoomKeyframes.sort((a, b) => a.startSec - b.startSec);
  snapshot();
  return true;
}

// Get zoom region at a specific time (for selecting/splitting)
function getZoomRegionAtTime(timeSec) {
  return S.zoomKeyframes.find(r => timeSec >= r.startSec && timeSec < r.startSec + r.durationSec) || null;
}

// Legacy compat wrappers for undo/redo
function addZoomKF(timeSec, scale) { addZoomRegion(timeSec, 5, scale || 2); }
function removeZoomKF(idx) { S.zoomKeyframes.splice(idx, 1); snapshot(); }

/* ── Cursor track data (loaded from .mictab-cursor.json) ── */
let cursorData = null; // {displayBounds, track: [{t, x, y}]}

function setCursorData(data) { cursorData = data; }

function processClicksToZooms(clicks, displayBounds) {
  if (!clicks || !clicks.length) return;
  
  const COOLDOWN = 2.0; 
  const PRE_CLICK = 1.5; 
  
  let currentGroup = null;
  const groups = [];
  
  for (const c of clicks) {
    if (!currentGroup) {
      currentGroup = { startT: Math.max(0, c.t - PRE_CLICK), endT: c.t + COOLDOWN, x: c.x, y: c.y };
      groups.push(currentGroup);
    } else {
      const newStart = c.t - PRE_CLICK;
      if (newStart <= currentGroup.endT) {
        // Overlaps, so merge
        currentGroup.endT = Math.max(currentGroup.endT, c.t + COOLDOWN);
        // keep recent target
        currentGroup.x = c.x;
        currentGroup.y = c.y;
      } else {
        // New group
        currentGroup = { startT: Math.max(0, newStart), endT: c.t + COOLDOWN, x: c.x, y: c.y };
        groups.push(currentGroup);
      }
    }
  }
  
  for (const g of groups) {
    const dur = g.endT - g.startT;
    const nx = clamp((g.x - displayBounds.x) / displayBounds.width, 0, 1);
    const ny = clamp((g.y - displayBounds.y) / displayBounds.height, 0, 1);
    
    // Check if it overlaps existing zooms (addZoomRegion already does this)
    addZoomRegion(g.startT, dur, 2.5, nx, ny); // 2.5x zoom
  }
}

// Get interpolated cursor position at time t (normalized 0-1)
function getCursorPosAtTime(t) {
  if (!cursorData || !cursorData.track || !cursorData.track.length) return { x: 0.5, y: 0.5 };
  const track = cursorData.track;
  const bounds = cursorData.displayBounds;

  // Binary search for nearest sample
  let lo = 0, hi = track.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; track[mid].t <= t ? lo = mid : hi = mid; }
  const a = track[lo], b = track[hi];
  if (!a || !b) return { x: 0.5, y: 0.5 };

  // Lerp between samples
  const frac = b.t === a.t ? 0 : clamp((t - a.t) / (b.t - a.t), 0, 1);
  const rawX = a.x + (b.x - a.x) * frac;
  const rawY = a.y + (b.y - a.y) * frac;

  // Normalize to 0-1 based on display bounds
  const nx = clamp((rawX - bounds.x) / bounds.width, 0, 1);
  const ny = clamp((rawY - bounds.y) / bounds.height, 0, 1);
  return { x: nx, y: ny };
}

/* ── Cinematic easing functions ── */
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2; }

// Smooth camera position with spring physics for cinematic motion
let camX = 0.5, camY = 0.5; // current camera target (smoothed)
function smoothCameraTarget(targetX, targetY, dt) {
  // Exponential decay lerp — creates that cinematic "lag" feel
  const speed = 3.0; // lower = more cinematic lag
  const factor = 1 - Math.exp(-speed * Math.max(dt, 1/60));
  camX += (targetX - camX) * factor;
  camY += (targetY - camY) * factor;
  return { x: camX, y: camY };
}

/* ── Get zoom info at time t: {scale, targetX, targetY, easePhase} ── */
function getZoomAtTime(t) {
  const regions = S.zoomKeyframes;
  if (!regions.length) return { scale: 1, targetX: 0.5, targetY: 0.5, easePhase: 0 };

  const EASE_DUR = 0.5; // 0.5s ease in/out for professional feel

  for (const r of regions) {
    const end = r.startSec + r.durationSec;
    // Ease-in zone: 0.5s before region starts
    if (t >= r.startSec - EASE_DUR && t < end + EASE_DUR) {
      let easeFactor;
      if (t < r.startSec) {
        // Easing IN
        easeFactor = easeInOutCubic((t - (r.startSec - EASE_DUR)) / EASE_DUR);
      } else if (t >= end) {
        // Easing OUT
        easeFactor = easeInOutCubic(1 - (t - end) / EASE_DUR);
      } else {
        // Fully zoomed
        easeFactor = 1;
      }

      const scale = 1 + (r.scale - 1) * easeFactor;

      // Get target position: use cursor data if available, else use region's stored target
      let tx = r.targetX, ty = r.targetY;
      if (cursorData) {
        const cp = getCursorPosAtTime(t);
        tx = cp.x; ty = cp.y;
      }

      return { scale, targetX: tx, targetY: ty, easePhase: easeFactor };
    }
  }

  return { scale: 1, targetX: 0.5, targetY: 0.5, easePhase: 0 };
}

/* ── Canvas Renderer ── */
let lastRenderTime = 0;
let bgImageObj = null; // cached Image for image backgrounds

/* Helper: resolve aspect ratio string to numeric w/h ratio or null for original */
function resolveAR(ar, vw, vh) {
  if (!ar || ar === 'original') return vw / vh;
  if (typeof ar === 'number') return ar;
  const map = { '16:9': 16/9, '9:16': 9/16, '1:1': 1, '4:3': 4/3, '3:4': 3/4, '4:5': 4/5, '21:9': 21/9 };
  return map[ar] || (vw / vh);
}

function renderFrame(canvas, video) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !video.videoWidth) return;

  const now = performance.now();
  const dt = (now - lastRenderTime) / 1000;
  lastRenderTime = now;

  const vw = video.videoWidth, vh = video.videoHeight;
  const { radius, padding, shadow, bg, aspectRatio, bgMode, blurIntensity, bgImageSrc } = S.viewport;
  const zoomInfo = getZoomAtTime(S.currentTime);

  // Resolve target aspect ratio
  const targetAR = resolveAR(aspectRatio, vw, vh);
  const sourceAR = vw / vh;

  // Set canvas dimensions based on target AR
  const maxW = Math.min(vw, 1920), maxH = Math.min(vh, 1080);
  let cw, ch;
  if (Math.abs(targetAR - sourceAR) < 0.01) {
    cw = maxW; ch = maxH;
  } else if (targetAR > sourceAR) {
    // Target is wider — height stays, width grows
    ch = maxH; cw = Math.round(ch * targetAR);
  } else {
    // Target is taller — width stays, height grows
    cw = maxW; ch = Math.round(cw / targetAR);
  }
  // Ensure even
  cw = cw % 2 === 0 ? cw : cw + 1;
  ch = ch % 2 === 0 ? ch : ch + 1;

  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw; canvas.height = ch;
  }

  ctx.clearRect(0, 0, cw, ch);

  // ── Compute video draw rect with padding ──
  const pad = padding;
  const availW = cw - pad * 2, availH = ch - pad * 2;
  const scaleToFit = Math.min(availW / vw, availH / vh);
  const dw = vw * scaleToFit, dh = vh * scaleToFit;
  const dx = pad + (availW - dw) / 2, dy = pad + (availH - dh) / 2;

  // ── Background layer (Static) ──
  if (bgMode === 'blur') {
    ctx.save();
    const bgScale = Math.max(cw / vw, ch / vh);
    const bw = vw * bgScale, bh = vh * bgScale;
    const bx = (cw - bw) / 2, by = (ch - bh) / 2;
    const sigma = blurIntensity || 30;
    ctx.filter = `blur(${Math.round(sigma * 0.8)}px) brightness(0.5)`;
    ctx.drawImage(video, bx - 10, by - 10, bw + 20, bh + 20);
    ctx.restore();
  } else if (bgMode === 'image' && bgImageObj) {
    ctx.save();
    const iAR = bgImageObj.naturalWidth / bgImageObj.naturalHeight;
    const cAR = cw / ch;
    let sx = 0, sy = 0, sw = bgImageObj.naturalWidth, sh = bgImageObj.naturalHeight;
    if (iAR > cAR) { sw = bgImageObj.naturalHeight * cAR; sx = (bgImageObj.naturalWidth - sw) / 2; }
    else { sh = bgImageObj.naturalWidth / cAR; sy = (bgImageObj.naturalHeight - sh) / 2; }
    ctx.drawImage(bgImageObj, sx, sy, sw, sh, 0, 0, cw, ch);
    if (blurIntensity > 0) {
      ctx.filter = `blur(${Math.round(blurIntensity * 0.5)}px)`;
      ctx.drawImage(bgImageObj, sx, sy, sw, sh, -6, -6, cw + 12, ch + 12);
    }
    ctx.restore();
  } else if (bg && bg !== 'none') {
    if (bg.startsWith('linear-gradient')) {
      const m = bg.match(/linear-gradient\(([^,]+),([^,)]+),([^)]+)\)/);
      if (m) {
        const angle = parseFloat(m[1]) * Math.PI / 180;
        const x0 = cw/2 - Math.cos(angle)*cw/2, y0 = ch/2 - Math.sin(angle)*ch/2;
        const x1 = cw/2 + Math.cos(angle)*cw/2, y1 = ch/2 + Math.sin(angle)*ch/2;
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, m[2].trim()); grad.addColorStop(1, m[3].trim());
        ctx.fillStyle = grad;
      } else { ctx.fillStyle = '#0f0f1a'; }
    } else { ctx.fillStyle = bg; }
    ctx.fillRect(0, 0, cw, ch);
  }

  ctx.save();

  // Apply zoom with cinematic camera tracking to the video layer
  const zoom = zoomInfo.scale;
  if (zoom > 1) {
    // Smooth the camera target for cinematic motion
    const cam = smoothCameraTarget(zoomInfo.targetX, zoomInfo.targetY, dt);

    // Convert normalized position to canvas coordinates
    const focusX = dx + cam.x * dw;
    const focusY = dy + cam.y * dh;

    ctx.translate(focusX, focusY);
    ctx.scale(zoom, zoom);
    ctx.translate(-focusX, -focusY);

    // Subtle motion blur during zoom transitions (easePhase < 1 means transitioning)
    if (zoomInfo.easePhase > 0 && zoomInfo.easePhase < 0.95) {
      ctx.filter = `blur(${(1 - zoomInfo.easePhase) * 1.5}px)`;
    }
  } else {
    // Reset camera smoothing when not zoomed
    camX = 0.5; camY = 0.5;
  }

  // Shadow — draw a shape behind the video to cast shadow from
  if (shadow > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = shadow;
    ctx.shadowOffsetY = shadow * 0.3;
    ctx.fillStyle = '#000';
    if (radius > 0) {
      const r = Math.min(radius, dw/2, dh/2);
      ctx.beginPath();
      ctx.roundRect(dx, dy, dw, dh, r);
      ctx.fill();
    } else {
      ctx.fillRect(dx, dy, dw, dh);
    }
    ctx.restore();
  }

  // Clip rounded corners
  if (radius > 0) {
    const r = Math.min(radius, dw/2, dh/2);
    ctx.beginPath();
    ctx.roundRect(dx, dy, dw, dh, r);
    ctx.clip();
  }

  ctx.drawImage(video, dx, dy, dw, dh);
  ctx.restore();
}

/* ── Export-specific renderer: deterministic dt for consistent spring physics ── */
function renderFrameForExport(canvas, video, fps) {
  // Force a deterministic dt = 1/fps so spring physics produce consistent results
  lastRenderTime = performance.now() - (1000 / (fps || 30));
  renderFrame(canvas, video);
}

/* Reset camera state (call before starting export) */
function resetCameraState() {
  camX = 0.5; camY = 0.5;
  lastRenderTime = 0;
}

/* ── Waveform Generator ── */
async function generateWaveform(filePath, samplesPerSec) {
  try {
    // In Electron, read file via fetch with file:// protocol
    const resp = await fetch('file://' + encodeURI(filePath));
    const arrayBuf = await resp.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
    const channelData = audioBuf.getChannelData(0);
    const totalSamples = Math.floor(audioBuf.duration * (samplesPerSec || 50));
    const sampleSize = Math.floor(channelData.length / totalSamples);
    const peaks = [];
    for (let i = 0; i < totalSamples; i++) {
      const start = i * sampleSize;
      let mn = 1, mx = -1;
      for (let j = 0; j < sampleSize; j++) {
        const v = channelData[start + j];
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
      peaks.push(Math.max(Math.abs(mn), Math.abs(mx)));
    }
    audioCtx.close();
    return peaks;
  } catch (e) {
    console.warn('Waveform generation failed:', e);
    return [];
  }
}

function drawWaveform(canvas, peaks) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !peaks.length) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1;
  const cy = h / 2, hs = h / 2;
  const ppk = w / peaks.length;
  for (let i = 0; i < peaks.length; i++) {
    const x = i * ppk, amp = peaks[i] * hs;
    ctx.moveTo(x, cy - amp);
    ctx.lineTo(x, cy + amp);
  }
  ctx.stroke();
}

/* ── Skip Deleted Segments ── */
function getNextActiveTime(time) {
  for (const seg of S.segments) {
    if (time >= seg.startSec && time < seg.endSec && seg.isDeleted) {
      // Find next non-deleted segment
      const idx = S.segments.indexOf(seg);
      for (let i = idx + 1; i < S.segments.length; i++) {
        if (!S.segments[i].isDeleted) return S.segments[i].startSec;
      }
      return S.duration; // no more active segments
    }
  }
  return time; // already in active segment
}

/* ── Find segment at a given time ── */
function getSegmentAtTime(t) {
  return S.segments.find(s => t >= s.startSec && t < s.endSec) || null;
}

/* ── Delete a specific segment (move to deleted track) ── */
function deleteSegment(segId) {
  const seg = S.segments.find(s => s.id === segId);
  if (!seg || seg.isDeleted) return false;
  seg.isDeleted = true;
  snapshot();
  return true;
}

/* ── Restore a specific segment (move back to active track) ── */
function restoreSegment(segId) {
  const seg = S.segments.find(s => s.id === segId);
  if (!seg || !seg.isDeleted) return false;
  seg.isDeleted = false;
  snapshot();
  return true;
}

/* ── Ripple Delete Backward (Q): delete from previous cut/start to playhead ── */
function rippleDeleteBackward(timeSec) {
  // First split at playhead if needed
  const segAtTime = getSegmentAtTime(timeSec);
  if (!segAtTime) return false;

  // If playhead is not exactly on a segment boundary, split first
  if (timeSec > segAtTime.startSec + 0.05 && timeSec < segAtTime.endSec - 0.05) {
    splitAtTime(timeSec);
  }

  // Now find and delete the segment that ends at (or just before) the playhead
  const segBefore = S.segments.find(s =>
    Math.abs(s.endSec - timeSec) < 0.1 && !s.isDeleted
  );
  if (segBefore) {
    segBefore.isDeleted = true;
    snapshot();
    return true;
  }
  return false;
}

/* ── Ripple Delete Forward (E): delete from playhead to next cut/end ── */
function rippleDeleteForward(timeSec) {
  const segAtTime = getSegmentAtTime(timeSec);
  if (!segAtTime) return false;

  // If playhead is not exactly on a segment boundary, split first
  if (timeSec > segAtTime.startSec + 0.05 && timeSec < segAtTime.endSec - 0.05) {
    splitAtTime(timeSec);
  }

  // Now find and delete the segment that starts at (or just after) the playhead
  const segAfter = S.segments.find(s =>
    Math.abs(s.startSec - timeSec) < 0.1 && !s.isDeleted
  );
  if (segAfter) {
    segAfter.isDeleted = true;
    snapshot();
    return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════
   SILENCE DETECTION
   Uses waveform peak data (already generated) to find quiet regions.
   No external dependencies — pure Web Audio API data.
   ═══════════════════════════════════════════════════════════ */

/**
 * Detect silent regions from waveform peaks.
 * @param {number[]} peaks - amplitude peaks (0-1), typically 50/sec
 * @param {number} duration - total video duration in seconds
 * @param {number} threshold - amplitude below this = silence (0.01-0.15)
 * @param {number} minDuration - minimum silence length in seconds (0.3+)
 * @returns {{startSec: number, endSec: number}[]}
 */
function detectSilence(peaks, duration, threshold, minDuration) {
  if (!peaks.length || !duration) return [];
  const secPerPeak = duration / peaks.length;
  const regions = [];
  let silenceStart = -1;

  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i] < threshold) {
      if (silenceStart < 0) silenceStart = i;
    } else {
      if (silenceStart >= 0) {
        const startSec = silenceStart * secPerPeak;
        const endSec = i * secPerPeak;
        if (endSec - startSec >= minDuration) {
          regions.push({ startSec, endSec });
        }
        silenceStart = -1;
      }
    }
  }
  // Handle silence that extends to the end
  if (silenceStart >= 0) {
    const startSec = silenceStart * secPerPeak;
    if (duration - startSec >= minDuration) {
      regions.push({ startSec, endSec: duration });
    }
  }
  return regions;
}

/**
 * Batch remove silent regions: splits at boundaries, then deletes silent segments.
 * @param {{startSec: number, endSec: number}[]} silentRegions
 * @returns {number} count of segments deleted
 */
function removeSilentRegions(silentRegions) {
  if (!silentRegions.length) return 0;
  let removed = 0;
  const sorted = [...silentRegions].sort((a, b) => b.startSec - a.startSec);
  for (const region of sorted) {
    splitAtTime(region.endSec);
    splitAtTime(region.startSec);
  }
  for (const seg of S.segments) {
    if (seg.isDeleted) continue;
    const segMid = (seg.startSec + seg.endSec) / 2;
    for (const region of silentRegions) {
      if (segMid >= region.startSec && segMid <= region.endSec) {
        seg.isDeleted = true;
        removed++;
        break;
      }
    }
  }
  snapshot();
  return removed;
}
