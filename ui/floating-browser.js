document.addEventListener('DOMContentLoaded', async () => {
  const api = window.browserAPI;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const urlInput     = document.getElementById('url-input');
  const tabList      = document.getElementById('tab-list');
  const btnNewTab    = document.getElementById('btn-new-tab');
  const btnStar      = document.getElementById('btn-star');
  const starSvg      = document.getElementById('star-svg');
  const findBar      = document.getElementById('find-bar');
  const findInput    = document.getElementById('find-input');
  const findCount    = document.getElementById('find-count');
  const settingsPanel = document.getElementById('settings-panel');
  const restoreOverlay = document.getElementById('restore-overlay');
  const bmBar        = document.getElementById('bm-bar');
  const bmBarInner   = document.getElementById('bm-bar-inner');
  const bmCtxMenu    = document.getElementById('bm-ctx-menu');

  // ── State ──────────────────────────────────────────────────────────────────
  let tabs        = [];
  let activeTabId = null;
  let bookmarks   = [];
  let downloads   = {};
  let zoomPct     = 100;
  let findQuery   = '';
  let settingsOpen = false;
  let bmCtxData   = null;      // { url, title, el } — active context menu target

  // ── Silence reset ─────────────────────────────────────────────────────────
  document.addEventListener('mousedown', () => api.resetSilence(), true);
  document.addEventListener('keydown',   () => api.resetSilence(), true);

  // ── Tab rendering ─────────────────────────────────────────────────────────
  function buildTabEl(tab) {
    const el = document.createElement('div');
    el.className = 'tab-item' + (tab.isSettings ? ' tab-settings' : '') +
                   ((tab.isSettings ? settingsOpen : tab.id === activeTabId) ? ' active' : '');
    if (!tab.isSettings) el.dataset.tabId = tab.id;

    if (tab.isSettings) {
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span class="tab-title">Settings</span><span class="tab-close" id="tab-settings-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>`;
      el.querySelector('#tab-settings-close').addEventListener('mousedown', (e) => { e.stopPropagation(); closeSettings(); });
      el.addEventListener('mousedown', (e) => { if (!e.target.closest('#tab-settings-close')) openSettings(); });
      return el;
    }

    const fav = document.createElement('span'); fav.className = 'tab-favicon';
    fav.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
    const title = document.createElement('span'); title.className = 'tab-title'; title.textContent = tab.title || 'New Tab';
    const close = document.createElement('span'); close.className = 'tab-close';
    close.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    close.addEventListener('mousedown', (e) => { e.stopPropagation(); api.closeTab(tab.id); });
    el.append(fav, title, close);
    el.addEventListener('mousedown', (e) => { if (e.target === close || close.contains(e.target)) return; api.switchTab(tab.id); });
    return el;
  }

  function renderTabs() {
    tabList.innerHTML = '';
    tabs.forEach(tab => tabList.appendChild(buildTabEl(tab)));
    if (settingsOpen) tabList.appendChild(buildTabEl({ isSettings: true }));
    tabList.appendChild(btnNewTab);
  }

  // ── Settings panel as a "tab" ─────────────────────────────────────────────
  function openSettings() {
    if (settingsOpen) return;
    settingsOpen = true;
    api.settingsToggle && api.settingsToggle(true);
    settingsPanel.classList.add('open');
    urlInput.value = 'Browser Settings';
    urlInput.disabled = true;
    renderTabs();
    // Load data for all panes
    api.bookmarksGet().then(bks => { bookmarks = bks; renderBookmarks(); updateStar(urlInput.value); });
    renderDownloads();
    api.historyGet().then(renderHistory);
    if(typeof getPwds === 'function') getPwds();
    syncBmModeUI();
    const pct = document.getElementById('zoom-pct'); if (pct) pct.textContent = zoomPct + '%';
  }

  function closeSettings() {
    if (!settingsOpen) return;
    settingsOpen = false;
    api.settingsToggle && api.settingsToggle(false);
    settingsPanel.classList.remove('open');
    urlInput.disabled = false;
    const activeTab = tabs.find(t => t.id === activeTabId);
    urlInput.value = activeTab ? activeTab.url || '' : '';
    updateStar(urlInput.value);
    renderTabs();
  }

  function toggleSettings() { settingsOpen ? closeSettings() : openSettings(); }

  // ── Bookmark state ─────────────────────────────────────────────────────────
  function updateStar(url) {
    const isBookmarked = bookmarks.some(b => b.url === url);
    starSvg.setAttribute('fill', isBookmarked ? 'var(--accent)' : 'none');
    starSvg.setAttribute('stroke', isBookmarked ? 'var(--accent)' : 'currentColor');
  }

  // ── Bookmarks bar (Removed) ───────────────────────────────────────────────
  // ── Bookmarks context menu ─────────────────────────────────────────────────
  function openBmCtx(e, bk) {
    bmCtxData = bk;
    bmCtxMenu.style.display = 'block';
    let x = e.clientX, y = e.clientY;
    const menuW = 180, menuH = bmCtxMenu.offsetHeight || 120;
    if (x + menuW > window.innerWidth)  x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    bmCtxMenu.style.left = x + 'px';
    bmCtxMenu.style.top  = y + 'px';
  }
  function closeBmCtx() { bmCtxMenu.style.display = 'none'; bmCtxData = null; }

  document.addEventListener('mousedown', (e) => { if (!bmCtxMenu.contains(e.target)) closeBmCtx(); });
  bmCtxMenu.querySelectorAll('.bm-ctx-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (!bmCtxData && action !== 'bar-settings') { closeBmCtx(); return; }
      if (action === 'open') api.navigate(bmCtxData.url);
      else if (action === 'new-tab') { api.addTab(bmCtxData.url); }
      else if (action === 'delete') { api.bookmarkToggle(bmCtxData.url, bmCtxData.title); }
      else if (action === 'bar-settings') { openSettings(); /* switch to appearance */ document.querySelector('[data-pane="appearance"]')?.click(); }
      closeBmCtx();
    });
  });

  // ── Main process events ────────────────────────────────────────────────────
  api.onTabsInit(({ tabs: t, activeTabId: aid }) => {
    restoreOverlay.style.display = 'none';
    tabs = t; activeTabId = aid; renderTabs();
    const active = tabs.find(t => t.id === activeTabId);
    if (active && !settingsOpen) { urlInput.value = active.url || ''; updateStar(active.url); }
  });

  api.onTabAdded((tab) => { tabs.push(tab); activeTabId = tab.id; renderTabs(); if (!settingsOpen) { urlInput.value = tab.url || ''; updateStar(tab.url); urlInput.focus(); } });
  api.onTabRemoved(({ id }) => { tabs = tabs.filter(t => t.id !== id); renderTabs(); });
  api.onTabSwitched(({ id, url }) => { activeTabId = id; closeSettings(); renderTabs(); urlInput.value = url || ''; updateStar(url); });
  api.onTabUpdated(({ id, url, title }) => {
    const tab = tabs.find(t => t.id === id); if (!tab) return;
    tab.url = url; tab.title = title;
    if (id === activeTabId && !settingsOpen) { urlInput.value = url || ''; updateStar(url); }
    const el = tabList.querySelector(`[data-tab-id="${id}"]`);
    if (el) { const tEl = el.querySelector('.tab-title'); if (tEl) tEl.textContent = title || url || 'Loading…'; }
  });
  api.onPoweredOff(() => {
    tabs = []; activeTabId = null; renderTabs(); urlInput.value = '';
    restoreOverlay.style.display = 'flex'; settingsPanel.classList.remove('open'); settingsOpen = false; urlInput.disabled = false;
  });

  api.on('browser-url-changed', (url) => { if (!settingsOpen) { urlInput.value = url || ''; updateStar(url); } });
  api.on('browser-find-bar', (open) => { findBar.classList.toggle('open', open); if (!open) { findInput.value = ''; findCount.textContent = ''; } else findInput.focus(); });
  api.on('browser-find-result', ({ active, total }) => { findCount.textContent = total > 0 ? `${active}/${total}` : 'No results'; });
  api.on('browser-zoom-pct', (pct) => { zoomPct = pct; const el = document.getElementById('zoom-pct'); if (el) el.textContent = pct + '%'; });
  api.on('browser-bookmarks', (bks) => { bookmarks = bks; renderBookmarks(); if (!settingsOpen) updateStar(urlInput.value); });
  api.on('browser-history', (h) => renderHistory(h));
  api.on('browser-dl-start',    (dl) => { downloads[dl.id] = { ...dl, received: 0 }; renderDownloads(); });
  api.on('browser-dl-progress', (dl) => { if (downloads[dl.id]) { downloads[dl.id].received = dl.received; downloads[dl.id].total = dl.total; renderDownloads(); } });
  api.on('browser-dl-done',     (dl) => { if (downloads[dl.id]) { downloads[dl.id].state = dl.state; renderDownloads(); } });

  // ── Window controls ────────────────────────────────────────────────────────
  document.getElementById('dot-close').addEventListener('click', () => api.close());
  document.getElementById('dot-min').addEventListener('click', () => api.minimize());
  document.getElementById('btn-power-off').addEventListener('click', () => api.powerOff());
  document.getElementById('btn-restore-session').addEventListener('click', () => { restoreOverlay.style.display = 'none'; api.restoreSession(); });
  document.getElementById('btn-new-session').addEventListener('click', () => { restoreOverlay.style.display = 'none'; api.newSession(); });

  // ── URL bar ────────────────────────────────────────────────────────────────
  urlInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || settingsOpen) return;
    let url = urlInput.value.trim(); if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://'))
      url = (url.includes('.') && !url.includes(' ')) ? 'https://' + url : 'https://google.com/search?q=' + encodeURIComponent(url);
    urlInput.blur(); api.navigate(url);
  });
  urlInput.addEventListener('click', () => { if (!settingsOpen) urlInput.select(); });
  urlInput.addEventListener('focus', () => { if (!settingsOpen) urlInput.select(); });

  // ── Nav buttons ────────────────────────────────────────────────────────────
  document.getElementById('btn-back').addEventListener('click', () => api.goBack());
  document.getElementById('btn-forward').addEventListener('click', () => api.goForward());
  document.getElementById('btn-reload').addEventListener('click', () => api.reload());
  btnNewTab.addEventListener('click', () => api.addTab());

  // ── Settings & Star ────────────────────────────────────────────────────────
  document.getElementById('btn-settings-open').addEventListener('click', toggleSettings);
  document.getElementById('btn-sp-close').addEventListener('click', () => { if (settingsOpen) toggleSettings(); });
  btnStar.addEventListener('click', () => { if (!settingsOpen) api.bookmarkToggle(urlInput.value, urlInput.value); });

  // ── Find bar ───────────────────────────────────────────────────────────────
  document.getElementById('btn-find-open').addEventListener('click', () => api.findShow());
  document.getElementById('find-close').addEventListener('click', () => api.findHide());
  findInput.addEventListener('input', () => {
    findQuery = findInput.value;
    if (findQuery) api.findQuery(findQuery, true, false); else findCount.textContent = '';
  });
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') api.findQuery(findQuery, !e.shiftKey, true);
    if (e.key === 'Escape') api.findHide();
  });
  document.getElementById('find-prev').addEventListener('click', () => api.findQuery(findQuery, false, true));
  document.getElementById('find-next').addEventListener('click', () => api.findQuery(findQuery, true, true));
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); api.findShow(); } });

  // ── Settings nav tab switching ─────────────────────────────────────────────
  document.querySelectorAll('.sp-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sp-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sp-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('sp-' + btn.dataset.pane)?.classList.add('active');
      if (btn.dataset.pane === 'history') api.historyGet().then(renderHistory);
    });
  });

  // ── Bookmarks rendering ────────────────────────────────────────────────────
  function renderBookmarks() {
    const list = document.getElementById('bk-list'), empty = document.getElementById('bk-empty');
    if (!list || !empty) return;
    list.innerHTML = '';
    empty.style.display = bookmarks.length ? 'none' : 'block';
    bookmarks.forEach(bk => {
      const row = document.createElement('div'); row.className = 'sp-row';
      const info = document.createElement('div'); info.className = 'sp-row-info';
      const t = document.createElement('div'); t.className = 'sp-row-title'; t.textContent = bk.title || bk.url;
      const u = document.createElement('div'); u.className = 'sp-row-url'; u.textContent = bk.url;
      const del = document.createElement('button'); del.className = 'sp-row-del'; del.textContent = 'Remove';
      del.addEventListener('click', () => api.bookmarkToggle(bk.url, bk.title));
      info.append(t, u); row.append(info, del);
      row.addEventListener('click', (e) => { if (e.target !== del) { closeSettings(); api.navigate(bk.url); } });
      list.appendChild(row);
    });
  }

  // ── History rendering ──────────────────────────────────────────────────────
  function renderHistory(hist) {
    const list = document.getElementById('hist-list'), empty = document.getElementById('hist-empty');
    list.innerHTML = ''; const h = hist || [];
    empty.style.display = h.length ? 'none' : 'block';
    h.slice(0, 100).forEach(item => {
      const row = document.createElement('div'); row.className = 'sp-row';
      const info = document.createElement('div'); info.className = 'sp-row-info';
      const t = document.createElement('div'); t.className = 'sp-row-title'; t.textContent = item.title || item.url;
      const u = document.createElement('div'); u.className = 'sp-row-url'; u.textContent = new Date(item.visitedAt).toLocaleString();
      info.append(t, u); row.appendChild(info);
      row.addEventListener('click', () => { closeSettings(); api.navigate(item.url); });
      list.appendChild(row);
    });
  }
  document.getElementById('btn-clear-history').addEventListener('click', () => { api.historyClear(); renderHistory([]); });

  // ── Downloads rendering ────────────────────────────────────────────────────
  function renderDownloads() {
    const list = document.getElementById('dl-list'), empty = document.getElementById('dl-empty');
    const dls = Object.values(downloads); list.innerHTML = '';
    empty.style.display = dls.length ? 'none' : 'block';
    dls.slice().reverse().forEach(dl => {
      const row = document.createElement('div'); row.className = 'sp-row dl-row';
      const info = document.createElement('div'); info.className = 'sp-row-info';
      const name = document.createElement('div'); name.className = 'sp-row-title'; name.textContent = dl.filename;
      const status = document.createElement('div'); status.className = 'sp-row-url';
      status.textContent = dl.state === 'completed' ? 'Completed' : dl.state === 'cancelled' ? 'Cancelled' : dl.total ? `Downloading… ${Math.round((dl.received / dl.total)*100)}%` : 'Downloading…';
      info.append(name, status);
      if (dl.state !== 'cancelled') { const bar = document.createElement('div'); bar.className = 'dl-bar'; const fill = document.createElement('div'); fill.className = 'dl-fill'; fill.style.width = dl.state === 'completed' ? '100%' : (dl.total ? Math.round((dl.received/dl.total)*100)+'%' : '5%'); bar.appendChild(fill); info.appendChild(bar); }
      row.appendChild(info); list.appendChild(row);
    });
  }
  // ── Bookmarks, History & Downloads Navbar Buttons ──────────────────────────
  document.getElementById('btn-bookmarks-open')?.addEventListener('click', () => {
    openSettings();
    document.querySelector('[data-pane="bookmarks"]')?.click();
  });
  
  document.getElementById('btn-history-drop')?.addEventListener('click', () => {
    openSettings();
    document.querySelector('[data-pane="history"]')?.click();
  });
  
  document.getElementById('btn-dl-drop')?.addEventListener('click', () => {
    openSettings();
    document.querySelector('[data-pane="downloads"]')?.click();
  });

  // ── Password Management ────────────────────────────────────────────────────
  let savedPasswords = [];
  function renderPasswords() {
    const list = document.getElementById('pwd-list'), empty = document.getElementById('pwd-empty');
    if (!list || !empty) return;
    list.innerHTML = '';
    empty.style.display = savedPasswords.length ? 'none' : 'block';
    savedPasswords.forEach(p => {
      const row = document.createElement('div'); row.className = 'sp-row';
      row.innerHTML = `
        <div class="sp-row-info">
          <div class="sp-row-title">${p.url} (${p.username})</div>
          <div class="sp-row-url">••••••••</div>
        </div>
        <button class="sp-action-btn-sm pwd-copy">Copy</button>
        <button class="sp-row-del pwd-del">Delete</button>
      `;
      row.querySelector('.pwd-copy').addEventListener('click', () => { navigator.clipboard.writeText(p.password); alert('Password copied to clipboard'); });
      row.querySelector('.pwd-del').addEventListener('click', () => { api.passwordDelete(p.id).then(getPwds); });
      list.appendChild(row);
    });
  }
  function getPwds() { if(api.passwordsGet) api.passwordsGet().then(pwds => { savedPasswords = pwds || []; renderPasswords(); }); }
  document.getElementById('btn-add-password')?.addEventListener('click', () => {
    const url = prompt('Website URL (e.g. google.com):'); if (!url) return;
    const username = prompt('Username/Email:'); if (!username) return;
    const password = prompt('Password (text will be hidden later):'); if (!password) return;
    if(api.passwordSave) api.passwordSave({ id: Date.now().toString(), url, username, password }).then(getPwds);
  });

  // ── Zoom ───────────────────────────────────────────────────────────────────
  document.getElementById('btn-zoom-in').addEventListener('click', () => api.zoom(1));
  document.getElementById('btn-zoom-out').addEventListener('click', () => api.zoom(-1));
  document.getElementById('btn-zoom-reset').addEventListener('click', () => api.zoomReset());

  // ── DevTools ───────────────────────────────────────────────────────────────
  document.getElementById('btn-devtools').addEventListener('click', () => api.devtools());

  // ── Initial load ───────────────────────────────────────────────────────────
  bookmarks = await api.bookmarksGet();
  updateStar('');
});
