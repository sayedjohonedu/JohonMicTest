/**
 * clipboard-ipc.js
 * ──────────────────────────────────────────────────────────────────────────
 * All IPC handlers for the Clipboard Manager.
 * Isolated — does not touch main ipc-handlers.js internals.
 * Call setupClipboardIpc() once from ipc-handlers.js.
 * ──────────────────────────────────────────────────────────────────────────
 */

const { ipcMain, dialog, shell, clipboard, BrowserWindow, app, nativeImage } = require('electron');
const fs       = require('fs');
const path     = require('path');
const store    = require('../../store/config');
const hs       = require('./clipboard-history-store');
const cwm      = require('./clipboard-window-manager');
const { getOverlayWindow } = require('./window-manager');
const clipboardManager = require('./clipboard-manager'); // original inject helper
const { showEditorFromGallery } = require('./lens-manager');

function setupClipboardIpc() {

  // ── Z-order: keep overlay always above clipboard on Windows ──────────────
  // On Windows, all alwaysOnTop windows share HWND_TOPMOST level — last
  // focused window wins. By calling moveTop() on the overlay right after
  // the clipboard window shows, we push it back above the clipboard.
  cwm.setOverlayMover(() => {
    const ov = getOverlayWindow();
    if (ov && !ov.isDestroyed() && ov.isVisible()) {
      ov.moveTop();
    }
  });

  // ── Query ──────────────────────────────────────────────────────────────

  ipcMain.handle('cb-get-history', (_, opts) => {
    return hs.query(opts || {});
  });

  ipcMain.handle('cb-get-stats', () => hs.getStats());

  ipcMain.handle('cb-get-entry-dates', () => hs.getEntryDates());

  ipcMain.handle('cb-get-user-cats', () => {
    try {
      const meta = store.get('clipboardUserCategories') || [];
      // Merge any entry-level categories not yet in config meta
      const entryNames = hs.getUserCategoryList();
      const metaNames = new Set(meta.map(m => m.name));
      for (const name of entryNames) {
        if (!metaNames.has(name)) {
          meta.push({ name, emoji: '🏷️' });
        }
      }
      if (meta.length > 0) {
        store.set('clipboardUserCategories', meta);
      }
      return meta;
    } catch (e) {
      console.warn('[ClipboardIPC] getUserCats error:', e.message);
      return [];
    }
  });

  // ── Actions ────────────────────────────────────────────────────────────

  ipcMain.handle('cb-delete-entry', (_, id, context) => {
    return { ok: hs.deleteEntry(id, context) };
  });

  ipcMain.handle('cb-delete-all', () => {
    hs.deleteAll();
    return { ok: true };
  });

  ipcMain.handle('cb-delete-day', (_, dateMs) => {
    const count = hs.deleteDay(dateMs);
    return { ok: true, count };
  });

  ipcMain.handle('cb-delete-oldest-day', () => {
    const count = hs.deleteOldestDay();
    return { ok: true, count };
  });

  ipcMain.handle('cb-toggle-favorite', (_, id) => {
    const isPaid = store.get('licenseStatus') === 'active';
    return hs.toggleFavorite(id, isPaid);
  });

  ipcMain.handle('cb-toggle-pin', (_, id) => {
    return hs.togglePin(id);
  });

  ipcMain.handle('cb-edit-entry', (_, id, newText) => {
    const ok = hs.editEntryText(id, newText);
    return { ok };
  });

  ipcMain.handle('cb-set-user-cats', (_, id, cats) => {
    return { ok: hs.setUserCategories(id, cats) };
  });

  // ── Paste to app (same pattern as translator) ──────────────────────────

  ipcMain.handle('cb-paste-entry', async (_, id) => {
    // Get the entry text
    const result = hs.query({ search: null });
    // ... need to look up the specific entry
    // Use a direct approach: find by querying all and filtering
    const found = _findEntryById(id);
    if (!found) return { ok: false, reason: 'not_found' };

    if (found.type === 'image') {
      // For images: write to clipboard and let user paste manually
      // (can't inject images via robotjs)
      try {
        const { nativeImage } = require('electron');
        if (found.imagePath && fs.existsSync(found.imagePath)) {
          const img = nativeImage.createFromPath(found.imagePath);
          clipboard.writeImage(img);
          return { ok: true, mode: 'clipboard_copy' };
        }
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    }

    // Text: hide clipboard window → inject → restore
    const cw = cwm.getClipboardWindow();
    if (cw && !cw.isDestroyed()) {
      // Save window bounds before hiding — Windows minimize/restore can lose dimensions
      const savedBounds = cw.getBounds();

      if (process.platform === 'darwin') {
        app.hide();
      } else {
        // minimize() is required on Windows to transfer focus back to the previous app
        // (otherwise the injected keystrokes have no target window)
        cw.minimize();
        cw.hide();
      }

      await new Promise(r => setTimeout(r, 200));
      clipboardManager.injectText(found.text);

      await new Promise(r => setTimeout(r, 150));

      // Restore if "paste and close" is not enabled
      const pasteAndClose = store.get('clipboardPasteAndClose');
      if (!pasteAndClose) {
        if (process.platform === 'darwin') {
          app.show();
        } else {
          if (cw && !cw.isDestroyed()) {
            // Restore exact bounds to prevent window shrinking from minimize/restore cycle
            cw.setBounds(savedBounds);
            cw.show();
            cw.focus();
          }
        }
      }

      // Increment copy count
      found.copyCount = (found.copyCount || 1) + 1;
      hs.editEntryText(found.id, found.text); // re-save (bump timestamp is a side effect but minor)
    } else {
      clipboardManager.injectText(found.text);
    }

    return { ok: true, mode: 'injected' };
  });

  // Copy entry back to system clipboard without injecting
  ipcMain.handle('cb-copy-to-clipboard', (_, id) => {
    const found = _findEntryById(id);
    if (!found) return { ok: false };
    if (found.type === 'text') {
      clipboard.writeText(found.text);
    } else if (found.type === 'image' && found.imagePath) {
      try {
        const { nativeImage } = require('electron');
        if (fs.existsSync(found.imagePath)) {
          clipboard.writeImage(nativeImage.createFromPath(found.imagePath));
        }
      } catch (_) {}
    }
    // Bump to top of list
    hs.bumpToTop(id);
    return { ok: true };
  });

  // Bump entry to top without copying
  ipcMain.handle('cb-bump-to-top', (_, id) => {
    return { ok: hs.bumpToTop(id) };
  });

  // Show image file in system file manager (Finder / Explorer)
  ipcMain.handle('cb-show-in-folder', (_, id) => {
    const found = _findEntryById(id);
    if (!found || !found.imagePath) return { ok: false };
    if (fs.existsSync(found.imagePath)) {
      shell.showItemInFolder(found.imagePath);
      return { ok: true };
    }
    return { ok: false, reason: 'file_not_found' };
  });

  // ── Export / Import ────────────────────────────────────────────────────

  ipcMain.handle('cb-export-history', async (event) => {
    const bw = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(bw, {
      title: 'Export Clipboard History',
      defaultPath: `mictab-backup-${_dateStr()}.mictab-backup`,
      filters: [{ name: 'MicTab Backup', extensions: ['mictab-backup', 'zip'] }],
    });
    if (canceled || !filePath) return { ok: false, reason: 'canceled' };
    try {
      const userCatsMeta = store.get('clipboardUserCategories') || [];
      hs.exportBackup(filePath, userCatsMeta);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  });

  ipcMain.handle('cb-import-history', async (event) => {
    const bw = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(bw, {
      title: 'Import Clipboard History',
      filters: [{ name: 'MicTab Backup', extensions: ['mictab-backup', 'zip'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { ok: false, reason: 'canceled' };
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePaths[0]);
      const jsonEntry = zip.getEntry("history.json");
      if (!jsonEntry) return { ok: false, reason: 'invalid_format' };
      const parsed = JSON.parse(zip.readAsText(jsonEntry));
      return { ok: true, count: parsed.entries?.length || 0, filePath: filePaths[0] };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  });

  ipcMain.handle('cb-import-commit', (_, { filePath, mode, raw }) => {
    // raw is kept for backwards compat just in case old payload hits here
    const result = hs.importBackup(filePath, mode);
    // Restore user category metadata if present in the backup
    if (result.ok && result.userCategoryMeta && result.userCategoryMeta.length > 0) {
      const existing = store.get('clipboardUserCategories') || [];
      const existingNames = new Set(existing.map(c => c.name));
      for (const cat of result.userCategoryMeta) {
        if (!existingNames.has(cat.name)) {
          existing.push(cat);
        }
      }
      store.set('clipboardUserCategories', existing);
    }
    return result;
  });

  // ── Image folder ───────────────────────────────────────────────────────

  ipcMain.handle('cb-open-images-folder', () => {
    shell.openPath(hs.getImagesDirPath());
    return { ok: true };
  });

  // ── Open image in Lens Editor ──────────────────────────────────────────

  ipcMain.on('cb-open-in-lens', (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) return;
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1) || 'png';
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      const { width, height } = nativeImage.createFromBuffer(buf).getSize();
      showEditorFromGallery(dataUrl, filePath, { width, height });
      
      // We can also optionally minimize/hide the clipboard window here
      // const cw = cwm.getClipboardWindow();
      // if (cw && !cw.isDestroyed()) cw.hide();
    } catch (err) {
      console.error('[Clipboard→Lens] Failed to open file:', err.message);
    }
  });

  // ── Config ─────────────────────────────────────────────────────────────

  ipcMain.handle('cb-get-config', () => ({
    theme: store.get('theme') || 'light', // Add global UI theme
    clipboard: {
      hotkey:          store.get('clipboardHotkey')          || 'Alt+V',
      hotkeyEnabled:   store.get('clipboardHotkeyEnabled')   !== false,
      retention:       store.get('clipboardRetention')        || '7days',
      autoDelete:      !!store.get('clipboardAutoDelete'),
      closeAfterPaste: store.get('clipboardPasteAndClose')   !== false,
    }
  }));

  ipcMain.handle('cb-save-config', (_, cfg) => {
    if (cfg && typeof cfg === 'object') {
      Object.entries(cfg).forEach(([k, v]) => store.set(k, v));
    }
    return { ok: true };
  });

  // Save entire clipboard sub-config at once
  ipcMain.handle('cb-set-clipboard-config', (_, cb) => {
    if (!cb || typeof cb !== 'object') return { ok: false };
    if (cb.hotkey          !== undefined) store.set('clipboardHotkey',         cb.hotkey);
    if (cb.hotkeyEnabled   !== undefined) store.set('clipboardHotkeyEnabled',  cb.hotkeyEnabled);
    if (cb.retention       !== undefined) store.set('clipboardRetention',       cb.retention);
    if (cb.autoDelete      !== undefined) store.set('clipboardAutoDelete',      cb.autoDelete);
    if (cb.closeAfterPaste !== undefined) store.set('clipboardPasteAndClose',   cb.closeAfterPaste);
    return { ok: true };
  });

  ipcMain.handle('cb-confirm-auto-delete', () => {
    store.set('clipboardAutoDelete', true);
    hs.deleteOldestDay();
    return { ok: true };
  });

  // ── License ────────────────────────────────────────────────────────────

  ipcMain.handle('cb-get-license-status', () => ({
    status: store.get('licenseStatus') || 'trial',
    isPaid: store.get('licenseStatus') === 'active',
  }));

  // ── Window controls ────────────────────────────────────────────────────

  ipcMain.on('cb-close-window', (event) => {
    const bw = BrowserWindow.fromWebContents(event.sender);
    if (bw) bw.close();
  });

  ipcMain.on('cb-minimize-window', (event) => {
    const bw = BrowserWindow.fromWebContents(event.sender);
    if (bw) bw.minimize();
  });

  ipcMain.handle('cb-assign-category', (_, id, cat) => {
    const BUILTINS = ['url', 'email', 'code', 'phone', 'image'];
    if (BUILTINS.includes(cat)) {
      // For built-in categories, find the entry and update its categories array
      // We reuse the query mechanism, then call setUserCategories-style mutation
      const result = hs.addBuiltinCategory(id, cat);
      return result;
    } else {
      // User category — get current user cats and append
      return hs.addUserCategory(id, cat);
    }
  });

  ipcMain.on('cb-hide-window', (event) => {
    const bw = BrowserWindow.fromWebContents(event.sender);
    if (bw) bw.hide();
  });

  // ── User category management ─────────────────────────────────────────────

  ipcMain.handle('cb-delete-user-cat', (_, catName) => {
    hs.deleteUserCategory(catName);
    let meta = store.get('clipboardUserCategories') || [];
    meta = meta.filter(c => c.name !== catName);
    store.set('clipboardUserCategories', meta);
    return { ok: true };
  });

  ipcMain.handle('cb-save-user-cats-meta', (_, cats) => {
    store.set('clipboardUserCategories', cats);
    return { ok: true };
  });

  // ── Runtime clipboard enable/disable ────────────────────────────────────
  ipcMain.handle('cb-set-enabled', (_, enabled) => {
    store.set('clipboardEnabled', !!enabled);
    const clipboardMonitor = require('./clipboard-monitor');

    if (enabled) {
      // Start monitor if not already running
      if (!clipboardMonitor.isRunning()) {
        clipboardMonitor.start((entry, isDuplicate) => {
          cwm.notifyClipboardWindow('cb-new-entry', { entry, isDuplicate });

          // Check TTL after each new entry
          const isPaidNow = store.get('licenseStatus') === 'active';
          if (!isPaidNow && !store.get('clipboardAutoDelete')) {
            const expiry = hs.checkFreeUserExpiry();
            if (expiry) {
              cwm.notifyClipboardWindow('cb-expired-prompt', {
                oldestDate: expiry.oldestDate.toISOString()
              });
            }
          } else if (!isPaidNow && store.get('clipboardAutoDelete')) {
            hs.deleteOldestDay();
          }
        });
      }
    } else {
      // Stop monitor
      if (clipboardMonitor.isRunning()) {
        clipboardMonitor.stop();
      }
    }
    return { ok: true, enabled: !!enabled };
  });

  // ── Open clipboard window from overlay/tray ────────────────────────────
  ipcMain.on('open-clipboard-manager', () => {
    cwm.toggleClipboardManager();
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _findEntryById(id) {
  return hs.getEntryById(id);
}

function _dateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

module.exports = { setupClipboardIpc };
