'use strict';

/**
 * offline-stt-engine.js — Local speech-to-text using sherpa-onnx.
 * Supports Whisper and other model architectures (Zipformer, Paraformer, etc.)
 * Models are stored in userData/offline-models/stt/
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let sherpa = null;

// Lazy-load sherpa-onnx to avoid startup penalty
function getSherpa() {
  if (!sherpa) {
    try {
      sherpa = require('sherpa-onnx-node');
    } catch (e) {
      console.error('[OfflineSTT] Failed to load sherpa-onnx-node:', e.message);
      throw new Error('sherpa-onnx-node is not available. Please reinstall dependencies.');
    }
  }
  return sherpa;
}

// ── Model directory ──
function getModelsDir() {
  return path.join(app.getPath('userData'), 'offline-models', 'stt');
}

function ensureModelsDir() {
  const dir = getModelsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ── Recommended models ──
const RECOMMENDED_MODELS = [
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny (75MB)',
    description: 'Fastest, lowest accuracy. Good for quick notes.',
    size: '75MB',
    urls: {
      encoder: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2',
    },
    type: 'whisper',
    language: 'en',
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base (142MB)',
    description: 'Good balance of speed and accuracy for English.',
    size: '142MB',
    urls: {
      encoder: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.en.tar.bz2',
    },
    type: 'whisper',
    language: 'en',
  },
  {
    id: 'whisper-small',
    name: 'Whisper Small (466MB)',
    description: 'Recommended for most users. Multilingual support.',
    size: '466MB',
    urls: {
      encoder: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2',
    },
    type: 'whisper',
    language: 'multilingual',
  },
  {
    id: 'whisper-medium',
    name: 'Whisper Medium (1.5GB)',
    description: 'High accuracy, multilingual. Needs 16GB+ RAM.',
    size: '1.5GB',
    urls: {
      encoder: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-medium.tar.bz2',
    },
    type: 'whisper',
    language: 'multilingual',
  },
];

class OfflineSttEngine {
  constructor() {
    this._recognizer = null;
    this._currentModelId = null;
  }

  /**
   * Get list of installed STT models.
   * Scans userData/offline-models/stt/ for valid model directories.
   */
  getInstalledModels() {
    const dir = ensureModelsDir();
    const installed = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const modelDir = path.join(dir, entry.name);
        // Check for any .onnx files as indicator of a valid model
        const files = fs.readdirSync(modelDir, { recursive: true });
        const hasOnnx = files.some(f => String(f).endsWith('.onnx'));
        if (hasOnnx) {
          installed.push({
            id: entry.name,
            name: entry.name,
            path: modelDir,
            size: this._getDirSize(modelDir),
          });
        }
      }
    } catch (e) {
      console.warn('[OfflineSTT] Error scanning models:', e.message);
    }

    return installed;
  }

  /**
   * Get recommended models with download status.
   */
  getRecommendedModels() {
    const installed = this.getInstalledModels();

    return RECOMMENDED_MODELS.map(m => ({
      ...m,
      installed: installed.some(inst => inst.id.includes(m.id)),
    }));
  }

  /**
   * Load a Whisper model for offline recognition.
   * @param {string} modelPath - Path to the model directory
   */
  async loadModel(modelPath) {
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model path does not exist: ${modelPath}`);
    }

    const sherpaModule = getSherpa();

    // Find model files in the directory
    const encoder = this._findFile(modelPath, '-encoder.onnx');
    const decoder = this._findFile(modelPath, '-decoder.onnx');
    const tokens = this._findFile(modelPath, 'tokens.txt');

    if (!encoder || !decoder || !tokens) {
      throw new Error(`Model files incomplete in ${modelPath}. Need encoder.onnx, decoder.onnx, tokens.txt`);
    }

    try {
      // Dispose previous recognizer if any
      this.unloadModel();

      const config = {
        featConfig: {
          sampleRate: 16000,
          featureDim: 80,
        },
        modelConfig: {
          whisper: {
            encoder: encoder,
            decoder: decoder,
          },
          tokens: tokens,
          numThreads: 4,
          provider: 'cpu',
          debug: false,
        },
      };

      this._recognizer = new sherpaModule.OfflineRecognizer(config);
      this._currentModelId = path.basename(modelPath);
      console.log(`[OfflineSTT] Model loaded: ${this._currentModelId}`);
    } catch (e) {
      console.error('[OfflineSTT] Failed to load model:', e);
      throw e;
    }
  }

  /**
   * Transcribe audio samples using the loaded model.
   * Automatically chunks long audio into ≤30-second segments (Whisper's context limit)
   * to prevent hangs and ensure reliable transcription of any-length recordings.
   *
   * @param {Float32Array} samples - Audio samples (16kHz, mono, float32)
   * @param {number} sampleRate - Sample rate of the audio
   * @returns {string} Transcribed text
   */
  transcribe(samples, sampleRate = 16000) {
    if (!this._recognizer) {
      throw new Error('No STT model loaded. Please download and select a model.');
    }

    const durationSec = samples.length / sampleRate;
    console.log(`[OfflineSTT] Audio duration: ${durationSec.toFixed(1)}s (${samples.length} samples @ ${sampleRate}Hz)`);

    // Whisper's max context is 30 seconds. Chunk long audio to avoid hangs.
    const MAX_CHUNK_SEC = 28; // slightly under 30s to allow overlap
    const OVERLAP_SEC = 1;    // 1 second overlap between chunks for continuity
    const maxChunkSamples = Math.floor(MAX_CHUNK_SEC * sampleRate);
    const overlapSamples = Math.floor(OVERLAP_SEC * sampleRate);

    if (durationSec <= MAX_CHUNK_SEC + 2) {
      // Short enough to process in one pass
      return this._transcribeChunk(samples, sampleRate);
    }

    // ── Chunked transcription for long recordings ──
    console.log(`[OfflineSTT] Long audio detected (${durationSec.toFixed(1)}s) — splitting into ${MAX_CHUNK_SEC}s chunks`);
    const transcripts = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < samples.length) {
      const end = Math.min(offset + maxChunkSamples, samples.length);
      const chunk = samples.slice(offset, end);
      const chunkDuration = chunk.length / sampleRate;

      chunkIndex++;
      console.log(`[OfflineSTT] Chunk ${chunkIndex}: offset=${offset}, length=${chunk.length} (${chunkDuration.toFixed(1)}s)`);

      try {
        const text = this._transcribeChunk(chunk, sampleRate);
        if (text) transcripts.push(text);
      } catch (e) {
        console.warn(`[OfflineSTT] Chunk ${chunkIndex} failed:`, e.message);
        // Continue with remaining chunks — don't lose the whole recording
      }

      // Move forward, subtracting overlap for continuity
      offset = end - (end < samples.length ? overlapSamples : 0);

      // Safety: prevent infinite loop if chunk size is tiny
      if (end === offset) break;
    }

    const fullText = transcripts.join(' ');
    console.log(`[OfflineSTT] Transcribed ${chunkIndex} chunks → "${fullText.substring(0, 80)}..."`);
    return fullText.trim();
  }

  /**
   * Transcribe a single audio chunk (≤30s).
   * @param {Float32Array} samples
   * @param {number} sampleRate
   * @returns {string}
   * @private
   */
  _transcribeChunk(samples, sampleRate) {
    try {
      const stream = this._recognizer.createStream();
      stream.acceptWaveform({ sampleRate, samples });

      this._recognizer.decode(stream);

      const text = this._recognizer.getResult(stream).text || '';
      return text.trim();
    } catch (e) {
      console.error('[OfflineSTT] Chunk transcription failed:', e);
      throw e;
    }
  }

  /** Unload the current model to free memory */
  unloadModel() {
    if (this._recognizer) {
      try {
        // sherpa-onnx doesn't have explicit dispose, but nulling lets GC clean up
        this._recognizer = null;
        this._currentModelId = null;
      } catch (e) {
        console.warn('[OfflineSTT] Error unloading model:', e.message);
      }
    }
  }

  /** Get the currently loaded model ID */
  get currentModelId() {
    return this._currentModelId;
  }

  /** Check if a model is loaded and ready */
  get isReady() {
    return this._recognizer !== null;
  }

  /** Find a file matching a pattern in a directory (recursive) */
  _findFile(dir, pattern) {
    try {
      const walk = (d) => {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) {
            const found = walk(full);
            if (found) return found;
          } else if (entry.name.includes(pattern) || entry.name.endsWith(pattern)) {
            return full;
          }
        }
        return null;
      };
      return walk(dir);
    } catch {
      return null;
    }
  }

  /** Get total size of a directory in bytes */
  _getDirSize(dir) {
    let total = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          total += this._getDirSize(full);
        } else {
          total += fs.statSync(full).size;
        }
      }
    } catch {}
    return total;
  }
}

module.exports = {
  offlineSttEngine: new OfflineSttEngine(),
  RECOMMENDED_MODELS,
};
