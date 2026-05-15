'use strict';

/**
 * offline-recorder.js — Records system microphone audio as PCM Float32 samples.
 * Uses Electron's desktopCapturer / Node AudioContext is not available in main process,
 * so we delegate actual recording to a hidden renderer (the offline-pill window).
 * 
 * This module manages the recording lifecycle:
 *   startRecording() → sends IPC to pill window to begin capturing
 *   stopRecording()  → sends IPC to pill window to stop, returns the audio buffer
 */

class OfflineRecorder {
  constructor() {
    this._pillWindow = null;
    this._recordingResolve = null;
    this._isRecording = false;
  }

  /** Set the pill window reference so we can send IPC to it */
  setPillWindow(win) {
    this._pillWindow = win;
  }

  /** Is the recorder currently active? */
  get isRecording() {
    return this._isRecording;
  }

  /**
   * Start recording audio.
   * The actual audio capture happens in the pill renderer process.
   */
  startRecording() {
    if (this._isRecording) return;
    if (!this._pillWindow || this._pillWindow.isDestroyed()) {
      console.error('[OfflineRecorder] No pill window available');
      return;
    }
    this._isRecording = true;
    this._pillWindow.webContents.send('offline-start-recording');
    console.log('[OfflineRecorder] Recording started');
  }

  /**
   * Stop recording and get the audio data.
   * Returns a Promise that resolves with { samples: Float32Array, sampleRate: number }
   */
  stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this._isRecording) {
        resolve(null);
        return;
      }
      if (!this._pillWindow || this._pillWindow.isDestroyed()) {
        this._isRecording = false;
        reject(new Error('Pill window not available'));
        return;
      }

      this._recordingResolve = resolve;
      this._isRecording = false;
      this._pillWindow.webContents.send('offline-stop-recording');

      // Safety timeout — if pill doesn't respond within 5s, resolve with null
      setTimeout(() => {
        if (this._recordingResolve) {
          console.warn('[OfflineRecorder] Timeout waiting for audio data');
          this._recordingResolve = null;
          resolve(null);
        }
      }, 5000);
    });
  }

  /**
   * Called by IPC handler when the pill window sends back the recorded audio.
   * @param {Object} data - { samples: number[], sampleRate: number }
   */
  onAudioDataReceived(data) {
    if (this._recordingResolve) {
      const resolve = this._recordingResolve;
      this._recordingResolve = null;
      if (data && data.samples && data.samples.length > 0) {
        resolve({
          samples: new Float32Array(data.samples),
          sampleRate: data.sampleRate || 16000,
        });
      } else {
        resolve(null);
      }
    }
  }

  /**
   * Cancel recording without processing — used by close button on pill.
   * Cleans up pending promise and resets state.
   */
  cancelRecording() {
    this._isRecording = false;
    // Tell the pill renderer to release the mic stream — without this,
    // the getUserMedia stream stays open and macOS shows the mic indicator.
    if (this._pillWindow && !this._pillWindow.isDestroyed()) {
      this._pillWindow.webContents.send('offline-stop-recording');
    }
    if (this._recordingResolve) {
      this._recordingResolve(null);
      this._recordingResolve = null;
    }
    console.log('[OfflineRecorder] Recording cancelled');
  }
}

module.exports = new OfflineRecorder();
