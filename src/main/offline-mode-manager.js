'use strict';

/**
 * offline-mode-manager.js — Orchestrator for offline dictation.
 * Ties together: key hold detection → audio recording → STT → LLM → paste
 * 
 * Flow:
 *   1. User holds Right Shift → show pill overlay + start recording
 *   2. User releases Right Shift → stop recording → show "Processing…"
 *   3. Send audio to sherpa-onnx → get transcript
 *   4. If LLM enabled → polish with node-llama-cpp
 *   5. Paste result to active text field
 */

const { BrowserWindow } = require('electron');
const store = require('../../store/config');
const offlineRecorder = require('./offline-recorder');
const { offlineSttEngine } = require('./offline-stt-engine');
const { offlineLlmEngine } = require('./offline-llm-engine');

// ── Download manager for models ──
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class OfflineModeManager {
  constructor() {
    this._enabled = false;
    this._pillWindow = null;
    this._isProcessing = false;
    this._clipboardManager = null; // Set externally
    this._activeDownloads = new Map(); // modelId → { abort, progress }
    this._maxRecordingTimer = null; // Safety timer for max recording duration
  }

  /** Initialize from stored config */
  init() {
    this._enabled = store.get('offlineModeEnabled') === true;
    
    // Auto-load the selected STT model on startup if enabled
    if (this._enabled) {
      const sttModelPath = store.get('offlineSttModelPath');
      if (sttModelPath && fs.existsSync(sttModelPath)) {
        offlineSttEngine.loadModel(sttModelPath).catch(e => {
          console.error('[OfflineMode] Failed to auto-load STT model:', e.message);
        });
      }

      const llmEnabled = store.get('offlineLlmEnabled') === true;
      const llmModelPath = store.get('offlineLlmModelPath');
      if (llmEnabled && llmModelPath && fs.existsSync(llmModelPath)) {
        offlineLlmEngine.loadModel(llmModelPath).catch(e => {
          console.error('[OfflineMode] Failed to auto-load LLM model:', e.message);
        });
      }
    }
  }

  /** Set the clipboard manager reference for text injection */
  setClipboardManager(cm) {
    this._clipboardManager = cm;
  }

  /** Set the pill overlay window reference */
  setPillWindow(win) {
    this._pillWindow = win;
    offlineRecorder.setPillWindow(win);
  }

  /** Is offline mode enabled in settings? */
  get isEnabled() {
    return store.get('offlineModeEnabled') === true;
  }

  /** Is a transcription currently being processed? */
  get isProcessing() {
    return this._isProcessing;
  }

  /**
   * Called when the activation key is pressed down.
   * Shows the pill overlay and starts recording.
   */
  onKeyDown() {
    if (!this.isEnabled || this._isProcessing) return;
    if (offlineRecorder.isRecording) return;

    // Runtime trial check — block if 15-day trial expired (free users)
    try {
      const { checkOfflineTrialExpiry } = require('./licensing');
      const trial = checkOfflineTrialExpiry();
      if (trial.expired) {
        const { showOfflineLockedPopup } = require('./window-manager');
        showOfflineLockedPopup();
        return;
      }
    } catch (_) { /* licensing module not available — allow */ }

    // Show the pill overlay
    this._showPill('recording');

    // Start recording
    offlineRecorder.startRecording();

    // ── Safety cap: auto-stop after 5 minutes ──
    // This calls the normal onKeyUp() flow, so ALL recorded audio
    // is transcribed and pasted. Nothing is ever thrown away.
    const MAX_RECORDING_MS = 5 * 60 * 1000;
    this._maxRecordingTimer = setTimeout(() => {
      console.warn(`[OfflineMode] Max recording duration (${MAX_RECORDING_MS / 1000}s) reached — auto-processing`);
      this.onKeyUp();
    }, MAX_RECORDING_MS);
  }

  /**
   * Called when the activation key is released.
   * Stops recording and processes the audio.
   */
  async onKeyUp() {
    if (!offlineRecorder.isRecording) return;

    // Clear the max-recording safety timer
    if (this._maxRecordingTimer) {
      clearTimeout(this._maxRecordingTimer);
      this._maxRecordingTimer = null;
    }

    this._isProcessing = true;
    this._updatePill('processing');

    // ── Safety timeout: auto-reset after 120s to prevent permanent lock ──
    const safetyTimer = setTimeout(() => {
      if (this._isProcessing) {
        console.error('[OfflineMode] Processing timeout (120s) — force-resetting state');
        this._isProcessing = false;
        this._updatePill('error', 'Processing took too long. Try a shorter recording.');
        setTimeout(() => this._hidePill(), 3000);
      }
    }, 120_000);

    try {
      // 1. Stop recording and get audio data
      const audioData = await offlineRecorder.stopRecording();
      if (!audioData || !audioData.samples || audioData.samples.length === 0) {
        console.warn('[OfflineMode] No audio data recorded');
        this._hidePill();
        this._isProcessing = false;
        return;
      }

      const durationSec = audioData.samples.length / audioData.sampleRate;
      console.log(`[OfflineMode] Got ${audioData.samples.length} samples at ${audioData.sampleRate}Hz (${durationSec.toFixed(1)}s)`);

      // 2. Check if STT engine is ready
      if (!offlineSttEngine.isReady) {
        console.error('[OfflineMode] STT engine not ready — no model loaded');
        this._updatePill('error', 'No STT model loaded. Go to Settings → Offline Mode.');
        setTimeout(() => this._hidePill(), 3000);
        this._isProcessing = false;
        return;
      }

      // 3. Transcribe with sherpa-onnx (runs chunked for long audio)
      this._updatePill('transcribing', durationSec > 30 ? `Transcribing ${durationSec.toFixed(0)}s audio…` : undefined);
      let transcript;
      try {
        // Yield to event loop before heavy processing so the UI can update
        await new Promise(resolve => setImmediate(resolve));
        transcript = offlineSttEngine.transcribe(audioData.samples, audioData.sampleRate);
      } catch (e) {
        console.error('[OfflineMode] STT failed:', e.message);
        this._updatePill('error', 'STT failed: ' + e.message);
        setTimeout(() => this._hidePill(), 3000);
        this._isProcessing = false;
        return;
      }

      if (!transcript || !transcript.trim()) {
        console.log('[OfflineMode] Empty transcript — nothing to paste');
        this._hidePill();
        this._isProcessing = false;
        return;
      }

      // 4. Optionally polish with LLM
      let finalText = transcript;
      const llmEnabled = store.get('offlineLlmEnabled') === true;
      
      if (llmEnabled && offlineLlmEngine.isReady) {
        this._updatePill('polishing');
        try {
          // Custom prompt overrides default; empty string = use hidden default
          const customPrompt = store.get('offlineSystemPrompt') || '';
          finalText = await offlineLlmEngine.polishText(transcript, customPrompt || undefined);
        } catch (e) {
          console.warn('[OfflineMode] LLM polish failed, using raw transcript:', e.message);
          // LLM failed — use raw whisper output (never lose user's words)
          finalText = transcript;
        }
      }

      // 5. Paste result
      if (finalText && finalText.trim()) {
        this._updatePill('done', finalText.substring(0, 60) + (finalText.length > 60 ? '…' : ''));
        
        if (this._clipboardManager) {
          this._clipboardManager.injectText(finalText);
        }
      }

      // Hide pill after a brief display of success
      setTimeout(() => this._hidePill(), 1200);

    } catch (e) {
      console.error('[OfflineMode] Processing error:', e);
      this._updatePill('error', e.message);
      setTimeout(() => this._hidePill(), 3000);
    } finally {
      clearTimeout(safetyTimer);
      this._isProcessing = false;
    }
  }

  /** Show the pill overlay with a given state */
  _showPill(state) {
    if (!this._pillWindow || this._pillWindow.isDestroyed()) return;
    this._pillWindow.webContents.send('offline-pill-state', { state });
    this._pillWindow.showInactive();

    // Restore saved position, or default to centered near top of screen
    const savedPos = store.get('offlinePillPosition');
    if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
      this._pillWindow.setPosition(savedPos.x, savedPos.y);
    } else {
      const { screen } = require('electron');
      const display = screen.getPrimaryDisplay();
      const { width } = display.workAreaSize;
      const pillWidth = 240;
      const x = Math.round((width - pillWidth) / 2);
      this._pillWindow.setPosition(x, 60);
    }
  }

  /** Update the pill overlay state */
  _updatePill(state, detail) {
    if (!this._pillWindow || this._pillWindow.isDestroyed()) return;
    this._pillWindow.webContents.send('offline-pill-state', { state, detail });
  }

  /** Hide the pill overlay */
  _hidePill() {
    if (!this._pillWindow || this._pillWindow.isDestroyed()) return;
    this._pillWindow.hide();
  }

  // ── Model Download ──

  /**
   * Download a model file from a URL to the appropriate directory.
   * Emits progress updates to any open settings/pill window.
   * @param {string} modelId - Unique model identifier
   * @param {string} url - Download URL
   * @param {string} type - 'stt' or 'llm'
   * @param {string} filename - Target filename
   */
  async downloadModel(modelId, url, type, filename) {
    const baseDir = type === 'stt'
      ? path.join(app.getPath('userData'), 'offline-models', 'stt')
      : path.join(app.getPath('userData'), 'offline-models', 'llm');
    
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

    const targetPath = path.join(baseDir, filename);

    // For STT: check if extracted directory already exists (modelId is dir name)
    if (type === 'stt') {
      const extractedDir = path.join(baseDir, modelId);
      if (fs.existsSync(extractedDir)) {
        this._broadcastDownloadProgress(modelId, { status: 'complete', path: extractedDir });
        return extractedDir;
      }
    } else {
      // For LLM: check if file already exists
      if (fs.existsSync(targetPath)) {
        this._broadcastDownloadProgress(modelId, { status: 'complete', path: targetPath });
        return targetPath;
      }
    }

    const downloadedPath = await new Promise((resolve, reject) => {
      const tempPath = targetPath + '.download';

      const doRequest = (downloadUrl) => {
        const proto = downloadUrl.startsWith('https') ? https : http;
        const req = proto.get(downloadUrl, (res) => {
          // Handle redirects (may switch between http/https)
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume(); // drain the response so socket can be freed
            doRequest(res.headers.location);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          // Create file stream only when we have the final 200 response
          const file = fs.createWriteStream(tempPath);

          const totalSize = parseInt(res.headers['content-length'], 10) || 0;
          let downloadedSize = 0;

          res.on('data', (chunk) => {
            downloadedSize += chunk.length;
            const progress = totalSize ? Math.round((downloadedSize / totalSize) * 100) : -1;
            this._broadcastDownloadProgress(modelId, { 
              status: 'downloading', 
              progress, 
              downloaded: downloadedSize, 
              total: totalSize 
            });
          });

          res.pipe(file);

          file.on('finish', () => {
            file.close();
            try {
              fs.renameSync(tempPath, targetPath);
              resolve(targetPath);
            } catch (e) {
              reject(e);
            }
          });

          file.on('error', (e) => {
            try { fs.unlinkSync(tempPath); } catch {}
            reject(e);
          });
        });

        req.on('error', (e) => {
          try { fs.unlinkSync(tempPath); } catch {}
          this._broadcastDownloadProgress(modelId, { status: 'error', error: e.message });
          reject(e);
        });

        this._activeDownloads.set(modelId, { abort: () => req.destroy() });
      };

      doRequest(url);
    });

    // ── Post-download: extract tar.bz2 archives (STT models) ──
    if (type === 'stt' && (downloadedPath.endsWith('.tar.bz2') || downloadedPath.endsWith('.tar.gz') || downloadedPath.endsWith('.tgz'))) {
      this._broadcastDownloadProgress(modelId, { status: 'downloading', progress: 100, downloaded: 0, total: 0 });
      
      try {
        const { execSync } = require('child_process');
        console.log(`[OfflineMode] Extracting ${path.basename(downloadedPath)} to ${baseDir}`);
        execSync(`tar -xf "${downloadedPath}" -C "${baseDir}"`, { timeout: 120000 });
        
        // Remove the archive after successful extraction
        try { fs.unlinkSync(downloadedPath); } catch {}
        
        // Find the extracted directory (sherpa-onnx archives extract to a named folder)
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        const extracted = entries.find(e => e.isDirectory() && e.name.includes(modelId.replace('whisper-', 'whisper-')));
        const extractedPath = extracted ? path.join(baseDir, extracted.name) : baseDir;
        
        console.log(`[OfflineMode] Extracted to: ${extractedPath}`);
        this._broadcastDownloadProgress(modelId, { status: 'complete', path: extractedPath });
        return extractedPath;
      } catch (e) {
        console.error('[OfflineMode] Extraction failed:', e.message);
        this._broadcastDownloadProgress(modelId, { status: 'error', error: 'Extraction failed: ' + e.message });
        throw new Error('Failed to extract model archive: ' + e.message);
      }
    }

    this._broadcastDownloadProgress(modelId, { status: 'complete', path: downloadedPath });
    return downloadedPath;
  }

  /** Cancel an active download */
  cancelDownload(modelId) {
    const dl = this._activeDownloads.get(modelId);
    if (dl && dl.abort) {
      dl.abort();
      this._activeDownloads.delete(modelId);
    }
  }

  /** Delete a downloaded model */
  deleteModel(modelPath) {
    try {
      if (fs.statSync(modelPath).isDirectory()) {
        fs.rmSync(modelPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(modelPath);
      }
      return true;
    } catch (e) {
      console.error('[OfflineMode] Failed to delete model:', e.message);
      return false;
    }
  }

  /** Broadcast download progress to all windows */
  _broadcastDownloadProgress(modelId, data) {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('offline-download-progress', { modelId, ...data });
      }
    });
  }

  /** Get overall status for settings display */
  getStatus() {
    return {
      enabled: this.isEnabled,
      sttReady: offlineSttEngine.isReady,
      sttModel: offlineSttEngine.currentModelId,
      llmEnabled: store.get('offlineLlmEnabled') === true,
      llmReady: offlineLlmEngine.isReady,
      llmModel: offlineLlmEngine.currentModelId,
      installedSttModels: offlineSttEngine.getInstalledModels(),
      installedLlmModels: offlineLlmEngine.getInstalledModels(),
      recommendedSttModels: offlineSttEngine.getRecommendedModels(),
      recommendedLlmModels: offlineLlmEngine.getRecommendedModels(),
    };
  }
}

module.exports = new OfflineModeManager();
