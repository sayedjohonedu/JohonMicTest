const fs = require('fs');
const file = '/Users/sayedjohon/Documents/DEV_AREA/MicTab/mictab/src/main/video-editor-manager.js';
let content = fs.readFileSync(file, 'utf8');

const pickIpc = `
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
    const { execFileSync } = require('child_process');
    const ffmpegManager = require('./ffmpeg-manager');
    if (!ffmpegManager.isFFmpegInstalled()) return { ok: false, error: 'FFmpeg not installed' };
    const ffmpegPath = ffmpegManager.ffmpegBinPath();
    const ffprobePath = ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1');

    try {
      // 1. Get base video resolution and audio presence
      let srcWidth = 1920, srcHeight = 1080;
      let hasAudio = false;
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
      } catch (e) {
        console.warn('Probe failed, using defaults', e.message);
      }

      const outDir = path.dirname(baseFilePath);
      const ext = path.extname(baseFilePath) || '.mp4';
      const outPath = path.join(outDir, path.basename(baseFilePath, ext) + '_merged' + ext);

      // Re-encode and scale appended video, then concat via filter_complex
      // This is fast if we just use a single command
      const filterComplex = hasAudio 
        ? \`[1:v]scale=\${srcWidth}:\${srcHeight}:force_original_aspect_ratio=decrease,pad=\${srcWidth}:\${srcHeight}:(ow-iw)/2:(oh-ih)/2[v1];[0:v][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]\`
        : \`[1:v]scale=\${srcWidth}:\${srcHeight}:force_original_aspect_ratio=decrease,pad=\${srcWidth}:\${srcHeight}:(ow-iw)/2:(oh-ih)/2[v1];[0:v][v1]concat=n=2:v=1:a=0[v]\`;

      const mapArgs = hasAudio ? ['-map', '[v]', '-map', '[a]'] : ['-map', '[v]'];
      
      const args = [
        '-i', baseFilePath,
        '-i', appendFilePath,
        '-filter_complex', filterComplex,
        ...mapArgs,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        ...(hasAudio ? ['-c:a', 'aac'] : []),
        '-y', outPath
      ];

      console.log('Merging:', ffmpegPath, args.join(' '));
      execFileSync(ffmpegPath, args);

      return { ok: true, path: outPath };
    } catch (err) {
      console.error(err);
      return { ok: false, error: err.message };
    }
  });
`;

content = content.replace("ipcMain.on('veditor-cancel-export', () => {", pickIpc + "\n  ipcMain.on('veditor-cancel-export', () => {");
fs.writeFileSync(file, content, 'utf8');
console.log("Injected IPC handlers.");
