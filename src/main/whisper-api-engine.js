'use strict';

/**
 * whisper-api-engine.js — Multi-provider Whisper API transcription engine.
 * Sends recorded audio (Float32 PCM → WAV) to OpenAI or Groq transcription endpoints.
 * 
 * Supported providers:
 *   - OpenAI:  api.openai.com/v1/audio/transcriptions
 *   - Groq:    api.groq.com/openai/v1/audio/transcriptions
 *
 * No chunking needed — 5-minute max recording cap limits audio to ~5 MB,
 * well below the 25 MB upload limit on both providers.
 */

const https = require('https');
const store = require('../../store/config');

// ── Provider configurations ──
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    hostname: 'api.openai.com',
    path: '/v1/audio/transcriptions',
    models: [
      { id: 'whisper-1',              name: 'Whisper v2 (whisper-1)' },
      { id: 'gpt-4o-transcribe',      name: 'GPT-4o Transcribe' },
      { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe' },
    ],
    defaultModel: 'whisper-1',
  },
  groq: {
    name: 'Groq',
    hostname: 'api.groq.com',
    path: '/openai/v1/audio/transcriptions',
    models: [
      { id: 'whisper-large-v3',            name: 'Whisper Large v3' },
      { id: 'whisper-large-v3-turbo',      name: 'Whisper Large v3 Turbo' },
      { id: 'distil-whisper-large-v3-en',  name: 'Distil Whisper Large v3 (English)' },
    ],
    defaultModel: 'whisper-large-v3-turbo',
  },
};

// ── Supported languages (ISO 639-1) ──
const WHISPER_LANGUAGES = [
  { code: '',     name: 'Auto-detect' },
  { code: 'en',   name: 'English' },
  { code: 'es',   name: 'Spanish' },
  { code: 'fr',   name: 'French' },
  { code: 'de',   name: 'German' },
  { code: 'it',   name: 'Italian' },
  { code: 'pt',   name: 'Portuguese' },
  { code: 'ru',   name: 'Russian' },
  { code: 'ja',   name: 'Japanese' },
  { code: 'ko',   name: 'Korean' },
  { code: 'zh',   name: 'Chinese' },
  { code: 'ar',   name: 'Arabic' },
  { code: 'hi',   name: 'Hindi' },
  { code: 'bn',   name: 'Bengali' },
  { code: 'tr',   name: 'Turkish' },
  { code: 'pl',   name: 'Polish' },
  { code: 'nl',   name: 'Dutch' },
  { code: 'sv',   name: 'Swedish' },
  { code: 'da',   name: 'Danish' },
  { code: 'fi',   name: 'Finnish' },
  { code: 'no',   name: 'Norwegian' },
  { code: 'uk',   name: 'Ukrainian' },
  { code: 'vi',   name: 'Vietnamese' },
  { code: 'th',   name: 'Thai' },
  { code: 'id',   name: 'Indonesian' },
  { code: 'ms',   name: 'Malay' },
  { code: 'fa',   name: 'Persian' },
  { code: 'ur',   name: 'Urdu' },
  { code: 'he',   name: 'Hebrew' },
  { code: 'ro',   name: 'Romanian' },
  { code: 'hu',   name: 'Hungarian' },
  { code: 'cs',   name: 'Czech' },
  { code: 'el',   name: 'Greek' },
  { code: 'bg',   name: 'Bulgarian' },
];

/**
 * Get the resolved provider config (hostname + path).
 * Supports custom base URL overrides.
 * @param {string} providerId - 'openai' | 'groq'
 * @param {string} [customBaseUrl] - Optional custom base URL
 */
function getProviderConfig(providerId, customBaseUrl) {
  const provider = PROVIDERS[providerId] || PROVIDERS.openai;

  if (customBaseUrl) {
    // Parse custom base URL
    try {
      const url = new URL(customBaseUrl);
      return {
        hostname: url.hostname,
        path: url.pathname.replace(/\/$/, '') + '/audio/transcriptions',
        port: url.port || undefined,
      };
    } catch {
      console.warn('[WhisperAPI] Invalid custom base URL, falling back to provider default');
    }
  }

  return { hostname: provider.hostname, path: provider.path };
}

/**
 * Convert Float32 PCM samples to a WAV file buffer.
 * @param {Float32Array} samples - Mono audio samples
 * @param {number} sampleRate - Sample rate (e.g. 16000)
 * @returns {Buffer} Complete WAV file as a Buffer
 */
function pcmToWav(samples, sampleRate) {
  const numSamples = samples.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);           // PCM format
  buffer.writeUInt16LE(1, 22);           // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);          // 16 bits per sample

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write samples as int16
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.round(val), 44 + i * bytesPerSample);
  }

  return buffer;
}

/**
 * Transcribe audio using Whisper API.
 * @param {Float32Array} samples - Audio samples (16kHz, mono, float32)
 * @param {number} sampleRate - Sample rate (default 16000)
 * @param {object} [profile] - Profile object: { provider, model, apiKey, baseUrl }
 *   If omitted, reads from store (legacy support).
 * @returns {Promise<string>} Transcribed text
 */
async function transcribe(samples, sampleRate = 16000, profile) {
  const apiKey = profile?.apiKey || store.get('whisperApiKey') || '';
  if (!apiKey) {
    throw new Error('No API key configured. Go to Settings → Whisper API.');
  }

  const providerId = profile?.provider || store.get('whisperApiProvider') || 'openai';
  const model = profile?.model || store.get('whisperApiModel') || 'whisper-1';
  const baseUrl = profile?.baseUrl || store.get('whisperApiBaseUrl') || '';
  const language = store.get('whisperApiLanguage') || '';
  const providerCfg = getProviderConfig(providerId, baseUrl);

  const durationSec = samples.length / sampleRate;
  console.log(`[WhisperAPI] Transcribing ${durationSec.toFixed(1)}s audio via ${providerId} (model: ${model})`);

  // Convert PCM to WAV
  const wavBuffer = pcmToWav(samples, sampleRate);
  console.log(`[WhisperAPI] WAV size: ${(wavBuffer.length / 1024).toFixed(1)} KB`);

  // Build multipart/form-data body
  const boundary = '----WhisperBoundary' + Date.now();
  const parts = [];

  // file field
  parts.push(
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n`,
    `Content-Type: audio/wav\r\n\r\n`,
  );
  const fileHeader = Buffer.from(parts.join(''));
  const afterFile = Buffer.from('\r\n');

  // model field
  const modelField = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`
  );

  // language field (optional)
  let langField = Buffer.alloc(0);
  if (language) {
    langField = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`
    );
  }

  // response_format field — plain text for simplicity
  const formatField = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n`
  );

  const closingBoundary = Buffer.from(`--${boundary}--\r\n`);

  // Assemble full body
  const body = Buffer.concat([
    fileHeader, wavBuffer, afterFile,
    modelField,
    langField,
    formatField,
    closingBoundary,
  ]);

  // Send HTTPS request
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: providerCfg.hostname,
      path: providerCfg.path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };
    if (providerCfg.port) reqOpts.port = providerCfg.port;

    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const text = data.trim();
          console.log(`[WhisperAPI] Transcribed: "${text.substring(0, 80)}${text.length > 80 ? '…' : ''}"`);
          resolve(text);
        } else {
          let errorMsg = `HTTP ${res.statusCode}`;
          try {
            const parsed = JSON.parse(data);
            errorMsg = parsed.error?.message || errorMsg;
          } catch {}
          console.error(`[WhisperAPI] API error: ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      });
    });

    req.on('error', (e) => {
      console.error('[WhisperAPI] Request failed:', e.message);
      reject(new Error('Network error: ' + e.message));
    });

    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout (120s) — try a shorter recording'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Test the API key by sending a tiny silent audio clip.
 * @param {string} apiKey - Key to test (falls back to stored key if empty)
 * @param {string} [provider] - Provider to test against
 * Returns { ok: true } or { ok: false, error: '...' }
 */
async function testApiKey(apiKey, provider) {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: 'No API key provided' };
  }

  // Resolve provider config
  const providerId = provider || 'openai';
  const providerDef = PROVIDERS[providerId] || PROVIDERS.openai;

  let hostname = providerDef.hostname;
  let apiPath = providerDef.path;
  let port;

  // Use the provider's default model for testing
  const testModel = providerDef.defaultModel;

  // Create a tiny 0.5s silent WAV
  const sampleRate = 16000;
  const samples = new Float32Array(sampleRate / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = (Math.random() - 0.5) * 0.001;
  }
  const wavBuffer = pcmToWav(samples, sampleRate);

  const boundary = '----WhisperTest' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
    wavBuffer,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${testModel}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n`),
    Buffer.from(`--${boundary}--\r\n`),
  ]);

  return new Promise((resolve) => {
    const reqOpts = {
      hostname,
      path: apiPath,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };
    if (port) reqOpts.port = port;

    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ ok: true });
        } else {
          let errorMsg = `HTTP ${res.statusCode}`;
          try {
            const parsed = JSON.parse(data);
            errorMsg = parsed.error?.message || errorMsg;
          } catch {}
          resolve({ ok: false, error: errorMsg });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ ok: false, error: e.message });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ ok: false, error: 'Connection timeout' });
    });

    req.write(body);
    req.end();
  });
}

module.exports = {
  transcribe,
  testApiKey,
  pcmToWav,
  WHISPER_LANGUAGES,
  PROVIDERS,
};
