const { BrowserWindow, WebContentsView, ipcMain, session, dialog, app, Menu, MenuItem, clipboard } = require('electron');
const path = require('path');
const store = require('../../store/config');

const HEADER_HEIGHT = 46;
const TAB_STRIP_HEIGHT = 32;
const FINDBAR_HEIGHT = 42;
let findBarOpen = false;
function contentOffset() { return HEADER_HEIGHT + TAB_STRIP_HEIGHT + (findBarOpen ? FINDBAR_HEIGHT : 0); }

let floatingWindow = null;
let tabs = [];        // [{ id, view, url, title }]
let activeTabId = null;
let nextTabId = 0;
let _resetSilenceTimer = null; // injected from main.js
let _isAppStartup = true;
let settingsOpen = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendToWindow(channel, ...args) {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send(channel, ...args);
  }
}

function resizeAllViews() {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  const [w, h] = floatingWindow.getSize();
  const off = contentOffset();
  tabs.forEach(tab => {
    tab.view.setBounds({ x: 0, y: off, width: w, height: Math.max(0, h - off) });
    tab.view.setVisible(!settingsOpen && tab.id === activeTabId);
  });
}

function activeView() {
  const tab = tabs.find(t => t.id === activeTabId);
  return tab ? tab.view : null;
}

function getTabState() {
  return tabs.map(t => ({ id: t.id, url: t.url, title: t.title }));
}

function saveState() {
  store.set('floatingBrowserState', {
    wasOpen: floatingWindow ? floatingWindow.isVisible() : false,
    tabs: getTabState(),
    activeTabId,
  });
}

// ─── Tab Management ─────────────────────────────────────────────────────────

function createTab(url = 'https://google.com') {
  const id = nextTabId++;
  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:floating-browser',
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../../ui', 'browser-view-preload.js')
    }
  });

  view.webContents.loadURL(url);

  // Track URL + history
  view.webContents.on('did-navigate', (_, navUrl) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    tab.url = navUrl;
    sendToWindow('browser-tab-updated', { id, url: navUrl, title: tab.title });
    sendToWindow('browser-url-changed', navUrl);
    const hist = store.get('floatingBrowserHistory') || [];
    hist.unshift({ url: navUrl, title: tab.title || navUrl, visitedAt: Date.now() });
    if (hist.length > 200) hist.splice(200);
    store.set('floatingBrowserHistory', hist);
    saveState();
  });
  view.webContents.on('did-navigate-in-page', (_, navUrl) => {
    const tab = tabs.find(t => t.id === id);
    if (tab) { tab.url = navUrl; sendToWindow('browser-tab-updated', { id, url: navUrl, title: tab.title }); sendToWindow('browser-url-changed', navUrl); saveState(); }
  });

  // Track title
  view.webContents.on('page-title-updated', (_, title) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    tab.title = title;
    sendToWindow('browser-tab-updated', { id, url: tab.url, title });
    const hist = store.get('floatingBrowserHistory') || [];
    if (hist[0] && hist[0].url === tab.url) { hist[0].title = title; store.set('floatingBrowserHistory', hist); }
    saveState();
  });

  // Loading state
  view.webContents.on('did-start-loading', () => sendToWindow('browser-loading', { id, loading: true }));
  view.webContents.on('did-stop-loading', () => {
    sendToWindow('browser-loading', { id, loading: false });
    const v = activeView();
    if (v && id === activeTabId) sendToWindow('browser-nav-state', { canBack: v.webContents.canGoBack(), canFwd: v.webContents.canGoForward() });
  });

  // Reset silence timer when user interacts with the browser content
  view.webContents.on('before-input-event', () => {
    if (_resetSilenceTimer) _resetSilenceTimer();
  });

  // Context Menu
  view.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    if (params.linkURL) {
      menu.append(new MenuItem({
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL)
      }));
    }

    if (params.hasImageContents) {
      menu.append(new MenuItem({
        label: 'Copy Image',
        role: 'copyImage'
      }));
    }

    if (params.selectionText) {
      menu.append(new MenuItem({
        label: 'Copy',
        role: 'copy'
      }));
      menu.append(new MenuItem({
        label: 'Search Google for "' + (params.selectionText.length > 15 ? params.selectionText.substring(0, 15) + '...' : params.selectionText) + '"',
        click: () => {
          const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(params.selectionText);
          createTab(searchUrl);
          resizeAllViews();
          saveState();
        }
      }));
    }

    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Undo', role: 'undo' }));
      menu.append(new MenuItem({ label: 'Redo', role: 'redo' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
      menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
      menu.append(new MenuItem({ label: 'Paste and Match Style', role: 'pasteAndMatchStyle' }));
      menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }));
    }

    if (!params.isEditable && !params.selectionText && !params.linkURL && !params.hasImageContents) {
      menu.append(new MenuItem({
        label: 'Back',
        click: () => view.webContents.goBack(),
        enabled: view.webContents.canGoBack()
      }));
      menu.append(new MenuItem({
        label: 'Forward',
        click: () => view.webContents.goForward(),
        enabled: view.webContents.canGoForward()
      }));
      menu.append(new MenuItem({
        label: 'Reload',
        click: () => view.webContents.reload()
      }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Inspect',
        click: () => view.webContents.inspectElement(params.x, params.y)
      }));
    }

    menu.popup({ window: floatingWindow });
  });

  const tab = { id, view, url, title: 'New Tab' };
  tabs.push(tab);

  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.contentView.addChildView(view);
  }

  return tab;
}

function switchTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  activeTabId = id;
  resizeAllViews();
  sendToWindow('browser-tab-switched', { id, url: tab.url, title: tab.title });
  saveState();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tab = tabs[idx];
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.contentView.removeChildView(tab.view);
  }
  tab.view.webContents.close();

  tabs.splice(idx, 1);
  sendToWindow('browser-tab-removed', { id });

  if (tabs.length === 0) {
    // No tabs left — treat as user manually closing: hide and mark wasOpen=false
    saveWasOpen(false);
    if (floatingWindow && !floatingWindow.isDestroyed()) floatingWindow.hide();
    return;
  }

  // Switch to adjacent tab
  if (activeTabId === id) {
    const newTab = tabs[Math.min(idx, tabs.length - 1)];
    switchTab(newTab.id);
  }
  saveState();
}

// ─── Window Lifecycle ────────────────────────────────────────────────────────

function createFloatingBrowser(savedTabs, savedActiveId, shouldFocus = false) {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    if (shouldFocus) {
      floatingWindow.show();
      floatingWindow.focus();
    } else {
      floatingWindow.showInactive();
    }
    return;
  }

  const savedPos = store.get('floatingBrowserPosition');
  const savedSize = store.get('floatingBrowserSize') || { width: 900, height: 620 };
  const posOptions = savedPos ? { x: savedPos.x, y: savedPos.y } : {};

  floatingWindow = new BrowserWindow({
    ...posOptions,
    width: savedSize.width,
    height: savedSize.height,
    minWidth: 500,
    minHeight: 350,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    hasShadow: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../ui', 'floating-browser-preload.js')
    }
  });

  if (process.platform === 'darwin') {
    floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    floatingWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  floatingWindow.loadFile(path.join(__dirname, '../../ui', 'floating-browser.html'));

  const finishInit = () => {
    if (store.get('floatingBrowserRestoreState')) {
      sendToWindow('browser-powered-off');
    } else {
      sendToWindow('browser-tabs-init', { tabs: getTabState(), activeTabId });
      resizeAllViews();
    }
  };

  floatingWindow.on('resize', resizeAllViews);
  floatingWindow.on('ready-to-show', () => {
    if (shouldFocus) {
      floatingWindow.show();
      floatingWindow.focus();
    } else {
      floatingWindow.showInactive();
    }
    finishInit();
  });
  floatingWindow.webContents.on('did-finish-load', finishInit);

  // Restore logic: on fresh app startup, move saved tabs to 'Restorable' and boot empty to save core RAM.
  if (_isAppStartup && (savedTabs && savedTabs.length > 0)) {
    store.set('floatingBrowserRestoreState', { tabs: savedTabs, activeTabId: savedActiveId });
    // Keep 'wasOpen' preference but clear the active tabs
    store.set('floatingBrowserState', {
      wasOpen: store.get('floatingBrowserState')?.wasOpen || false,
      tabs: [],
      activeTabId: null,
    });
  } else if (!store.get('floatingBrowserRestoreState')) {
    // Restore tabs from saved state, or create a default tab
    const tabsToRestore = (savedTabs && savedTabs.length > 0) ? savedTabs : [{ url: 'https://google.com', title: 'Google' }];
    tabsToRestore.forEach(t => createTab(t.url));

    // Activate the last active tab, or default to first
    const initialActive = (savedActiveId !== null && tabs.find(t => t.id === savedActiveId))
      ? savedActiveId
      : tabs[0].id;
    activeTabId = initialActive;

    // Attach all views to the window
    tabs.forEach(t => floatingWindow.contentView.addChildView(t.view));
  }
  _isAppStartup = false;

  // Track position/size persistence
  floatingWindow.on('moved', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      const [x, y] = floatingWindow.getPosition();
      store.set('floatingBrowserPosition', { x, y });
    }
  });
  floatingWindow.on('resized', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      const [w, h] = floatingWindow.getSize();
      store.set('floatingBrowserSize', { w, h });
    }
  });

  // Reset silence on any click inside the chrome UI
  floatingWindow.webContents.on('before-input-event', () => {
    if (_resetSilenceTimer) _resetSilenceTimer();
  });

  floatingWindow.on('closed', () => {
    floatingWindow = null;
    // Clear tab view references (views are destroyed with window)
    tabs = [];
    activeTabId = null;
    nextTabId = 0;
  });
}

function showFloatingBrowser(shouldFocus = false) {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    if (shouldFocus) {
      floatingWindow.show();
      floatingWindow.focus();
    } else {
      floatingWindow.showInactive();
    }
    // Sync tab strip in case renderer reloaded
    if (store.get('floatingBrowserRestoreState')) {
      sendToWindow('browser-powered-off');
    } else {
      sendToWindow('browser-tabs-init', { tabs: getTabState(), activeTabId });
      resizeAllViews();
    }
  } else {
    const state = store.get('floatingBrowserState') || {};
    createFloatingBrowser(state.tabs, state.activeTabId ?? null, shouldFocus);
  }
}

function hideFloatingBrowser(updateWasOpen = true) {
  if (floatingWindow && !floatingWindow.isDestroyed() && floatingWindow.isVisible()) {
    if (updateWasOpen) saveWasOpen(false);
    floatingWindow.hide();
  }
}

function isFloatingBrowserVisible() {
  return !!(floatingWindow && !floatingWindow.isDestroyed() && floatingWindow.isVisible());
}

// ─── Overlay State Sync ─────────────────────────────────────────────────────

/**
 * Called when the overlay HIDES.
 * Saves whether the browser was visible, then hides the browser.
 * The browser only lives while the overlay is active.
 */
function onOverlayHide() {
  const wasOpen = isFloatingBrowserVisible();
  // Persist state (including current wasOpen preference)
  const current = store.get('floatingBrowserState') || {};
  store.set('floatingBrowserState', {
    ...current,
    wasOpen,           // remember for next overlay activation
    tabs: getTabState(),
    activeTabId,
  });
  // Always hide the browser when the overlay goes away
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.hide();
  }
}

/**
 * Called when the overlay SHOWS.
 * Restores the browser ONLY if it was open when the overlay last hid.
 */
function onOverlayShow() {
  const state = store.get('floatingBrowserState') || {};
  if (state.wasOpen) {
    showFloatingBrowser();
  }
}

function saveWasOpen(val) {
  const current = store.get('floatingBrowserState') || {};
  store.set('floatingBrowserState', { ...current, wasOpen: val });
}

// ─── Toggle (for browser button in overlay) ─────────────────────────────────

function toggleFloatingBrowser() {
  if (isFloatingBrowserVisible()) {
    saveWasOpen(false);
    floatingWindow.hide();
  } else {
    saveWasOpen(true);
    showFloatingBrowser(true); // User fully intended to open it, so focus.
  }
}

// ─── Power Controls  ─────────────────────────────────────────────────────────

function powerOffBrowser() {
  if (tabs.length === 0) return; // Already off
  
  // Save current tabs to restore state
  store.set('floatingBrowserRestoreState', { tabs: getTabState(), activeTabId });
  
  // Destroy all webContents
  tabs.forEach(t => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      try { floatingWindow.contentView.removeChildView(t.view); } catch(e) {}
    }
    t.view.webContents.close();
  });
  
  tabs = [];
  activeTabId = null;
  saveState();
  sendToWindow('browser-powered-off');
}

function restoreBrowserSession() {
  const restoreState = store.get('floatingBrowserRestoreState');
  store.delete('floatingBrowserRestoreState');
  
  if (restoreState && restoreState.tabs && restoreState.tabs.length > 0) {
    restoreState.tabs.forEach(t => createTab(t.url));
    const initialActive = (restoreState.activeTabId !== null && tabs.find(t => t.id === restoreState.activeTabId))
      ? restoreState.activeTabId
      : tabs[0].id;
    activeTabId = initialActive;
  } else {
    createTab('https://google.com');
  }
  
  resizeAllViews();
  sendToWindow('browser-tabs-init', { tabs: getTabState(), activeTabId });
  saveState();
}

function newBrowserSession() {
  store.delete('floatingBrowserRestoreState');
  createTab('https://google.com');
  resizeAllViews();
  sendToWindow('browser-tabs-init', { tabs: getTabState(), activeTabId });
  saveState();
}

// ─── Browser Hard Reset ──────────────────────────────────────────────────────

async function hardResetBrowser() {
  // Hide and destroy the window
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    tabs.forEach(t => {
      try { floatingWindow.contentView.removeChildView(t.view); } catch(e) {}
    });
    floatingWindow.destroy();
    floatingWindow = null;
  }
  tabs = [];
  activeTabId = null;
  nextTabId = 0;

  // Clear persisted state
  store.delete('floatingBrowserState');
  store.delete('floatingBrowserPosition');
  store.delete('floatingBrowserSize');

  // Clear the browser session (logged-in accounts, cookies, cache)
  try {
    const browserSession = session.fromPartition('persist:floating-browser');
    await browserSession.clearStorageData();
    await browserSession.clearCache();
  } catch (e) {
    console.error('Browser reset error:', e);
  }
}

// ─── IPC Setup ───────────────────────────────────────────────────────────────

function setupFloatingBrowserIpc(resetSilenceTimerFn) {
  _resetSilenceTimer = resetSilenceTimerFn;

  let savedPasswords = [];
  const passwordsPath = path.join(app.getPath('userData'), 'floating_passwords.json');
  function loadPasswords() {
    try {
      if (fs.existsSync(passwordsPath)) savedPasswords = JSON.parse(fs.readFileSync(passwordsPath, 'utf8'));
    } catch(e) {}
  }
  function savePwds() {
    try { fs.writeFileSync(passwordsPath, JSON.stringify(savedPasswords, null, 2)); } catch(e) {}
  }
  loadPasswords();

  ipcMain.handle('floating-browser-passwords-get', () => savedPasswords);
  ipcMain.handle('floating-browser-password-save', (e, pwd) => {
    const existing = savedPasswords.findIndex(p => p.id === pwd.id);
    if (existing > -1) savedPasswords[existing] = pwd;
    else savedPasswords.push({ ...pwd, id: Date.now().toString() });
    savePwds();
    return true;
  });
  ipcMain.handle('floating-browser-password-delete', (e, id) => {
    savedPasswords = savedPasswords.filter(p => p.id !== id);
    savePwds();
    return true;
  });

  ipcMain.on('floating-browser-dl-action', (e, { id, action }) => {
    const dl = global_downloads[id];
    if (!dl) return;
    if (action === 'show' && dl.savePath) {
      shell.showItemInFolder(dl.savePath);
    } else if (action === 'delete') {
      if (dl.savePath && fs.existsSync(dl.savePath)) {
        try { fs.unlinkSync(dl.savePath); } catch(e) {}
      }
      delete global_downloads[id];
    }
  });

  ipcMain.on('toggle-floating-browser', () => toggleFloatingBrowser());

  // Close = hide (remember wasOpen=false)
  ipcMain.on('floating-browser-close', () => {
    saveWasOpen(false);
    if (floatingWindow && !floatingWindow.isDestroyed()) floatingWindow.hide();
  });

  ipcMain.on('floating-browser-minimize', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) floatingWindow.minimize();
  });

  ipcMain.on('floating-browser-power-off', () => powerOffBrowser());
  ipcMain.on('floating-browser-restore-session', () => restoreBrowserSession());
  ipcMain.on('floating-browser-new-session', () => newBrowserSession());

  // Tab management
  ipcMain.on('floating-browser-add-tab', (_, payload) => {
    if (!floatingWindow || floatingWindow.isDestroyed()) return;
    const url = typeof payload === 'string' ? payload : payload.url;
    const background = typeof payload === 'object' && payload.background;
    const tab = createTab(url || 'https://google.com');
    floatingWindow.contentView.addChildView(tab.view);
    sendToWindow('browser-tab-added', { id: tab.id, url: tab.url, title: tab.title });
    if (!background) switchTab(tab.id);
    saveState();
  });

  ipcMain.on('floating-browser-close-tab', (_, id) => closeTab(id));
  ipcMain.on('floating-browser-switch-tab', (_, id) => switchTab(id));

  // Navigation on active tab
  ipcMain.on('floating-browser-navigate', (_, url) => {
    if (_resetSilenceTimer) _resetSilenceTimer();
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) tab.view.webContents.loadURL(url);
  });

  ipcMain.on('floating-browser-back', () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && tab.view.webContents.canGoBack()) tab.view.webContents.goBack();
  });

  ipcMain.on('floating-browser-forward', () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && tab.view.webContents.canGoForward()) tab.view.webContents.goForward();
  });

  ipcMain.on('floating-browser-reload', () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) tab.view.webContents.reload();
  });

  // Reset silence timer from browser interaction
  ipcMain.on('floating-browser-user-activity', () => { if (_resetSilenceTimer) _resetSilenceTimer(); });

  // Find in page
  ipcMain.on('floating-browser-find-show', () => { findBarOpen = true; sendToWindow('browser-find-bar', true); resizeAllViews(); });
  ipcMain.on('floating-browser-find-hide', () => {
    findBarOpen = false; sendToWindow('browser-find-bar', false); resizeAllViews();
    const v = activeView(); if (v) v.webContents.stopFindInPage('clearSelection');
  });

  // Settings
  ipcMain.on('floating-browser-settings-toggle', (_, isOpen) => {
    settingsOpen = isOpen;
    resizeAllViews();
  });
  ipcMain.on('floating-browser-find-query', (_, { query, forward = true, findNext = false }) => {
    const v = activeView(); if (!v || !query) return;
    v.webContents.findInPage(query, { forward, findNext });
    v.webContents.once('found-in-page', (e, r) => sendToWindow('browser-find-result', { active: r.activeMatchOrdinal || 0, total: r.matches || 0 }));
  });

  // Zoom
  ipcMain.on('floating-browser-zoom', (_, delta) => {
    const v = activeView(); if (!v) return;
    v.webContents.setZoomLevel(v.webContents.getZoomLevel() + delta);
    sendToWindow('browser-zoom-pct', Math.round(v.webContents.getZoomFactor() * 100));
  });
  ipcMain.on('floating-browser-zoom-reset', () => {
    const v = activeView(); if (!v) return;
    v.webContents.setZoomLevel(0);
    sendToWindow('browser-zoom-pct', 100);
  });

  // DevTools
  ipcMain.on('floating-browser-devtools', () => { const v = activeView(); if (v) v.webContents.openDevTools({ mode: 'detach' }); });

  // Bookmarks
  ipcMain.handle('floating-browser-bookmarks-get', () => store.get('floatingBrowserBookmarks') || []);
  ipcMain.on('floating-browser-bookmark-toggle', (_, { url, title }) => {
    const bks = store.get('floatingBrowserBookmarks') || [];
    const idx = bks.findIndex(b => b.url === url);
    if (idx >= 0) bks.splice(idx, 1); else bks.unshift({ url, title, addedAt: Date.now() });
    store.set('floatingBrowserBookmarks', bks);
    sendToWindow('browser-bookmarks', bks);
  });

  // History
  ipcMain.handle('floating-browser-history-get', () => store.get('floatingBrowserHistory') || []);
  ipcMain.on('floating-browser-history-clear', () => { store.set('floatingBrowserHistory', []); sendToWindow('browser-history', []); });

  // Downloads (setup once)
  const dlSess = session.fromPartition('persist:floating-browser');
  dlSess.on('will-download', (event, item) => {
    const id = Date.now();
    const filename = item.getFilename();
    item.setSavePath(path.join(app.getPath('downloads'), filename));
    sendToWindow('browser-dl-start', { id, filename, total: item.getTotalBytes() });
    item.on('updated', (_, s) => { if (s === 'progressing') sendToWindow('browser-dl-progress', { id, received: item.getReceivedBytes(), total: item.getTotalBytes() }); });
    item.once('done', (_, s) => sendToWindow('browser-dl-done', { id, filename, state: s }));
  });



  // Hard reset
  ipcMain.handle('floating-browser-hard-reset', async () => { await hardResetBrowser(); return { ok: true }; });
}

module.exports = {
  setupFloatingBrowserIpc,
  toggleFloatingBrowser,
  onOverlayShow,
  onOverlayHide,
  isFloatingBrowserVisible,
};
