'use strict';

/**
 * gallery-manager.js
 *
 * Main-process manager for the MicTab Media Gallery.
 * - Opens/closes the gallery BrowserWindow
 * - Scans the MicTab ScreenRec folder for recordings & screenshots
 * - Handles file operations (rename, delete, reveal in Finder)
 * - Auto-opens gallery after recording completes
 */

const {
  BrowserWindow, ipcMain, app, shell, dialog, nativeImage,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const { showEditorFromGallery } = require('./lens-manager');

/* ── Constants ──────────────────────────────────────────── */
const SAVE_DIR_NAME = 'MicTab ScreenRec';

function getSaveDir() {
  return path.join(app.getPath('downloads'), SAVE_DIR_NAME);
}

/* ── Window reference ───────────────────────────────────── */
let galleryWindow = null;

/* ── File scanning ──────────────────────────────────────── */

/**
 * Scan the save directory for all MicTab media files.
 * Returns an array of file info objects sorted by creation date (newest first).
 */
function scanMediaFiles() {
  const saveDir = getSaveDir();
  if (!fs.existsSync(saveDir)) return [];

  const entries = fs.readdirSync(saveDir);
  const mediaFiles = [];

  for (const name of entries) {
    // Skip hidden files and non-media
    if (name.startsWith('.')) continue;

    const ext = path.extname(name).toLowerCase();
    const isVideo = ['.webm', '.mp4', '.mov', '.gif'].includes(ext);
    const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'].includes(ext);

    if (!isVideo && !isImage) continue;

    const filePath = path.join(saveDir, name);
    try {
      const stat = fs.statSync(filePath);
      mediaFiles.push({
        name,
        path: filePath,
        type: isVideo ? 'video' : 'image',
        ext: ext.slice(1), // remove dot
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch (_) {
      // Skip unreadable files
    }
  }

  // Sort newest first
  mediaFiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return mediaFiles;
}

/**
 * Format bytes to human-readable string.
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/* ── Gallery Window ─────────────────────────────────────── */

function openGallery(autoPlayFile = null) {
  if (galleryWindow && !galleryWindow.isDestroyed()) {
    galleryWindow.focus();
    if (autoPlayFile) {
      // Rescan so the new file appears in allFiles before navigating
      const files = scanMediaFiles();
      galleryWindow.webContents.send('gallery-file-list', files);
      setTimeout(() => {
        if (galleryWindow && !galleryWindow.isDestroyed()) {
          galleryWindow.webContents.send('gallery-navigate-to-file', autoPlayFile);
        }
      }, 80);
    }
    return;
  }

  galleryWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 520,
    center: true,
    frame: false,
    transparent: false,
    resizable: true,
    title: 'MicTab Gallery',
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'ui', 'gallery-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local file:// videos
    },
  });

  galleryWindow.loadFile(path.join(__dirname, '..', '..', 'ui', 'gallery.html'));

  galleryWindow.webContents.on('did-finish-load', () => {
    if (!galleryWindow || galleryWindow.isDestroyed()) return;
    // Send the initial file list
    const files = scanMediaFiles();
    galleryWindow.webContents.send('gallery-file-list', files);
    // If there's a file to auto-navigate to, send it
    if (autoPlayFile) {
      setTimeout(() => {
        if (galleryWindow && !galleryWindow.isDestroyed()) {
          galleryWindow.webContents.send('gallery-navigate-to-file', autoPlayFile);
        }
      }, 300);
    }
  });

  galleryWindow.on('closed', () => {
    galleryWindow = null;
  });
}

function closeGallery() {
  if (galleryWindow && !galleryWindow.isDestroyed()) {
    galleryWindow.destroy();
    galleryWindow = null;
  }
}

function isGalleryOpen() {
  return galleryWindow && !galleryWindow.isDestroyed();
}

function getGalleryWindow() {
  return galleryWindow;
}

/* ── IPC Handlers ───────────────────────────────────────── */

function setupGalleryIpc() {
  // Scan files
  ipcMain.handle('gallery-scan-files', () => {
    return scanMediaFiles();
  });

  const SIDECAR_EXTS = ['.mictab-cursor.json', '.mictab-edit.json', '.mictab-whisper.json'];

  // Rename a file
  ipcMain.handle('gallery-rename-file', async (_, { oldPath, newName }) => {
    try {
      const dir = path.dirname(oldPath);
      const ext = path.extname(oldPath);
      // Ensure new name keeps the same extension
      const safeName = newName.endsWith(ext) ? newName : newName + ext;
      const newPath = path.join(dir, safeName);

      if (fs.existsSync(newPath)) {
        return { ok: false, error: 'A file with that name already exists.' };
      }

      fs.renameSync(oldPath, newPath);

      // Rename sidecars
      const oldBase = oldPath.replace(/\.[^.]+$/, '');
      const newBase = newPath.replace(/\.[^.]+$/, '');
      for (const sidecarExt of SIDECAR_EXTS) {
        const oldSidecar = oldBase + sidecarExt;
        const newSidecar = newBase + sidecarExt;
        if (fs.existsSync(oldSidecar)) {
          fs.renameSync(oldSidecar, newSidecar);
        }
      }

      return { ok: true, newPath, newName: safeName };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Delete a file
  ipcMain.handle('gallery-delete-file', async (_, filePath) => {
    try {
      // Also delete sidecar files
      const baseName = filePath.replace(/\.[^.]+$/, '');
      for (const ext of SIDECAR_EXTS) {
        const sidecar = baseName + ext;
        if (fs.existsSync(sidecar)) {
          try {
            await shell.trashItem(sidecar);
          } catch (e) {
            try { fs.unlinkSync(sidecar); } catch(err) {}
          }
        }
      }

      // Move main file to trash
      try {
        await shell.trashItem(filePath);
      } catch (err) {
        // Fallback to unlink if trash fails
        fs.unlinkSync(filePath);
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Reveal in Finder/Explorer
  ipcMain.on('gallery-reveal-in-finder', (_, filePath) => {
    shell.showItemInFolder(filePath);
  });

  // Open gallery window
  ipcMain.on('gallery-open', (_, autoPlayFile) => {
    openGallery(autoPlayFile || null);
  });

  // Close gallery window
  ipcMain.on('gallery-close', () => {
    closeGallery();
  });

  // Window controls
  ipcMain.on('gallery-minimize', () => {
    if (galleryWindow && !galleryWindow.isDestroyed()) galleryWindow.minimize();
  });

  ipcMain.on('gallery-maximize', () => {
    if (galleryWindow && !galleryWindow.isDestroyed()) {
      if (galleryWindow.isMaximized()) galleryWindow.unmaximize();
      else galleryWindow.maximize();
    }
  });

  // Get save directory path
  ipcMain.handle('gallery-get-save-dir', () => {
    return getSaveDir();
  });

  // ── FFmpeg / Conversion ──────────────────────────────────
  const { isFFmpegInstalled, downloadFFmpeg, convertVideo } = require('./ffmpeg-manager');

  ipcMain.handle('gallery-check-ffmpeg', () => {
    return { installed: isFFmpegInstalled() };
  });

  ipcMain.handle('gallery-download-ffmpeg', async (event) => {
    const senderWC = event.sender;
    await downloadFFmpeg((progress) => {
      try {
        if (senderWC && !senderWC.isDestroyed()) {
          senderWC.send('ffmpeg-download-progress', progress);
        }
      } catch (_) {}
    });
    return { ok: true };
  });

  ipcMain.handle('gallery-convert-file', async (_, { filePath, format }) => {
    try {
      const convertedPath = await convertVideo(filePath, format, 'high');
      return { ok: true, convertedPath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ── Open image from gallery in Lens Editor ──────────────────
  ipcMain.on('gallery-open-in-lens', (_, filePath) => {
    try {
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1) || 'png';
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      const { width, height } = nativeImage.createFromBuffer(buf).getSize();
      // Open the editor, passing originFilePath so save overwrites it
      showEditorFromGallery(dataUrl, filePath, { width, height });
    } catch (err) {
      console.error('[Gallery→Lens] Failed to open file:', err.message);
    }
  });

  // ── Save overwrite (from gallery edit mode) ──────────────────
  ipcMain.handle('lens-save-overwrite', async (_, { dataUrl, filePath }) => {
    try {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      console.log('[Lens] Overwrite saved →', filePath);

      // Notify gallery to rescan and re-open the updated image
      if (galleryWindow && !galleryWindow.isDestroyed()) {
        const files = scanMediaFiles();
        galleryWindow.webContents.send('gallery-file-list', files);
        // Small delay to let the file-list update settle, then navigate
        setTimeout(() => {
          if (galleryWindow && !galleryWindow.isDestroyed()) {
            galleryWindow.webContents.send('gallery-navigate-to-file', filePath);
          }
        }, 80);
      }

      return { ok: true, filePath };
    } catch (err) {
      console.error('[Lens] Overwrite save failed:', err.message);
      return { ok: false, error: err.message };
    }
  });
}


/* ── Exports ────────────────────────────────────────────── */

module.exports = {
  openGallery,
  closeGallery,
  isGalleryOpen,
  getGalleryWindow,
  setupGalleryIpc,
  getSaveDir,
};
