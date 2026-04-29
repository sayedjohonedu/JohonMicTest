const fs = require('fs');
const file = '/Users/sayedjohon/Documents/DEV_AREA/MicTab/mictab/src/main/video-editor-manager.js';
let content = fs.readFileSync(file, 'utf8');

// remove the previous execFileSync version
content = content.replace(/ipcMain\.handle\('veditor-append-video'[\s\S]*?return \{ ok: false, error: err\.message \};\s*\}\s*\}\);\s*/, '');

const asyncIpc = `
  ipcMain.handle('veditor-append-video', async (event, { baseFilePath, appendFilePath }) => {
    const { spawn, execFileSync } = require('child_process');
    const ffmpegManager = require('./ffmpeg-manager');
    if (!ffmpegManager.isFFmpegInstalled()) return { ok: false, error: 'FFmpeg not installed' };
    const ffmpegPath = ffmpegManager.ffmpegBinPath();
    const ffprobePath = ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1');

    try {
      let srcWidth = 1920, srcHeight = 1080;
      let hasAudio = false;
      let totalDur = 0;
      try {
        const probeResult = execFileSync(ffprobePath, [
          '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type',
          '-of', 'csv=p=0', baseFilePath
        ], { timeout: 10000 }).toString().trim();
        hasAudio = probeResult.includes('audio');

        const dimResult = execFileSync(ffprobePath, [
          '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
          '-of', 'csv=p=0:s=x', baseFilePath
        ], { timeout: 10000 }).toString().trim();
        const dimParts = dimResult.split('x');
        if (dimParts.length === 2) {
          srcWidth = parseInt(dimParts[0]) || 1920;
          srcHeight = parseInt(dimParts[1]) || 1080;
        }

        const dur1 = execFileSync(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', baseFilePath]).toString().trim();
        const dur2 = execFileSync(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', appendFilePath]).toString().trim();
        totalDur = parseFloat(dur1) + parseFloat(dur2);
      } catch (e) {
        console.warn('Probe failed, using defaults', e.message);
      }

      const outDir = path.dirname(baseFilePath);
      const ext = path.extname(baseFilePath) || '.mp4';
      const outPath = path.join(outDir, path.basename(baseFilePath, ext) + '_merged_' + Date.now() + ext);

      const filterComplex = hasAudio 
        ? \`[1:v]scale=\${srcWidth}:\${srcHeight}:force_original_aspect_ratio=decrease,pad=\${srcWidth}:\${srcHeight}:(ow-iw)/2:(oh-ih)/2[v1];[0:v][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]\`
        : \`[1:v]scale=\${srcWidth}:\${srcHeight}:force_original_aspect_ratio=decrease,pad=\${srcWidth}:\${srcHeight}:(ow-iw)/2:(oh-ih)/2[v1];[0:v][v1]concat=n=2:v=1:a=0[v]\`;

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
          const timeMatch = stderrBuf.match(/time=\\s*(\\d+):(\\d+):(\\d+)\\.(\\d+)/g);
          if (timeMatch && totalDur > 0) {
            const last = timeMatch[timeMatch.length - 1];
            const m = last.match(/time=\\s*(\\d+):(\\d+):(\\d+)\\.(\\d+)/);
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
            resolve({ ok: false, error: \`FFmpeg exited with code \${code}\` });
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
`;

content = content.replace("ipcMain.on('veditor-cancel-export', () => {", asyncIpc + "\n  ipcMain.on('veditor-cancel-export', () => {");
fs.writeFileSync(file, content, 'utf8');
