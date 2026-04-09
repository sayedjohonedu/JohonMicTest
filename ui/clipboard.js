/* ══════════════════════════════════════════════════════════════════════════
   clipboard.js — MicTab Clipboard Manager UI Logic
   ══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let _state = {
  section:      'all',
  category:     null,
  search:       '',
  dateFilter:   '',
  typeFilter:   '',
  page:         0,
  view:         'list',      // 'list' | 'grid'
  entries:      [],
  hasMore:      false,
  total:        0,
  loading:      false,       // prevents concurrent page fetches
  selecting:    false,
  selectedIds:  new Set(),
  isPaid:       false,
  importRaw:    null,
  editingId:    null,
  confirmCb:    null,
  userCats:     [],
};

// Hoisted so they're available before settings functions are defined
let _hotkeyRecording = false;
let _cbConfig        = {};
let _newEntryTimer   = null;

// Debounce: only fire after `ms` ms of silence
function _debounce(fn, ms) {
  return function(...args) {
    clearTimeout(_newEntryTimer);
    _newEntryTimer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Each step wrapped individually — one IPC failure must not freeze the whole UI
  try { await loadLicenseStatus(); } catch (e) { console.warn('[CB] loadLicenseStatus:', e.message); }
  try { await loadConfig();        } catch (e) { console.warn('[CB] loadConfig:', e.message); }
  try { await loadUserCats();      } catch (e) { console.warn('[CB] loadUserCats:', e.message); _state.userCats = []; }
  try { await loadStats();         } catch (e) { console.warn('[CB] loadStats:', e.message); }
  try { await loadEntries(true);   } catch (e) { console.warn('[CB] loadEntries:', e.message); }

  // Apply theme happens globally via config updates or loadConfig

  // Sync theme immediately on config broadcast
  window.clipboardAPI.onConfigUpdate((cfg) => {
    if (cfg.theme) applyTheme(cfg.theme);
  });
  // becomes visible via show()/toggle(). Much more reliable than visibilitychange
  // in Electron on Windows during hide/show cycles.
  window.clipboardAPI.onWindowShown(() => {
    loadEntries(true).catch(() => {});
    loadStats().catch(() => {});
  });

  // Fallback: visibilitychange fires on first load and in some edge cases
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadEntries(true).catch(() => {});
      loadStats().catch(() => {});
    }
  });

  // Listen for real-time new entries — debounced so rapid copies don't lag
  const _onNewEntryDebounced = _debounce(async () => {
    await loadEntries(true).catch(() => {});
    await loadStats().catch(() => {});
  }, 250);
  window.clipboardAPI.onNewEntry(_onNewEntryDebounced);

  // Listen for expired entries prompt
  window.clipboardAPI.onExpiredPrompt(({ oldestDate }) => {
    showExpiredModal(oldestDate);
  });

  // ── Confirm modal: wire buttons directly (no overlay-click-to-close
  //    which was nuking confirmCb before the confirm button could read it)
  document.getElementById('confirm-cancel-btn').onclick = () => {
    document.getElementById('confirm-modal').style.display = 'none';
    _state.confirmCb = null;
  };
  document.getElementById('confirm-action-btn').onclick = async () => {
    document.getElementById('confirm-modal').style.display = 'none';
    const cb = _state.confirmCb;
    _state.confirmCb = null;
    if (cb) await cb();
  };

  // Alt+V while clipboard window is focused → hide
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyV' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      if (!_hotkeyRecording) {
        e.preventDefault();
        window.clipboardAPI.hideWindow();
      }
    }
  });

  // Infinite scroll — sentinel at bottom of list triggers next page load
  const sentinel = document.getElementById('scroll-sentinel');
  if (sentinel) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && _state.hasMore && !_state.loading) {
        loadMore();
      }
    }, { threshold: 0.1 });
    observer.observe(sentinel);
  }
});

// ── License / Config ───────────────────────────────────────────────────────
async function loadLicenseStatus() {
  const { isPaid } = await window.clipboardAPI.getLicenseStatus();
  _state.isPaid = isPaid;
}

async function loadConfig() {
  _cbConfig = await window.clipboardAPI.getConfig();
  if (_cbConfig && _cbConfig.theme) {
    applyTheme(_cbConfig.theme);
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────
async function loadStats() {
  const stats = await window.clipboardAPI.getStats();
  document.getElementById('stats-summary').textContent = `${stats.total} entries`;
  document.getElementById('badge-all').textContent  = stats.total;
  document.getElementById('badge-favs').textContent = stats.favorites;
  document.getElementById('badge-pins').textContent = stats.pinned;
  document.getElementById('badge-imgs').textContent = stats.images;
}

// ── User categories ────────────────────────────────────────────────────────
async function loadUserCats() {
  _state.userCats = await window.clipboardAPI.getUserCats();
  renderUserCatNav();
}

function renderUserCatNav() {
  const container = document.getElementById('user-cats-nav');
  container.innerHTML = '';
  for (const cat of _state.userCats) {
    const el = document.createElement('div');
    el.className = 'nav-item cat-item';
    el.dataset.cat = cat;
    el.onclick = () => switchCategory(cat, el);
    el.innerHTML = `<span class="nav-icon">🏷️</span> ${escHtml(cat)}`;
    container.appendChild(el);
  }
}

// ── Load entries ───────────────────────────────────────────────────────────
async function loadEntries(reset = false) {
  if (_state.loading && !reset) return;    // block concurrent page appends
  _state.loading = true;
  if (reset) { _state.page = 0; _state.entries = []; }

  const opts = buildQueryOpts();
  const result = await window.clipboardAPI.getHistory(opts);

  if (reset) {
    _state.entries = result.entries;
  } else {
    _state.entries = [..._state.entries, ...result.entries];
  }
  _state.total   = result.total;
  _state.hasMore = result.hasMore;
  _state.page    = result.page + 1;
  _state.loading = false;

  renderEntries(reset);
}


function buildQueryOpts() {
  const opts = {
    section:  _state.section,
    category: _state.category,
    page:     _state.page,
  };
  if (_state.search) opts.search = _state.search;
  if (_state.typeFilter === 'text')  { opts.section = 'all'; }
  if (_state.typeFilter === 'image') { opts.section = 'images'; }

  // Date filter → epoch range
  const { from, to } = dateFilterToRange(_state.dateFilter);
  if (from) opts.dateFrom = from;
  if (to)   opts.dateTo   = to;

  return opts;
}

function dateFilterToRange(filter) {
  if (!filter) return {};
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
  const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x.getTime(); };

  if (filter === 'today') return { from: startOfDay(now), to: endOfDay(now) };
  if (filter === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (filter === 'week') {
    const w = new Date(now); w.setDate(w.getDate() - 7);
    return { from: w.getTime(), to: now.getTime() };
  }
  if (filter === 'month') {
    const m = new Date(now); m.setDate(m.getDate() - 30);
    return { from: m.getTime(), to: now.getTime() };
  }
  return {};
}

async function loadMore() {
  await loadEntries(false);
}

async function refreshIfNeeded() {
  await loadEntries(true);
  await loadStats();
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderEntries(reset = true) {
  const list      = document.getElementById('entry-list');
  const emptyEl   = document.getElementById('empty-state');

  if (reset) list.innerHTML = '';

  // Set view class
  list.className = `entry-list${_state.view === 'grid' ? ' grid-view' : ''}`;

  if (_state.entries.length === 0) {
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';

  // Use DocumentFragment for fast batch DOM insert
  const frag = document.createDocumentFragment();
  for (const entry of _state.entries) {
    frag.appendChild(buildEntryCard(entry));
  }
  list.appendChild(frag);
}


function buildEntryCard(entry) {
  const card = document.createElement('div');
  card.className = [
    'entry-card',
    entry.isFavorite ? 'favorited' : '',
    entry.isPinned   ? 'pinned'    : '',
    _state.view === 'grid' ? 'grid-view' : '',
  ].filter(Boolean).join(' ');
  card.dataset.id = entry.id;

  // Checkbox (shown in selecting mode)
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'entry-checkbox';
  cb.checked = _state.selectedIds.has(entry.id);
  cb.onchange = () => toggleSelectEntry(entry.id, cb.checked);
  card.appendChild(cb);

  // Thumbnail / icon
  if (entry.type === 'image' && entry.imagePath) {
    const img = document.createElement('img');
    img.className = 'entry-thumb';
    img.src = `file://${entry.imagePath}`;
    img.alt = 'Clipboard Image';
    img.onclick = () => showImageModal(`file://${entry.imagePath}`);
    card.appendChild(img);
  } else if (entry.type === 'text') {
    const ph = document.createElement('div');
    ph.className = 'entry-thumb-placeholder';
    ph.textContent = getCategoryEmoji(entry.categories, entry.userCategories);
    card.appendChild(ph);
  }

  // Body
  const body = document.createElement('div');
  body.className = 'entry-body';

  // Preview text
  const preview = document.createElement('div');
  preview.className = 'entry-preview';
  preview.textContent = entry.type === 'text'
    ? (entry.text || '')
    : '📷 Image';
  preview.title = entry.type === 'text' ? (entry.text || '') : 'Click to preview';
  if (entry.type === 'image') {
    preview.onclick = () => showImageModal(`file://${entry.imagePath}`);
    preview.style.cursor = 'zoom-in';
  } else {
    preview.ondblclick = () => openEditModal(entry);
  }
  body.appendChild(preview);

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'entry-meta';

  const time = document.createElement('span');
  time.className = 'entry-time';
  time.textContent = formatTime(entry.timestamp);
  meta.appendChild(time);

  // Category tags
  const allCats = [...(entry.categories||[]), ...(entry.userCategories||[])];
  for (const cat of allCats.slice(0, 3)) {
    const tag = document.createElement('span');
    tag.className = 'entry-cat-tag';
    tag.textContent = cat;
    meta.appendChild(tag);
  }

  // Copy count
  if ((entry.copyCount || 0) > 1) {
    const badge = document.createElement('span');
    badge.className = 'entry-copy-badge';
    badge.innerHTML = `<span class="copy-star">✦</span>${entry.copyCount}`;
    badge.title = `Copied ${entry.copyCount} times`;
    meta.appendChild(badge);
  }

  body.appendChild(meta);
  card.appendChild(body);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'entry-actions';

  // Favorite button
  const favBtn = document.createElement('button');
  favBtn.className = `entry-btn fav${entry.isFavorite ? ' active' : ''}`;
  favBtn.innerHTML = '⭐';
  favBtn.title = entry.isFavorite ? 'Unfavorite' : 'Favorite';
  favBtn.onclick = (e) => { e.stopPropagation(); doToggleFavorite(entry, favBtn); };
  actions.appendChild(favBtn);

  // Pin button
  const pinBtn = document.createElement('button');
  pinBtn.className = `entry-btn pin${entry.isPinned ? ' active' : ''}`;
  pinBtn.innerHTML = '📌';
  pinBtn.title = entry.isPinned ? 'Unpin' : 'Pin';
  pinBtn.onclick = (e) => { e.stopPropagation(); doTogglePin(entry, pinBtn); };
  actions.appendChild(pinBtn);

  // Edit button (text only)
  if (entry.type === 'text') {
    const editBtn = document.createElement('button');
    editBtn.className = 'entry-btn';
    editBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>';
    editBtn.title = 'Edit';
    editBtn.onclick = (e) => { e.stopPropagation(); openEditModal(entry); };
    actions.appendChild(editBtn);
  }

  // Copy-to-clipboard button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'entry-btn';
  copyBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
  copyBtn.title = 'Copy to clipboard';
  copyBtn.onclick = (e) => { e.stopPropagation(); doCopyToClipboard(entry.id); };
  actions.appendChild(copyBtn);

  // Show in folder button (images only)
  if (entry.type === 'image' && entry.imagePath) {
    const folderBtn = document.createElement('button');
    folderBtn.className = 'entry-btn';
    folderBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
    folderBtn.title = 'Show in folder';
    folderBtn.onclick = (e) => { e.stopPropagation(); doShowInFolder(entry.id); };
    actions.appendChild(folderBtn);
  }

  // Add to Category button (tag icon) with dropdown
  const catBtn = document.createElement('button');
  catBtn.className = 'entry-btn cat-assign-btn';
  catBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
  catBtn.title = 'Add to category';
  catBtn.onclick = (e) => { e.stopPropagation(); showCatDropdown(entry, catBtn); };
  actions.appendChild(catBtn);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'entry-btn danger';
  delBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>';
  delBtn.title = 'Delete';
  delBtn.onclick = (e) => { e.stopPropagation(); doDeleteEntry(entry.id); };
  actions.appendChild(delBtn);

  card.appendChild(actions);

  // Click card to paste (text) or copy-to-clipboard (image)
  card.onclick = (e) => {
    // Don't act if click was on an action button/checkbox/thumbnail
    if (e.target.closest('.entry-actions') || e.target.closest('.entry-checkbox') || e.target.closest('.entry-thumb')) return;
    if (_state.selecting) {
      toggleSelectEntry(entry.id, !_state.selectedIds.has(entry.id));
      cb.checked = _state.selectedIds.has(entry.id);
      return;
    }
    if (entry.type === 'image') {
      // Copy image to clipboard and bump to top
      doCopyToClipboard(entry.id);
    } else {
      doPasteEntry(entry);
    }
  };

  return card;
}

function prependEntry(entry) {
  const list = document.getElementById('entry-list');
  const emptyEl = document.getElementById('empty-state');
  emptyEl.style.display = 'none';
  _state.entries.unshift(entry);
  const card = buildEntryCard(entry);
  if (list.firstChild) {
    list.insertBefore(card, list.firstChild);
  } else {
    list.appendChild(card);
  }
  updateStatsBadges();
}

// ── Entry actions ──────────────────────────────────────────────────────────
async function doToggleFavorite(entry, btn) {
  // Image favorites — paid only
  if (entry.type === 'image' && !_state.isPaid) {
    showUpsell('Image Favorites', 'Favoriting images is a paid feature. Upgrade to save images forever.');
    return;
  }
  const res = await window.clipboardAPI.toggleFavorite(entry.id);
  if (!res.ok) {
    if (res.reason === 'free_limit_reached') {
      showUpsell('Favorites Limit Reached',
        `Free plan allows up to ${res.limit} favorites. Delete an existing favorite or upgrade for unlimited.`);
    } else if (res.reason === 'image_fav_paid_only') {
      showUpsell('Image Favorites', 'Favoriting images requires a paid license.');
    }
    return;
  }
  entry.isFavorite = res.isFavorite;
  btn.classList.toggle('active', entry.isFavorite);
  btn.closest('.entry-card').classList.toggle('favorited', entry.isFavorite);
  loadStats();
}

async function doTogglePin(entry, btn) {
  const res = await window.clipboardAPI.togglePin(entry.id);
  if (!res.ok) {
    if (res.reason === 'pin_limit_reached') {
      showToast(`Pin limit reached (${res.limit} max). Remove a pin first.`, 'warn');
    }
    return;
  }
  entry.isPinned = res.isPinned;
  btn.classList.toggle('active', entry.isPinned);
  btn.closest('.entry-card').classList.toggle('pinned', entry.isPinned);
  loadStats();
}

async function doDeleteEntry(id) {
  const context = { section: _state.section, category: _state.category };
  const res = await window.clipboardAPI.deleteEntry(id, context);
  if (res.ok) {
    // Also, if we're in a category view and deleted the category link,
    // the backend will have just stripped the category. Let's refresh UI.
    removeCardFromDom(id);
    _state.entries = _state.entries.filter(e => e.id !== id);
    loadStats();
    if (_state.entries.length === 0) {
      document.getElementById('empty-state').style.display = 'flex';
    }
  }
}

async function doPasteEntry(entry) {
  const res = await window.clipboardAPI.pasteEntry(entry.id);
  if (res && res.mode === 'clipboard_copy') {
    showToast('Image copied to clipboard — paste it in your app (Ctrl+V)', 'info');
  }
}

async function doCopyToClipboard(id) {
  await window.clipboardAPI.copyToClipboard(id);
  showToast('Copied! Go to destination and paste (Ctrl+V / ⌘V)');
  // Refresh the list so the bumped entry appears on top
  await loadEntries(true);
  await loadStats();
}

async function doShowInFolder(id) {
  const res = await window.clipboardAPI.showInFolder(id);
  if (!res || !res.ok) {
    showToast('Could not locate the image file.', 'error');
  }
}

function removeCardFromDom(id) {
  const card = document.querySelector(`.entry-card[data-id="${id}"]`);
  if (card) card.remove();
}

// ── Category dropdown popover ──────────────────────────────────────────────
const BUILTIN_CATS = [
  { key: 'url',   emoji: '🔗', label: 'URL' },
  { key: 'email', emoji: '📧', label: 'Email' },
  { key: 'code',  emoji: '💻', label: 'Code' },
  { key: 'phone', emoji: '📱', label: 'Phone' },
];

let _activeCatPopover = null;

function showCatDropdown(entry, anchorBtn) {
  // Close any existing popover first
  closeCatDropdown();

  const popover = document.createElement('div');
  popover.className = 'cat-popover';
  popover.innerHTML = '<div class="cat-popover-title">Add to Category</div>';

  const allCats = [
    ...BUILTIN_CATS,
    ..._state.userCats.map(k => ({ key: k, emoji: '🏷️', label: k }))
  ];

  const currentCats = new Set([
    ...(entry.categories || []),
    ...(entry.userCategories || [])
  ]);

  for (const cat of allCats) {
    const already = currentCats.has(cat.key);
    const item = document.createElement('div');
    item.className = `cat-popover-item${already ? ' already' : ''}`;
    item.innerHTML = `<span>${cat.emoji}</span><span>${escHtml(cat.label)}</span>${already ? '<span class="cat-check">✓</span>' : ''}`;
    item.onclick = async (e) => {
      e.stopPropagation();
      closeCatDropdown();
      if (!already) {
        await doAssignCategory(entry, cat.key);
      }
    };
    popover.appendChild(item);
  }

  // Position near the button
  document.body.appendChild(popover);
  _activeCatPopover = popover;

  const rect = anchorBtn.getBoundingClientRect();
  const pw = popover.offsetWidth || 160;
  const ph = popover.offsetHeight || 200;
  let top  = rect.bottom + 4;
  let left = rect.left - pw + rect.width;
  if (left < 4) left = 4;
  if (top + ph > window.innerHeight) top = rect.top - ph - 4;
  popover.style.top  = `${top}px`;
  popover.style.left = `${left}px`;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeCatDropdown, { once: true });
  }, 0);
}

function closeCatDropdown() {
  if (_activeCatPopover) {
    _activeCatPopover.remove();
    _activeCatPopover = null;
  }
}

async function doAssignCategory(entry, catKey) {
  const res = await window.clipboardAPI.assignCategory(entry.id, catKey);
  if (res && res.ok) {
    // Update local entry state
    const isUser = !BUILTIN_CATS.find(c => c.key === catKey);
    if (isUser) {
      if (!entry.userCategories) entry.userCategories = [];
      if (!entry.userCategories.includes(catKey)) entry.userCategories.push(catKey);
    } else {
      if (!entry.categories) entry.categories = [];
      if (!entry.categories.includes(catKey)) entry.categories.push(catKey);
    }
    // Refresh the card's meta tags
    const card = document.querySelector(`.entry-card[data-id="${entry.id}"]`);
    if (card) {
      const meta = card.querySelector('.entry-meta');
      // Remove old tags
      card.querySelectorAll('.entry-cat-tag').forEach(t => t.remove());
      // Re-insert updated tags after the time element
      const allCats = [...(entry.categories||[]), ...(entry.userCategories||[])];
      const timeEl = meta.querySelector('.entry-time');
      for (const cat of allCats.slice(0, 3)) {
        const tag = document.createElement('span');
        tag.className = 'entry-cat-tag';
        tag.textContent = cat;
        if (timeEl && timeEl.nextSibling) {
          meta.insertBefore(tag, timeEl.nextSibling);
        } else {
          meta.appendChild(tag);
        }
      }
    }
    showToast(`Added to "${catKey}"`);
  } else {
    showToast('Failed to assign category', 'error');
  }
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function openEditModal(entry) {
  if (entry.type !== 'text') return;
  _state.editingId = entry.id;
  document.getElementById('edit-textarea').value = entry.text || '';
  document.getElementById('edit-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('edit-textarea').focus(), 100);
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('edit-modal')) return;
  document.getElementById('edit-modal').style.display = 'none';
  _state.editingId = null;
}

async function saveEditedEntry() {
  const id = _state.editingId;
  const newText = document.getElementById('edit-textarea').value.trim();
  if (!id || !newText) return;

  const res = await window.clipboardAPI.editEntry(id, newText);
  if (res.ok) {
    // Update card in DOM
    const card = document.querySelector(`.entry-card[data-id="${id}"]`);
    if (card) {
      const preview = card.querySelector('.entry-preview');
      if (preview) preview.textContent = newText;
    }
    // Update state
    const entry = _state.entries.find(e => e.id === id);
    if (entry) entry.text = newText;

    showToast('Entry updated!');
  }
  document.getElementById('edit-modal').style.display = 'none';
  _state.editingId = null;
}

// ── Expired modal ──────────────────────────────────────────────────────────
function showExpiredModal(isoDate) {
  const d = new Date(isoDate);
  document.getElementById('expired-oldest-date').textContent = d.toLocaleDateString();
  document.getElementById('expired-modal').style.display = 'flex';
}

async function onExpiredChoice(choice) {
  document.getElementById('expired-modal').style.display = 'none';
  if (choice === 'oldest') {
    await window.clipboardAPI.deleteOldestDay();
    showToast('Oldest day deleted.');
  } else if (choice === 'all') {
    await window.clipboardAPI.deleteAll();
    showToast('All history cleared.');
  } else if (choice === 'auto') {
    await window.clipboardAPI.confirmAutoDelete();
    showToast('Auto-delete enabled. Oldest day removed.');
  }
  await loadEntries(true);
  await loadStats();
}

// ── Delete all confirm ─────────────────────────────────────────────────────
function confirmDeleteAll() {
  _state.confirmCb = async () => {
    await window.clipboardAPI.deleteAll();
    _state.entries      = [];
    _state.total        = 0;
    _state.hasMore      = false;
    _state.page         = 0;
    _state.category     = null;
    _state.userCats     = [];
    document.getElementById('entry-list').innerHTML = '';
    document.getElementById('empty-state').style.display = 'flex';
    // Clear user category nav (all custom cats are gone)
    const userCatsNav = document.getElementById('user-cats-nav');
    if (userCatsNav) userCatsNav.innerHTML = '';
    // Hide category delete button
    const catClearBtn = document.getElementById('cat-clear-btn');
    if (catClearBtn) catClearBtn.style.display = 'none';
    await loadStats();
    showToast('All clipboard history cleared — fresh start!');
  };
  document.getElementById('confirm-title').textContent = '⚠️ Clear ALL History';
  document.getElementById('confirm-text').textContent  = 'This will permanently delete EVERYTHING — all entries, images, favorites, pins and categories. This cannot be undone.';
  document.getElementById('confirm-modal').style.display = 'flex';
}

// ── Delete category confirm ────────────────────────────────────────────────
function confirmDeleteCategory() {
  const cat = _state.category;
  if (!cat) return;
  _state.confirmCb = async () => {
    // Delete all visible entries in this category
    const idsToDelete = _state.entries.map(e => e.id);
    const context = { section: _state.section, category: cat };
    for (const id of idsToDelete) {
      await window.clipboardAPI.deleteEntry(id, context);
    }
    _state.entries = [];
    _state.total   = 0;
    _state.hasMore = false;
    _state.page    = 0;
    document.getElementById('entry-list').innerHTML = '';
    document.getElementById('empty-state').style.display = 'flex';
    await loadStats();
    showToast(`All entries in "${cat}" deleted.`);
  };
  document.getElementById('confirm-title').textContent = `🗑️ Delete All in "${cat}"`;
  document.getElementById('confirm-text').textContent  = `This will remove all entries from the "${cat}" category. This cannot be undone.`;
  document.getElementById('confirm-modal').style.display = 'flex';
}

// ── Import / Export ────────────────────────────────────────────────────────
async function doExport() {
  const res = await window.clipboardAPI.exportHistory();
  if (res.ok) {
    showToast('Backup exported! Your history and images are bundled inside the .mictab-backup file.');
  } else if (res.reason !== 'canceled') {
    showToast('Export failed: ' + res.reason, 'error');
  }
}

let _importFilePath = null;
async function doImport() {
  const res = await window.clipboardAPI.importHistory();
  if (!res.ok) { if (res.reason !== 'canceled') showToast('Import failed: ' + res.reason, 'error'); return; }
  _importFilePath = res.filePath;
  document.getElementById('import-count').textContent = res.count;
  document.getElementById('import-modal').style.display = 'flex';
}

function closeImportModal(e) {
  if (e && e.target !== document.getElementById('import-modal')) return;
  document.getElementById('import-modal').style.display = 'none';
}

async function commitImport(mode) {
  document.getElementById('import-modal').style.display = 'none';
  if (!_importFilePath) return;
  const res = await window.clipboardAPI.importCommit({ filePath: _importFilePath, mode });
  _importFilePath = null;
  await loadEntries(true);
  await loadStats();
  if (res && res.ok) {
    showToast(`Imported ${res.added} entries successfully!`);
  } else {
    showToast('Import failed.', 'error');
  }
}

// ── Image folder ───────────────────────────────────────────────────────────
async function openImagesFolder() {
  await window.clipboardAPI.openImagesFolder();
}

// ── Image preview modal ────────────────────────────────────────────────────
function showImageModal(src) {
  document.getElementById('image-preview-img').src = src;
  document.getElementById('image-modal').style.display = 'flex';
}

function closeImageModal() {
  document.getElementById('image-modal').style.display = 'none';
  document.getElementById('image-preview-img').src = '';
}

// ── Upsell modal ───────────────────────────────────────────────────────────
function showUpsell(title, text) {
  document.getElementById('upsell-title').textContent = title;
  document.getElementById('upsell-text').textContent  = text;
  document.getElementById('upsell-modal').style.display = 'flex';
}

function closeUpsellModal(e) {
  if (e && e.target !== document.getElementById('upsell-modal')) return;
  document.getElementById('upsell-modal').style.display = 'none';
}

function openUpgrade() {
  window.clipboardAPI.openUrl('https://johonsayed.gumroad.com/l/JunoverseAI-Dictation');
}

// ── Category management ────────────────────────────────────────────────────
function showAddCategoryPrompt() {
  document.getElementById('addcat-input').value = '';
  document.getElementById('addcat-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('addcat-input').focus(), 100);
}

function closeAddCatModal(e) {
  if (e && e.target !== document.getElementById('addcat-modal')) return;
  document.getElementById('addcat-modal').style.display = 'none';
}

async function confirmAddCategory() {
  const name = document.getElementById('addcat-input').value.trim();
  if (!name) return;
  document.getElementById('addcat-modal').style.display = 'none';
  if (!_state.userCats.includes(name)) {
    _state.userCats.push(name);
    renderUserCatNav();
  }
}

// ── Multi-select ───────────────────────────────────────────────────────────
function toggleSelectEntry(id, selected) {
  if (selected) { _state.selectedIds.add(id); }
  else          { _state.selectedIds.delete(id); }

  _state.selecting = _state.selectedIds.size > 0;
  document.getElementById('entry-list').classList.toggle('selecting', _state.selecting);
  updateBatchControls();
}

function clearSelection() {
  _state.selectedIds.clear();
  _state.selecting = false;
  document.getElementById('entry-list').classList.remove('selecting');
  document.querySelectorAll('.entry-checkbox').forEach(c => c.checked = false);
  updateBatchControls();
}

async function batchDelete() {
  const ids = [..._state.selectedIds];
  const context = { section: _state.section, category: _state.category };
  for (const id of ids) {
    await window.clipboardAPI.deleteEntry(id, context);
    removeCardFromDom(id);
  }
  _state.entries = _state.entries.filter(e => !_state.selectedIds.has(e.id));
  clearSelection();
  showToast(`Deleted ${ids.length} entries.`);
  loadStats();
  if (_state.entries.length === 0) document.getElementById('empty-state').style.display = 'flex';
}

function updateBatchControls() {
  const bc = document.getElementById('batch-controls');
  const count = _state.selectedIds.size;
  bc.style.display = count > 0 ? 'flex' : 'none';
  document.getElementById('batch-count').textContent = `${count} selected`;
}

// ── Navigation ─────────────────────────────────────────────────────────────
function switchSection(section, el) {
  const settingsPanel = document.getElementById('settings-panel');
  const contentBody   = document.getElementById('content-body');
  const filterBar     = document.getElementById('filter-bar');
  const contentHeader = document.querySelector('.content-header');

  if (section === 'settings') {
    // Show settings panel, hide content
    settingsPanel.style.display = 'flex';
    contentBody.style.display   = 'none';
    if (filterBar)     filterBar.style.display = 'none';

    // Hide category delete button when entering settings
    const catClearBtnSettings = document.getElementById('cat-clear-btn');
    if (catClearBtnSettings) catClearBtnSettings.style.display = 'none';

    document.querySelectorAll('.nav-item, .sidebar-btn').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('panel-title').textContent = '⚙️ Settings';
    loadSettingsPanel();
    return;
  }

  // Show content, hide settings
  settingsPanel.style.display = 'none';
  contentBody.style.display   = 'flex';
  if (filterBar)     filterBar.style.display = 'flex';

  // Hide category delete button (only shown in category view)
  const catClearBtn = document.getElementById('cat-clear-btn');
  if (catClearBtn) catClearBtn.style.display = 'none';

  _state.section  = section;
  _state.category = null;
  _state.page     = 0;
  _state.selectedIds.clear();
  _state.selecting = false;

  // Update active nav
  document.querySelectorAll('.nav-item, .sidebar-btn').forEach(n => n.classList.remove('active'));
  el.classList.add('active');

  const titles = { all: 'All Items', favorites: '⭐ Favorites', pinned: '📌 Pinned', images: '🖼️ Images' };
  document.getElementById('panel-title').textContent = titles[section] || 'All Items';

  loadEntries(true);
}

function switchCategory(cat, el) {
  // Close settings panel if it's open (fix: clicking category while settings is open)
  const settingsPanel = document.getElementById('settings-panel');
  const contentBody   = document.getElementById('content-body');
  const filterBar     = document.getElementById('filter-bar');
  settingsPanel.style.display = 'none';
  contentBody.style.display   = 'flex';
  if (filterBar) filterBar.style.display = 'flex';

  _state.section  = 'all';
  _state.category = cat;
  _state.page     = 0;

  // Update active nav (also deactivate any sidebar buttons like Settings)
  document.querySelectorAll('.nav-item, .sidebar-btn').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-title').textContent = `🏷️ ${cat}`;

  // Show category delete button
  const catClearBtn = document.getElementById('cat-clear-btn');
  if (catClearBtn) catClearBtn.style.display = 'flex';

  loadEntries(true);
}

// ── Search & filters ───────────────────────────────────────────────────────
let _searchTimer = null;
function onSearch(val) {
  _state.search = val;
  _state.page   = 0;
  const clearBtn = document.getElementById('search-clear');
  clearBtn.style.display = val ? 'block' : 'none';
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => loadEntries(true), 250);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  onSearch('');
}

function onDateFilter(val) {
  _state.dateFilter = val;
  _state.page = 0;
  loadEntries(true);
}

function onTypeFilter(val) {
  _state.typeFilter = val;
  _state.page = 0;
  loadEntries(true);
}

// ── View toggle ────────────────────────────────────────────────────────────
function setView(view) {
  _state.view = view;
  document.getElementById('btn-list-view').classList.toggle('active', view === 'list');
  document.getElementById('btn-grid-view').classList.toggle('active', view === 'grid');
  renderEntries(false); // re-render current entries with new view class
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)   return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000)return `${Math.floor(diff/3600000)}h ago`;
  const days = Math.floor(diff/86400000);
  if (days === 1) return 'Yesterday';
  if (days < 7)   return `${days}d ago`;
  return d.toLocaleDateString();
}

function getCategoryEmoji(cats, userCats) {
  const all = [...(cats||[]), ...(userCats||[])];
  const map = { url: '🔗', email: '📧', code: '💻', phone: '📱', image: '🖼️' };
  for (const c of all) { if (map[c]) return map[c]; }
  return '📋';
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast visible';
  t.style.borderColor = type === 'error' ? 'rgba(255,71,87,0.4)'
    : type === 'warn'  ? 'rgba(255,165,0,0.4)'
    : type === 'info'  ? 'rgba(124,111,255,0.4)'
    : 'rgba(46,213,115,0.4)';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('visible'); }, 2800);
}

function updateStatsBadges() {
  loadStats();
}

function applyTheme(themeVal) {
  if (!themeVal) return;
  document.documentElement.setAttribute('data-theme', themeVal);
}

// Keyboard shortcut: Escape closes any open modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('edit-modal').style.display      = 'none';
    document.getElementById('confirm-modal').style.display   = 'none';
    document.getElementById('import-modal').style.display    = 'none';
    document.getElementById('image-modal').style.display     = 'none';
    document.getElementById('addcat-modal').style.display    = 'none';
    document.getElementById('upsell-modal').style.display    = 'none';
    clearSelection();
  }
});

// ── Settings Panel Logic ───────────────────────────────────────────────────

async function loadSettingsPanel() {
  _cbConfig = await window.clipboardAPI.getConfig() || {};
  const cb = _cbConfig.clipboard || {};

  // Hotkey
  const hotkey = cb.hotkey || 'Alt+V';
  document.getElementById('hotkey-display').textContent = hotkey;
  const hotkeyEnabled = cb.hotkeyEnabled !== false;
  document.getElementById('hotkey-enabled').checked = hotkeyEnabled;

  // Auto-delete
  document.getElementById('auto-delete-toggle').checked = !!cb.autoDelete;

  // Paste close
  document.getElementById('paste-close-toggle').checked = cb.closeAfterPaste !== false;

  // Retention (paid only)
  const isPaid = _state.isPaid;
  document.getElementById('free-retention-notice').style.display = isPaid ? 'none' : 'flex';
  document.getElementById('paid-retention-wrap').style.display   = isPaid ? 'block' : 'none';
  if (isPaid) {
    const sel = document.getElementById('retention-select');
    sel.value = cb.retention || '7days';
  }

  // License status
  if (isPaid) {
    document.getElementById('license-status-text').textContent = '✅ Paid Plan';
    document.getElementById('license-status-hint').textContent = 'Unlimited history & favorites';
    document.getElementById('upgrade-btn').style.display = 'none';
  } else {
    document.getElementById('license-status-text').textContent = '🔒 Free Plan';
    document.getElementById('license-status-hint').textContent = 'Limited to 7-day history & 10 favorites';
    document.getElementById('upgrade-btn').style.display = 'inline-flex';
  }
}

async function saveSettings() {
  const cfg = await window.clipboardAPI.getConfig() || {};
  if (!cfg.clipboard) cfg.clipboard = {};

  cfg.clipboard.autoDelete      = document.getElementById('auto-delete-toggle').checked;
  cfg.clipboard.closeAfterPaste = document.getElementById('paste-close-toggle').checked;
  cfg.clipboard.hotkeyEnabled   = document.getElementById('hotkey-enabled').checked;
  cfg.clipboard.hotkey          = document.getElementById('hotkey-display').textContent;

  if (_state.isPaid) {
    cfg.clipboard.retention = document.getElementById('retention-select').value;
  }

  await window.clipboardAPI.setClipboardConfig(cfg.clipboard);
  if (window.clipboardAPI.resumeHotkeys) {
    window.clipboardAPI.resumeHotkeys();
  }
  showToast('Settings saved!');
}

function resetHotkey() {
  document.getElementById('hotkey-display').textContent = 'Alt+V';
  saveSettings();
}

// Hotkey recorder
function startHotkeyRecord() {
  const rec = document.getElementById('hotkey-recorder');
  const disp = document.getElementById('hotkey-display');
  if (_hotkeyRecording) return;
  _hotkeyRecording = true;
  rec.classList.add('recording');
  disp.textContent = 'Press keys...';

  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const parts = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey)  parts.push('Meta');
    const key = e.key;
    if (!['Control','Alt','Shift','Meta'].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
    }
    if (parts.length > 1 || (parts.length === 1 && !['Control','Alt','Shift','Meta'].includes(parts[0]))) {
      const combo = parts.join('+');
      disp.textContent = combo;
      rec.classList.remove('recording');
      _hotkeyRecording = false;
      window.removeEventListener('keydown', handler, true);
      saveSettings();
    }
  };
  window.addEventListener('keydown', handler, true);

  // Cancel if they click elsewhere
  setTimeout(() => {
    if (_hotkeyRecording) {
      _hotkeyRecording = false;
      rec.classList.remove('recording');
      disp.textContent = _cbConfig.clipboard?.hotkey || 'Alt+V';
      window.removeEventListener('keydown', handler, true);
    }
  }, 8000);
}

async function manualDeleteOldest() {
  _state.confirmCb = async () => {
    await window.clipboardAPI.deleteOldestDay();
    await loadEntries(true);
    await loadStats();
    showToast('Oldest day deleted.');
  };
  document.getElementById('confirm-title').textContent = '🗑 Delete Oldest Day';
  document.getElementById('confirm-text').textContent  = 'This will permanently delete all entries from the oldest recorded day.';
  document.getElementById('confirm-modal').style.display = 'flex';
}
