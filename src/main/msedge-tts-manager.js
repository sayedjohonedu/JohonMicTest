const { ipcMain } = require('electron');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

class MsEdgeTTSManager {
  constructor() {
    this.tts = new MsEdgeTTS();
    this.voicesCache = null;
    this.tempDir = path.join(os.tmpdir(), 'mictab-tts');
    
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    } else {
      // Clean up previous files to avoid disk bloat
      fs.readdirSync(this.tempDir).forEach(file => {
        try { fs.unlinkSync(path.join(this.tempDir, file)); } catch (e) {}
      });
    }
  }

  init() {
    // Expose IPC handlers
    ipcMain.handle('msedge-tts:get-voices', async () => {
      try {
        if (!this.voicesCache) {
          this.voicesCache = await this.tts.getVoices();
        }
        return this.voicesCache;
      } catch (err) {
        console.error('MsEdgeTTS getVoices error:', err);
        return [];
      }
    });

    ipcMain.handle('msedge-tts:synthesize', async (event, text, voiceShortName) => {
      try {
        // Output as 24khz mp3 96kbitrate for high quality
        await this.tts.setMetadata(voiceShortName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {});
        const { audioStream } = this.tts.toStream(text);
        
        const fileName = `tts-${uuidv4()}.mp3`;
        const filePath = path.join(this.tempDir, fileName);
        
        return new Promise((resolve, reject) => {
          const writeStream = fs.createWriteStream(filePath);
          audioStream.pipe(writeStream);
          
          writeStream.on('finish', () => {
            resolve({ filePath });
          });
          
          writeStream.on('error', (err) => {
            reject(err);
          });
          
          audioStream.on('error', (err) => {
            reject(err);
          });
        });
      } catch (err) {
        console.error('MsEdgeTTS synthesize error:', err);
        throw err;
      }
    });

    ipcMain.handle('msedge-tts:download', async (event, text, voiceShortName) => {
      try {
        await this.tts.setMetadata(voiceShortName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {});
        const { audioStream } = this.tts.toStream(text);
        
        const { dialog, BrowserWindow } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);
        const { canceled, filePath } = await dialog.showSaveDialog(win, {
          title: 'Save Voiceover',
          defaultName: 'voiceover.mp3',
          filters: [{ name: 'Audio', extensions: ['mp3'] }]
        });

        if (canceled || !filePath) return null;

        return new Promise((resolve, reject) => {
          const writeStream = fs.createWriteStream(filePath);
          audioStream.pipe(writeStream);
          
          writeStream.on('finish', () => {
            resolve(filePath);
          });
          
          writeStream.on('error', (err) => {
            reject(err);
          });
          
          audioStream.on('error', (err) => {
            reject(err);
          });
        });
      } catch (err) {
        console.error('MsEdgeTTS download error:', err);
        throw err;
      }
    });
  }
}

module.exports = MsEdgeTTSManager;
