'use strict';

/**
 * ffmpeg-manager.js
 *
 * On-demand FFmpeg download + video conversion.
 * - Downloads static FFmpeg binary on first use (~70-80 MB)
 * - Caches in app.getPath('userData')/ffmpeg/
 * - Converts WebM → MP4, MP4-YouTube, GIF, MOV
 * - Zero impact on installer size
 *
 * Download source: eugeneware/ffmpeg-static GitHub releases
 *   — Trusted, GitHub-hosted, single-binary .gz files
 *   — Supports macOS (x64 + arm64), Windows (x64), Linux (x64)
 */

const { app, BrowserWindow, screen } = require('electron');
const path   = require('path');
const fs     = require('fs');
const zlib   = require('zlib');
const https  = require('https');
const http   = require('http');
const { execFile } = require('child_process');

/* ─── Paths ─────────────────────────────────────────────── */
const FFMPEG_DIR = path.join(app.getPath('userData'), 'ffmpeg');
const platform   = process.platform;   // 'darwin', 'win32', 'linux'
const arch       = process.arch;       // 'x64', 'arm64'

function ffmpegBinName() {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function ffmpegBinPath() {
  return path.join(FFMPEG_DIR, ffmpegBinName());
}

/* ─── Download URLs ─────────────────────────────────────── */
// eugeneware/ffmpeg-static GitHub releases — single binary, gzipped
// URL pattern: https://github.com/eugeneware/ffmpeg-static/releases/download/b{ver}/ffmpeg-{platform}-{arch}.gz
const FFMPEG_STATIC_VERSION = 'b6.0';

function getDownloadUrl() {
  // Map Node.js platform/arch to ffmpeg-static naming
  const platformMap = { darwin: 'darwin', win32: 'win32', linux: 'linux' };
  const archMap     = { x64: 'x64', arm64: 'arm64' };

  const p = platformMap[platform];
  const a = archMap[arch];

  if (!p || !a) {
    throw new Error(`Unsupported platform/architecture: ${platform}/${arch}`);
  }

  return `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_VERSION}/ffmpeg-${p}-${a}.gz`;
}

/* ─── Check if FFmpeg is available ──────────────────────── */
function isFFmpegInstalled() {
  const binPath = ffmpegBinPath();
  try {
    // Windows doesn't support X_OK reliably — just check file exists
    const checkFlag = platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK;
    fs.accessSync(binPath, checkFlag);
    return true;
  } catch (_) {
    return false;
  }
}

/* ─── Progress toast window ─────────────────────────────── */
let progressWin = null;
let progressWinReady = false;   // true once the initial HTML has loaded

function showProgressToast(title, subtitle, progress) {
  const pct = Math.round(progress || 0);

  // If window already exists and is ready, just update the content via JS
  if (progressWin && !progressWin.isDestroyed() && progressWinReady) {
    const safeTitle = title.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    const safeSub   = subtitle.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    progressWin.webContents.executeJavaScript(`
      document.getElementById('p-title').textContent = '${safeTitle}';
      document.getElementById('p-sub').textContent   = '${safeSub}';
      document.getElementById('p-fill').style.width   = '${pct}%';
    `).catch(() => {});
    return;
  }

  // ── First call: create the window and load the HTML once ──
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw } = primaryDisplay.size;
  const bounds = primaryDisplay.bounds;
  const toastW = 380;
  const toastH = 80;

  if (progressWin && !progressWin.isDestroyed()) {
    progressWin.destroy();
  }
  progressWinReady = false;

  progressWin = new BrowserWindow({
    x: bounds.x + sw - toastW - 20,
    y: bounds.y + 20,
    width: toastW,
    height: toastH,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  if (platform === 'darwin') {
    progressWin.setVisibleOnAllWorkspaces(true);
  }

  const safeTitle = title.replace(/'/g, "\\'");
  const safeSub   = subtitle.replace(/'/g, "\\'");

  const html = `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:transparent;font-family:'Inter',-apple-system,sans-serif;overflow:hidden}
    .toast{display:flex;flex-direction:column;gap:6px;padding:14px 18px;
      background:rgba(10,10,18,0.94);backdrop-filter:blur(24px) saturate(180%);
      border:1px solid rgba(255,255,255,0.08);border-radius:14px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);animation:slideIn .25s ease}
    @keyframes slideIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
    .top{display:flex;align-items:center;gap:10px}
    .icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;
      background:rgba(124,111,255,0.12);flex-shrink:0}
    .info{flex:1;min-width:0}
    .title{font:600 12px/1 sans-serif;color:#f0f0f5;margin-bottom:3px}
    .sub{font:400 10px/1.2 sans-serif;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bar-bg{height:4px;border-radius:2px;background:rgba(255,255,255,0.06);overflow:hidden}
    .bar-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,#7c6fff,#a5b4fc);
      transition:width 0.3s ease}
  </style></head><body>
    <div class="toast">
      <div class="top">
        <div class="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
        <div class="info"><div class="title" id="p-title">${safeTitle}</div><div class="sub" id="p-sub">${safeSub}</div></div>
      </div>
      <div class="bar-bg"><div class="bar-fill" id="p-fill" style="width:${pct}%"></div></div>
    </div>
  </body></html>`;

  progressWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  progressWin.once('ready-to-show', () => {
    if (progressWin && !progressWin.isDestroyed()) {
      progressWin.show();
      progressWinReady = true;
    }
  });
}

function closeProgressToast() {
  if (progressWin && !progressWin.isDestroyed()) {
    progressWin.destroy();
    progressWin = null;
  }
  progressWinReady = false;
}

/* ─── Follow redirects (GitHub uses 302) ────────────────── */
function httpGet(url, onData, onEnd, onError) {
  const mod = url.startsWith('https') ? https : http;
  const request = mod.get(url, { headers: { 'User-Agent': 'MicTab-FFmpeg-Downloader' } }, (res) => {
    // Follow redirects (301/302/307/308)
    if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
      return httpGet(res.headers.location, onData, onEnd, onError);
    }
    if (res.statusCode !== 200) {
      onError(new Error(`HTTP ${res.statusCode} from ${url}`));
      return;
    }
    const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
    let downloaded = 0;
    res.on('data', (chunk) => {
      downloaded += chunk.length;
      onData(chunk, downloaded, totalBytes);
    });
    res.on('end', () => onEnd());
    res.on('error', onError);
  });
  request.on('error', onError);
}

/* ─── Download FFmpeg ───────────────────────────────────── */
async function downloadFFmpeg(onProgress) {
  if (isFFmpegInstalled()) return ffmpegBinPath();

  // Ensure directory exists
  fs.mkdirSync(FFMPEG_DIR, { recursive: true });

  const url = getDownloadUrl();
  const tmpFile = path.join(FFMPEG_DIR, 'ffmpeg-download.gz');

  console.log(`[FFmpeg] Downloading from: ${url}`);
  console.log(`[FFmpeg] Platform: ${platform}, Arch: ${arch}`);
  showProgressToast('Downloading FFmpeg', 'First-time setup (~70 MB)…', 0);
  if (onProgress) onProgress({ pct: 0, status: 'Downloading FFmpeg…', detail: 'Starting download…' });

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(tmpFile);

    httpGet(
      url,
      // onData
      (chunk, downloaded, totalBytes) => {
        writeStream.write(chunk);
        if (totalBytes > 0) {
          const pct = Math.round((downloaded / totalBytes) * 100);
          showProgressToast('Downloading FFmpeg', `${(downloaded / 1e6).toFixed(1)} / ${(totalBytes / 1e6).toFixed(1)} MB`, pct);
          if (onProgress) onProgress({ pct, status: 'Downloading FFmpeg…', detail: `${(downloaded / 1e6).toFixed(1)} / ${(totalBytes / 1e6).toFixed(1)} MB` });
        } else {
          showProgressToast('Downloading FFmpeg', `${(downloaded / 1e6).toFixed(1)} MB downloaded…`, 50);
          if (onProgress) onProgress({ pct: 50, status: 'Downloading FFmpeg…', detail: `${(downloaded / 1e6).toFixed(1)} MB downloaded…` });
        }
      },
      // onEnd
      () => {
        writeStream.end(async () => {
          try {
            showProgressToast('Installing FFmpeg', 'Extracting binary…', 95);
            if (onProgress) onProgress({ pct: 95, status: 'Installing FFmpeg…', detail: 'Extracting binary…' });

            // Decompress .gz → binary using Node's built-in zlib (works on all platforms)
            await gunzipFile(tmpFile, ffmpegBinPath());

            // Clean up .gz archive
            try { fs.unlinkSync(tmpFile); } catch (_) {}

            // Set executable permission on macOS/Linux
            if (platform !== 'win32') {
              fs.chmodSync(ffmpegBinPath(), 0o755);
            }

            // Verify the binary exists
            if (!fs.existsSync(ffmpegBinPath())) {
              throw new Error('FFmpeg binary not found after extraction');
            }

            console.log(`[FFmpeg] Installed at: ${ffmpegBinPath()}`);
            showProgressToast('FFmpeg Ready', 'Converter installed successfully ✓', 100);
            if (onProgress) onProgress({ pct: 100, status: 'FFmpeg Ready!', detail: 'Installed successfully ✓' });
            setTimeout(() => closeProgressToast(), 2000);
            resolve(ffmpegBinPath());
          } catch (err) {
            console.error('[FFmpeg] Extraction failed:', err);
            closeProgressToast();
            // Clean up partial files
            try { fs.unlinkSync(tmpFile); } catch (_) {}
            try { fs.unlinkSync(ffmpegBinPath()); } catch (_) {}
            reject(err);
          }
        });
      },
      // onError
      (err) => {
        writeStream.end();
        console.error('[FFmpeg] Download failed:', err);
        closeProgressToast();
        // Clean up partial files
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        reject(err);
      }
    );
  });
}

/* ─── Gunzip using Node's built-in zlib ─────────────────── */
function gunzipFile(gzPath, outputPath) {
  return new Promise((resolve, reject) => {
    const input  = fs.createReadStream(gzPath);
    const gunzip = zlib.createGunzip();
    const output = fs.createWriteStream(outputPath);

    input.pipe(gunzip).pipe(output);

    output.on('finish', () => {
      output.close();
      resolve();
    });
    output.on('error', reject);
    gunzip.on('error', reject);
    input.on('error', reject);
  });
}

/* ─── Conversion Presets ────────────────────────────────── */

/**
 * Format presets keyed by format ID.
 * Each returns an array of FFmpeg arguments (excluding input/output).
 */
const FORMAT_PRESETS = {
  webm: {
    label: 'WebM (Default)',
    ext: '.webm',
    args: () => ['-c', 'copy'],   // no conversion needed
  },

  mp4: {
    label: 'MP4 (H.264 + AAC)',
    ext: '.mp4',
    args: (quality) => {
      const crf = { high: '18', mid: '23', low: '28' }[quality] || '18';
      return [
        '-c:v', 'libx264', '-preset', 'fast', '-crf', crf,
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
      ];
    },
  },

  'mp4-youtube': {
    label: 'MP4 — YouTube 1080p',
    ext: '.mp4',
    args: () => [
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-profile:v', 'high', '-level', '4.0',
      '-bf', '2', '-g', '30',
      '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-maxrate', '12M', '-bufsize', '24M',
    ],
  },

  'mp4-twitter': {
    label: 'MP4 — Social Media',
    ext: '.mp4',
    args: () => [
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-profile:v', 'baseline', '-level', '3.1',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
    ],
  },

  gif: {
    label: 'GIF (Animated)',
    ext: '.gif',
    args: (quality) => {
      const fps = { high: '15', mid: '10', low: '8' }[quality] || '15';
      const scale = { high: '-1', mid: '640', low: '480' }[quality] || '-1';
      return [
        '-vf', `fps=${fps},scale=${scale}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`,
        '-loop', '0',
      ];
    },
  },

  mov: {
    label: 'MOV (Apple ProRes)',
    ext: '.mov',
    args: () => [
      '-c:v', 'prores_ks', '-profile:v', '1',  // ProRes 422 LT
      '-c:a', 'pcm_s16le',
      '-pix_fmt', 'yuv422p10le',
    ],
  },
};

/* ─── Convert video ─────────────────────────────────────── */

/**
 * Convert a WebM file to the specified format.
 *
 * @param {string} inputPath  — path to the .webm file
 * @param {string} formatId  — one of: 'mp4', 'mp4-youtube', 'mp4-twitter', 'gif', 'mov'
 * @param {string} quality   — 'high' | 'mid' | 'low'
 * @returns {Promise<string>} — path to the converted file
 */
async function convertVideo(inputPath, formatId, quality = 'high') {
  if (formatId === 'webm') return inputPath;  // no conversion needed

  const preset = FORMAT_PRESETS[formatId];
  if (!preset) throw new Error(`Unknown format: ${formatId}`);

  // Ensure FFmpeg is available
  let binPath;
  try {
    binPath = await downloadFFmpeg();
  } catch (err) {
    throw new Error(`Failed to get FFmpeg: ${err.message}`);
  }

  const ext = preset.ext;
  const outputPath = inputPath.replace(/\.webm$/i, ext);
  const ffmpegArgs = preset.args(quality);

  console.log(`[FFmpeg] Converting: ${path.basename(inputPath)} → ${path.basename(outputPath)}`);
  console.log(`[FFmpeg] Args: ${ffmpegArgs.join(' ')}`);

  showProgressToast('Converting Video', `→ ${preset.label}`, 30);

  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      ...ffmpegArgs,
      '-y',           // overwrite if exists
      outputPath,
    ];

    const proc = execFile(binPath, args, {
      timeout: 600000,   // 10 min max
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[FFmpeg] Conversion failed:', stderr || err.message);
        closeProgressToast();
        reject(new Error(`Conversion failed: ${err.message}`));
      } else {
        console.log(`[FFmpeg] Done → ${outputPath}`);
        showProgressToast('Conversion Complete', path.basename(outputPath) + ' ✓', 100);
        setTimeout(() => closeProgressToast(), 2500);
        resolve(outputPath);
      }
    });

    // Track progress via stderr (FFmpeg outputs progress there)
    if (proc.stderr) {
      let lastUpdate = 0;
      proc.stderr.on('data', (data) => {
        const now = Date.now();
        if (now - lastUpdate > 500) {
          lastUpdate = now;
          const str = data.toString();
          const timeMatch = str.match(/time=(\d+:\d+:\d+\.\d+)/);
          if (timeMatch) {
            showProgressToast('Converting Video', `Processing ${timeMatch[1]}…`, 60);
          }
        }
      });
    }
  });
}

/* ─── Exports ───────────────────────────────────────────── */

module.exports = {
  isFFmpegInstalled,
  downloadFFmpeg,
  convertVideo,
  ffmpegBinPath,
  FORMAT_PRESETS,
};
