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
let activeExportProc = null;

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

  // Cancel export
  
  ipcMain.handle('veditor-pick-append-video', async (event) => {
    const { dialog } = require('electron');
    const bw = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(bw, {
      title: 'Import Video to Timeline',
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths.length) return null;
    return filePaths[0];
  });

  
  ipcMain.handle('veditor-append-video', async (event, { baseFilePath, appendFilePath }) => {
    const { spawn, spawnSync } = require('child_process');
    const ffmpegManager = require('./ffmpeg-manager');
    if (!ffmpegManager.isFFmpegInstalled()) return { ok: false, error: 'FFmpeg not installed' };
    const ffmpegPath = ffmpegManager.ffmpegBinPath();

    try {
      let srcWidth = 1920, srcHeight = 1080;
      let hasAudio = false;
      let totalDur = 0;
      try {
        // Use ffmpeg -i to probe (ffprobe not bundled)
        const infoOut = spawnSync(ffmpegPath, ['-i', baseFilePath], { timeout: 10000 });
        const infoStr = infoOut.stderr ? infoOut.stderr.toString() : '';
        hasAudio = /Stream.*Audio/i.test(infoStr);
        const dimMatch = infoStr.match(/(\d{2,5})x(\d{2,5})/);
        if (dimMatch) { srcWidth = parseInt(dimMatch[1]) || 1920; srcHeight = parseInt(dimMatch[2]) || 1080; }
        // Probe duration via ffmpeg format info
        const durMatch1 = infoStr.match(/Duration:\s*([\d:.]+)/);
        const durOut2 = spawnSync(ffmpegPath, ['-i', appendFilePath], { timeout: 10000 });
        const infoStr2 = durOut2.stderr ? durOut2.stderr.toString() : '';
        const durMatch2 = infoStr2.match(/Duration:\s*([\d:.]+)/);
        const parseDur = (s) => { if (!s) return 0; const p = s.split(':'); return (+p[0])*3600+(+p[1])*60+parseFloat(p[2]||0); };
        totalDur = parseDur(durMatch1 && durMatch1[1]) + parseDur(durMatch2 && durMatch2[1]);
      } catch (e) {
        console.warn('Probe failed, using defaults', e.message);
      }

      const outDir = path.dirname(baseFilePath);
      const ext = path.extname(baseFilePath) || '.mp4';
      const outPath = path.join(outDir, path.basename(baseFilePath, ext) + '_merged_' + Date.now() + ext);

      const filterComplex = hasAudio 
        ? `[1:v]scale=${srcWidth}:${srcHeight}:force_original_aspect_ratio=decrease,pad=${srcWidth}:${srcHeight}:(ow-iw)/2:(oh-ih)/2[v1];[0:v][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]`
        : `[1:v]scale=${srcWidth}:${srcHeight}:force_original_aspect_ratio=decrease,pad=${srcWidth}:${srcHeight}:(ow-iw)/2:(oh-ih)/2[v1];[0:v][v1]concat=n=2:v=1:a=0[v]`;

      const mapArgs = hasAudio ? ['-map', '[v]', '-map', '[a]'] : ['-map', '[v]'];
      
      const args = [
        '-i', baseFilePath,
        '-i', appendFilePath,
        '-filter_complex', filterComplex,
        ...mapArgs,
        '-c:v', 'libx264', '-preset', 'superfast', '-crf', '24',
        ...(hasAudio ? ['-c:a', 'aac'] : []),
        '-y', outPath
      ];

      return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderrBuf = '';
        const startTime = Date.now();

        const sendProgress = (pct) => {
          if (editorWindow && !editorWindow.isDestroyed()) {
            editorWindow.webContents.send('veditor-append-progress', { percent: pct });
          }
        };

        proc.stderr.on('data', (chunk) => {
          stderrBuf += chunk.toString();
          const timeMatch = stderrBuf.match(/time=\s*(\d+):(\d+):(\d+)\.(\d+)/g);
          if (timeMatch && totalDur > 0) {
            const last = timeMatch[timeMatch.length - 1];
            const m = last.match(/time=\s*(\d+):(\d+):(\d+)\.(\d+)/);
            if (m) {
              const elapsed = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 100;
              const pct = Math.min(99, Math.round((elapsed / totalDur) * 100));
              sendProgress(pct);
            }
          }
          if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-2048);
        });

        proc.on('close', (code) => {
          if (code !== 0) {
            console.error('Merge error:', stderrBuf);
            resolve({ ok: false, error: `FFmpeg exited with code ${code}` });
          } else {
            sendProgress(100);
            resolve({ ok: true, path: outPath });
          }
        });
      });
    } catch (err) {
      console.error(err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.on('veditor-cancel-export', () => {
    if (activeExportProc) {
      console.log('[VEditor Export] Cancelling export…');
      activeExportProc.kill('SIGKILL');
      activeExportProc = null;
    }
  });

  // Export video — applies all edits (cuts, deletions, muting, zoom)
  ipcMain.handle('veditor-export', async (_, opts) => {
    try {
      const { filePath, format, filename, segments, mutedSegments, viewport, zoomRegions, hwaccel, fps: fpsChoice } = opts;
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
      const { execFile, execFileSync, spawnSync } = require('child_process');

      // Probe source for audio stream and video dimensions.
      // We use ffmpeg itself (not ffprobe — it's not bundled) to probe the file.
      let hasAudio = true;
      let srcWidth = 1920, srcHeight = 1080;
      try {
        // Use ffmpeg -i to probe metadata — it exits non-zero but prints info to stderr
        const probeOut = spawnSync(ffmpegPath, ['-v', 'quiet', '-print_format', 'json', '-show_streams', filePath], { timeout: 10000 });
        // First try via ffprobe-compatible invocation using ffmpeg
        const probeStr = (probeOut.stdout || probeOut.stderr || Buffer.alloc(0)).toString();
        // Try JSON parse (works if ffprobe is available)
        let streamsDetected = false;
        try {
          const info = JSON.parse(probeStr);
          if (info && info.streams) {
            hasAudio = info.streams.some(s => s.codec_type === 'audio');
            const vStream = info.streams.find(s => s.codec_type === 'video');
            if (vStream && vStream.width) { srcWidth = vStream.width; srcHeight = vStream.height; }
            streamsDetected = true;
          }
        } catch (_) {}

        if (!streamsDetected) {
          // Fallback: use ffmpeg -i stderr output (always available)
          const infoOut = spawnSync(ffmpegPath, ['-i', filePath], { timeout: 10000 });
          const infoStr = infoOut.stderr ? infoOut.stderr.toString() : '';
          hasAudio = /Stream.*Audio/i.test(infoStr);
          const dimMatch = infoStr.match(/(\d{2,5})x(\d{2,5})/);
          if (dimMatch) {
            srcWidth = parseInt(dimMatch[1]) || 1920;
            srcHeight = parseInt(dimMatch[2]) || 1080;
          }
          streamsDetected = true;
          console.log(`[VEditor Export] ffmpeg probe: audio=${hasAudio}, dim=${srcWidth}x${srcHeight}`);
        }
      } catch (e) {
        console.log('[VEditor Export] Probe failed, assuming audio+1920x1080:', e.message);
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
      // ═══ Post-process: apply aspect ratio + background from viewport ═══
      const arSetting = (viewport && viewport.aspectRatio) || 'original';
      const bgModeSetting = (viewport && viewport.bgMode) || 'color';
      const bgColor = (viewport && viewport.bg) || 'none';
      const blurSigma = (viewport && viewport.blurIntensity) || 30;

      const arMap = { '16:9': 16/9, '9:16': 9/16, '1:1': 1, '4:3': 4/3, '3:4': 3/4, '4:5': 4/5, '21:9': 21/9 };
      const targetAR = arMap[arSetting];
      const sourceAR = srcWidth / srcHeight;

      if (targetAR && Math.abs(targetAR - sourceAR) > 0.01) {
        // Compute target canvas dimensions
        let canvasW, canvasH;
        if (targetAR > sourceAR) {
          canvasH = srcHeight; canvasW = Math.round(srcHeight * targetAR);
        } else {
          canvasW = srcWidth; canvasH = Math.round(srcWidth / targetAR);
        }
        canvasW = canvasW % 2 === 0 ? canvasW : canvasW + 1;
        canvasH = canvasH % 2 === 0 ? canvasH : canvasH + 1;

        console.log('[VEditor Export] AR reframe:', `${srcWidth}x${srcHeight}`, '→', `${canvasW}x${canvasH}`, `(${arSetting})`);

        // Rename [outv] → [arIn] in the existing filter
        filterComplex = filterComplex.replace(/\[outv\]/g, '[arIn]');

        if (bgModeSetting === 'blur') {
          // Blur mode: split → one fills bg blurred, other is padded centered → overlay
          filterComplex += `;[arIn]split=2[arBgSrc][arFg]`;
          filterComplex += `;[arBgSrc]scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase,crop=${canvasW}:${canvasH},gblur=sigma=${blurSigma},colorlevels=rimax=0.5:gimax=0.5:bimax=0.5[arBg]`;
          filterComplex += `;[arFg]scale=${canvasW}:${canvasH}:force_original_aspect_ratio=decrease[arFgScaled]`;
          filterComplex += `;[arBg][arFgScaled]overlay=(W-w)/2:(H-h)/2[outv]`;
        } else {
          // Color mode: pad with solid color
          let padColor = '0x0f0f1a'; // default dark
          if (bgColor && bgColor !== 'none' && !bgColor.startsWith('linear')) {
            padColor = '0x' + bgColor.replace('#', '');
          }
          filterComplex += `;[arIn]scale=${canvasW}:${canvasH}:force_original_aspect_ratio=decrease,pad=${canvasW}:${canvasH}:(ow-iw)/2:(oh-ih)/2:color=${padColor}[outv]`;
        }
      }

      // Build FFmpeg args
      const args = [
        '-i', filePath,
        '-filter_complex', filterComplex,
        ...mapArgs,
      ];

      // Hardware acceleration selection
      const hw = hwaccel || 'auto';
      const isMac = process.platform === 'darwin';
      const isWin = process.platform === 'win32';

      // Format-specific encoding options (with hwaccel support)
      if (format === 'webm') {
        args.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0');
        if (hasAudio) args.push('-c:a', 'libopus');
      } else if (format === 'mp4') {
        if (hw === 'gpu' || (hw === 'auto' && isMac)) {
          // GPU: use VideoToolbox on macOS, NVENC on Windows, fallback to CPU on Linux
          if (isMac) {
            args.push('-c:v', 'h264_videotoolbox', '-q:v', '65');
          } else if (isWin) {
            args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23');
          } else {
            args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
          }
        } else {
          args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
        }
        if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
      } else if (format === 'mov') {
        if (hw === 'gpu' || (hw === 'auto' && isMac)) {
          if (isMac) {
            args.push('-c:v', 'h264_videotoolbox', '-q:v', '65');
          } else {
            args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
          }
        } else {
          args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
        }
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

      // Frame rate: only add -r when user explicitly chose a specific fps
      if (fpsChoice && fpsChoice !== 'source') {
        args.push('-r', String(fpsChoice));
      }

      // Add shortest to avoid hanging or audio drift if streams mismatch
      args.push('-shortest');

      args.push('-y', outPath);

      console.log('[VEditor Export] FFmpeg command:', ffmpegPath, args.join(' '));

      // Compute total output duration for progress
      const totalOutDuration = activeSegs.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);

      const sendProgress = (pct, eta) => {
        if (editorWindow && !editorWindow.isDestroyed()) {
          editorWindow.webContents.send('veditor-export-progress', { percent: pct, eta: eta || null });
        }
      };

      sendProgress(2);

      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        activeExportProc = proc;

        let stderrBuf = '';
        const startTime = Date.now();

        proc.stderr.on('data', (chunk) => {
          stderrBuf += chunk.toString();
          // Parse FFmpeg time= progress from stderr
          const timeMatch = stderrBuf.match(/time=\s*(\d+):(\d+):(\d+)\.(\d+)/g);
          if (timeMatch && totalOutDuration > 0) {
            const last = timeMatch[timeMatch.length - 1];
            const m = last.match(/time=\s*(\d+):(\d+):(\d+)\.(\d+)/);
            if (m) {
              const elapsed = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 100;
              const pct = Math.min(99, Math.round((elapsed / totalOutDuration) * 100));
              // Estimate remaining time
              const wallElapsed = (Date.now() - startTime) / 1000;
              const eta = pct > 2 ? Math.round((wallElapsed / pct) * (100 - pct)) : null;
              sendProgress(Math.max(2, pct), eta);
            }
          }
          // Keep buffer from growing unbounded
          if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-2048);
        });

        proc.on('close', (code) => {
          activeExportProc = null;
          if (code !== 0) {
            const errMsg = code === null ? 'Export cancelled' : `FFmpeg exited with code ${code}`;
            console.error('[VEditor Export] FFmpeg error:', errMsg);
            if (editorWindow && !editorWindow.isDestroyed()) {
              editorWindow.webContents.send('veditor-export-done', { ok: false, error: errMsg, cancelled: code === null });
            }
            // Clean up partial output
            try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_e) {}
            resolve({ ok: false, error: errMsg, cancelled: code === null });
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

  // ═══════════════════════════════════════════════════════════
  //  CANVAS FRAME-BY-FRAME EXPORT — Dynamic Zoom Pipeline
  //  Renderer sends JPEG frames via IPC, we pipe to FFmpeg stdin.
  // ═══════════════════════════════════════════════════════════
  let frameExportProc = null;
  let frameExportOutPath = null;

  ipcMain.handle('veditor-start-frame-export', async (_, opts) => {
    try {
      const { filePath, format, filename, width, height, fps, segments, mutedSegments, hwaccel } = opts;
      const dir = path.dirname(filePath);
      const outName = (filename || 'export') + '.' + format;
      const outPath = path.join(dir, outName);
      frameExportOutPath = outPath;

      // Check FFmpeg
      let ffmpegPath = null;
      try {
        const ffmpegManager = require('./ffmpeg-manager');
        if (ffmpegManager.isFFmpegInstalled()) {
          ffmpegPath = ffmpegManager.ffmpegBinPath();
        } else {
          ffmpegPath = await ffmpegManager.downloadFFmpeg();
        }
      } catch (e) {
        return { ok: false, error: 'FFmpeg not available: ' + e.message };
      }
      if (!ffmpegPath) return { ok: false, error: 'FFmpeg not found.' };

      // Probe source for audio using ffmpeg itself (ffprobe is not bundled)
      const { spawnSync, spawn } = require('child_process');
      let hasAudio = false;
      try {
        // ffmpeg -i exits with code 1 but prints stream info to stderr
        const infoOut = spawnSync(ffmpegPath, ['-i', filePath], { timeout: 10000 });
        const infoStr = infoOut.stderr ? infoOut.stderr.toString() : '';
        hasAudio = /Stream.*Audio/i.test(infoStr);
        console.log(`[VEditor Frame Export] Audio probe: hasAudio=${hasAudio}`);
      } catch (_e) {
        // If probe fails, assume audio exists (safer — FFmpeg will ignore -map 1:a if absent)
        hasAudio = true;
        console.warn('[VEditor Frame Export] Audio probe failed, assuming audio=true');
      }

      console.log(`[VEditor Frame Export] Starting: ${width}x${height} @ ${fps}fps, format=${format}, audio=${hasAudio}`);

      // Build FFmpeg args
      // Input 1: JPEG frames from stdin (piped from renderer)
      // Input 2: Source file for audio extraction
      const args = [
        '-thread_queue_size', '1024',
        '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(fps),
        '-i', 'pipe:0',         // video frames from stdin
      ];

      if (hasAudio) {
        args.push('-thread_queue_size', '1024', '-i', filePath);  // input 1: source for audio
      }

      // Build audio filter for trimming + muting
      if (hasAudio && segments && segments.length) {
        const activeSegs = segments.filter(s => !s.isDeleted);
        const mutedRanges = (mutedSegments || []).map(s => ({ start: s.startSec, end: s.endSec }));

        const audioFilters = [];
        const audioConcatInputs = [];

        activeSegs.forEach((seg, i) => {
          const start = seg.startSec;
          const end = seg.endSec;
          const isMuted = mutedRanges.some(m =>
            m.start <= start + 0.01 && m.end >= end - 0.01
          );
          if (isMuted) {
            audioFilters.push(`aevalsrc=0:d=${(end - start).toFixed(4)}[ea${i}]`);
          } else {
            audioFilters.push(`[1:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[ea${i}]`);
          }
          audioConcatInputs.push(`[ea${i}]`);
        });

        const audioFilter = audioFilters.join(';') + ';' +
          audioConcatInputs.join('') + `concat=n=${activeSegs.length}:v=0:a=1[outa]`;
        args.push('-filter_complex', audioFilter);
        args.push('-map', '0:v', '-map', '[outa]');
      } else if (hasAudio) {
        args.push('-map', '0:v', '-map', '1:a');
      } else {
        args.push('-map', '0:v');
      }

      // Encoding settings
      const hw = hwaccel || 'auto';
      const isMac = process.platform === 'darwin';
      const isWin = process.platform === 'win32';

      if (format === 'gif') {
        // GIF: strip audio, add palette generation in a single pass
        // For simplicity, just encode directly — quality is acceptable
        args.length = 0;
        args.push(
          '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(fps),
          '-i', 'pipe:0',
          '-vf', `fps=${Math.min(fps, 15)},scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
          '-map', '0:v',
        );
      } else if (format === 'webm') {
        args.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0');
        if (hasAudio) args.push('-c:a', 'libopus');
      } else if (format === 'mp4') {
        if (hw === 'gpu' || (hw === 'auto' && isMac)) {
          if (isMac) args.push('-c:v', 'h264_videotoolbox', '-q:v', '65');
          else if (isWin) args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23');
          else args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
        } else {
          args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
        }
        if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
      } else if (format === 'mov') {
        if (hw === 'gpu' || (hw === 'auto' && isMac)) {
          if (isMac) args.push('-c:v', 'h264_videotoolbox', '-q:v', '65');
          else args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
        } else {
          args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
        }
        if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
      }

      // Add shortest to avoid audio trailing or dropping
      args.push('-shortest');

      args.push('-y', outPath);

      console.log('[VEditor Frame Export] FFmpeg:', ffmpegPath, args.join(' '));

      // Spawn FFmpeg with stdin pipe for frames
      frameExportProc = spawn(ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      activeExportProc = frameExportProc;

      // Log stderr for debugging (don't block)
      frameExportProc.stderr.on('data', (chunk) => {
        const msg = chunk.toString();
        // Only log errors, not progress spam
        if (msg.includes('Error') || msg.includes('error') || msg.includes('Invalid')) {
          console.error('[VEditor Frame Export] FFmpeg stderr:', msg.trim());
        }
      });

      frameExportProc.on('error', (err) => {
        console.error('[VEditor Frame Export] FFmpeg process error:', err.message);
      });

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('veditor-send-frame', async (_, frameData) => {
    if (!frameExportProc || !frameExportProc.stdin || !frameExportProc.stdin.writable) {
      return { ok: false };
    }
    try {
      const buf = Buffer.from(frameData);
      // Write with backpressure handling
      const canContinue = frameExportProc.stdin.write(buf);
      if (!canContinue) {
        // Wait for drain before allowing next frame
        await new Promise(resolve => frameExportProc.stdin.once('drain', resolve));
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('veditor-finish-frame-export', async () => {
    if (!frameExportProc) return { ok: false, error: 'No active export' };

    const outPath = frameExportOutPath;

    return new Promise((resolve) => {
      // Close stdin to signal end of input
      frameExportProc.stdin.end();

      frameExportProc.on('close', (code) => {
        activeExportProc = null;
        frameExportProc = null;

        if (code !== 0) {
          const errMsg = code === null ? 'Export cancelled' : `FFmpeg exited with code ${code}`;
          console.error('[VEditor Frame Export] Failed:', errMsg);
          try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_e) {}
          if (editorWindow && !editorWindow.isDestroyed()) {
            editorWindow.webContents.send('veditor-export-done', { ok: false, error: errMsg });
          }
          resolve({ ok: false, error: errMsg });
          return;
        }

        console.log('[VEditor Frame Export] Success:', outPath);
        shell.showItemInFolder(outPath);
        if (editorWindow && !editorWindow.isDestroyed()) {
          editorWindow.webContents.send('veditor-export-done', { ok: true, path: outPath });
        }
        resolve({ ok: true, path: outPath });
      });

      // Safety timeout — if FFmpeg hangs, kill it after 5 minutes
      setTimeout(() => {
        if (frameExportProc) {
          console.warn('[VEditor Frame Export] Timeout — killing FFmpeg');
          frameExportProc.kill('SIGKILL');
        }
      }, 5 * 60 * 1000);
    });
  });
}

/* ── Exports ────────────────────────────────────────────── */
module.exports = {
  openEditor,
  closeEditor,
  isEditorOpen,
  setupEditorIpc,
};
