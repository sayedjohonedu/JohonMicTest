'use strict';
/* ═══════════════════════════════════════════════════════════
   MicTab Video Editor — UI Controller
   Wires veditor-core.js to the DOM
   ═══════════════════════════════════════════════════════════ */

/* ── Theme synchronisation ── */
function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); }
window.veditor.getConfig().then(c => { if (c && c.theme) applyTheme(c.theme); }).catch(() => {});
window.veditor.onConfigUpdate(c => { if (c && c.theme) applyTheme(c.theme); });

/* ── DOM refs ── */
const $ = id => document.getElementById(id);
const canvas = $('preview-canvas');
const video = document.createElement('video');
video.preload = 'metadata'; video.playsInline = true; video.muted = false;
const tlScroll = $('tl-scroll');
const tlContent = $('tl-content');
const tlRuler = $('tl-ruler');
const wfCanvas = $('waveform-canvas');
const trackActive = $('track-active');
// trackDeleted removed — deleted segments shown as cut markers inline
const trackZoom = $('track-zoom');
const playhead = $('playhead');
const toast = $('toast');

let waveformPeaks = [];
let resolvedDuration = false;
let animId = null;
let resizeDrag = null; // {leftId, rightId}
let isDraggingTimeline = false; // for scrubbing
let skipPending = false; // prevents re-seek loop when skipping deleted segments
let zoomDrag = null; // {id, side, grabOffset?} for resizing/moving zoom regions
let selectedZoomId = null;
let lastZoomScale = 2; // remember last zoom level user chose
const inspectorTitle = () => $('inspector-title');
const inspectorBody = () => $('inspector-body');

// Silence detection state
let silenceRegions = [];       // detected silent regions [{startSec, endSec}]
let silenceThreshold = 0.03;   // amplitude threshold (0-1)
let silenceMinDuration = 0.5;  // minimum silence length (seconds)
let silenceMode = false;       // whether silence overlays are visible

/* ═══ INIT ═══ */
(function init() {
  const params = new URLSearchParams(location.search);
  const fp = params.get('file');
  if (!fp) return;
  S.filePath = fp;

  // Cross-platform file URL: normalise backslashes and ensure 3 slashes for Windows drive paths
  let _fp = fp.replace(/\\/g, '/');
  if (!_fp.startsWith('/')) _fp = '/' + _fp;
  video.src = 'file://' + encodeURI(_fp);
  video.load();

  video.addEventListener('loadedmetadata', () => {
    if (!isFinite(video.duration)) { resolvedDuration = false; video.currentTime = 1e10; }
    else onDurationReady();
  });
  video.addEventListener('seeked', () => {
    if (!resolvedDuration && isFinite(video.duration)) { onDurationReady(); return; }
    skipPending = false; // seek completed, allow skip-check again
    if (!S.playing) renderCurrentFrame();
  });
  video.addEventListener('ended', () => { S.playing = false; updatePlayBtn(); });
})();

function onDurationReady() {
  resolvedDuration = true;
  const dur = video.duration;
  S.videoW = video.videoWidth; S.videoH = video.videoHeight;
  // Canvas dimensions are now set dynamically by renderFrame based on AR
  canvas.width = Math.min(S.videoW, 1920); canvas.height = Math.min(S.videoH, 1080);
  updateResLabel();
  $('tc-total').textContent = fmtTime(dur);
  initSegments(dur);
  video.currentTime = 0;
  buildTimeline();
  renderCurrentFrame();

  // Load sidecar project and cursor track
  if (window.veditor && window.veditor.loadProject && window.veditor.loadCursorTrack) {
    Promise.all([
      window.veditor.loadProject(S.filePath),
      window.veditor.loadCursorTrack(S.filePath)
    ]).then(([proj, data]) => {
      if (proj) {
        S.autoZoomApplied = proj.autoZoomApplied || false;
        if (proj.segments) S.segments = proj.segments;
        if (proj.zoomKeyframes) S.zoomKeyframes = proj.zoomKeyframes;
        if (proj.viewport) Object.assign(S.viewport, proj.viewport);
      } else {
        S.autoZoomApplied = false;
      }

      if (data) {
        setCursorData(data);
        console.log('[Editor] Cursor track loaded:', data.track ? data.track.length : 0, 'points');
        if (data.clicks && data.clicks.length && !S.autoZoomApplied) {
          processClicksToZooms(data.clicks, data.displayBounds);
          S.autoZoomApplied = true;
        }
      }

      syncSettingsUI(); buildTimeline(); snapshot();
    });
  }

  // Generate waveform (async)
  generateWaveform(S.filePath, 50).then(peaks => {
    waveformPeaks = peaks; drawTimelineWaveform();
  });
}

/* ── Resolution label helper ── */
function updateResLabel() {
  const ar = S.viewport.aspectRatio || 'original';
  const resLabel = $('res-label');
  if (!resLabel || !S.videoW) return;
  if (ar === 'original') {
    resLabel.textContent = S.videoW + '×' + S.videoH;
  } else {
    // Compute effective canvas dims same way renderFrame does
    const sourceAR = S.videoW / S.videoH;
    const arMap = { '16:9': 16/9, '9:16': 9/16, '1:1': 1, '4:3': 4/3, '3:4': 3/4, '4:5': 4/5, '21:9': 21/9 };
    const targetAR = arMap[ar] || sourceAR;
    const maxW = Math.min(S.videoW, 1920), maxH = Math.min(S.videoH, 1080);
    let cw, ch;
    if (Math.abs(targetAR - sourceAR) < 0.01) { cw = maxW; ch = maxH; }
    else if (targetAR > sourceAR) { ch = maxH; cw = Math.round(ch * targetAR); }
    else { cw = maxW; ch = Math.round(cw / targetAR); }
    cw = cw % 2 === 0 ? cw : cw + 1;
    ch = ch % 2 === 0 ? ch : ch + 1;
    resLabel.textContent = cw + '×' + ch + ' (' + ar + ')';
  }
}

/* ═══ RENDER LOOP ═══ */
function renderCurrentFrame() { renderFrame(canvas, video); }

function startPlayLoop() {
  if (animId) return;
  const loop = () => {
    if (!S.playing) { animId = null; return; }
    S.currentTime = video.currentTime;

    // Skip deleted segments (only if not already waiting for a seek)
    if (!skipPending) {
      const adjusted = getNextActiveTime(S.currentTime);
      if (adjusted !== S.currentTime) {
        if (adjusted >= S.duration) { pauseVideo(); return; }
        skipPending = true;
        video.currentTime = adjusted;
        S.currentTime = adjusted;
      }
    }

    // Handle per-segment mute
    const seg = getSegmentAtTime(S.currentTime);
    video.muted = (seg && seg.isMuted) || false;

    renderCurrentFrame(); updateTimeUI(); updatePlayhead(); scrollToPlayhead();
    animId = requestAnimationFrame(loop);
  };
  animId = requestAnimationFrame(loop);
}

function playVideo() {
  S.playing = true; video.playbackRate = S.speed;
  video.play().catch(() => {}); updatePlayBtn(); startPlayLoop();
}
function pauseVideo() {
  S.playing = false; video.pause(); updatePlayBtn(); animId = null;
}
function togglePlay() { S.playing ? pauseVideo() : playVideo(); }

/* ═══ SEEK ═══ */
function seekTo(t) {
  S.currentTime = clamp(t, 0, S.duration);
  video.currentTime = S.currentTime;
  updateTimeUI(); updatePlayhead();
  // Auto-select segment under playhead — only if no zoom region is selected
  if (!selectedZoomId) {
    const seg = getSegmentAtTime(S.currentTime);
    S.selectedSegId = seg ? seg.id : null;
  }
  if (!S.playing) renderCurrentFrame();
  highlightSelected();
}

/* ═══ TIMELINE BUILD ═══ */
// Map to convert between visual (packed) positions and real time
let segmentVisualMap = []; // [{seg, visualLeft, visualWidth}]

function buildTimeline() {
  // Calculate packed (active-only) duration for timeline width
  const activeSegs = S.segments.filter(s => !s.isDeleted);
  const activeDuration = activeSegs.reduce((sum, s) => sum + (s.endSec - s.startSec), 0) || S.duration;
  const tw = activeDuration * S.tlZoom;
  tlContent.style.width = tw + 'px';

  // Ruler — based on active duration
  tlRuler.innerHTML = '';
  const rulerDur = activeDuration || S.duration;
  const tickInt = S.tlZoom > 150 ? 1 : S.tlZoom > 60 ? 5 : 10;
  for (let t = 0; t <= rulerDur; t += tickInt) {
    const tick = document.createElement('div');
    tick.className = 'ruler-tick';
    tick.style.left = (t * S.tlZoom) + 'px';
    tick.innerHTML = `<span class="ruler-label">${fmtTime(t)}</span>`;
    tlRuler.appendChild(tick);
  }

  // Clear existing segments & cut markers
  trackActive.querySelectorAll('.segment').forEach(el => el.remove());
  trackActive.querySelectorAll('.cut-marker').forEach(el => el.remove());

  // ── Build packed segment layout ──
  // Active segments pack together; deleted segments become cut markers at seams
  segmentVisualMap = [];
  let visualOffset = 0; // running visual x offset (seconds)

  S.segments.forEach((seg, i) => {
    if (seg.isDeleted) {
      // Check if this deletion is between two active segments (seam)
      const hasPrev = i > 0 && !S.segments[i - 1].isDeleted;
      const hasNext = i < S.segments.length - 1 && !S.segments[i + 1].isDeleted;
      if (hasPrev || hasNext) {
        // Place cut marker at the current visual offset position
        const marker = document.createElement('div');
        marker.className = 'cut-marker';
        marker.style.left = (visualOffset * S.tlZoom) + 'px';
        const deletedDur = (seg.endSec - seg.startSec).toFixed(1);
        marker.title = `Deleted: ${fmtTime(seg.startSec)} → ${fmtTime(seg.endSec)} (${deletedDur}s) — click to restore`;
        const icon = document.createElement('div');
        icon.className = 'cut-marker-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 0 1 15.36-6.36"/></svg>';
        icon.addEventListener('click', e => {
          e.stopPropagation();
          toggleDeleteSegment(seg.id);
          buildTimeline();
          showToast('Segment restored');
        });
        marker.appendChild(icon);
        trackActive.appendChild(marker);
      }
      return; // Don't advance visual offset for deleted segments
    }

    const segDur = seg.endSec - seg.startSec;
    const segVisualLeft = visualOffset;
    const segVisualWidth = segDur;

    // Store mapping for coordinate translation
    segmentVisualMap.push({ seg, visualLeft: segVisualLeft, visualWidth: segVisualWidth });

    const el = document.createElement('div');
    el.className = 'segment active';
    if (seg.id === S.selectedSegId) el.classList.add('selected');
    if (seg.isMuted) el.classList.add('muted');
    el.style.left = (segVisualLeft * S.tlZoom) + 'px';
    el.style.width = Math.max(3, segVisualWidth * S.tlZoom) + 'px';
    el.dataset.segId = seg.id;

    // Currently-playing highlight
    if (S.currentTime >= seg.startSec && S.currentTime < seg.endSec) {
      el.classList.add('playing');
    }

    // Segment text
    const txt = document.createElement('div');
    txt.className = 'segment-text';
    const dur = segDur.toFixed(1);
    let label = fmtTime(seg.startSec) + ' → ' + fmtTime(seg.endSec) + '  (' + dur + 's)';
    if (seg.isMuted) label = '🔇 ' + label;
    txt.textContent = label;
    el.appendChild(txt);

    // Buttons row
    const btns = document.createElement('div');
    btns.className = 'seg-actions';

    // Mute/Unmute button
    const muteBtn = document.createElement('button');
    muteBtn.className = 'seg-action mute-btn';
    muteBtn.title = seg.isMuted ? 'Unmute' : 'Mute';
    muteBtn.innerHTML = seg.isMuted
      ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
      : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
    muteBtn.addEventListener('click', e => {
      e.stopPropagation();
      seg.isMuted = !seg.isMuted;
      snapshot(); buildTimeline();
      showToast(seg.isMuted ? 'Segment muted' : 'Segment unmuted');
    });
    btns.appendChild(muteBtn);

    // Delete button
    const action = document.createElement('button');
    action.className = 'seg-action';
    action.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    action.addEventListener('click', e => {
      e.stopPropagation();
      toggleDeleteSegment(seg.id);
      buildTimeline();
    });
    btns.appendChild(action);
    el.appendChild(btns);

    // Left Resize handle (only if previous segment is deleted)
    const prev = S.segments[i - 1];
    if (prev && prev.isDeleted) {
      const handleLeft = document.createElement('div');
      handleLeft.className = 'seg-resize-left';
      handleLeft.addEventListener('mousedown', e => {
        e.stopPropagation(); e.preventDefault();
        resizeDrag = { leftId: prev.id, rightId: seg.id, initialCut: prev.endSec, startX: e.clientX };
      });
      el.appendChild(handleLeft);
    }

    // Right Resize handle (between this and next segment)
    const next = S.segments[i + 1];
    if (next && Math.abs(next.startSec - seg.endSec) < 0.01) {
      const handle = document.createElement('div');
      handle.className = 'seg-resize';
      handle.addEventListener('mousedown', e => {
        e.stopPropagation(); e.preventDefault();
        resizeDrag = { leftId: seg.id, rightId: next.id, initialCut: seg.endSec, startX: e.clientX };
      });
      el.appendChild(handle);
    }

    // Click on segment: select it (deselect zoom)
    el.addEventListener('mousedown', e => {
      if (e.target.closest('.seg-action') || e.target.closest('.seg-resize') || e.target.closest('.seg-resize-left')) return;
      S.selectedSegId = seg.id;
      selectedZoomId = null; // mutual exclusion
      highlightSelected();
    });

    trackActive.appendChild(el);
    visualOffset += segDur;
  });

  // Zoom regions (amber blocks in the zoom track)
  trackZoom.querySelectorAll('.zoom-region').forEach(el => el.remove());
  S.zoomKeyframes.forEach((region) => {
    const el = document.createElement('div');
    el.className = 'zoom-region';
    if (region.id === selectedZoomId) el.classList.add('selected');
    // Use packed visual positions so zoom aligns with active clips
    const vStart = realTimeToVisualPos(region.startSec);
    const vEnd = realTimeToVisualPos(region.startSec + (region.durationSec || 5));
    el.style.left = (vStart * S.tlZoom) + 'px';
    el.style.width = Math.max(8, (vEnd - vStart) * S.tlZoom) + 'px';
    el.dataset.zoomId = region.id;
    el.title = `${region.scale.toFixed(1)}× zoom for ${(region.durationSec || 5).toFixed(1)}s`;

    // Scale badge
    const badge = document.createElement('div');
    badge.className = 'zoom-scale-badge';
    badge.textContent = region.scale.toFixed(1) + '×';
    el.appendChild(badge);

    // Delete button
    const del = document.createElement('button');
    del.className = 'zoom-delete';
    del.innerHTML = '×';
    del.addEventListener('click', e => {
      e.stopPropagation();
      removeZoomRegion(region.id);
      buildTimeline(); showToast('Zoom region removed');
    });
    el.appendChild(del);

    // Resize handles
    const rl = document.createElement('div');
    rl.className = 'zoom-resize-l';
    rl.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); zoomDrag = { id: region.id, side: 'left' }; });
    el.appendChild(rl);
    const rr = document.createElement('div');
    rr.className = 'zoom-resize-r';
    rr.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); zoomDrag = { id: region.id, side: 'right' }; });
    el.appendChild(rr);

    // Click to select AND start drag-to-move (deselect main clip)
    el.addEventListener('mousedown', e => {
      if (e.target.closest('.zoom-delete') || e.target.closest('.zoom-resize-l') || e.target.closest('.zoom-resize-r')) return;
      e.stopPropagation(); e.preventDefault();
      selectedZoomId = region.id;
      S.selectedSegId = null; // mutual exclusion
      highlightSelected();
      // Calculate grab offset: where inside the region the user clicked
      const clickTime = getTimeFromMouseEvent(e);
      const grabOffset = clickTime - region.startSec;
      zoomDrag = { id: region.id, side: 'move', grabOffset };
    });



    trackZoom.appendChild(el);
  });

  updatePlayhead(); drawTimelineWaveform();
  // Re-render silence overlays if active
  if (silenceMode && silenceRegions.length) renderSilenceOverlays();
}

/* ── Highlight selected segment ── */
function highlightSelected() {
  document.querySelectorAll('.segment.selected').forEach(el => el.classList.remove('selected'));
  if (S.selectedSegId) {
    const el = document.querySelector(`.segment[data-seg-id="${S.selectedSegId}"]`);
    if (el) el.classList.add('selected');
  }
  // Also highlight selected zoom region
  document.querySelectorAll('.zoom-region.selected').forEach(el => el.classList.remove('selected'));
  if (selectedZoomId) {
    const el = document.querySelector(`.zoom-region[data-zoom-id="${selectedZoomId}"]`);
    if (el) el.classList.add('selected');
  }
  // Refresh inspector panel for new selection
  updateInspector();
}

function drawTimelineWaveform() {
  if (!waveformPeaks.length) return;

  // Build packed waveform — only include peaks from active segments
  const activeSegs = S.segments.filter(s => !s.isDeleted);
  const totalPeaks = waveformPeaks.length;

  if (!activeSegs.length) {
    wfCanvas.width = 1;
    return;
  }

  // Calculate active duration for canvas width
  const activeDuration = activeSegs.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
  const tw = activeDuration * S.tlZoom;
  wfCanvas.width = tw;
  wfCanvas.height = trackActive.clientHeight || (tlScroll.clientHeight - 36) * 0.6;

  // Extract only peaks from active segments, packed together
  const packedPeaks = [];
  for (const seg of activeSegs) {
    const startIdx = Math.floor((seg.startSec / S.duration) * totalPeaks);
    const endIdx = Math.ceil((seg.endSec / S.duration) * totalPeaks);
    for (let i = startIdx; i < endIdx && i < totalPeaks; i++) {
      packedPeaks.push(waveformPeaks[i]);
    }
  }

  drawWaveform(wfCanvas, packedPeaks);
}

/* ── Convert real video time to packed visual position (seconds) ── */
function realTimeToVisualPos(t) {
  for (const entry of segmentVisualMap) {
    const seg = entry.seg;
    if (t >= seg.startSec && t <= seg.endSec) {
      // Within this active segment
      return entry.visualLeft + (t - seg.startSec);
    }
  }
  // If time is in a deleted segment, snap to nearest active boundary
  let lastEnd = 0;
  for (const entry of segmentVisualMap) {
    if (t < entry.seg.startSec) return lastEnd;
    lastEnd = entry.visualLeft + entry.visualWidth;
  }
  return lastEnd;
}

function updatePlayhead() {
  const visualPos = realTimeToVisualPos(S.currentTime);
  playhead.style.left = (visualPos * S.tlZoom) + 'px';
}

function updateTimeUI() {
  $('tc-current').textContent = fmtTime(S.currentTime);
}

/* ── Auto-scroll timeline to keep playhead visible ── */
function scrollToPlayhead() {
  const pos = realTimeToVisualPos(S.currentTime) * S.tlZoom;
  const vw = tlScroll.clientWidth;
  const sl = tlScroll.scrollLeft;
  // If playhead goes off the right edge or left edge, center it
  if (pos > sl + vw - 60 || pos < sl + 60) {
    tlScroll.scrollLeft = pos - vw / 2;
  }
}

/* ═══ PLAY BUTTON SVG ═══ */
const PLAY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
const PAUSE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
function updatePlayBtn() { $('btn-play').innerHTML = S.playing ? PAUSE_SVG : PLAY_SVG; }

/* ═══ TOAST ═══ */
function showToast(msg) {
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toast._tid);
  toast._tid = setTimeout(() => toast.classList.remove('show'), 1800);
}

/* ═══ CONTEXT-SENSITIVE INSPECTOR ═══ */
function updateInspector() {
  const body = inspectorBody();
  const title = inspectorTitle();
  if (!body || !title) return;

  // Priority: silence mode > selected zoom region > selected segment > default viewport
  if (silenceMode) {
    renderSilenceInspector(body, title); return;
  }
  if (selectedZoomId) {
    const zr = S.zoomKeyframes.find(z => z.id === selectedZoomId);
    if (zr) { renderZoomInspector(zr, body, title); return; }
  }
  if (S.selectedSegId) {
    const seg = S.segments.find(s => s.id === S.selectedSegId);
    if (seg) { renderClipInspector(seg, body, title); return; }
  }
  renderDefaultInspector(body, title);
}

/* ── Clip Inspector ── */
function renderClipInspector(seg, body, title) {
  const dur = (seg.endSec - seg.startSec).toFixed(2);
  const isDeleted = seg.isDeleted;
  const speedEnabled = S.speed !== 1;
  title.textContent = isDeleted ? 'Deleted Clip' : 'Clip Properties';
  body.innerHTML = `
    <div class="inspector-clip-header ${isDeleted ? 'deleted-header' : ''}">
      <div class="inspector-clip-icon ${isDeleted ? 'deleted' : 'active'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
      </div>
      <div class="inspector-clip-info">
        <div class="inspector-clip-name">${isDeleted ? 'Removed Segment' : 'Video Segment'}</div>
        <div class="inspector-clip-meta">${fmtTime(seg.startSec)} → ${fmtTime(seg.endSec)}  (${dur}s)</div>
      </div>
    </div>
    ${!isDeleted ? `
    <!-- Speed -->
    <div class="panel-section">
      <div class="panel-row" style="margin-bottom:0">
        <span class="panel-section-title" style="margin:0">Speed</span>
        <label class="switch" id="speed-toggle">
          <div class="switch-track ${speedEnabled ? 'on' : ''}">
            <div class="switch-thumb"></div>
          </div>
          <span class="panel-value" id="speed-val" style="min-width:32px;text-align:right">${S.speed.toFixed(2)}×</span>
        </label>
      </div>
      <div id="speed-slider-wrap" style="margin-top:8px;${speedEnabled ? '' : 'display:none;'}">
        <input type="range" class="panel-slider" id="slider-speed" min="0.25" max="4" value="${S.speed}" step="0.05">
        <div style="display:flex;justify-content:space-between;margin-top:2px">
          <span style="font:500 8px/1 'Inter',sans-serif;color:rgba(255,255,255,0.25)">0.25×</span>
          <span style="font:500 8px/1 'Inter',sans-serif;color:rgba(255,255,255,0.35)">1×</span>
          <span style="font:500 8px/1 'Inter',sans-serif;color:rgba(255,255,255,0.25)">4×</span>
        </div>
      </div>
    </div>
    <div class="inspector-divider"></div>
    <!-- Audio -->
    <div class="panel-section">
      <div class="panel-row" style="margin-bottom:0">
        <span class="panel-section-title" style="margin:0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>${seg.isMuted ? '<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>' : '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'}</svg>Audio
        </span>
        <label class="switch" id="mute-toggle">
          <div class="switch-track ${!seg.isMuted ? 'on' : ''}">
            <div class="switch-thumb"></div>
          </div>
          <span class="panel-value" style="min-width:32px;text-align:right">${seg.isMuted ? 'Off' : 'On'}</span>
        </label>
      </div>
    </div>
    ` : ''}
    <div class="inspector-divider"></div>
    <!-- Actions -->
    <div class="panel-section">
      <div class="panel-section-title">Actions</div>
      <div class="inspector-actions">
        ${isDeleted ? `
          <button class="inspector-action-btn restore" id="btn-restore-seg">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 0 1 15.36-6.36"/></svg> Restore
          </button>
        ` : `
          <button class="inspector-action-btn" id="btn-split-seg">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/></svg> Split at Playhead
          </button>
          <button class="inspector-action-btn danger" id="btn-delete-seg">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete
          </button>
        `}
      </div>
    </div>
    ${getGlobalSettingsHTML()}`;
  wireClipInspectorEvents(seg);
  wireGlobalSettingsEvents();
}

function wireClipInspectorEvents(seg) {
  // Speed toggle
  const speedToggle = $('speed-toggle');
  if (speedToggle) speedToggle.addEventListener('click', () => {
    const track = speedToggle.querySelector('.switch-track');
    const isOn = track.classList.contains('on');
    if (isOn) {
      // Turn off → reset to 1x
      S.speed = 1; video.playbackRate = 1;
      track.classList.remove('on');
      $('speed-val').textContent = '1.00×';
      const wrap = $('speed-slider-wrap');
      if (wrap) wrap.style.display = 'none';
      const sl = $('slider-speed');
      if (sl) sl.value = 1;
    } else {
      // Turn on → show slider
      track.classList.add('on');
      const wrap = $('speed-slider-wrap');
      if (wrap) wrap.style.display = '';
    }
    snapshot();
  });
  // Speed slider
  const speedSlider = $('slider-speed');
  if (speedSlider) {
    speedSlider.addEventListener('input', e => {
      S.speed = +parseFloat(e.target.value).toFixed(2);
      video.playbackRate = S.speed;
      $('speed-val').textContent = S.speed.toFixed(2) + '×';
    });
    speedSlider.addEventListener('change', snapshot);
  }
  // Mute toggle
  const muteToggle = $('mute-toggle');
  if (muteToggle) muteToggle.addEventListener('click', () => {
    seg.isMuted = !seg.isMuted; snapshot(); buildTimeline(); updateInspector();
    showToast(seg.isMuted ? 'Segment muted' : 'Segment unmuted');
  });
  // Split
  const splitBtn = $('btn-split-seg');
  if (splitBtn) splitBtn.addEventListener('click', () => {
    if (splitAtTime(S.currentTime)) { buildTimeline(); showToast('Split at ' + fmtTime(S.currentTime)); }
  });
  // Delete
  const delBtn = $('btn-delete-seg');
  if (delBtn) delBtn.addEventListener('click', () => {
    deleteSegment(seg.id); buildTimeline(); updateInspector(); showToast('Segment deleted');
  });
  // Restore
  const resBtn = $('btn-restore-seg');
  if (resBtn) resBtn.addEventListener('click', () => {
    restoreSegment(seg.id); buildTimeline(); updateInspector(); showToast('Segment restored');
  });
}

/* ── Zoom Region Inspector ── */
function renderZoomInspector(zr, body, title) {
  title.textContent = 'Zoom Region';
  const SCALES = [1.25, 1.5, 2, 2.5, 3, 4, 5];
  body.innerHTML = `
    <div class="inspector-clip-header zoom-header">
      <div class="inspector-clip-icon zoom">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      </div>
      <div class="inspector-clip-info">
        <div class="inspector-clip-name">Zoom: ${zr.scale.toFixed(1)}×</div>
        <div class="inspector-clip-meta">${fmtTime(zr.startSec)} → ${fmtTime(zr.startSec+zr.durationSec)} (${zr.durationSec.toFixed(1)}s)</div>
      </div>
    </div>
    <!-- Zoom Scale -->
    <div class="panel-section">
      <div class="panel-section-title">Zoom Level</div>
      <div class="zoom-presets" id="zoom-scale-presets">
        ${SCALES.map(s => `<button class="zoom-preset${Math.abs(zr.scale-s)<0.01?' active':''}" data-scale="${s}">${s}×</button>`).join('')}
      </div>
      <div class="panel-row" style="margin-top:8px">
        <span class="panel-label">Fine adjust</span>
        <span class="panel-value" id="val-zoom-scale">${zr.scale.toFixed(2)}×</span>
      </div>
      <input type="range" class="panel-slider" id="slider-zoom-scale" min="1.25" max="5" value="${zr.scale}" step="0.05">
    </div>
    <div class="inspector-divider"></div>
    <!-- Duration -->
    <div class="panel-section">
      <div class="panel-section-title">Duration</div>
      <div class="panel-row">
        <span class="panel-label">Length</span>
        <span class="panel-value" id="val-zoom-dur">${zr.durationSec.toFixed(1)}s</span>
      </div>
      <input type="range" class="panel-slider" id="slider-zoom-dur" min="0.5" max="30" value="${zr.durationSec}" step="0.5">
    </div>
    <div class="inspector-divider"></div>
    <!-- Actions -->
    <div class="panel-section">
      <div class="panel-section-title">Actions</div>
      <div class="inspector-actions">
        <button class="inspector-action-btn" id="btn-split-zoom">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/></svg> Split at Playhead
        </button>
        <button class="inspector-action-btn danger" id="btn-delete-zoom">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Remove
        </button>
      </div>
    </div>
    ${getGlobalSettingsHTML()}`;
  wireZoomInspectorEvents(zr);
  wireGlobalSettingsEvents();
}

function wireZoomInspectorEvents(zr) {
  // Scale presets
  document.querySelectorAll('#zoom-scale-presets .zoom-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      zr.scale = +btn.dataset.scale;
      snapshot(); buildTimeline(); updateInspector();
      showToast('Zoom: ' + zr.scale.toFixed(1) + '×');
    });
  });
  // Scale slider
  const scaleSlider = $('slider-zoom-scale');
  if (scaleSlider) {
    scaleSlider.addEventListener('input', e => {
      zr.scale = +e.target.value;
      $('val-zoom-scale').textContent = zr.scale.toFixed(2) + '×';
      buildTimeline(); renderCurrentFrame();
    });
    scaleSlider.addEventListener('change', snapshot);
  }
  // Duration slider
  const durSlider = $('slider-zoom-dur');
  if (durSlider) {
    durSlider.addEventListener('input', e => {
      const newDur = +e.target.value;
      // Check overlap
      const others = S.zoomKeyframes.filter(z => z.id !== zr.id);
      let maxDur = S.duration - zr.startSec;
      for (const o of others) {
        if (o.startSec > zr.startSec) maxDur = Math.min(maxDur, o.startSec - zr.startSec);
      }
      zr.durationSec = clamp(newDur, 0.5, maxDur);
      $('val-zoom-dur').textContent = zr.durationSec.toFixed(1) + 's';
      buildTimeline();
    });
    durSlider.addEventListener('change', snapshot);
  }
  // Split
  const splitBtn = $('btn-split-zoom');
  if (splitBtn) splitBtn.addEventListener('click', () => {
    if (splitZoomRegion(zr.id, S.currentTime)) {
      selectedZoomId = null; buildTimeline(); updateInspector();
      showToast('Zoom region split');
    } else { showToast('⚠ Playhead not inside this region'); }
  });
  // Delete
  const delBtn = $('btn-delete-zoom');
  if (delBtn) delBtn.addEventListener('click', () => {
    removeZoomRegion(zr.id); selectedZoomId = null;
    buildTimeline(); updateInspector(); showToast('Zoom region removed');
  });
}

/* ── Global Settings HTML (shared across all inspector views) ── */
let _savedCustomGradients = [];
try { _savedCustomGradients = JSON.parse(localStorage.getItem('veditor_custom_gradients') || '[]'); } catch(e) {}

const _PRESET_BGS = [
  { val:'none', css:'repeating-conic-gradient(#1a1a28 0% 25%,#0f0f18 0% 50%) 50%/8px 8px', label:'None' },
  { val:'#f5f5f5', css:'#f5f5f5', label:'White' },
  { val:'linear-gradient(135deg,#2d1b69,#11998e)', css:'linear-gradient(135deg,#2d1b69,#11998e)', label:'Ocean' },
  { val:'linear-gradient(135deg,#667eea,#764ba2)', css:'linear-gradient(135deg,#667eea,#764ba2)', label:'Purple' },
  { val:'linear-gradient(135deg,#f093fb,#f5576c)', css:'linear-gradient(135deg,#f093fb,#f5576c)', label:'Pink' },
  { val:'linear-gradient(135deg,#4facfe,#00f2fe)', css:'linear-gradient(135deg,#4facfe,#00f2fe)', label:'Sky' },
  { val:'linear-gradient(135deg,#43e97b,#38f9d7)', css:'linear-gradient(135deg,#43e97b,#38f9d7)', label:'Mint' },
  { val:'linear-gradient(135deg,#fa709a,#fee140)', css:'linear-gradient(135deg,#fa709a,#fee140)', label:'Sunset' },
];

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

let _CURRENT_WALLPAPERS = [...ALL_WALLPAPERS].sort(() => 0.5 - Math.random()).slice(0, 11);

function getGlobalSettingsHTML() {
  const AR_PRESETS = [
    { key:'original', label:'Original', w:0, h:0 },
    { key:'16:9', label:'16:9', w:16, h:9 },
    { key:'9:16', label:'9:16', w:9, h:16 },
    { key:'1:1', label:'1:1', w:1, h:1 },
    { key:'4:3', label:'4:3', w:4, h:3 },
    { key:'4:5', label:'4:5', w:4, h:5 },
    { key:'21:9', label:'21:9', w:21, h:9 },
  ];
  const currentAR = S.viewport.aspectRatio || 'original';
  const m = S.viewport.bgMode || 'color';
  const bv = S.viewport.blurIntensity ?? 30;

  return `
    <div class="inspector-divider"></div>
    <div class="panel-section">
      <div class="panel-section-title">Aspect Ratio</div>
      <div class="ar-presets" id="ar-presets">
        ${AR_PRESETS.map(p => {
          let iW, iH;
          if (p.key === 'original') {
            iW = S.videoW > S.videoH ? 18 : Math.round(18*(S.videoW/S.videoH));
            iH = S.videoW > S.videoH ? Math.round(18*(S.videoH/S.videoW)) : 18;
          } else {
            if (p.w >= p.h) { iW = 18; iH = Math.round(18*(p.h/p.w)); }
            else { iH = 18; iW = Math.round(18*(p.w/p.h)); }
          }
          iW = Math.max(iW,4); iH = Math.max(iH,4);
          return `<button class="ar-preset${currentAR===p.key?' active':''}" data-ar="${p.key}" title="${p.label}"><span class="ar-icon" style="width:${iW}px;height:${iH}px"></span><span class="ar-label">${p.label}</span></button>`;
        }).join('')}
      </div>
    </div>
    <div class="inspector-divider"></div>
    <div class="panel-section">
      <div class="panel-section-title">Background Fill</div>
      <div class="bgmode-selector" id="bgmode-selector">
        <button class="bgmode-btn${m==='color'?' active':''}" data-mode="color"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Color</button>
        <button class="bgmode-btn${m==='image'?' active':''}" data-mode="image"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Image</button>
        <button class="bgmode-btn${m==='blur'?' active':''}" data-mode="blur"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6" opacity=".5"/><circle cx="12" cy="12" r="2"/></svg> Blur</button>
      </div>
    </div>
    <div id="bg-panel-color" style="${m!=='color'?'display:none':''}">
      <div class="panel-section">
        <div class="color-swatches" id="bg-swatches">
          ${_PRESET_BGS.map(p=>`<div class="color-swatch${S.viewport.bgMode==='color'&&S.viewport.bg===p.val?' active':''}" data-bg="${p.val}" style="background:${p.css}" title="${p.label}"></div>`).join('')}
          ${_savedCustomGradients.map((g,i)=>{
            const isDataUrl = g.startsWith('data:image/');
            const isActive = isDataUrl ? (S.viewport.bgMode==='image' && S.viewport.bgImageSrc===g) : (S.viewport.bgMode==='color' && S.viewport.bg===g);
            return `<div class="color-swatch${isActive?' active':''}" data-bg="${g}" style="${isDataUrl ? `background-image:url('${g}');background-size:cover` : `background:${g}`}" title="Custom ${i+1}"><span class="swatch-delete" data-cidx="${i}">×</span></div>`;
          }).join('')}
        </div>
      </div>
      <div class="panel-section">
        <div style="display:flex;gap:6px;align-items:center">
          <button id="btn-random-grad" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(124,111,255,0.3);background:rgba(124,111,255,0.1);color:#b4a8ff;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Generate Random Gradient">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
          </button>
          <div id="grad-preview" style="flex:1;height:22px;border-radius:4px;border:1px solid rgba(255,255,255,0.08);${S.viewport.bgMode==='image' && S.viewport.bgImageSrc && S.viewport.isCustomGradient ? `background-image:url('${S.viewport.bgImageSrc}');background-size:cover` : `background:${(S.viewport.bgMode==='color' && S.viewport.bg && S.viewport.bg.includes('gradient')) ? S.viewport.bg : 'linear-gradient(135deg,#667eea,#764ba2)'}`}"></div>
        </div>
      </div>
    </div>
    <div id="bg-panel-image" style="${m!=='image'?'display:none':''}">
      <div class="panel-section">
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <button id="btn-shuffle-images" style="flex:1;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px" title="Shuffle Wallpapers">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
            Shuffle
          </button>
        </div>
        <div class="bg-image-grid" id="bg-image-grid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px">
          ${_CURRENT_WALLPAPERS.map(p=>`<div class="bg-image-thumb preset${S.viewport.bgMode==='image'&&S.viewport.bgImageSrc==='../assets/walpaper/'+p?' active':''}" data-src="../assets/walpaper/${p}" title="${p}"><img src="../assets/walpaper/${p}" alt="${p}" style="pointer-events:none;"></div>`).join('')}
          <label class="bg-image-thumb upload" title="Upload image">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <input type="file" id="bg-image-file" accept="image/*" style="display:none">
          </label>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-row"><span class="panel-label">Blur</span><span class="panel-value" id="val-img-blur">${bv}</span></div>
        <input type="range" class="panel-slider" id="slider-img-blur" min="0" max="60" value="${bv}" step="1">
      </div>
    </div>
    <div id="bg-panel-blur" style="${m!=='blur'?'display:none':''}">
      <div class="panel-section">
        <div class="panel-row"><span class="panel-label">Intensity</span><span class="panel-value" id="val-blur-intensity">${bv}</span></div>
        <input type="range" class="panel-slider" id="slider-blur-intensity" min="5" max="60" value="${bv}" step="1">
      </div>
    </div>
    <div class="inspector-divider"></div>
    <div class="panel-section">
      <div class="panel-section-title">Viewport</div>
      <div class="panel-row"><span class="panel-label">Corner Radius</span><span class="panel-value" id="val-radius">${S.viewport.radius}px</span></div>
      <input type="range" class="panel-slider" id="slider-radius" min="0" max="48" value="${S.viewport.radius}" step="1">
      <div class="panel-row" style="margin-top:8px"><span class="panel-label">Padding</span><span class="panel-value" id="val-padding">${S.viewport.padding}px</span></div>
      <input type="range" class="panel-slider" id="slider-padding" min="0" max="120" value="${S.viewport.padding}" step="2">
      <div class="panel-row" style="margin-top:8px"><span class="panel-label">Shadow</span><span class="panel-value" id="val-shadow">${S.viewport.shadow}px</span></div>
      <input type="range" class="panel-slider" id="slider-shadow" min="0" max="80" value="${S.viewport.shadow}" step="1">
    </div>`;
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
  return `linear-gradient(${angle}deg,${hex1},${hex2})`;
}

function wireGlobalSettingsEvents() {
  // AR presets
  document.querySelectorAll('#ar-presets .ar-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      S.viewport.aspectRatio = btn.dataset.ar;
      document.querySelectorAll('#ar-presets .ar-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateResLabel(); renderCurrentFrame(); snapshot(); saveProject();
    });
  });
  // BG mode tabs
  document.querySelectorAll('#bgmode-selector .bgmode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      S.viewport.bgMode = btn.dataset.mode;
      document.querySelectorAll('#bgmode-selector .bgmode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['color','image','blur'].forEach(m => {
        const p = document.getElementById('bg-panel-' + m);
        if (p) p.style.display = m === btn.dataset.mode ? '' : 'none';
      });
      renderCurrentFrame(); snapshot();
    });
  });
  // Color swatches
  document.querySelectorAll('#bg-swatches .color-swatch').forEach(sw => {
    sw.addEventListener('click', e => {
      if (e.target.classList.contains('swatch-delete')) return;
      const val = sw.dataset.bg;
      if (val.startsWith('data:image/')) {
        S.viewport.bgMode = 'image';
        S.viewport.bgImageSrc = val;
        S.viewport.isCustomGradient = true;
        const img = new Image();
        img.onload = () => { bgImageObj = img; renderCurrentFrame(); snapshot(); };
        img.src = val;
      } else {
        S.viewport.bgMode = 'color';
        S.viewport.bg = val;
        S.viewport.isCustomGradient = false;
        renderCurrentFrame();
        snapshot();
      }
      document.querySelectorAll('#bg-swatches .color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });
  // Custom gradient delete
  document.querySelectorAll('.swatch-delete').forEach(del => {
    del.addEventListener('click', e => {
      e.stopPropagation();
      _savedCustomGradients.splice(+del.dataset.cidx, 1);
      localStorage.setItem('veditor_custom_gradients', JSON.stringify(_savedCustomGradients));
      updateInspector();
    });
  });
  // Gradient generator
  const btnRand = $('btn-random-grad');
  const gP = $('grad-preview');
  if (btnRand) {
    btnRand.addEventListener('click', () => {
      const gradStr = generateRandomGradientString();
      S.viewport.bgMode = 'color';
      S.viewport.bg = gradStr;
      S.viewport.isCustomGradient = true;
      
      if (gP) {
        gP.style.backgroundImage = 'none';
        gP.style.background = gradStr;
      }
      
      document.querySelectorAll('#bg-swatches .color-swatch').forEach(s => s.classList.remove('active'));
      
      renderCurrentFrame();
      snapshot();
    });
  }
  // Image upload
  const fIn = $('bg-image-file');
  if (fIn) fIn.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      S.viewport.bgImageSrc = ev.target.result;
      S.viewport.isCustomGradient = false;
      document.querySelectorAll('#bg-image-grid .bg-image-thumb').forEach(t => t.classList.remove('active'));
      const img = new Image();
      img.onload = () => { bgImageObj = img; renderCurrentFrame(); snapshot(); };
      img.src = ev.target.result;
    };
    r.readAsDataURL(f);
  });
  function bindImageThumbEvents() {
    document.querySelectorAll('#bg-image-grid .bg-image-thumb.preset').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const src = thumb.dataset.src;
        S.viewport.bgMode = 'image';
        S.viewport.bgImageSrc = src;
        S.viewport.isCustomGradient = false;
        document.querySelectorAll('#bg-image-grid .bg-image-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        const img = new Image();
        img.onload = () => { bgImageObj = img; renderCurrentFrame(); snapshot(); };
        img.src = src;
      });
    });
  }
  
  bindImageThumbEvents();
  
  const btnShuffle = $('btn-shuffle-images');
  if (btnShuffle) {
    btnShuffle.addEventListener('click', () => {
      _CURRENT_WALLPAPERS = [...ALL_WALLPAPERS].sort(() => 0.5 - Math.random()).slice(0, 11);
      const grid = $('bg-image-grid');
      if (grid) {
        const uploadHtml = `
          <label class="bg-image-thumb upload" title="Upload image">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <input type="file" id="bg-image-file" accept="image/*" style="display:none">
          </label>`;
        const thumbsHtml = _CURRENT_WALLPAPERS.map(p=>`<div class="bg-image-thumb preset${S.viewport.bgMode==='image'&&S.viewport.bgImageSrc==='../assets/walpaper/'+p?' active':''}" data-src="../assets/walpaper/${p}" title="${p}"><img src="../assets/walpaper/${p}" alt="${p}" style="pointer-events:none;"></div>`).join('');
        grid.innerHTML = thumbsHtml + uploadHtml;
        
        // Re-bind file upload
        const newFIn = $('bg-image-file');
        if (newFIn) {
          newFIn.addEventListener('change', e => {
            const f = e.target.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = ev => {
              S.viewport.bgImageSrc = ev.target.result;
              S.viewport.isCustomGradient = false;
              document.querySelectorAll('#bg-image-grid .bg-image-thumb').forEach(t => t.classList.remove('active'));
              const img = new Image();
              img.onload = () => { bgImageObj = img; renderCurrentFrame(); snapshot(); };
              img.src = ev.target.result;
            };
            r.readAsDataURL(f);
          });
        }
        
        bindImageThumbEvents();
      }
    });
  }
  // Image blur slider
  const ibSlider = $('slider-img-blur');
  if (ibSlider) {
    ibSlider.addEventListener('input', e => { S.viewport.blurIntensity = +e.target.value; $('val-img-blur').textContent = e.target.value; renderCurrentFrame(); });
    ibSlider.addEventListener('change', snapshot);
  }
  // Blur intensity slider
  const blSlider = $('slider-blur-intensity');
  if (blSlider) {
    blSlider.addEventListener('input', e => { S.viewport.blurIntensity = +e.target.value; $('val-blur-intensity').textContent = e.target.value; renderCurrentFrame(); });
    blSlider.addEventListener('change', snapshot);
  }
  // Viewport sliders
  const rS = $('slider-radius');
  if (rS) { rS.addEventListener('input', e => { S.viewport.radius = +e.target.value; $('val-radius').textContent = S.viewport.radius+'px'; renderCurrentFrame(); }); rS.addEventListener('change', snapshot); }
  const pS = $('slider-padding');
  if (pS) { pS.addEventListener('input', e => { S.viewport.padding = +e.target.value; $('val-padding').textContent = S.viewport.padding+'px'; renderCurrentFrame(); }); pS.addEventListener('change', snapshot); }
  const sS = $('slider-shadow');
  if (sS) { sS.addEventListener('input', e => { S.viewport.shadow = +e.target.value; $('val-shadow').textContent = S.viewport.shadow+'px'; renderCurrentFrame(); }); sS.addEventListener('change', snapshot); }
}

/* ── Default Inspector ── */
function renderDefaultInspector(body, title) {
  title.textContent = 'Inspector';
  body.innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Default Zoom Level</div>
      <div class="panel-row" style="margin-bottom:6px"><span class="panel-label">New zoom regions will use:</span><span class="panel-value" id="val-default-zoom">${lastZoomScale.toFixed(1)}×</span></div>
      <div class="zoom-presets" id="default-zoom-presets">
        ${[1.25,1.5,2,2.5,3,4,5].map(s => `<button class="zoom-preset${Math.abs(lastZoomScale-s)<0.01?' active':''}" data-scale="${s}">${s}×</button>`).join('')}
      </div>
    </div>
    ${getGlobalSettingsHTML()}
    <div class="inspector-divider"></div>
    <div class="inspector-empty" style="height:auto; padding:16px 0">
      <div class="inspector-empty-sub">Select a clip or zoom region on the timeline to see its properties</div>
    </div>`;
  // Wire zoom presets
  document.querySelectorAll('#default-zoom-presets .zoom-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      lastZoomScale = +btn.dataset.scale;
      document.querySelectorAll('#default-zoom-presets .zoom-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('val-default-zoom').textContent = lastZoomScale.toFixed(1) + '×';
      showToast('Default zoom set to ' + lastZoomScale.toFixed(1) + '×');
    });
  });
  wireGlobalSettingsEvents();
}

/* ═══ SILENCE INSPECTOR ═══ */
function renderSilenceInspector(body, title) {
  title.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M8 13a4 4 0 0 0 8 0"/><circle cx="12" cy="12" r="10"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Silence Detection`;

  const totalSilence = silenceRegions.reduce((sum, r) => sum + (r.endSec - r.startSec), 0);
  const pct = S.duration ? ((totalSilence / S.duration) * 100).toFixed(1) : '0.0';

  body.innerHTML = `
    <div class="silence-slider-group">
      <label>Threshold <span id="val-silence-thresh">${(silenceThreshold * 100).toFixed(0)}%</span></label>
      <input type="range" id="slider-silence-thresh" min="1" max="20" step="1" value="${Math.round(silenceThreshold * 100)}" class="slider">
    </div>
    <div class="silence-slider-group">
      <label>Min Duration <span id="val-silence-dur">${silenceMinDuration.toFixed(1)}s</span></label>
      <input type="range" id="slider-silence-dur" min="2" max="30" step="1" value="${Math.round(silenceMinDuration * 10)}" class="slider">
    </div>

    <div class="inspector-divider"></div>

    <button class="btn-scan-silence" id="btn-scan-silence">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      ${silenceRegions.length ? 'Re-scan' : 'Scan for Silence'}
    </button>

    ${silenceRegions.length ? `
      <div style="height:8px"></div>

      <div class="silence-stats">
        <div style="text-align:center">
          <div class="stat-val">${silenceRegions.length}</div>
          <div class="stat-label">Regions</div>
        </div>
        <div style="text-align:center">
          <div class="stat-val">${totalSilence.toFixed(1)}s</div>
          <div class="stat-label">Total Silence</div>
        </div>
        <div style="text-align:center">
          <div class="stat-val">${pct}%</div>
          <div class="stat-label">Of Video</div>
        </div>
      </div>

      <div style="height:8px"></div>

      <button class="btn-remove-silence" id="btn-remove-silence">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Remove All Silence
      </button>

      <div style="height:6px"></div>
      <button class="btn-scan-silence" id="btn-clear-silence" style="color:rgba(255,255,255,0.5);border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">
        Clear Highlights
      </button>
    ` : `
      <div style="height:12px"></div>
      <div style="text-align:center;color:rgba(255,255,255,0.3);font-size:10px;">
        Adjust threshold & duration, then scan.<br>
        Lower threshold = more sensitive.
      </div>
    `}
  `;

  // Wire threshold slider
  const threshSlider = $('slider-silence-thresh');
  if (threshSlider) {
    threshSlider.addEventListener('input', e => {
      silenceThreshold = +e.target.value / 100;
      $('val-silence-thresh').textContent = e.target.value + '%';
    });
  }
  // Wire duration slider
  const durSlider = $('slider-silence-dur');
  if (durSlider) {
    durSlider.addEventListener('input', e => {
      silenceMinDuration = +e.target.value / 10;
      $('val-silence-dur').textContent = silenceMinDuration.toFixed(1) + 's';
    });
  }
  // Wire scan button
  const scanBtn = $('btn-scan-silence');
  if (scanBtn) {
    scanBtn.addEventListener('click', () => {
      if (!waveformPeaks.length) {
        showToast('⚠ Waveform not yet loaded');
        return;
      }
      silenceRegions = detectSilence(waveformPeaks, S.duration, silenceThreshold, silenceMinDuration);
      renderSilenceOverlays();
      updateInspector(); // re-render to show stats
      if (silenceRegions.length) {
        showToast(`Found ${silenceRegions.length} silent region${silenceRegions.length > 1 ? 's' : ''}`);
      } else {
        showToast('No silence detected with current settings');
      }
    });
  }
  // Wire remove button
  const removeBtn = $('btn-remove-silence');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      const count = removeSilentRegions(silenceRegions);
      silenceRegions = [];
      clearSilenceOverlays();
      buildTimeline();
      updateInspector();
      showToast(`Removed ${count} silent segment${count > 1 ? 's' : ''}`);
    });
  }
  // Wire clear button
  const clearBtn = $('btn-clear-silence');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      silenceRegions = [];
      clearSilenceOverlays();
      updateInspector();
    });
  }
}

/* ═══ SILENCE TIMELINE OVERLAYS ═══ */
function renderSilenceOverlays() {
  clearSilenceOverlays();
  const track = $('track-active');
  if (!track || !silenceRegions.length) return;
  for (const region of silenceRegions) {
    const el = document.createElement('div');
    el.className = 'silence-overlay';
    const vStart = realTimeToVisualPos(region.startSec);
    const vEnd = realTimeToVisualPos(region.endSec);
    el.style.left = (vStart * S.tlZoom) + 'px';
    el.style.width = ((vEnd - vStart) * S.tlZoom) + 'px';
    el.title = `Silence: ${region.startSec.toFixed(1)}s – ${region.endSec.toFixed(1)}s (${(region.endSec - region.startSec).toFixed(1)}s)`;
    track.appendChild(el);
  }
}

function clearSilenceOverlays() {
  document.querySelectorAll('.silence-overlay').forEach(el => el.remove());
}

/* Legacy compat alias */
function syncSettingsUI() { updateInspector(); }

/* ═══════════════════════════════════════════════════════════
   TIMELINE INTERACTION — Natural scrubbing
   ═══════════════════════════════════════════════════════════ */
/* ── Convert packed visual position (seconds) back to real video time ── */
function visualPosToRealTime(vPos) {
  for (const entry of segmentVisualMap) {
    if (vPos >= entry.visualLeft && vPos <= entry.visualLeft + entry.visualWidth) {
      return entry.seg.startSec + (vPos - entry.visualLeft);
    }
  }
  // Beyond all segments — clamp to last active segment end
  if (segmentVisualMap.length) {
    const last = segmentVisualMap[segmentVisualMap.length - 1];
    if (vPos >= last.visualLeft + last.visualWidth) {
      return last.seg.endSec;
    }
    // Before first segment
    const first = segmentVisualMap[0];
    if (vPos <= first.visualLeft) return first.seg.startSec;
  }
  return vPos; // fallback (no map yet)
}

function getTimeFromMouseEvent(e) {
  const rect = tlScroll.getBoundingClientRect();
  const x = e.clientX - rect.left + tlScroll.scrollLeft;
  const visualSec = x / S.tlZoom;
  // Convert packed visual position to real time
  return clamp(visualPosToRealTime(visualSec), 0, S.duration);
}

/* Raw time (no packed conversion) — for zoom track and absolute time references */
function getRawTimeFromMouseEvent(e) {
  const rect = tlScroll.getBoundingClientRect();
  const x = e.clientX - rect.left + tlScroll.scrollLeft;
  return clamp(x / S.tlZoom, 0, S.duration);
}

// Click on timeline ruler/background → seek immediately
tlScroll.addEventListener('mousedown', e => {
  if (resizeDrag || zoomDrag) return;
  const segEl = e.target.closest('.segment');
  const zoomEl = e.target.closest('.zoom-region');
  const cutMarker = e.target.closest('.cut-marker');
  if (zoomEl || cutMarker) return; // handled by their own listeners

  const t = getTimeFromMouseEvent(e);

  // Start scrubbing — seek on mousedown (deselect zoom when clicking empty area)
  if (!segEl) selectedZoomId = null;
  isDraggingTimeline = true;
  seekTo(t);
});

// Click on zoom track background → add zoom region at click position
trackZoom.addEventListener('mousedown', e => {
  if (e.target.closest('.zoom-region')) return; // handled by zoom region listeners
  e.stopPropagation();
  const t = getTimeFromMouseEvent(e); // visual→real time conversion
  const cp = getCursorPosAtTime(t);
  const result = addZoomRegion(t, 3, lastZoomScale, cp.x, cp.y);
  buildTimeline();
  if (result) {
    selectedZoomId = result.id;
    S.selectedSegId = null;
    highlightSelected();
    showToast(`Zoom added (${result.durationSec.toFixed(1)}s, ${lastZoomScale.toFixed(1)}×)`);
  } else {
    showToast('⚠ Overlaps existing zoom region');
  }
});

document.addEventListener('mousemove', e => {
  // Timeline scrub drag
  if (isDraggingTimeline) {
    const t = getTimeFromMouseEvent(e);
    seekTo(t);
    return;
  }
  // Segment boundary resize
  if (resizeDrag) {
    const deltaX = e.clientX - resizeDrag.startX;
    const t = resizeDrag.initialCut + (deltaX / S.tlZoom);
    resizeBoundary(resizeDrag.leftId, resizeDrag.rightId, t, resizeDrag.initialCut);
    buildTimeline();
    return;
  }
  // Zoom region resize or move (with overlap protection)
  if (zoomDrag) {
    const t = getTimeFromMouseEvent(e); // visual→real time
    const region = S.zoomKeyframes.find(z => z.id === zoomDrag.id);
    if (region) {
      // Find neighboring zoom regions
      const others = S.zoomKeyframes.filter(z => z.id !== region.id);
      if (zoomDrag.side === 'move') {
        // ── Drag-to-move: reposition region keeping duration fixed ──
        let newStart = t - (zoomDrag.grabOffset || 0);
        const dur = region.durationSec;
        // Clamp to video bounds
        newStart = clamp(newStart, 0, S.duration - dur);
        // Clamp against neighboring zoom regions to prevent overlaps
        for (const o of others) {
          const oEnd = o.startSec + o.durationSec;
          // If dragging into a region on the left
          if (o.startSec < region.startSec && newStart < oEnd) {
            newStart = Math.max(newStart, oEnd);
          }
          // If dragging into a region on the right
          if (o.startSec >= region.startSec && newStart + dur > o.startSec) {
            newStart = Math.min(newStart, o.startSec - dur);
          }
        }
        region.startSec = Math.max(0, newStart);
      } else if (zoomDrag.side === 'left') {
        // Find the nearest region that ends before this one starts
        let minLeft = 0;
        for (const o of others) {
          const oEnd = o.startSec + o.durationSec;
          if (oEnd <= region.startSec + 0.01) minLeft = Math.max(minLeft, oEnd);
        }
        const end = region.startSec + region.durationSec;
        const newStart = clamp(t, minLeft, end - 0.5);
        region.durationSec = end - newStart;
        region.startSec = newStart;
      } else {
        // Find the nearest region that starts after this one ends
        let maxRight = S.duration;
        for (const o of others) {
          if (o.startSec >= region.startSec + region.durationSec - 0.01) maxRight = Math.min(maxRight, o.startSec);
        }
        const newEnd = clamp(t, region.startSec + 0.5, maxRight);
        region.durationSec = newEnd - region.startSec;
      }
      buildTimeline();
    }
  }
});

document.addEventListener('mouseup', () => {
  if (isDraggingTimeline) { isDraggingTimeline = false; }
  if (resizeDrag) { snapshot(); resizeDrag = null; }
  if (zoomDrag) { snapshot(); zoomDrag = null; }
});

/* ═══════════════════════════════════════════════════════════
   EVENT WIRING
   ═══════════════════════════════════════════════════════════ */

// Title bar
$('btn-close').addEventListener('click', () => { saveProject(); window.veditor ? window.veditor.close() : window.close(); });
$('btn-minimize').addEventListener('click', () => window.veditor && window.veditor.minimize());
$('btn-maximize').addEventListener('click', () => window.veditor && window.veditor.maximize());

// Play controls
$('btn-play').addEventListener('click', togglePlay);
$('btn-skip-back').addEventListener('click', () => seekTo(S.currentTime - 5));
$('btn-skip-fwd').addEventListener('click', () => seekTo(S.currentTime + 5));

// Timeline zoom
$('tl-zoom-slider').addEventListener('input', e => {
  S.tlZoom = +e.target.value; buildTimeline();
});

// Sidebar tools (zoom removed — zoom regions created by clicking zoom track directly)
$('tl-btn-select').addEventListener('click', () => {
  S.tool = 'select';
  ['tl-btn-select', 'tl-btn-silence'].forEach(id => $(id).classList.remove('active'));
  $('tl-btn-select').classList.add('active');
  // Exit silence mode when switching tools
  if (silenceMode) { silenceMode = false; clearSilenceOverlays(); silenceRegions = []; }
  updateInspector();
});

$('tl-btn-split').addEventListener('click', () => {
  if (selectedZoomId) {
    if (splitZoomRegion(selectedZoomId, S.currentTime)) {
      selectedZoomId = null;
      buildTimeline(); showToast('Zoom split at ' + fmtTime(S.currentTime));
    } else {
      showToast('Playhead outside selected zoom');
    }
  } else {
    if (splitAtTime(S.currentTime)) {
      buildTimeline(); showToast('Cut at ' + fmtTime(S.currentTime));
    }
  }
});

// Silence detection tool (toggles mode, not a timeline tool)
$('tl-btn-silence').addEventListener('click', () => {
  silenceMode = !silenceMode;
  ['tl-btn-select', 'tl-btn-silence'].forEach(id => $(id).classList.remove('active'));
  if (silenceMode) {
    $('tl-btn-silence').classList.add('active');
    // Make sure the panel is visible
    $('tools-panel').classList.remove('collapsed');
  } else {
    // Restore select tool highlight
    $('tl-btn-select').classList.add('active');
    clearSilenceOverlays();
    silenceRegions = [];
  }
  updateInspector();
});
$('tl-btn-undo').addEventListener('click', () => { if(undo()) { buildTimeline(); syncSettingsUI(); renderCurrentFrame(); showToast('Undo'); }});
$('tl-btn-redo').addEventListener('click', () => { if(redo()) { buildTimeline(); syncSettingsUI(); renderCurrentFrame(); showToast('Redo'); }});

$('tl-btn-erase-left').addEventListener('click', () => {
  if (splitAtTime(S.currentTime)) {
    // splitAtTime replaces the old segment with left (idx) and right (idx+1).
    // The playhead is now exactly between them. 
    // We want to delete the one immediately to the left of the playhead.
    const idx = S.segments.findIndex(s => s.endSec === S.currentTime);
    if (idx >= 0 && !S.segments[idx].isDeleted) {
      S.segments[idx].isDeleted = true;
      snapshot();
      buildTimeline();
      renderCurrentFrame();
      showToast('Erased Left');
    }
  }
});

$('tl-btn-erase-right').addEventListener('click', () => {
  if (splitAtTime(S.currentTime)) {
    // Delete the one immediately to the right of the playhead.
    const idx = S.segments.findIndex(s => s.startSec === S.currentTime);
    if (idx >= 0 && !S.segments[idx].isDeleted) {
      S.segments[idx].isDeleted = true;
      snapshot();
      buildTimeline();
      renderCurrentFrame();
      showToast('Erased Right');
    }
  }
});

$('tl-btn-delete').addEventListener('click', () => {
  if (selectedZoomId) {
    removeZoomRegion(selectedZoomId);
    selectedZoomId = null;
    buildTimeline(); showToast('Zoom region removed');
  } else if (S.selectedSegId) {
    const seg = S.segments.find(s => s.id === S.selectedSegId);
    if (seg) {
      if (seg.isDeleted) { restoreSegment(seg.id); showToast('Restored'); }
      else { deleteSegment(seg.id); showToast('Deleted segment'); }
      buildTimeline();
    }
  }
});
$('btn-style').addEventListener('click', () => { $('tools-panel').classList.toggle('collapsed'); });

// Initial inspector render
setTimeout(updateInspector, 100);

// Panel resize handle
const panelResize = $('panel-resize');
let panelDrag = false, panelStartX = 0, panelStartW = 0;
panelResize.addEventListener('mousedown', e => {
  panelDrag = true; panelStartX = e.clientX; panelStartW = $('tools-panel').offsetWidth;
  panelResize.classList.add('dragging');
});
document.addEventListener('mousemove', e => {
  if (!panelDrag) return;
  $('tools-panel').style.width = clamp(panelStartW + (panelStartX - e.clientX), 180, 400) + 'px';
});
document.addEventListener('mouseup', () => {
  if (panelDrag) { panelDrag = false; panelResize.classList.remove('dragging'); }
});

// Export button
$('btn-export').addEventListener('click', showExportDialog);

/* ═══════════════════════════════════════════════════════════
   FFMPEG DOWNLOAD MODAL
   ─────────────────────────────────────────────────────────
   Shown when the user first tries to export and FFmpeg
   is not yet installed. Explains what it is, offers a
   one-click download with live progress, and then
   auto-opens the export dialog on success.
   ═══════════════════════════════════════════════════════════ */
function showFFmpegDownloadModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ffmpeg-overlay';
    overlay.innerHTML = `
      <div class="ffmpeg-box">
        <div class="ffmpeg-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b4a8ff" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>
        <div class="ffmpeg-title">FFmpeg Required</div>
        <div class="ffmpeg-sub">
          To export videos in MP4, GIF, or MOV format, MicTab needs FFmpeg — a free, industry-standard video processor. It will be downloaded once and cached for future use.
        </div>
        <div class="ffmpeg-features">
          <div class="ffmpeg-feature">
            <div class="ffmpeg-feature-icon">🎬</div>
            <div class="ffmpeg-feature-label">Convert</div>
            <div class="ffmpeg-feature-desc">WebM to MP4, GIF, MOV</div>
          </div>
          <div class="ffmpeg-feature">
            <div class="ffmpeg-feature-icon">⚡</div>
            <div class="ffmpeg-feature-label">Fast</div>
            <div class="ffmpeg-feature-desc">Hardware accelerated</div>
          </div>
          <div class="ffmpeg-feature">
            <div class="ffmpeg-feature-icon">🔒</div>
            <div class="ffmpeg-feature-label">Private</div>
            <div class="ffmpeg-feature-desc">Runs 100% locally</div>
          </div>
        </div>
        <div class="ffmpeg-size">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          One-time download · ~70 MB · Cached locally
        </div>
        <div id="ffmpeg-initial-state">
          <div class="ffmpeg-actions">
            <button class="ffmpeg-btn cancel" id="ffmpeg-cancel">Cancel</button>
            <button class="ffmpeg-btn download" id="ffmpeg-download">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download FFmpeg
            </button>
          </div>
        </div>
        <div class="ffmpeg-progress" id="ffmpeg-progress">
          <div class="ffmpeg-progress-status" id="ffmpeg-status">Downloading FFmpeg…</div>
          <div class="ffmpeg-progress-track">
            <div class="ffmpeg-progress-fill" id="ffmpeg-fill"></div>
          </div>
          <div class="ffmpeg-progress-detail" id="ffmpeg-detail">Starting download…</div>
        </div>
        <div class="ffmpeg-success" id="ffmpeg-success">
          <div class="ffmpeg-success-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="ffmpeg-success-text">FFmpeg Installed!</div>
          <div class="ffmpeg-success-sub">Opening export dialog…</div>
        </div>
        <div class="ffmpeg-error" id="ffmpeg-error"></div>
      </div>`;
    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('#ffmpeg-cancel');
    const downloadBtn = overlay.querySelector('#ffmpeg-download');
    const initialState = overlay.querySelector('#ffmpeg-initial-state');
    const progressSection = overlay.querySelector('#ffmpeg-progress');
    const statusEl = overlay.querySelector('#ffmpeg-status');
    const fillEl = overlay.querySelector('#ffmpeg-fill');
    const detailEl = overlay.querySelector('#ffmpeg-detail');
    const successSection = overlay.querySelector('#ffmpeg-success');
    const errorEl = overlay.querySelector('#ffmpeg-error');

    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !progressSection.classList.contains('active')) {
        overlay.remove();
        resolve(false);
      }
    });

    downloadBtn.addEventListener('click', async () => {
      // Switch to download state
      downloadBtn.disabled = true;
      initialState.style.display = 'none';
      progressSection.classList.add('active');
      cancelBtn.style.display = 'none';
      errorEl.classList.remove('active');

      // Listen for real-time progress events from main process
      let resolved = false;
      if (window.veditor && window.veditor.onFFmpegProgress) {
        window.veditor.onFFmpegProgress((data) => {
          if (resolved) return;
          fillEl.style.width = data.pct + '%';
          statusEl.textContent = data.status || 'Downloading…';
          detailEl.textContent = data.detail || '';
        });
      }

      // Trigger the actual download
      try {
        await window.veditor.downloadFFmpeg();
        // downloadFFmpeg resolved successfully
        resolved = true;
        fillEl.style.width = '100%';
        statusEl.textContent = 'Complete!';
        detailEl.textContent = 'FFmpeg installed successfully';

        // Show success state
        setTimeout(() => {
          progressSection.classList.remove('active');
          successSection.classList.add('active');
          setTimeout(() => {
            overlay.remove();
            resolve(true);
          }, 1200);
        }, 400);
      } catch (err) {
        // Download failed
        resolved = true;
        progressSection.classList.remove('active');
        initialState.style.display = '';
        cancelBtn.style.display = '';
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Retry Download`;
        errorEl.classList.add('active');
        errorEl.textContent = '⚠ Download failed: ' + (err.message || 'Network error. Check your internet connection and try again.');
      }
    });
  });
}

/**
 * Ensure FFmpeg is installed before proceeding with export.
 * Returns true if FFmpeg is ready, false if user cancelled.
 */
async function ensureFFmpeg() {
  if (!window.veditor || !window.veditor.checkFFmpeg) return true;
  try {
    const status = await window.veditor.checkFFmpeg();
    if (status.installed) return true;
  } catch (_) {
    return true; // Can't check, let the export try anyway
  }
  // FFmpeg not installed — show download modal
  return showFFmpegDownloadModal();
}

async function showExportDialog() {
  // ── Step 1: Ensure FFmpeg is available ──
  const ffmpegReady = await ensureFFmpeg();
  if (!ffmpegReady) return; // User cancelled the FFmpeg download
  const srcName = S.filePath.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '');
  const defaultName = srcName + '-edited';
  const hasZoom = S.zoomKeyframes.length > 0;

  const isUnedited = S.segments.length === 1 && S.segments[0].startSec < 0.05 && S.segments.filter(s => s.isMuted).length === 0;

  let hwInfoHtml = '';
  let hasGpu = true;
  if (window.veditor && window.veditor.getHardwareInfo) {
    try {
      const info = await window.veditor.getHardwareInfo();
      if (!info.gpu || info.gpu.toLowerCase().includes('unknown')) {
        hasGpu = false;
      }
      hwInfoHtml = `
        <div style="font:500 10px/1.4 'Inter',sans-serif; color:rgba(255,255,255,0.5); margin-bottom:12px; padding:8px; background:rgba(255,255,255,0.03); border-radius:6px; display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between;"><span>GPU:</span><span style="color:#e2e2e8;">${info.gpu}</span></div>
          <div style="display:flex; justify-content:space-between;"><span>CPU:</span><span style="color:#e2e2e8;">${info.cpu}</span></div>
        </div>
      `;
    } catch(e) {
      console.warn('Failed to fetch hardware info:', e);
    }
  }
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      overlay.innerHTML = `
        <div class="dialog-box">
          <div class="dialog-title">Export Video</div>
          <div class="dialog-sub">Choose a name, format, and hardware acceleration mode.</div>
          <div style="margin-bottom:14px">
            <label style="font:500 10px/1 'Inter',sans-serif; color:#6b7280; display:block; margin-bottom:6px">Filename</label>
            <input type="text" id="export-filename" value="${defaultName}" style="
              width:100%; padding:8px 12px; border-radius:8px; border:1px solid #1e1e2a;
              background:rgba(255,255,255,0.03); color:#e2e2e8; font:500 12px/1 'Inter',sans-serif;
              outline:none;
            " />
          </div>
          <label style="font:500 10px/1 'Inter',sans-serif; color:#6b7280; display:block; margin-bottom:6px">Hardware Acceleration</label>
          ${hwInfoHtml}
          <div class="hw-selector" id="hw-selector">
            <div class="hw-option ${hasGpu ? 'active' : ''}" data-hw="auto">
              <span class="hw-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></span>
              <span class="hw-label">Auto</span>
            </div>
            <div class="hw-option ${!hasGpu ? 'active' : ''}" data-hw="cpu">
              <span class="hw-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M9 2v2M15 20v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2"/></svg></span>
              <span class="hw-label">CPU</span>
            </div>
            ${hasGpu ? `
            <div class="hw-option" data-hw="gpu">
              <span class="hw-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M10 12h.01M14 12h4"/></svg></span>
              <span class="hw-label">GPU</span>
            </div>
            ` : ''}
          </div>
          <label style="font:500 10px/1 'Inter',sans-serif; color:#6b7280; display:block; margin-bottom:6px; margin-top:12px">Frame Rate</label>
          <div style="display:flex; gap:6px; margin-bottom:14px;" id="fps-selector">
            ${['source','24','30','60'].map((f, i) => `
              <div data-fps="${f}" style="
                flex:1; text-align:center; padding:6px 4px; border-radius:7px; cursor:pointer;
                border:1px solid ${i === 0 ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)'};
                background:${i === 0 ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)'};
                font:${i === 0 ? '600' : '500'} 10px/1 'Inter',sans-serif;
                color:${i === 0 ? '#818cf8' : '#6b7280'};
                transition:all .15s;
              ">${f === 'source' ? 'Source' : f + ' fps'}</div>`).join('')}
          </div>
          ${hasZoom ? `
          <div style="margin-bottom:14px; padding:10px 12px; border-radius:8px; border:1px solid rgba(139,92,246,0.2); background:rgba(139,92,246,0.05);">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="export-zoom-canvas" style="accent-color:#8b5cf6; width:14px; height:14px;">
              <div>
                <div style="font:600 10px/1 'Inter',sans-serif; color:rgba(139,92,246,0.9);">Include Zoom Keyframes (Slower Export)</div>
                <div style="font:400 9px/1.3 'Inter',sans-serif; color:rgba(139,92,246,0.4); margin-top:3px;">Render dynamic cursor-tracking zooms. Leave unchecked to <b>ignore zooms</b> and export extremely fast.</div>
              </div>
            </label>
          </div>
          ` : ''}
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px;">
            <button class="dialog-btn ${isUnedited && !hasZoom ? 'primary' : ''}" data-fmt="webm">WebM ${isUnedited && !hasZoom ? '(Instant)' : ''}</button>
            <button class="dialog-btn ${!isUnedited || hasZoom ? 'primary' : ''}" data-fmt="mp4">MP4 ${!isUnedited || hasZoom ? '(Fast HW)' : ''}</button>
            <button class="dialog-btn" data-fmt="gif">GIF</button>
            <button class="dialog-btn" data-fmt="mov">MOV</button>
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn" id="export-cancel">Cancel</button>
          </div>
        </div>`;
  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector('#export-filename');
  nameInput.focus(); nameInput.select();

  // HW selector
  let selectedHw = 'auto';
  overlay.querySelectorAll('.hw-option').forEach(opt => {
    opt.addEventListener('click', () => {
      overlay.querySelectorAll('.hw-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      selectedHw = opt.dataset.hw;
    });
  });

  // FPS selector
  let selectedFps = 'source';
  overlay.querySelectorAll('#fps-selector [data-fps]').forEach(opt => {
    opt.addEventListener('click', () => {
      selectedFps = opt.dataset.fps;
      overlay.querySelectorAll('#fps-selector [data-fps]').forEach(o => {
        const active = o.dataset.fps === selectedFps;
        o.style.border = active ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.07)';
        o.style.background = active ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)';
        o.style.color = active ? '#818cf8' : '#6b7280';
        o.style.fontWeight = active ? '600' : '500';
      });
    });
  });

  overlay.querySelector('#export-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('[data-fmt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = nameInput.value.trim() || defaultName;
      const zoomCanvasCheckbox = overlay.querySelector('#export-zoom-canvas');
      const useCanvasZoom = zoomCanvasCheckbox ? zoomCanvasCheckbox.checked : false;
      overlay.remove();

      // Save custom gradient to history on export
      let valToSave = null;
      if (S.viewport.bgMode === 'image' && S.viewport.bgImageSrc && S.viewport.isCustomGradient) {
        valToSave = S.viewport.bgImageSrc;
      } else if (S.viewport.bgMode === 'color' && S.viewport.bg && S.viewport.bg.includes('gradient')) {
        const isPreset = _PRESET_BGS.some(p => p.val === S.viewport.bg);
        if (!isPreset) valToSave = S.viewport.bg;
      }

      if (valToSave && !_savedCustomGradients.includes(valToSave)) {
        _savedCustomGradients.unshift(valToSave);
        if (_savedCustomGradients.length > 5) {
          _savedCustomGradients = _savedCustomGradients.slice(0, 5);
        }
        localStorage.setItem('veditor_custom_gradients', JSON.stringify(_savedCustomGradients));
        updateInspector();
      }

      doExport(btn.dataset.fmt, name, selectedHw, useCanvasZoom, selectedFps);
    });
  });
}

/* ── Export progress overlay ── */
let exportProgressOverlay = null;

function showExportProgress(format) {
  removeExportProgress();
  const ov = document.createElement('div');
  ov.className = 'export-progress-overlay';
  ov.innerHTML = `
    <div class="export-progress-box">
      <div class="export-progress-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b4a8ff" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </div>
      <div class="export-progress-title">Rendering ${format.toUpperCase()}…</div>
      <div class="export-progress-sub">Please wait — do not close the editor</div>
      <div class="export-progress-track"><div class="export-progress-fill" id="ep-fill" style="width:2%"></div></div>
      <div class="export-progress-stats">
        <span class="export-progress-pct" id="ep-pct">2%</span>
        <span class="export-progress-eta" id="ep-eta">Estimating…</span>
      </div>
      <button class="export-cancel-btn" id="ep-cancel">Cancel Export</button>
    </div>`;
  document.body.appendChild(ov);
  exportProgressOverlay = ov;

  ov.querySelector('#ep-cancel').addEventListener('click', () => {
    if (window.veditor && window.veditor.cancelExport) {
      window.veditor.cancelExport();
    }
  });
}

function updateExportProgress(pct, eta) {
  const fill = document.getElementById('ep-fill');
  const pctEl = document.getElementById('ep-pct');
  const etaEl = document.getElementById('ep-eta');
  if (fill) fill.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
  if (etaEl) {
    if (eta && eta > 0) {
      const m = Math.floor(eta / 60);
      const s = eta % 60;
      etaEl.textContent = m > 0 ? `~${m}m ${s}s remaining` : `~${s}s remaining`;
    } else if (pct >= 95) {
      etaEl.textContent = 'Finalizing…';
    } else {
      etaEl.textContent = 'Estimating…';
    }
  }
}

function removeExportProgress() {
  if (exportProgressOverlay) { exportProgressOverlay.remove(); exportProgressOverlay = null; }
}

async function doExport(format, filename, hwaccel, useCanvasZoom, fpsChoice) {
  saveProject();

  // Route to canvas frame pipeline if zoom regions exist and user wants them
  const hasZoom = S.zoomKeyframes.length > 0;
  if (hasZoom && useCanvasZoom) {
    return canvasFrameExport(format, filename, hwaccel, fpsChoice);
  }

  // Standard FFmpeg-only pipeline (super fast natively via filter_complex)
  showExportProgress(format);
  if (window.veditor && window.veditor.exportVideo) {
    try {
      const result = await window.veditor.exportVideo({
        filePath: S.filePath, format, filename,
        segments: S.segments,
        mutedSegments: S.segments.filter(s => s.isMuted).map(s => ({ startSec: s.startSec, endSec: s.endSec })),
        viewport: S.viewport,
        zoomRegions: [], // Fast mode ignores zoom keyframes entirely, per user request
        hwaccel: hwaccel || 'auto',
        fps: fpsChoice || 'source',
      });
      removeExportProgress();
      if (result && result.ok) {
        showToast('✅ Exported: ' + (result.path || '').replace(/\\/g, '/').split('/').pop());
      } else if (result && result.cancelled) {
        showToast('Export cancelled');
      } else {
        showToast('⚠ Export failed: ' + (result ? result.error : 'Unknown error'));
      }
    } catch (err) {
      removeExportProgress();
      showToast('⚠ Export error: ' + err.message);
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   CANVAS FRAME-BY-FRAME EXPORT — Dynamic Zoom Pipeline
   ───────────────────────────────────────────────────────────
   Renders every frame through the Canvas (with cursor tracking,
   spring physics, easing) and pipes JPEG frames to FFmpeg.
   This produces pixel-perfect WYSIWYG zoom export.
   ═══════════════════════════════════════════════════════════ */
async function canvasFrameExport(format, filename, hwaccel, fpsChoice) {
  // Resolve actual fps number: 'source' = use native video fps, else parse the number
  let fps;
  if (!fpsChoice || fpsChoice === 'source') {
    // Default to 60fps for "Source" to preserve smooth 60fps captures.
    // If the original video is 30fps, FFmpeg handles the duplicated frame times well, 
    // but a 60fps video downsampled to 30fps causes noticeable stutter.
    fps = 60;
  } else {
    fps = parseInt(fpsChoice, 10) || 30;
  }

  const wasPlaying = S.playing;
  if (wasPlaying) pauseVideo();

  // Build frame list from active segments
  const activeSegs = S.segments.filter(s => !s.isDeleted);
  const frameTimes = [];
  for (const seg of activeSegs) {
    for (let t = seg.startSec; t < seg.endSec; t += 1 / fps) {
      frameTimes.push(t);
    }
  }
  const totalFrames = frameTimes.length;
  if (!totalFrames) { showToast('⚠ No active segments'); return; }

  // Determine export canvas dimensions (same logic as renderFrame)
  const vw = video.videoWidth, vh = video.videoHeight;
  const ar = S.viewport.aspectRatio || 'original';
  const sourceAR = vw / vh;
  const arMap = { '16:9': 16/9, '9:16': 9/16, '1:1': 1, '4:3': 4/3, '3:4': 3/4, '4:5': 4/5, '21:9': 21/9 };
  const targetAR = arMap[ar] || sourceAR;
  const maxW = Math.min(vw, 1920), maxH = Math.min(vh, 1080);
  let cw, ch;
  if (Math.abs(targetAR - sourceAR) < 0.01) { cw = maxW; ch = maxH; }
  else if (targetAR > sourceAR) { ch = maxH; cw = Math.round(ch * targetAR); }
  else { cw = maxW; ch = Math.round(cw / targetAR); }
  cw = cw % 2 === 0 ? cw : cw + 1;
  ch = ch % 2 === 0 ? ch : ch + 1;

  // Create offscreen export canvas
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = cw;
  exportCanvas.height = ch;

  console.log(`[Export] Canvas pipeline: ${cw}x${ch} @ ${fps}fps, ${totalFrames} frames, format=${format}`);

  showExportProgress(format);

  // Build muted segment info for audio
  const mutedSegments = S.segments.filter(s => s.isMuted).map(s => ({ startSec: s.startSec, endSec: s.endSec }));

  try {
    // Start FFmpeg process in main via IPC
    const startResult = await window.veditor.startFrameExport({
      filePath: S.filePath,
      format,
      filename,
      width: cw,
      height: ch,
      fps,
      totalFrames,
      segments: activeSegs,
      mutedSegments,
      hwaccel: hwaccel || 'auto',
    });

    if (!startResult || !startResult.ok) {
      removeExportProgress();
      showToast('⚠ Failed to start export: ' + (startResult ? startResult.error : 'Unknown'));
      return;
    }

    // Reset camera state for clean export starting position
    resetCameraState();

    const startTime = Date.now();
    let cancelled = false;

    // Wire cancel button to abort the export
    const cancelBtn = document.getElementById('ep-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        cancelled = true;
        window.veditor.cancelExport();
      });
    }

    // Render frames one by one
    for (let i = 0; i < totalFrames; i++) {
      if (cancelled) break;

      const t = frameTimes[i];
      S.currentTime = t;

      // Seek video to this frame
      await new Promise(resolve => {
        let finished = false;
        const complete = () => {
          if (finished) return;
          finished = true;
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        const onSeeked = () => {
          if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(complete);
          } else {
            // fallback
            requestAnimationFrame(() => requestAnimationFrame(complete));
          }
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = t;
        // Safety timeout in case seeked never fires (corrupt frame)
        setTimeout(complete, 500);
      });

      // Render through the full pipeline (zoom, cursor, spring physics, bg, etc.)
      renderFrameForExport(exportCanvas, video, fps);

      // Extract as JPEG blob
      const blob = await new Promise(resolve =>
        exportCanvas.toBlob(resolve, 'image/jpeg', 0.95)
      );
      if (!blob) continue;

      // Convert to ArrayBuffer and send to main process
      const buffer = await blob.arrayBuffer();
      await window.veditor.sendExportFrame(new Uint8Array(buffer));

      // Update progress
      const pct = Math.min(99, Math.round(((i + 1) / totalFrames) * 100));
      const elapsed = (Date.now() - startTime) / 1000;
      const eta = pct > 2 ? Math.round((elapsed / pct) * (100 - pct)) : null;
      updateExportProgress(pct, eta);
    }

    if (cancelled) {
      removeExportProgress();
      showToast('Export cancelled');
      return;
    }

    // Signal FFmpeg to finish (closes stdin, waits for encode to complete)
    const result = await window.veditor.finishFrameExport();
    removeExportProgress();

    if (result && result.ok) {
      showToast('✅ Exported: ' + (result.path || '').replace(/\\/g, '/').split('/').pop());
    } else {
      showToast('⚠ Export failed: ' + (result ? result.error : 'Unknown'));
    }
  } catch (err) {
    removeExportProgress();
    showToast('⚠ Export error: ' + err.message);
    console.error('[Export] Canvas pipeline error:', err);
  }
}

// Listen for export progress/completion from main process
if (window.veditor && window.veditor.onExportProgress) {
  window.veditor.onExportProgress((data) => {
    if (data && data.percent != null) updateExportProgress(data.percent, data.eta);
  });
}
if (window.veditor && window.veditor.onExportDone) {
  window.veditor.onExportDone((data) => {
    removeExportProgress();
    if (data && data.ok) {
      showToast('✅ Export complete: ' + (data.path || '').replace(/\\/g, '/').split('/').pop());
    } else if (data && data.cancelled) {
      showToast('Export cancelled');
    } else if (data && data.error) {
      showToast('⚠ Export failed: ' + data.error);
    }
  });
}

function saveProject() {
  if (window.veditor && window.veditor.saveProject) {
    window.veditor.saveProject(S.filePath, { segments: S.segments, zoomKeyframes: S.zoomKeyframes, viewport: S.viewport, autoZoomApplied: S.autoZoomApplied });
  }
}
// Autosave every 5 seconds
setInterval(saveProject, 5000);
// Always save when window is closed by any means (OS X button, Alt+F4, etc.)
window.addEventListener('beforeunload', saveProject);

/* ═══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS  (NLE-style)
   ───────────────────────────────────────────────────────────
   Space        Play / Pause
   C            Cut (split at playhead)
   Delete/Bksp  Delete selected segment
   Q            Ripple delete backward (delete segment before playhead)
   E            Ripple delete forward  (delete segment after playhead)
   ←  →         Seek ±5s  (Shift: ±1s, Alt: ±0.1s frame-step)
   J K L        Reverse / Pause / Forward (industry standard)
   Home/End     Jump to start / end
   [ ]          Jump to prev / next cut point
   ⌘Z / ⌘⇧Z    Undo / Redo
   V            Select tool
   S            Split tool (then click timeline to split)
   Z            Zoom keyframe tool
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const key = e.key;
  const kl = key.toLowerCase();
  const meta = e.metaKey || e.ctrlKey;

  // Play/Pause
  if (kl === ' ' || kl === 'k') { e.preventDefault(); togglePlay(); return; }

  // ─── CUT (C) — operates on whichever item is selected ───
  if (kl === 'c' && !meta) {
    e.preventDefault();
    if (selectedZoomId) {
      // Zoom region is selected → split the zoom region
      if (splitZoomRegion(selectedZoomId, S.currentTime)) {
        selectedZoomId = null;
        buildTimeline(); showToast('Zoom split at ' + fmtTime(S.currentTime));
      } else {
        showToast('Playhead outside selected zoom');
      }
    } else {
      // Main clip selected (or nothing) → split the video clip
      if (splitAtTime(S.currentTime)) {
        buildTimeline(); showToast('Cut at ' + fmtTime(S.currentTime));
      }
    }
    return;
  }

  // ─── DELETE / BACKSPACE — operates on whichever item is selected ───
  if (key === 'Delete' || key === 'Backspace') {
    e.preventDefault();
    if (selectedZoomId) {
      removeZoomRegion(selectedZoomId);
      selectedZoomId = null;
      buildTimeline(); showToast('Zoom region removed');
    } else if (S.selectedSegId) {
      const seg = S.segments.find(s => s.id === S.selectedSegId);
      if (seg) {
        if (seg.isDeleted) { restoreSegment(seg.id); showToast('Restored'); }
        else { deleteSegment(seg.id); showToast('Deleted segment'); }
        buildTimeline();
      }
    }
    return;
  }

  // ─── RIPPLE DELETE BACKWARD (Q) ───
  if (kl === 'q' && !meta) {
    e.preventDefault();
    if (selectedZoomId) {
      // If zoom selected, delete the zoom region that ends at/before playhead
      const zr = S.zoomKeyframes.find(r => {
        const end = r.startSec + r.durationSec;
        return Math.abs(end - S.currentTime) < 0.15;
      });
      if (zr) {
        removeZoomRegion(zr.id);
        selectedZoomId = null;
        buildTimeline(); showToast('Zoom ripple ← removed');
      }
    } else {
      if (rippleDeleteBackward(S.currentTime)) {
        buildTimeline(); showToast('Ripple delete ← backward');
      }
    }
    return;
  }

  // ─── RIPPLE DELETE FORWARD (E) ───
  if (kl === 'e' && !meta) {
    e.preventDefault();
    if (selectedZoomId) {
      // If zoom selected, delete the zoom region that starts at/after playhead
      const zr = S.zoomKeyframes.find(r => {
        return Math.abs(r.startSec - S.currentTime) < 0.15;
      });
      if (zr) {
        removeZoomRegion(zr.id);
        selectedZoomId = null;
        buildTimeline(); showToast('Zoom ripple → removed');
      }
    } else {
      if (rippleDeleteForward(S.currentTime)) {
        buildTimeline(); showToast('Ripple delete → forward');
      }
    }
    return;
  }

  // Seek
  if (kl === 'arrowleft') {
    e.preventDefault();
    const step = e.altKey ? 1/30 : e.shiftKey ? 1 : 5;
    seekTo(S.currentTime - step);
    return;
  }
  if (kl === 'arrowright') {
    e.preventDefault();
    const step = e.altKey ? 1/30 : e.shiftKey ? 1 : 5;
    seekTo(S.currentTime + step);
    return;
  }

  // Home / End
  if (kl === 'home') { e.preventDefault(); seekTo(0); return; }
  if (kl === 'end') { e.preventDefault(); seekTo(S.duration); return; }

  // Jump to prev/next cut point [ ]
  if (key === '[') {
    e.preventDefault();
    const cuts = S.segments.map(s => s.startSec).filter(t => t < S.currentTime - 0.05);
    if (cuts.length) seekTo(cuts[cuts.length - 1]);
    return;
  }
  if (key === ']') {
    e.preventDefault();
    const cuts = S.segments.map(s => s.startSec).filter(t => t > S.currentTime + 0.05);
    if (cuts.length) seekTo(cuts[0]);
    return;
  }

  // J K L (reverse/pause/forward)
  if (kl === 'j') { e.preventDefault(); S.speed = Math.max(0.25, S.speed - 0.5); video.playbackRate = S.speed; updateInspector(); if (!S.playing) playVideo(); return; }
  if (kl === 'l') { e.preventDefault(); S.speed = Math.min(4, S.speed + 0.5); video.playbackRate = S.speed; updateInspector(); if (!S.playing) playVideo(); return; }

  // Undo / Redo
  if (kl === 'z' && meta && e.shiftKey) { e.preventDefault(); $('tl-btn-redo').click(); return; }
  if (kl === 'z' && meta) { e.preventDefault(); $('tl-btn-undo').click(); return; }

  // Tool selection
  if (kl === 'v' && !meta) { $('tl-btn-select').click(); return; }
  if (kl === 'c' && !meta) { $('tl-btn-split').click(); return; }
  if (kl === 'q' && !meta) { $('tl-btn-erase-left').click(); return; }
  if (kl === 'e' && !meta) { $('tl-btn-erase-right').click(); return; }
});

/* ═══ WINDOW RESIZE ═══ */
window.addEventListener('resize', () => { drawTimelineWaveform(); renderCurrentFrame(); });
