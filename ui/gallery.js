'use strict';

/* ═══════════════════════════════════════════════════════════
   MicTab Gallery — Renderer
   ═══════════════════════════════════════════════════════════ */

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

/* ── Title bar ── */
document.getElementById('btn-close').addEventListener('click', () => window.gallery.close());
document.getElementById('btn-minimize').addEventListener('click', () => window.gallery.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.gallery.maximize());

/* ── Utility ── */
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
searchInput.addEventListener('input', () => { currentSearch = searchInput.value; applyFilterSort(); });

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
    thumbHtml = `<img class="card-thumb" src="file://${encodeURI(file.path)}" loading="lazy">`;
  } else {
    thumbHtml = `<div class="card-thumb-placeholder" data-video-thumb="${file.path}">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </div>`;
  }

  // Actions
  const actions = `<div class="card-actions">
    <button class="card-action" data-action="reveal" data-path="${file.path}" title="Reveal in Finder">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    </button>
    <button class="card-action del" data-action="delete" data-path="${file.path}" data-name="${file.name}" title="Delete">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
  </div>`;

  card.innerHTML = `
    ${thumbHtml}
    ${badge}
    ${actions}
    <div class="card-overlay">
      <div class="card-name">${file.name}</div>
      <div class="card-meta">${formatDate(file.createdAt)} · ${formatSize(file.size)}</div>
    </div>`;

  // Click handler: Cmd/Ctrl = toggle selection, plain click = open (or select if others selected)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-action')) return; // don't interfere with action btns

    if (e.metaKey || e.ctrlKey) {
      // Toggle this card's selection
      toggleSelect(file.path);
      e.preventDefault();
    } else if (selectedPaths.size > 0) {
      // If there are selected items, click clears selection and opens
      clearSelection();
      openPlayer(file);
    } else {
      openPlayer(file);
    }
  });

  // Action buttons
  card.querySelectorAll('.card-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'reveal') window.gallery.revealInFinder(btn.dataset.path);
      if (action === 'delete') showDeleteConfirm(btn.dataset.path, btn.dataset.name);
    });
  });

  return card;
}

/* ── Video Thumbnail Generation ── */
function generateThumbnails() {
  const placeholders = gridView.querySelectorAll('[data-video-thumb]');
  for (const ph of placeholders) {
    const videoPath = ph.dataset.videoThumb;
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;
    tempVideo.src = 'file://' + encodeURI(videoPath);

    let durationResolved = false;
    let thumbCaptured = false;

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
      tempVideo.src = '';
      tempVideo.load();
    }

    tempVideo.addEventListener('loadedmetadata', () => {
      if (!isFinite(tempVideo.duration)) {
        // WebM duration bug: seek to huge time to force browser to calculate
        tempVideo.currentTime = 1e10;
      } else {
        durationResolved = true;
        tempVideo.currentTime = Math.min(1, tempVideo.duration * 0.1);
      }
    });

    tempVideo.addEventListener('seeked', () => {
      if (!durationResolved && isFinite(tempVideo.duration)) {
        durationResolved = true;
        // Now seek to a good frame for thumbnail
        tempVideo.currentTime = Math.min(1, tempVideo.duration * 0.1);
        return;
      }
      captureThumb();
    });
  }
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
    videoEl.src = 'file://' + encodeURI(file.path);
    videoEl.load();
    // Don't auto-play — show paused
    videoEl.pause();
    btnPlay.innerHTML = PLAY_SVG;
    resolvedDuration = false;
  } else {
    videoEl.style.display = 'none';
    imageEl.style.display = 'block';
    playerControls.style.display = 'none';
    imageEl.src = `file://${encodeURI(file.path)}?t=${Date.now()}`;
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
        <div style="font:500 11px/1 'Inter',sans-serif;color:#b4a8ff;margin-bottom:6px;">Downloading FFmpeg…</div>
        <div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.06);">
          <div id="ffmpeg-fill" style="height:100%;border-radius:2px;background:linear-gradient(90deg,#7c6fff,#a5b4fc);width:0%;transition:width 0.3s;"></div>
        </div>
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

    // Poll progress
    const pollId = setInterval(async () => {
      const st = await window.gallery.checkFFmpeg();
      if (st.progress) {
        overlay.querySelector('#ffmpeg-fill').style.width = st.progress + '%';
      }
      if (st.installed) {
        clearInterval(pollId);
        overlay.remove();
      }
    }, 500);

    try {
      await window.gallery.downloadFFmpeg();
      clearInterval(pollId);
      overlay.remove();
    } catch (err) {
      clearInterval(pollId);
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
      imageEl.src = `file://${encodeURI(file.path)}?t=${ts}`;
    }
  }
});
