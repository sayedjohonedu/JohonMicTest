'use strict';
/* ═══════════════════════════════════════════════════════════
   MicTab Video Editor — UI Controller
   Wires veditor-core.js to the DOM
   ═══════════════════════════════════════════════════════════ */

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

  video.src = 'file://' + encodeURI(fp);
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
  canvas.width = Math.min(S.videoW, 1920); canvas.height = Math.min(S.videoH, 1080);
  $('res-label').textContent = S.videoW + '×' + S.videoH;
  $('tc-total').textContent = fmtTime(dur);
  initSegments(dur);
  video.currentTime = 0;
  buildTimeline();
  renderCurrentFrame();

  // Load sidecar project
  if (window.veditor && window.veditor.loadProject) {
    window.veditor.loadProject(S.filePath).then(proj => {
      if (proj) {
        if (proj.segments) S.segments = proj.segments;
        if (proj.zoomKeyframes) S.zoomKeyframes = proj.zoomKeyframes;
        if (proj.viewport) Object.assign(S.viewport, proj.viewport);
        syncSettingsUI(); buildTimeline(); snapshot();
      }
    });
  }

  // Load cursor track data for position-aware zoom
  if (window.veditor && window.veditor.loadCursorTrack) {
    window.veditor.loadCursorTrack(S.filePath).then(data => {
      if (data) {
        setCursorData(data);
        console.log('[Editor] Cursor track loaded:', data.track.length, 'points');
      }
    });
  }

  // Generate waveform (async)
  generateWaveform(S.filePath, 50).then(peaks => {
    waveformPeaks = peaks; drawTimelineWaveform();
  });
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
        marker.appendChild(icon);
        marker.addEventListener('click', e => {
          e.stopPropagation();
          toggleDeleteSegment(seg.id);
          buildTimeline();
          showToast('Segment restored');
        });
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

    // Resize handle between this and next segment
    const next = S.segments[i + 1];
    if (next && Math.abs(next.startSec - seg.endSec) < 0.01) {
      const handle = document.createElement('div');
      handle.className = 'seg-resize';
      handle.addEventListener('mousedown', e => {
        e.stopPropagation(); e.preventDefault();
        resizeDrag = { leftId: seg.id, rightId: next.id };
      });
      el.appendChild(handle);
    }

    // Click on segment: select it (deselect zoom)
    el.addEventListener('mousedown', e => {
      if (e.target.closest('.seg-action') || e.target.closest('.seg-resize')) return;
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

    // Scroll wheel to adjust scale
    el.addEventListener('wheel', e => {
      e.preventDefault(); e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      region.scale = clamp(region.scale + delta, 1.25, 5);
      snapshot(); buildTimeline();
      showToast('Zoom: ' + region.scale.toFixed(2) + '×');
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
      <div class="panel-section-title">Speed</div>
      <div class="speed-presets" id="speed-presets">
        <button class="speed-preset${S.speed===0.25?' active':''}" data-speed="0.25">0.25×</button>
        <button class="speed-preset${S.speed===0.5?' active':''}" data-speed="0.5">0.5×</button>
        <button class="speed-preset${S.speed===0.75?' active':''}" data-speed="0.75">0.75×</button>
        <button class="speed-preset${S.speed===1?' active':''}" data-speed="1">1×</button>
        <button class="speed-preset${S.speed===1.5?' active':''}" data-speed="1.5">1.5×</button>
        <button class="speed-preset${S.speed===2?' active':''}" data-speed="2">2×</button>
        <button class="speed-preset${S.speed===4?' active':''}" data-speed="4">4×</button>
      </div>
    </div>
    <div class="inspector-divider"></div>
    <!-- Volume -->
    <div class="panel-section">
      <div class="panel-section-title">Audio</div>
      <div class="panel-row">
        <span class="panel-label">${seg.isMuted ? '🔇 Muted' : '🔊 Audible'}</span>
      </div>
      <button class="inspector-action-btn mute" id="btn-toggle-mute">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>${seg.isMuted ? '<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>' : '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'}</svg>
        ${seg.isMuted ? 'Unmute' : 'Mute'}
      </button>
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
    </div>`;
  wireClipInspectorEvents(seg);
}

function wireClipInspectorEvents(seg) {
  // Speed presets
  document.querySelectorAll('#speed-presets .speed-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      S.speed = +btn.dataset.speed;
      video.playbackRate = S.speed;
      updateInspector();
    });
  });
  // Mute toggle
  const muteBtn = $('btn-toggle-mute');
  if (muteBtn) muteBtn.addEventListener('click', () => {
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
    </div>`;
  wireZoomInspectorEvents(zr);
}

function wireZoomInspectorEvents(zr) {
  // Scale presets
  document.querySelectorAll('#zoom-scale-presets .zoom-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      zr.scale = +btn.dataset.scale;
      lastZoomScale = zr.scale;
      snapshot(); buildTimeline(); updateInspector();
      showToast('Zoom: ' + zr.scale.toFixed(1) + '×');
    });
  });
  // Scale slider
  const scaleSlider = $('slider-zoom-scale');
  if (scaleSlider) {
    scaleSlider.addEventListener('input', e => {
      zr.scale = +e.target.value;
      lastZoomScale = zr.scale;
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

/* ── Default Inspector (viewport/background settings) ── */
function renderDefaultInspector(body, title) {
  title.textContent = 'Inspector';
  body.innerHTML = `
    <!-- Viewport section -->
    <div class="panel-section">
      <div class="panel-section-title">Viewport</div>
      <div class="panel-row"><span class="panel-label">Corner Radius</span><span class="panel-value" id="val-radius">${S.viewport.radius}px</span></div>
      <input type="range" class="panel-slider" id="slider-radius" min="0" max="48" value="${S.viewport.radius}" step="1">
      <div class="panel-row" style="margin-top:8px"><span class="panel-label">Padding</span><span class="panel-value" id="val-padding">${S.viewport.padding}px</span></div>
      <input type="range" class="panel-slider" id="slider-padding" min="0" max="120" value="${S.viewport.padding}" step="2">
      <div class="panel-row" style="margin-top:8px"><span class="panel-label">Shadow</span><span class="panel-value" id="val-shadow">${S.viewport.shadow}px</span></div>
      <input type="range" class="panel-slider" id="slider-shadow" min="0" max="80" value="${S.viewport.shadow}" step="1">
    </div>
    <div class="inspector-divider"></div>
    <!-- Background section -->
    <div class="panel-section">
      <div class="panel-section-title">Background</div>
      <div class="color-swatches" id="bg-swatches">
        <div class="color-swatch${S.viewport.bg==='none'?' active':''}" data-bg="none" style="background:repeating-conic-gradient(#1a1a28 0% 25%, #0f0f18 0% 50%) 50%/8px 8px" title="None"></div>
        <div class="color-swatch${S.viewport.bg==='#0f0f1a'?' active':''}" data-bg="#0f0f1a" style="background:#0f0f1a" title="Dark"></div>
        <div class="color-swatch${S.viewport.bg==='linear-gradient(135deg,#1a1a2e,#16213e)'?' active':''}" data-bg="linear-gradient(135deg,#1a1a2e,#16213e)" style="background:linear-gradient(135deg,#1a1a2e,#16213e)" title="Deep Blue"></div>
        <div class="color-swatch${S.viewport.bg==='linear-gradient(135deg,#2d1b69,#11998e)'?' active':''}" data-bg="linear-gradient(135deg,#2d1b69,#11998e)" style="background:linear-gradient(135deg,#2d1b69,#11998e)" title="Ocean"></div>
        <div class="color-swatch${S.viewport.bg==='linear-gradient(135deg,#667eea,#764ba2)'?' active':''}" data-bg="linear-gradient(135deg,#667eea,#764ba2)" style="background:linear-gradient(135deg,#667eea,#764ba2)" title="Purple"></div>
        <div class="color-swatch${S.viewport.bg==='linear-gradient(135deg,#f093fb,#f5576c)'?' active':''}" data-bg="linear-gradient(135deg,#f093fb,#f5576c)" style="background:linear-gradient(135deg,#f093fb,#f5576c)" title="Pink"></div>
        <div class="color-swatch${S.viewport.bg==='linear-gradient(135deg,#4facfe,#00f2fe)'?' active':''}" data-bg="linear-gradient(135deg,#4facfe,#00f2fe)" style="background:linear-gradient(135deg,#4facfe,#00f2fe)" title="Sky"></div>
        <div class="color-swatch${S.viewport.bg==='linear-gradient(135deg,#43e97b,#38f9d7)'?' active':''}" data-bg="linear-gradient(135deg,#43e97b,#38f9d7)" style="background:linear-gradient(135deg,#43e97b,#38f9d7)" title="Mint"></div>
        <div class="color-swatch${S.viewport.bg==='linear-gradient(135deg,#fa709a,#fee140)'?' active':''}" data-bg="linear-gradient(135deg,#fa709a,#fee140)" style="background:linear-gradient(135deg,#fa709a,#fee140)" title="Sunset"></div>
        <div class="color-swatch${S.viewport.bg==='#f5f5f5'?' active':''}" data-bg="#f5f5f5" style="background:#f5f5f5" title="White"></div>
      </div>
    </div>
    <div class="inspector-divider"></div>
    <!-- Zoom default level -->
    <div class="panel-section">
      <div class="panel-section-title">Default Zoom Level</div>
      <div class="panel-row" style="margin-bottom:6px"><span class="panel-label">New zoom regions will use:</span><span class="panel-value" id="val-default-zoom">${lastZoomScale.toFixed(1)}×</span></div>
      <div class="zoom-presets" id="default-zoom-presets">
        ${[1.25,1.5,2,2.5,3,4,5].map(s => `<button class="zoom-preset${Math.abs(lastZoomScale-s)<0.01?' active':''}" data-scale="${s}">${s}×</button>`).join('')}
      </div>
    </div>
    <div class="inspector-divider"></div>
    <!-- Empty state hint -->
    <div class="inspector-empty" style="height:auto; padding:16px 0">
      <div class="inspector-empty-sub">Select a clip or zoom region on the timeline to see its properties</div>
    </div>`;
  wireDefaultInspectorEvents();
}

function wireDefaultInspectorEvents() {
  // Viewport sliders
  const rSlider = $('slider-radius');
  if (rSlider) {
    rSlider.addEventListener('input', e => { S.viewport.radius = +e.target.value; $('val-radius').textContent = S.viewport.radius+'px'; renderCurrentFrame(); });
    rSlider.addEventListener('change', snapshot);
  }
  const pSlider = $('slider-padding');
  if (pSlider) {
    pSlider.addEventListener('input', e => { S.viewport.padding = +e.target.value; $('val-padding').textContent = S.viewport.padding+'px'; renderCurrentFrame(); });
    pSlider.addEventListener('change', snapshot);
  }
  const sSlider = $('slider-shadow');
  if (sSlider) {
    sSlider.addEventListener('input', e => { S.viewport.shadow = +e.target.value; $('val-shadow').textContent = S.viewport.shadow+'px'; renderCurrentFrame(); });
    sSlider.addEventListener('change', snapshot);
  }
  // Background swatches
  document.querySelectorAll('#bg-swatches .color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      S.viewport.bg = sw.dataset.bg;
      document.querySelectorAll('#bg-swatches .color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      renderCurrentFrame(); snapshot();
    });
  });
  // Default zoom presets
  document.querySelectorAll('#default-zoom-presets .zoom-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      lastZoomScale = +btn.dataset.scale;
      document.querySelectorAll('#default-zoom-presets .zoom-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('val-default-zoom').textContent = lastZoomScale.toFixed(1) + '×';
      showToast('Default zoom set to ' + lastZoomScale.toFixed(1) + '×');
    });
  });
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
    showToast('Zoom added (3s, ' + lastZoomScale.toFixed(1) + '×)');
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
    const t = getTimeFromMouseEvent(e);
    resizeBoundary(resizeDrag.leftId, resizeDrag.rightId, t);
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
['select','cut'].forEach(tool => {
  const btnId = tool === 'cut' ? 'sb-cut' : 'sb-select';
  $(btnId).addEventListener('click', () => {
    S.tool = tool === 'cut' ? 'split' : tool;
    document.querySelectorAll('#sidebar .sidebar-btn').forEach(b => b.classList.remove('active'));
    $(btnId).classList.add('active');
    // Exit silence mode when switching tools
    if (silenceMode) { silenceMode = false; clearSilenceOverlays(); silenceRegions = []; }
    updateInspector();
  });
});
// Silence detection tool (toggles mode, not a timeline tool)
$('sb-silence').addEventListener('click', () => {
  silenceMode = !silenceMode;
  document.querySelectorAll('#sidebar .sidebar-btn').forEach(b => b.classList.remove('active'));
  if (silenceMode) {
    $('sb-silence').classList.add('active');
    // Make sure the panel is visible
    $('tools-panel').classList.remove('collapsed');
  } else {
    // Restore previous tool highlight
    const curBtn = S.tool === 'split' ? 'sb-cut' : 'sb-select';
    $(curBtn).classList.add('active');
    clearSilenceOverlays();
    silenceRegions = [];
  }
  updateInspector();
});
$('sb-undo').addEventListener('click', () => { if(undo()) { buildTimeline(); syncSettingsUI(); renderCurrentFrame(); showToast('Undo'); }});
$('sb-redo').addEventListener('click', () => { if(redo()) { buildTimeline(); syncSettingsUI(); renderCurrentFrame(); showToast('Redo'); }});
$('sb-reset').addEventListener('click', () => {
  if (!confirm('Reset all edits? This will remove all cuts, deletions, and zoom regions.')) return;
  initSegments(S.duration);
  S.selectedSegId = null;
  selectedZoomId = null;
  seekTo(0);
  buildTimeline();
  syncSettingsUI();
  renderCurrentFrame();
  showToast('All edits reset');
});
$('sb-settings').addEventListener('click', () => { $('tools-panel').classList.toggle('collapsed'); });

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

function showExportDialog() {
  const srcName = S.filePath.split('/').pop().replace(/\.[^.]+$/, '');
  const defaultName = srcName + '-edited';
  const hasZoom = S.zoomKeyframes.length > 0;

  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog-box">
      <div class="dialog-title">Export Video</div>
      <div class="dialog-sub">Choose a name and format. WebM exports instantly. Other formats require FFmpeg.</div>
      <div style="margin-bottom:14px">
        <label style="font:500 10px/1 'Inter',sans-serif; color:#6b7280; display:block; margin-bottom:6px">Filename</label>
        <input type="text" id="export-filename" value="${defaultName}" style="
          width:100%; padding:8px 12px; border-radius:8px; border:1px solid #1e1e2a;
          background:rgba(255,255,255,0.03); color:#e2e2e8; font:500 12px/1 'Inter',sans-serif;
          outline:none;
        " />
      </div>
      ${hasZoom ? `
      <div style="margin-bottom:14px; padding:10px 12px; border-radius:8px; border:1px solid rgba(245,158,11,0.12); background:rgba(245,158,11,0.03);">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          <span style="font:600 10px/1 'Inter',sans-serif; color:rgba(245,158,11,0.6);">${S.zoomKeyframes.length} Zoom Region${S.zoomKeyframes.length > 1 ? 's' : ''} — Preview Only</span>
        </div>
        <div style="font:400 9px/1.3 'Inter',sans-serif; color:rgba(245,158,11,0.4); padding-left:20px;">
          Zoom effects with cursor tracking are visible during preview playback. Export with zoom is coming in a future update.
        </div>
      </div>
      ` : ''}
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px;">
        <button class="dialog-btn primary" data-fmt="webm">WebM (Instant)</button>
        <button class="dialog-btn" data-fmt="mp4">MP4</button>
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

  overlay.querySelector('#export-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('[data-fmt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = nameInput.value.trim() || defaultName;
      overlay.remove();
      doExport(btn.dataset.fmt, name);
    });
  });
}

async function doExport(format, filename) {
  saveProject();
  showToast('Starting export (' + format.toUpperCase() + ')…');
  if (window.veditor && window.veditor.exportVideo) {
    try {
      const result = await window.veditor.exportVideo({
        filePath: S.filePath, format, filename,
        segments: S.segments, // send all — backend filters active ones
        mutedSegments: S.segments.filter(s => s.isMuted).map(s => ({ startSec: s.startSec, endSec: s.endSec })),
        viewport: S.viewport,
        zoomRegions: [], // zoom export disabled — preview only for now
      });
      if (result && result.ok) {
        showToast('✅ Exported: ' + (result.path || '').split('/').pop());
      } else {
        showToast('⚠ Export failed: ' + (result ? result.error : 'Unknown error'));
      }
    } catch (err) {
      showToast('⚠ Export error: ' + err.message);
    }
  }
}

// Listen for export progress/completion from main process
if (window.veditor && window.veditor.onExportProgress) {
  window.veditor.onExportProgress((data) => {
    if (data && data.percent) showToast('Exporting… ' + data.percent + '%');
  });
}
if (window.veditor && window.veditor.onExportDone) {
  window.veditor.onExportDone((data) => {
    if (data && data.ok) {
      showToast('✅ Export complete: ' + (data.path || '').split('/').pop());
    } else if (data && data.error) {
      showToast('⚠ Export failed: ' + data.error);
    }
  });
}

function saveProject() {
  if (window.veditor && window.veditor.saveProject) {
    window.veditor.saveProject(S.filePath, { segments: S.segments, zoomKeyframes: S.zoomKeyframes, viewport: S.viewport });
  }
}
setInterval(saveProject, 30000);

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
  if (kl === 'z' && meta && e.shiftKey) { e.preventDefault(); $('sb-redo').click(); return; }
  if (kl === 'z' && meta) { e.preventDefault(); $('sb-undo').click(); return; }

  // Tool selection
  if (kl === 'v' && !meta) { $('sb-select').click(); return; }
  if (kl === 's' && !meta) { $('sb-cut').click(); return; }
});

/* ═══ WINDOW RESIZE ═══ */
window.addEventListener('resize', () => { drawTimelineWaveform(); renderCurrentFrame(); });
