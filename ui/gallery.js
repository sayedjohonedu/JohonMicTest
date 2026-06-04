'use strict';

/* ═══════════════════════════════════════════════════════════
   MicTab Gallery — Renderer
   ═══════════════════════════════════════════════════════════ */

/* ── Theme synchronisation ── */
function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); }
window.gallery.getConfig().then(c => { if (c && c.theme) applyTheme(c.theme); }).catch(() => {});
window.gallery.onConfigUpdate(c => { if (c && c.theme) applyTheme(c.theme); });

/* ── Platform ── */
if (navigator.userAgent.includes('Mac')) document.body.classList.add('platform-mac');

let allFiles = [];
let filteredFiles = [];
let currentFilter = 'all';
let currentSort = 'date-desc';
let currentSearch = '';
let currentFile = null; // file object being played/viewed
let selectedPaths = new Set(); // multi-select tracking

/* ── DOM refs ── */
const gridView    = document.getElementById('grid-view');
const playerView  = document.getElementById('player-view');
const toolbar     = document.getElementById('toolbar');
const searchInput = document.getElementById('search-input');
const sortSelect  = document.getElementById('sort-select');
const videoEl     = document.getElementById('player-video');
const imageEl     = document.getElementById('player-image');
const progressBar = document.getElementById('progress-bar');
const progressFill= document.getElementById('progress-fill');
const timeDisplay = document.getElementById('time-display');
const btnPlay     = document.getElementById('btn-play');
const volumeSlider= document.getElementById('volume-slider');
const playerFilename = document.getElementById('player-filename');
const playerFileMeta = document.getElementById('player-file-meta');
const playerControls = document.getElementById('player-controls');

const PLAY_SVG  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
const PAUSE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';

/* ── Utility ── */

/**
 * Convert an absolute file-system path to a proper file:// URL.
 * On Windows paths start with a drive letter (C:\…) and use backslashes,
 * so we normalise to forward slashes and ensure three slashes after "file:".
 */
function toFileUrl(filePath) {
  let p = filePath.replace(/\\/g, '/');
  // Ensure the path starts with a leading slash (Windows drive letters don't have one)
  if (!p.startsWith('/')) p = '/' + p;
  return 'file://' + encodeURI(p);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatTime(sec) {
  if (!sec || !isFinite(sec) || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateFull(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getMonthKey(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ── Filter & Sort ── */
function applyFilterSort() {
  let files = [...allFiles];

  // Filter by type
  if (currentFilter !== 'all') {
    files = files.filter(f => f.type === currentFilter);
  }

  // Search
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    files = files.filter(f => f.name.toLowerCase().includes(q));
  }

  // Sort
  switch (currentSort) {
    case 'date-desc': files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
    case 'date-asc':  files.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
    case 'name-asc':  files.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'name-desc': files.sort((a, b) => b.name.localeCompare(a.name)); break;
    case 'size-desc': files.sort((a, b) => b.size - a.size); break;
    case 'size-asc':  files.sort((a, b) => a.size - b.size); break;
  }

  filteredFiles = files;
  renderGrid();
}

/* ── Filter buttons ── */
document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilterSort();
  });
});

sortSelect.addEventListener('change', () => { currentSort = sortSelect.value; applyFilterSort(); });
let _searchTimer = null;
// Debounced: prevents expensive grid re-renders on every keystroke
searchInput.addEventListener('input', () => {
  currentSearch = searchInput.value;
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { applyFilterSort(); }, 250);
});

/* ── Refresh ── */
document.getElementById('btn-refresh').addEventListener('click', async () => {
  allFiles = await window.gallery.scanFiles();
  applyFilterSort();
});

/* ── Open folder ── */
document.getElementById('btn-open-folder').addEventListener('click', async () => {
  const dir = await window.gallery.getSaveDir();
  window.gallery.revealInFinder(dir);
});

/* ═══════════════════════════════════════════════════════════
   GRID RENDERING
   ═══════════════════════════════════════════════════════════ */

function renderGrid() {
  gridView.innerHTML = '';

  if (filteredFiles.length === 0) {
    gridView.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
        </svg>
        <div class="empty-state-title">No media found</div>
        <div class="empty-state-sub">Record your screen or take a screenshot with Alt+Shift+S to see files here.</div>
      </div>`;
    return;
  }

  // Group by month
  const groups = {};
  for (const file of filteredFiles) {
    const key = getMonthKey(file.createdAt);
    if (!groups[key]) groups[key] = [];
    groups[key].push(file);
  }

  for (const [month, files] of Object.entries(groups)) {
    const header = document.createElement('div');
    header.className = 'month-header';
    header.innerHTML = `${month} <span class="month-count">${files.length} file${files.length > 1 ? 's' : ''}</span>`;
    gridView.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'media-grid';

    for (const file of files) {
      const card = createCard(file);
      grid.appendChild(card);
    }
    gridView.appendChild(grid);
  }

  // Generate thumbnails for videos
  generateThumbnails();
}

function createCard(file) {
  const card = document.createElement('div');
  card.className = 'media-card';
  card.dataset.path = file.path;

  // Badge
  const badge = file.type === 'video'
    ? '<span class="card-badge badge-video">VIDEO</span>'
    : '<span class="card-badge badge-image">IMG</span>';

  // Thumbnail
  let thumbHtml;
  if (file.type === 'image') {
    thumbHtml = `<img class="card-thumb" src="${toFileUrl(file.path)}" loading="lazy">`;
  } else {
    thumbHtml = `<div class="card-thumb-placeholder" data-video-thumb="${file.path}" data-video-mtime="${file.modifiedAt}">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </div>`;
  }

  card.innerHTML = `
    ${thumbHtml}
    ${badge}
    <div class="card-overlay">
      <div class="card-name">${file.name}</div>
      <div class="card-meta">${formatDate(file.createdAt)} · ${formatSize(file.size)}</div>
    </div>`;

  // Click handler: Cmd/Ctrl = toggle selection, plain click = open (or select if others selected)
  card.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey) {
      toggleSelect(file.path);
      e.preventDefault();
    } else if (selectedPaths.size > 0) {
      clearSelection();
      openPlayer(file);
    } else {
      openPlayer(file);
    }
  });

  // Right-click context menu
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showCardContextMenu(e.clientX, e.clientY, file);
  });

  return card;
}

/* ── Video Thumbnail Generation ── */

/**
 * Generates (or restores from cache) a single video thumbnail.
 * Returns a Promise that resolves when the thumbnail is shown (or fails).
 */
function generateOneThumbnail(ph) {
  return new Promise(async (resolve) => {
    const videoPath = ph.dataset.videoThumb;
    const videoMtime = ph.dataset.videoMtime || '';
    // Placeholder may have already been replaced (e.g. double renderGrid call)
    if (!ph.parentElement) { resolve(); return; }

    // ── Cache-hit: restore instantly without loading the video ──
    try {
      const cached = await window.gallery.getThumb(videoPath, videoMtime);
      if (cached) {
        // Make sure the placeholder is still in the DOM (grid may have re-rendered)
        if (!ph.parentElement) { resolve(); return; }
        const img = document.createElement('img');
        img.className = 'card-thumb';
        img.src = cached;
        ph.parentElement.replaceChild(img, ph);
        resolve();
        return;
      }
    } catch { /* cache unavailable — fall through to video decode */ }

    // ── Cache-miss: decode via <video> element ──
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;

    let durationResolved = false;
    let thumbCaptured = false;
    let settled = false;

    function done() {
      if (settled) return;
      settled = true;
      resolve();
    }

    function captureThumb() {
      if (thumbCaptured) return;
      thumbCaptured = true;

      const canvas = document.createElement('canvas');
      canvas.width = tempVideo.videoWidth || 320;
      canvas.height = tempVideo.videoHeight || 180;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

      const img = document.createElement('img');
      img.className = 'card-thumb';
      img.src = dataUrl;
      img.loading = 'lazy';
      if (ph.parentElement) ph.parentElement.replaceChild(img, ph);

      const card = img.closest('.media-card');
      if (card && isFinite(tempVideo.duration) && tempVideo.duration > 0) {
        const durEl = document.createElement('span');
        durEl.className = 'card-duration';
        durEl.textContent = formatTime(tempVideo.duration);
        card.appendChild(durEl);
      }

      // Persist the thumbnail so next open is instant
      window.gallery.saveThumb(videoPath, videoMtime, dataUrl).catch(() => {});

      tempVideo.src = '';
      tempVideo.load();
      done();
    }

    tempVideo.addEventListener('loadedmetadata', () => {
      if (!isFinite(tempVideo.duration)) {
        // WebM duration bug: seek far to force the browser to resolve duration
        tempVideo.currentTime = 1e10;
      } else {
        durationResolved = true;
        tempVideo.currentTime = Math.min(1, tempVideo.duration * 0.1);
      }
    });

    tempVideo.addEventListener('seeked', () => {
      if (!durationResolved && isFinite(tempVideo.duration)) {
        durationResolved = true;
        // Seek to the actual thumbnail frame now that duration is known
        tempVideo.currentTime = Math.min(1, tempVideo.duration * 0.1);
        return;
      }
      captureThumb();
    });

    // Safety timeout — if the video never loads/seeks, unblock the queue
    tempVideo.addEventListener('error', done);
    setTimeout(done, 8000);

    // Start loading only after all event listeners are set up
    tempVideo.src = toFileUrl(videoPath);
  });
}

/**
 * Kick off thumbnail generation for all video placeholder elements.
 * Runs at most CONCURRENCY thumbnails at a time so we don't saturate
 * disk I/O and the browser's video decode pipeline simultaneously.
 */
function generateThumbnails() {
  const CONCURRENCY = 3;
  const placeholders = Array.from(gridView.querySelectorAll('[data-video-thumb]'));
  if (placeholders.length === 0) return;

  let nextIndex = 0;

  function runNext() {
    if (nextIndex >= placeholders.length) return;
    const ph = placeholders[nextIndex++];
    generateOneThumbnail(ph).then(runNext);
  }

  // Seed the initial batch (up to CONCURRENCY workers)
  const initialBatch = Math.min(CONCURRENCY, placeholders.length);
  for (let i = 0; i < initialBatch; i++) runNext();
}

/* ═══════════════════════════════════════════════════════════
   PLAYER VIEW
   ═══════════════════════════════════════════════════════════ */

function openPlayer(file) {
  currentFile = file;
  selectedPaths.clear();
  updateSelectionUI();
  gridView.classList.add('hidden');
  toolbar.classList.add('hidden');
  bulkBar.classList.add('hidden');
  playerView.classList.add('active');

  playerFilename.textContent = file.name.replace(/\.[^.]+$/, ''); // name without ext
  playerFilename.contentEditable = 'false';
  playerFileMeta.textContent = `${formatSize(file.size)} · ${file.ext.toUpperCase()} · ${formatDateFull(file.createdAt)}`;

  // Show/hide export panel
  const exportPanel = document.getElementById('export-panel');
  if (file.type === 'video' && file.ext === 'webm') {
    exportPanel.style.display = 'flex';
  } else {
    exportPanel.style.display = 'none';
  }

  // Edit button is always visible — routes to Lens (images) or Video Editor (videos)
  const btnEdit = document.getElementById('btn-player-edit');
  if (btnEdit) btnEdit.style.display = 'flex';

  if (file.type === 'video') {
    videoEl.style.display = 'block';
    imageEl.style.display = 'none';
    playerControls.style.display = 'flex';
    videoEl.src = toFileUrl(file.path);
    videoEl.load();
    // Don't auto-play — show paused
    videoEl.pause();
    btnPlay.innerHTML = PLAY_SVG;
    resolvedDuration = false;
  } else {
    videoEl.style.display = 'none';
    imageEl.style.display = 'block';
    playerControls.style.display = 'none';
    imageEl.src = `${toFileUrl(file.path)}?t=${Date.now()}`;
  }
}

function closePlayer() {
  currentFile = null;
  playerView.classList.remove('active');
  gridView.classList.remove('hidden');
  toolbar.classList.remove('hidden');
  videoEl.pause();
  videoEl.src = '';
}

document.getElementById('btn-back-gallery').addEventListener('click', closePlayer);

/* ── Player: Reveal / Delete / Edit ── */
document.getElementById('btn-player-reveal').addEventListener('click', () => {
  if (currentFile) window.gallery.revealInFinder(currentFile.path);
});

document.getElementById('btn-player-delete').addEventListener('click', () => {
  if (currentFile) showDeleteConfirm(currentFile.path, currentFile.name);
});

document.getElementById('btn-player-edit').addEventListener('click', () => {
  if (!currentFile) return;
  if (currentFile.type === 'image') {
    // Open in Lens editor — Save will overwrite the original file
    window.gallery.openInLens(currentFile.path);
  } else if (currentFile.type === 'video') {
    // Open in Video Editor
    window.gallery.openEditor(currentFile.path);
  }
});

/* ── Player: Video Controls ── */
btnPlay.addEventListener('click', () => {
  if (videoEl.paused) { videoEl.play(); btnPlay.innerHTML = PAUSE_SVG; }
  else { videoEl.pause(); btnPlay.innerHTML = PLAY_SVG; }
});

videoEl.addEventListener('play', () => { btnPlay.innerHTML = PAUSE_SVG; });
videoEl.addEventListener('pause', () => { btnPlay.innerHTML = PLAY_SVG; });

/* ── WebM duration fix ── */
let resolvedDuration = false;

videoEl.addEventListener('timeupdate', () => {
  if (!isFinite(videoEl.duration) || !videoEl.duration) return;
  const pct = (videoEl.currentTime / videoEl.duration) * 100;
  progressFill.style.width = pct + '%';
  timeDisplay.textContent = formatTime(videoEl.currentTime) + ' / ' + formatTime(videoEl.duration);
});

videoEl.addEventListener('loadedmetadata', () => {
  if (!isFinite(videoEl.duration)) {
    // WebM duration bug: seek to huge time to force Chromium to resolve it
    resolvedDuration = false;
    videoEl.currentTime = 1e10;
  } else {
    resolvedDuration = true;
    timeDisplay.textContent = '0:00 / ' + formatTime(videoEl.duration);
  }
});

// After the seek-to-end trick, Chromium resolves the real duration
videoEl.addEventListener('seeked', () => {
  if (!resolvedDuration && isFinite(videoEl.duration)) {
    resolvedDuration = true;
    timeDisplay.textContent = '0:00 / ' + formatTime(videoEl.duration);
    videoEl.currentTime = 0; // reset to start
  }
});

videoEl.addEventListener('ended', () => { btnPlay.innerHTML = PLAY_SVG; });

// Seek on progress bar click
progressBar.addEventListener('click', (e) => {
  if (!videoEl.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  videoEl.currentTime = pct * videoEl.duration;
});

// Volume
volumeSlider.addEventListener('input', () => { videoEl.volume = parseFloat(volumeSlider.value); });

/* ── Player: Rename ── */
playerFilename.addEventListener('dblclick', () => {
  if (!currentFile) return;
  playerFilename.contentEditable = 'true';
  playerFilename.classList.add('editing');
  playerFilename.focus();
  // Select all text
  const range = document.createRange();
  range.selectNodeContents(playerFilename);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

playerFilename.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    await commitRename();
  }
  if (e.key === 'Escape') {
    playerFilename.textContent = currentFile.name.replace(/\.[^.]+$/, '');
    playerFilename.contentEditable = 'false';
    playerFilename.classList.remove('editing');
  }
});

playerFilename.addEventListener('blur', () => {
  if (playerFilename.contentEditable === 'true') commitRename();
});

async function commitRename() {
  if (!currentFile) return;
  playerFilename.contentEditable = 'false';
  playerFilename.classList.remove('editing');

  const newBaseName = playerFilename.textContent.trim();
  if (!newBaseName || newBaseName === currentFile.name.replace(/\.[^.]+$/, '')) return;

  const result = await window.gallery.renameFile(currentFile.path, newBaseName);
  if (result.ok) {
    currentFile.path = result.newPath;
    currentFile.name = result.newName;
    playerFilename.textContent = result.newName.replace(/\.[^.]+$/, '');
    // Refresh grid
    allFiles = await window.gallery.scanFiles();
    applyFilterSort();
  }
}

/* ═══════════════════════════════════════════════════════════
   CARD CONTEXT MENU (right-click)
   ═══════════════════════════════════════════════════════════ */

let _activeCtxMenu = null;

function dismissContextMenu() {
  if (_activeCtxMenu) {
    _activeCtxMenu.remove();
    _activeCtxMenu = null;
  }
}

function showCardContextMenu(x, y, file) {
  dismissContextMenu();

  const isSelected = selectedPaths.has(file.path);
  const hasMultiSelect = selectedPaths.size > 1;
  const openLabel = file.type === 'video' ? 'Play Video' : 'View Image';
  const editLabel = file.type === 'video' ? 'Open in Video Editor' : 'Open in Lens Editor';
  const clipLabel = file.type === 'image' ? 'Copy Image to Clipboard' : 'Copy File Path';

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <div class="ctx-item" data-action="open">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <span>${openLabel}</span>
    </div>
    <div class="ctx-item" data-action="edit">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      <span>${editLabel}</span>
    </div>
    <div class="ctx-item" data-action="select">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg>
      <span>${isSelected ? 'Deselect' : 'Select'}</span>
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-action="rename">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      <span>Rename</span>
    </div>
    <div class="ctx-item" data-action="reveal">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span>Open File Location</span>
    </div>
    <div class="ctx-item" data-action="clipboard">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"/></svg>
      <span>${clipLabel}</span>
    </div>
    <div class="ctx-item" data-action="copy-path">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      <span>Copy File Path</span>
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" data-action="delete">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      <span>Delete${hasMultiSelect && isSelected ? ` (${selectedPaths.size} selected)` : ''}</span>
    </div>
  `;

  // Position within viewport
  document.body.appendChild(menu);
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const px = x + mw > vw ? vw - mw - 6 : x;
  const py = y + mh > vh ? vh - mh - 6 : y;
  menu.style.left = px + 'px';
  menu.style.top  = py + 'px';
  menu.classList.add('ctx-menu-visible');
  _activeCtxMenu = menu;

  // Handle actions
  menu.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-action]');
    if (!item) return;
    const action = item.dataset.action;
    dismissContextMenu();

    switch (action) {
      case 'open':
        openPlayer(file);
        break;
      case 'edit':
        if (file.type === 'image') window.gallery.openInLens(file.path);
        else if (file.type === 'video') window.gallery.openEditor(file.path);
        break;
      case 'select':
        toggleSelect(file.path);
        break;
      case 'rename':
        showRenameDialog(file);
        break;
      case 'reveal':
        window.gallery.revealInFinder(file.path);
        break;
      case 'clipboard':
        if (file.type === 'image') {
          const r = await window.gallery.copyToClipboard(file.path, 'image');
          showToast(r.ok ? 'Image copied to clipboard' : 'Copy failed');
        } else {
          const r = await window.gallery.copyToClipboard(file.path, 'file');
          showToast(r.ok ? 'File path copied to clipboard' : 'Copy failed');
        }
        break;
      case 'copy-path':
        await window.gallery.copyToClipboard(file.path, 'file');
        showToast('File path copied to clipboard');
        break;
      case 'delete':
        if (hasMultiSelect && isSelected) {
          showBulkDeleteConfirm();
        } else {
          showDeleteConfirm(file.path, file.name);
        }
        break;
    }
  });

  // Dismiss on outside click or Escape
  const outsideClick = (e) => {
    if (!menu.contains(e.target)) {
      dismissContextMenu();
      document.removeEventListener('mousedown', outsideClick);
    }
  };
  const escKey = (e) => {
    if (e.key === 'Escape') {
      dismissContextMenu();
      document.removeEventListener('keydown', escKey);
    }
  };
  // Slight delay so the current mousedown doesn't immediately dismiss
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClick);
    document.addEventListener('keydown', escKey);
  }, 10);
}

/* ── Rename Dialog ── */
function showRenameDialog(file) {
  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
  const baseName = ext ? file.name.slice(0, -ext.length) : file.name;

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box rename-box">
      <div class="confirm-title">Rename File</div>
      <div class="rename-input-wrap">
        <input class="rename-input" id="rename-input" type="text" value="${baseName}" spellcheck="false" autocomplete="off">
        <span class="rename-ext">${ext}</span>
      </div>
      <div class="rename-hint">Press Enter to save · Escape to cancel</div>
      <div class="rename-error" id="rename-error"></div>
      <div class="confirm-actions">
        <button class="confirm-btn" id="rename-cancel">Cancel</button>
        <button class="confirm-btn" id="rename-confirm" style="background:rgba(124,111,255,0.15);border-color:rgba(124,111,255,0.3);color:#b4a8ff;">Rename</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#rename-input');
  const errorEl = overlay.querySelector('#rename-error');

  // Focus and select all on open
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });

  async function doRename() {
    const newName = input.value.trim();
    if (!newName) { errorEl.textContent = 'Name cannot be empty.'; return; }
    if (newName === baseName) { overlay.remove(); return; } // no change

    const result = await window.gallery.renameFile(file.path, newName);
    if (result.ok) {
      overlay.remove();
      // Update the file object in place so the card reflects new name
      const oldPath = file.path;
      file.path = result.newPath;
      file.name = result.newName;
      // Update the card DOM directly for instant feedback
      const card = gridView.querySelector(`.media-card[data-path="${oldPath}"]`);
      if (card) {
        card.dataset.path = result.newPath;
        const nameEl = card.querySelector('.card-name');
        if (nameEl) nameEl.textContent = result.newName;
      }
      // Also update allFiles array
      const idx = allFiles.findIndex(f => f.path === oldPath);
      if (idx >= 0) { allFiles[idx].path = result.newPath; allFiles[idx].name = result.newName; }
      showToast(`Renamed to "${result.newName}"`);
    } else {
      errorEl.textContent = result.error || 'Rename failed.';
      input.focus();
      input.select();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doRename(); }
    if (e.key === 'Escape') { overlay.remove(); }
  });
  overlay.querySelector('#rename-confirm').addEventListener('click', doRename);
  overlay.querySelector('#rename-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

/* ── Toast notification ── */
function showToast(message) {
  // Remove existing toasts
  document.querySelectorAll('.gallery-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'gallery-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  // Trigger fade-in
  requestAnimationFrame(() => toast.classList.add('gallery-toast-visible'));
  setTimeout(() => {
    toast.classList.remove('gallery-toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/* ── Delete Confirm ── */
function showDeleteConfirm(filePath, fileName) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-title">Delete "${fileName}"?</div>
      <div class="confirm-sub">This file will be moved to Trash.</div>
      <div class="confirm-actions">
        <button class="confirm-btn" id="confirm-cancel">Cancel</button>
        <button class="confirm-btn danger" id="confirm-delete">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#confirm-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#confirm-delete').addEventListener('click', async () => {
    const result = await window.gallery.deleteFile(filePath);
    overlay.remove();
    if (result.ok) {
      // If we're in player view for this file, go back to gallery
      if (currentFile && currentFile.path === filePath) closePlayer();
      allFiles = await window.gallery.scanFiles();
      applyFilterSort();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   MULTI-SELECT
   ═══════════════════════════════════════════════════════════ */

const bulkBar     = document.getElementById('bulk-bar');
const bulkCount   = document.getElementById('bulk-count');
const rubberBand  = document.getElementById('rubber-band');

function toggleSelect(filePath) {
  if (selectedPaths.has(filePath)) selectedPaths.delete(filePath);
  else selectedPaths.add(filePath);
  updateSelectionUI();
}

function clearSelection() {
  selectedPaths.clear();
  updateSelectionUI();
}

function selectAll() {
  for (const f of filteredFiles) selectedPaths.add(f.path);
  updateSelectionUI();
}

function updateSelectionUI() {
  // Update card visual state
  gridView.querySelectorAll('.media-card').forEach(card => {
    card.classList.toggle('selected', selectedPaths.has(card.dataset.path));
  });
  // Show/hide bulk bar
  if (selectedPaths.size > 0) {
    bulkBar.classList.remove('hidden');
    bulkCount.textContent = `${selectedPaths.size} selected`;
  } else {
    bulkBar.classList.add('hidden');
  }
}

/* ── Bulk bar buttons ── */
document.getElementById('bulk-select-all').addEventListener('click', selectAll);
document.getElementById('bulk-deselect').addEventListener('click', clearSelection);
document.getElementById('bulk-delete').addEventListener('click', () => {
  if (selectedPaths.size === 0) return;
  showBulkDeleteConfirm();
});

function showBulkDeleteConfirm() {
  const count = selectedPaths.size;
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-title">Delete ${count} file${count > 1 ? 's' : ''}?</div>
      <div class="confirm-sub">${count} file${count > 1 ? 's' : ''} will be moved to Trash. This cannot be undone.</div>
      <div class="confirm-actions">
        <button class="confirm-btn" id="confirm-cancel">Cancel</button>
        <button class="confirm-btn danger" id="confirm-delete">Delete ${count} File${count > 1 ? 's' : ''}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#confirm-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#confirm-delete').addEventListener('click', async () => {
    const paths = [...selectedPaths];
    overlay.remove();
    // Delete all selected files
    let deleted = 0;
    for (const p of paths) {
      const r = await window.gallery.deleteFile(p);
      if (r.ok) deleted++;
    }
    selectedPaths.clear();
    allFiles = await window.gallery.scanFiles();
    applyFilterSort();
  });
}

/* ═══════════════════════════════════════════════════════════
   RUBBER BAND DRAG SELECTION
   ═══════════════════════════════════════════════════════════ */

let rbActive = false;
let rbStartX = 0, rbStartY = 0;

gridView.addEventListener('mousedown', (e) => {
  // Only start rubber band from empty space (not from cards or actions)
  if (e.target.closest('.media-card') || e.target.closest('.month-header')) return;
  if (e.button !== 0) return; // left click only

  rbActive = true;
  rbStartX = e.clientX;
  rbStartY = e.clientY;

  // If not holding Cmd/Ctrl, clear existing selection
  if (!e.metaKey && !e.ctrlKey) {
    selectedPaths.clear();
    updateSelectionUI();
  }

  rubberBand.style.display = 'block';
  rubberBand.style.left = rbStartX + 'px';
  rubberBand.style.top = rbStartY + 'px';
  rubberBand.style.width = '0px';
  rubberBand.style.height = '0px';

  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!rbActive) return;

  const x = Math.min(e.clientX, rbStartX);
  const y = Math.min(e.clientY, rbStartY);
  const w = Math.abs(e.clientX - rbStartX);
  const h = Math.abs(e.clientY - rbStartY);

  rubberBand.style.left = x + 'px';
  rubberBand.style.top = y + 'px';
  rubberBand.style.width = w + 'px';
  rubberBand.style.height = h + 'px';

  // Hit-test cards against rubber band
  const rbRect = { left: x, top: y, right: x + w, bottom: y + h };
  gridView.querySelectorAll('.media-card').forEach(card => {
    const cardRect = card.getBoundingClientRect();
    const intersects =
      cardRect.left < rbRect.right &&
      cardRect.right > rbRect.left &&
      cardRect.top < rbRect.bottom &&
      cardRect.bottom > rbRect.top;

    if (intersects) {
      selectedPaths.add(card.dataset.path);
    }
  });
  updateSelectionUI();
});

document.addEventListener('mouseup', () => {
  if (!rbActive) return;
  rbActive = false;
  rubberBand.style.display = 'none';
});

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', (e) => {
  // Escape: deselect first, then close player, then close window
  if (e.key === 'Escape') {
    if (selectedPaths.size > 0) { clearSelection(); return; }
    if (currentFile) closePlayer();
    else window.gallery.close();
  }
  // Space to toggle play/pause in player view
  if (e.code === 'Space' && currentFile && currentFile.type === 'video') {
    e.preventDefault();
    btnPlay.click();
  }
  // Cmd/Ctrl+A to select all (in grid view)
  if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !currentFile) {
    e.preventDefault();
    selectAll();
  }
  // Delete / Backspace to delete selected
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPaths.size > 0 && !currentFile) {
    e.preventDefault();
    showBulkDeleteConfirm();
  }
});

/* ═══════════════════════════════════════════════════════════
   EXPORT / CONVERT PANEL
   ═══════════════════════════════════════════════════════════ */

function initExportPanel() {
  document.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentFile) return;
      const format = btn.dataset.format;
      // Check if FFmpeg is available
      const status = await window.gallery.checkFFmpeg();
      if (!status.installed) {
        showFFmpegInstallPrompt();
        return;
      }
      // Disable button and show converting state
      btn.disabled = true;
      const origText = btn.innerHTML;
      btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Converting…';
      try {
        const result = await window.gallery.convertFile(currentFile.path, format);
        if (result.ok) {
          btn.innerHTML = '✓ Done';
          // Reveal the exported file in Finder — same behaviour as editor export
          window.gallery.revealInFinder(result.convertedPath);
          // Refresh file list
          allFiles = await window.gallery.scanFiles();
          applyFilterSort();
        } else {
          btn.innerHTML = '✗ Failed';
        }
      } catch (err) {
        btn.innerHTML = '✗ Error';
      }
      setTimeout(() => { btn.innerHTML = origText; btn.disabled = false; }, 2500);
    });
  });
}

function showFFmpegInstallPrompt() {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-title">FFmpeg Required</div>
      <div class="confirm-sub">Video conversion requires FFmpeg (~70 MB download). It will be cached for future use.</div>
      <div id="ffmpeg-progress" style="display:none;margin-bottom:12px;">
        <div id="ffmpeg-status" style="font:500 11px/1 'Inter',sans-serif;color:#b4a8ff;margin-bottom:6px;">Downloading FFmpeg…</div>
        <div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.06);">
          <div id="ffmpeg-fill" style="height:100%;border-radius:2px;background:linear-gradient(90deg,#7c6fff,#a5b4fc);width:0%;transition:width 0.3s;"></div>
        </div>
        <div id="ffmpeg-detail" style="font:400 9px/1 'SF Mono',monospace;color:#4b5563;margin-top:4px;"></div>
      </div>
      <div class="confirm-actions">
        <button class="confirm-btn" id="ffmpeg-cancel">Cancel</button>
        <button class="confirm-btn" id="ffmpeg-download" style="background:rgba(124,111,255,0.15);border-color:rgba(124,111,255,0.3);color:#b4a8ff;">Download FFmpeg</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#ffmpeg-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#ffmpeg-download').addEventListener('click', async () => {
    const dlBtn = overlay.querySelector('#ffmpeg-download');
    dlBtn.disabled = true;
    dlBtn.textContent = 'Downloading…';
    overlay.querySelector('#ffmpeg-progress').style.display = 'block';
    overlay.querySelector('#ffmpeg-cancel').style.display = 'none';

    // Listen for real-time progress from main process
    if (window.gallery && window.gallery.onFFmpegProgress) {
      window.gallery.onFFmpegProgress((data) => {
        const fillEl = overlay.querySelector('#ffmpeg-fill');
        const statusEl = overlay.querySelector('#ffmpeg-status');
        const detailEl = overlay.querySelector('#ffmpeg-detail');
        if (fillEl) fillEl.style.width = data.pct + '%';
        if (statusEl) statusEl.textContent = data.status || 'Downloading…';
        if (detailEl) detailEl.textContent = data.detail || '';
      });
    }

    try {
      await window.gallery.downloadFFmpeg();
      overlay.remove();
    } catch (err) {
      dlBtn.textContent = 'Failed — Retry';
      dlBtn.disabled = false;
      overlay.querySelector('#ffmpeg-cancel').style.display = 'block';
    }
  });
}

initExportPanel();

/* ── Receive file list from main ── */
window.gallery.onFileList((files) => {
  allFiles = files;
  applyFilterSort();
});

/* ── Auto-navigate to a specific file (after recording or gallery edit) ── */
window.gallery.onNavigateToFile((filePath) => {
  const file = allFiles.find(f => f.path === filePath);
  if (file) {
    openPlayer(file);
    // If it's an image, force-reload to bust browser cache (in case it was just edited)
    if (file.type === 'image') {
      const ts = Date.now();
      imageEl.src = `${toFileUrl(file.path)}?t=${ts}`;
    }
  }
});
