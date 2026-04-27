'use strict';

/**
 * video-editor-manager.js
 *
 * Main-process manager for the MicTab Video Editor.
 * - Opens/closes the editor BrowserWindow
 * - Receives a video file path from the gallery
 * - Handles export via canvas-rendered WebM or FFmpeg conversion
 */

const {
  BrowserWindow, ipcMain, app, shell,
} = require('electron');
const path = require('path');
const fs   = require('fs');

/* ── Window reference ───────────────────────────────────── */
let editorWindow = null;

/* ── Open editor with a video file ─────────────────────── */
function openEditor(filePath) {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.focus();
    // Send the new file to the existing window
    editorWindow.webContents.send('veditor-file-loaded', { filePath });
    return;
  }

  editorWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    center: true,
    frame: false,
    transparent: false,
    resizable: true,
    title: 'MicTab Editor',
    backgroundColor: '#08080f',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'ui', 'video-editor-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local file:// videos
    },
  });

  const encodedPath = encodeURIComponent(filePath);
  editorWindow.loadFile(path.join(__dirname, '..', '..', 'ui', 'video-editor.html'), {
    query: { file: filePath },
  });

  editorWindow.on('closed', () => {
    editorWindow = null;
  });
}

function closeEditor() {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.destroy();
    editorWindow = null;
  }
}

function isEditorOpen() {
  return editorWindow && !editorWindow.isDestroyed();
}

/* ── IPC Handlers ───────────────────────────────────────── */
function setupEditorIpc() {
  // Window controls
  ipcMain.on('veditor-close', () => closeEditor());

  ipcMain.on('veditor-minimize', () => {
    if (editorWindow && !editorWindow.isDestroyed()) editorWindow.minimize();
  });

  ipcMain.on('veditor-maximize', () => {
    if (editorWindow && !editorWindow.isDestroyed()) {
      if (editorWindow.isMaximized()) editorWindow.unmaximize();
      else editorWindow.maximize();
    }
  });

  // Open editor (called from gallery)
  ipcMain.on('veditor-open', (_, filePath) => {
    openEditor(filePath);
  });

  // Save project state to JSON sidecar
  ipcMain.handle('veditor-save-project', async (_, { filePath, data }) => {
    try {
      const sidecarPath = filePath.replace(/\.[^.]+$/, '.mictab-edit.json');
      fs.writeFileSync(sidecarPath, JSON.stringify(data, null, 2), 'utf8');
      return { ok: true, path: sidecarPath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Load project state from JSON sidecar
  ipcMain.handle('veditor-load-project', async (_, filePath) => {
    try {
      const sidecarPath = filePath.replace(/\.[^.]+$/, '.mictab-edit.json');
      if (fs.existsSync(sidecarPath)) {
        const data = fs.readFileSync(sidecarPath, 'utf8');
        return JSON.parse(data);
      }
      return null;
    } catch (err) {
      console.error('Failed to load project:', err);
      return null;
    }
  });

  // Load cursor track sidecar (mouse positions during recording)
  ipcMain.handle('veditor-load-cursor-track', async (_, filePath) => {
    try {
      const sidecarPath = filePath.replace(/\.[^.]+$/, '.mictab-cursor.json');
      if (fs.existsSync(sidecarPath)) {
        return JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
      }
      return null;
    } catch (err) {
      console.error('Failed to load cursor track:', err);
      return null;
    }
  });

  // Export video — applies all edits (cuts, deletions, muting, zoom)
  ipcMain.handle('veditor-export', async (_, opts) => {
    try {
      const { filePath, format, filename, segments, mutedSegments, viewport, zoomRegions } = opts;
      const dir = path.dirname(filePath);
      const outName = (filename || 'export') + '.' + format;
      const outPath = path.join(dir, outName);

      // Only keep active (non-deleted) segments
      const activeSegs = (segments || []).filter(s => !s.isDeleted);
      if (!activeSegs.length) {
        return { ok: false, error: 'No active segments to export.' };
      }

      // Check if we have FFmpeg
      let ffmpegPath = null;
      try {
        const ffmpegManager = require('./ffmpeg-manager');
        if (ffmpegManager.isFFmpegInstalled()) {
          ffmpegPath = ffmpegManager.ffmpegBinPath();
        } else {
          // Auto-download FFmpeg if not installed
          console.log('[VEditor Export] FFmpeg not found, downloading…');
          ffmpegPath = await ffmpegManager.downloadFFmpeg();
        }
        console.log('[VEditor Export] FFmpeg path:', ffmpegPath);
      } catch (e) {
        console.error('[VEditor Export] FFmpeg resolution failed:', e.message);
      }

      // Determine muted time ranges
      const mutedRanges = (mutedSegments || []).map(s => ({ start: s.startSec, end: s.endSec }));

      // If no cuts were made (single segment covering full duration), just copy/convert
      const isUnedited = activeSegs.length === 1 &&
                         activeSegs[0].startSec < 0.05 &&
                         mutedRanges.length === 0;

      const hasZoomEffects = (zoomRegions || []).length > 0;

      if (isUnedited && format === 'webm' && !hasZoomEffects) {
        fs.copyFileSync(filePath, outPath);
        shell.showItemInFolder(outPath);
        if (editorWindow && !editorWindow.isDestroyed()) {
          editorWindow.webContents.send('veditor-export-done', { ok: true, path: outPath });
        }
        return { ok: true, path: outPath };
      }

      // Need FFmpeg for proper segment-aware export
      if (!ffmpegPath) {
        // Fallback: if WebM + no FFmpeg, do a simple copy (user warned about limitations)
        if (format === 'webm' && isUnedited && !hasZoomEffects) {
          fs.copyFileSync(filePath, outPath);
          shell.showItemInFolder(outPath);
          if (editorWindow && !editorWindow.isDestroyed()) {
            editorWindow.webContents.send('veditor-export-done', { ok: true, path: outPath });
          }
          return { ok: true, path: outPath };
        }
        return { ok: false, error: 'FFmpeg is required to export with edits applied. Please download it from Settings first.' };
      }

      // ═══ Build FFmpeg command with filter_complex ═══
      const { execFile, execFileSync } = require('child_process');

      // Probe source for audio stream and video dimensions
      let hasAudio = true;
      let srcWidth = 1920, srcHeight = 1080;
      try {
        const ffprobePath = ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1');
        const probeResult = execFileSync(ffprobePath, [
          '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type',
          '-of', 'csv=p=0', filePath
        ], { timeout: 10000 }).toString().trim();
        hasAudio = probeResult.includes('audio');

        // Probe video dimensions
        const dimResult = execFileSync(ffprobePath, [
          '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
          '-of', 'csv=p=0:s=x', filePath
        ], { timeout: 10000 }).toString().trim();
        const dimParts = dimResult.split('x');
        if (dimParts.length === 2) {
          srcWidth = parseInt(dimParts[0]) || 1920;
          srcHeight = parseInt(dimParts[1]) || 1080;
        }
      } catch (e) {
        console.log('[VEditor Export] ffprobe failed, using defaults:', e.message);
      }

      // Ensure even dimensions for h264/vp9 encoding
      srcWidth = srcWidth % 2 === 0 ? srcWidth : srcWidth - 1;
      srcHeight = srcHeight % 2 === 0 ? srcHeight : srcHeight - 1;

      console.log('[VEditor Export] Source:', filePath, `${srcWidth}x${srcHeight}`);
      console.log('[VEditor Export] Active segments:', activeSegs.length, JSON.stringify(activeSegs.map(s => `${s.startSec.toFixed(2)}-${s.endSec.toFixed(2)}`)));
      console.log('[VEditor Export] Has audio:', hasAudio);
      console.log('[VEditor Export] Zoom regions:', (zoomRegions || []).length);
      console.log('[VEditor Export] Format:', format, '→', outPath);

      // ═══ Build zoom via split + overlay approach ═══
      // Strategy: split concat output into copies, apply static crop+scale
      // to each copy for its zoom region, then overlay on base with enable=between()
      // This is much more reliable than expression-based crop.

      function mapZoomRegionsToConcat(regions) {
        if (!regions || !regions.length) return [];

        // Build time mapping: after concat, deleted segments are removed
        let concatOffset = 0;
        const timeMap = [];
        for (const seg of activeSegs) {
          const dur = seg.endSec - seg.startSec;
          timeMap.push({
            origStart: seg.startSec, origEnd: seg.endSec,
            concatStart: concatOffset, concatEnd: concatOffset + dur,
          });
          concatOffset += dur;
        }

        // Convert original-time zoom regions to concat-time
        const mapped = [];
        for (const zr of regions) {
          const zStart = zr.startSec;
          const zEnd = zr.startSec + zr.durationSec;
          for (const tm of timeMap) {
            const overlapStart = Math.max(zStart, tm.origStart);
            const overlapEnd = Math.min(zEnd, tm.origEnd);
            if (overlapStart < overlapEnd) {
              const cStart = tm.concatStart + (overlapStart - tm.origStart);
              const cEnd = tm.concatStart + (overlapEnd - tm.origStart);
              mapped.push({
                startSec: cStart,
                endSec: cEnd,
                scale: zr.scale,
                targetX: zr.targetX || 0.5,
                targetY: zr.targetY || 0.5,
              });
            }
          }
        }
        return mapped;
      }

      // Build filter_complex to trim and concat active segments
      const videoFilters = [];
      const audioFilters = [];
      const concatInputs = [];

      activeSegs.forEach((seg, i) => {
        const start = seg.startSec;
        const end = seg.endSec;
        const isMuted = mutedRanges.some(m =>
          m.start <= start + 0.01 && m.end >= end - 0.01
        );

        // Trim video
        videoFilters.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`);

        if (hasAudio) {
          if (isMuted) {
            audioFilters.push(`aevalsrc=0:d=${(end - start).toFixed(4)}[a${i}]`);
          } else {
            audioFilters.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`);
          }
          concatInputs.push(`[v${i}][a${i}]`);
        } else {
          concatInputs.push(`[v${i}]`);
        }
      });

      // Map zoom regions to concat timeline
      const mappedZooms = hasZoomEffects ? mapZoomRegionsToConcat(zoomRegions) : [];
      const zoomCount = mappedZooms.length;

      console.log('[VEditor Export] Mapped zoom regions:', zoomCount, JSON.stringify(mappedZooms));

      let filterComplex, mapArgs;

      if (zoomCount > 0) {
        // ═══ Zoom path: concat → split → crop+scale per region → chain overlays ═══
        const parts = [...videoFilters, ...audioFilters];

        if (hasAudio) {
          parts.push(`${concatInputs.join('')}concat=n=${activeSegs.length}:v=1:a=1[concatv][outa]`);
        } else {
          parts.push(`${concatInputs.join('')}concat=n=${activeSegs.length}:v=1:a=0[concatv]`);
        }

        // Split concat video into (zoomCount + 1) copies: 1 base + N zoom sources
        const splitLabels = ['[base]'];
        for (let i = 0; i < zoomCount; i++) splitLabels.push(`[zsrc${i}]`);
        parts.push(`[concatv]split=${zoomCount + 1}${splitLabels.join('')}`);

        // For each zoom region: crop the zoomed area and scale back to full size
        for (let i = 0; i < zoomCount; i++) {
          const r = mappedZooms[i];
          let cropW = Math.round(srcWidth / r.scale);
          let cropH = Math.round(srcHeight / r.scale);
          // Ensure even dimensions
          cropW = cropW % 2 === 0 ? cropW : cropW - 1;
          cropH = cropH % 2 === 0 ? cropH : cropH - 1;
          const cropX = Math.round((srcWidth - cropW) * r.targetX);
          const cropY = Math.round((srcHeight - cropH) * r.targetY);
          parts.push(`[zsrc${i}]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${srcWidth}:${srcHeight}:flags=lanczos[z${i}]`);
        }

        // Chain overlays: base → overlay z0 → overlay z1 → ... → [outv]
        for (let i = 0; i < zoomCount; i++) {
          const r = mappedZooms[i];
          const inLabel = i === 0 ? '[base]' : `[ov${i - 1}]`;
          const outLabel = i === zoomCount - 1 ? '[outv]' : `[ov${i}]`;
          // Use enable to only show the zoomed overlay during the zoom region's time window
          // Escape commas with \\ for FFmpeg filter_complex syntax
          parts.push(`${inLabel}[z${i}]overlay=0:0:enable='between(t,${r.startSec.toFixed(4)},${r.endSec.toFixed(4)})'${outLabel}`);
        }

        filterComplex = parts.join(';');
        mapArgs = hasAudio ? ['-map', '[outv]', '-map', '[outa]'] : ['-map', '[outv]'];
      } else {
        // ═══ No zoom — simple concat ═══
        if (hasAudio) {
          const concatFilter = `${concatInputs.join('')}concat=n=${activeSegs.length}:v=1:a=1[outv][outa]`;
          filterComplex = [...videoFilters, ...audioFilters, concatFilter].join(';');
          mapArgs = ['-map', '[outv]', '-map', '[outa]'];
        } else {
          const concatFilter = `${concatInputs.join('')}concat=n=${activeSegs.length}:v=1:a=0[outv]`;
          filterComplex = [...videoFilters, concatFilter].join(';');
          mapArgs = ['-map', '[outv]'];
        }
      }

      // Build FFmpeg args
      const args = [
        '-i', filePath,
        '-filter_complex', filterComplex,
        ...mapArgs,
      ];

      // Format-specific encoding options
      if (format === 'webm') {
        args.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0');
        if (hasAudio) args.push('-c:a', 'libopus');
      } else if (format === 'mp4') {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
        if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
      } else if (format === 'mov') {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
        if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
      } else if (format === 'gif') {
        // GIF — rebuild with zoom support
        args.length = 0;
        const gifParts = [];
        const gifConcatInputs = [];
        activeSegs.forEach((seg, i) => {
          gifParts.push(`[0:v]trim=start=${seg.startSec}:end=${seg.endSec},setpts=PTS-STARTPTS[gv${i}]`);
          gifConcatInputs.push(`[gv${i}]`);
        });

        if (zoomCount > 0) {
          gifParts.push(`${gifConcatInputs.join('')}concat=n=${activeSegs.length}:v=1:a=0[gcv]`);
          const gSplitLabels = ['[gbase]'];
          for (let i = 0; i < zoomCount; i++) gSplitLabels.push(`[gzsrc${i}]`);
          gifParts.push(`[gcv]split=${zoomCount + 1}${gSplitLabels.join('')}`);
          for (let i = 0; i < zoomCount; i++) {
            const r = mappedZooms[i];
            let cw = Math.round(srcWidth / r.scale); let ch = Math.round(srcHeight / r.scale);
            cw = cw % 2 === 0 ? cw : cw - 1; ch = ch % 2 === 0 ? ch : ch - 1;
            const cx = Math.round((srcWidth - cw) * r.targetX);
            const cy = Math.round((srcHeight - ch) * r.targetY);
            gifParts.push(`[gzsrc${i}]crop=${cw}:${ch}:${cx}:${cy},scale=${srcWidth}:${srcHeight}:flags=lanczos[gz${i}]`);
          }
          for (let i = 0; i < zoomCount; i++) {
            const r = mappedZooms[i];
            const inL = i === 0 ? '[gbase]' : `[gov${i - 1}]`;
            const outL = i === zoomCount - 1 ? '[gzoomed]' : `[gov${i}]`;
            gifParts.push(`${inL}[gz${i}]overlay=0:0:enable='between(t,${r.startSec.toFixed(4)},${r.endSec.toFixed(4)})'${outL}`);
          }
          gifParts.push(`[gzoomed]fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse[outgif]`);
        } else {
          gifParts.push(`${gifConcatInputs.join('')}concat=n=${activeSegs.length}:v=1:a=0,fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse[outgif]`);
        }
        args.push('-i', filePath, '-filter_complex', gifParts.join(';'), '-map', '[outgif]');
      }

      args.push('-y', outPath);

      console.log('[VEditor Export] FFmpeg command:', ffmpegPath, args.join(' '));

      // Send progress updates
      const sendProgress = (pct) => {
        if (editorWindow && !editorWindow.isDestroyed()) {
          editorWindow.webContents.send('veditor-export-progress', { percent: pct });
        }
      };

      sendProgress(10);

      return new Promise((resolve) => {
        const proc = execFile(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (err) {
            console.error('[VEditor Export] FFmpeg error:', err.message);
            console.error('[VEditor Export] FFmpeg stderr:', stderr);
            if (editorWindow && !editorWindow.isDestroyed()) {
              editorWindow.webContents.send('veditor-export-done', { ok: false, error: err.message });
            }
            resolve({ ok: false, error: err.message });
            return;
          }
          console.log('[VEditor Export] Success:', outPath);
          sendProgress(100);
          shell.showItemInFolder(outPath);
          if (editorWindow && !editorWindow.isDestroyed()) {
            editorWindow.webContents.send('veditor-export-done', { ok: true, path: outPath });
          }
          resolve({ ok: true, path: outPath });
        });
      });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

/* ── Exports ────────────────────────────────────────────── */
module.exports = {
  openEditor,
  closeEditor,
  isEditorOpen,
  setupEditorIpc,
};
