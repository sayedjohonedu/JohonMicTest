'use strict';

/* ── Offline Pill Overlay — UI Logic ──────────────────────────────── */
/* Handles mic recording in the renderer process.                      */
/* Uses the same visualizer engine as the main overlay pill mode.       */

// Sparkle SVG — same icon as the AI Dictation entry in the settings sidebar
const SPARKLE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`;
const WARN_SVG    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
const CHECK_SVG   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

const STATUS_MAP = {
  recording:    { icon: '',          text: 'Listening…' },
  processing:   { icon: SPARKLE_SVG, text: 'Processing…' },
  transcribing: { icon: SPARKLE_SVG, text: 'Transcribing…' },
  polishing:    { icon: SPARKLE_SVG, text: 'AI Polishing…' },
  done:         { icon: CHECK_SVG,   text: 'Done!' },
  error:        { icon: WARN_SVG,    text: 'Error' },
};

const iconEl = document.getElementById('status-icon');
const textEl = document.getElementById('status-text');
const canvas = document.getElementById('mini-wave');
const ctx = canvas.getContext('2d');
const dotClose = document.getElementById('dot-close');

// ── Visualizer config — matches overlay.js exactly ──
let visualizerType = 'wave';
let isSpeaking = false;
let currentAudioData = { bins: new Array(15).fill(0), volume: 0 };
let smoothedBins = new Array(15).fill(0);
let smoothedVol = 0;
let miniPhase = 0;
let currentMiniAmp = 2.0;
const accentRgb = '124, 111, 255';

// Load saved visualizer type from config
window.offlineAPI.getConfig().then(cfg => {
  if (cfg.visualizerType) visualizerType = cfg.visualizerType;
});

// ── Audio Recording ──
let mediaStream = null;
let audioContext = null;
let analyser = null;
let scriptProcessor = null;
let recordedChunks = [];
let sampleRate = 16000;
let waveAnimFrame = null;
let _isStarting = false;   // true while getUserMedia is in progress
let _pendingStop = false;  // true if stopRecording was called during startup

// Particles for the particles visualizer (same as overlay.js)
const particles = Array.from({ length: 40 }).map(() => ({
  x: Math.random(), y: Math.random(),
  speed: Math.random() * 0.02 + 0.005,
  offset: Math.random() * Math.PI * 2
}));

/**
 * Release all media resources (mic stream, audio context, processor).
 * Centralized cleanup to ensure mic indicator always clears.
 */
function releaseAllMedia() {
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
    analyser = null;
  }
}

async function startRecording() {
  _pendingStop = false;
  _isStarting = true;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        sampleRate: 16000,
      }
    });

    // ── Race condition guard ──
    // If stopRecording() was called while getUserMedia was resolving
    // (user did a quick tap), immediately release the mic and send empty data.
    if (_pendingStop) {
      console.warn('[OfflinePill] Stop requested during mic init — releasing immediately');
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
      _isStarting = false;
      _pendingStop = false;
      // Send empty data so the main process can resolve its pending promise
      window.offlineAPI.sendAudioData({ samples: [], sampleRate: 16000 });
      return;
    }

    audioContext = new AudioContext({ sampleRate: 16000 });
    sampleRate = audioContext.sampleRate;
    const source = audioContext.createMediaStreamSource(mediaStream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    // Use ScriptProcessor to capture raw PCM
    const bufferSize = 4096;
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    recordedChunks = [];

    scriptProcessor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      recordedChunks.push(new Float32Array(data));

      // Feed audio data to visualizer from analyser
      if (analyser) {
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);

        // Downsample to 15 bins (matching overlay.js)
        const bins = [];
        const step = Math.floor(freqData.length / 15);
        for (let i = 0; i < 15; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += freqData[i * step + j];
          }
          bins.push(sum / step);
        }

        // Volume from time domain
        const timeDomainData = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(timeDomainData);
        let maxVol = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const v = Math.abs(timeDomainData[i] - 128);
          if (v > maxVol) maxVol = v;
        }

        currentAudioData = { bins, volume: maxVol * 2 };
        isSpeaking = maxVol > 5;
      }
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    _isStarting = false;
    // Use classList instead of className to preserve the ai-mode class
    // that was already set by the preceding onPillState IPC message
    document.body.classList.remove('processing', 'transcribing', 'polishing', 'done', 'error');
    document.body.classList.add('recording');
    isSpeaking = true;
    startVisualizer();
    console.log('[OfflinePill] Recording started');
  } catch (e) {
    _isStarting = false;
    _pendingStop = false;
    console.error('[OfflinePill] Mic access failed:', e);
    document.body.className = 'error';
    textEl.textContent = 'Mic access denied';
    // Send empty data so main process doesn't hang waiting
    window.offlineAPI.sendAudioData({ samples: [], sampleRate: 16000 });
  }
}

function stopRecording() {
  isSpeaking = false;

  // ── Handle race condition: stop called while getUserMedia is still resolving ──
  if (_isStarting) {
    console.warn('[OfflinePill] Stop called during mic init — setting pending stop');
    _pendingStop = true;
    return; // startRecording() will handle cleanup when getUserMedia resolves
  }

  // Stop waveform animation
  if (waveAnimFrame) {
    cancelAnimationFrame(waveAnimFrame);
    waveAnimFrame = null;
  }

  // Merge all recorded chunks into one Float32Array
  const totalLength = recordedChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of recordedChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  recordedChunks = [];

  // Release all media resources (mic, audio context, processor)
  releaseAllMedia();

  // Send audio data back to main process
  // Convert Float32Array to regular array for IPC serialization
  window.offlineAPI.sendAudioData({
    samples: Array.from(merged),
    sampleRate: sampleRate,
  });

  console.log(`[OfflinePill] Sent ${merged.length} samples at ${sampleRate}Hz (${(merged.length / sampleRate).toFixed(1)}s)`);
}

// ── Canvas sizing (retina-aware, matches overlay.js) ──
function resizeMiniCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.offsetWidth * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeMiniCanvas();
new ResizeObserver(resizeMiniCanvas).observe(canvas);

// ── Visualizer Drawing — exact copies from overlay.js ──

function getNeonGradient(c, w) {
  const g = c.createLinearGradient(0, 0, w, 0);
  const rgb = accentRgb;
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(0.15, `rgba(${rgb},0.85)`);
  g.addColorStop(0.85, `rgba(${rgb},0.85)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  return g;
}

function updateSmoothings() {
  smoothedVol += ((isSpeaking ? currentAudioData.volume / 255 : 0) - smoothedVol) * 0.2;
  for (let i = 0; i < 15; i++) {
    smoothedBins[i] += ((isSpeaking ? currentAudioData.bins[i] / 255 : 0) - smoothedBins[i]) * 0.2;
  }
}

function drawTypeWave(c, w, h) {
  const phaseStep = isSpeaking ? 0.075 : 0.022;
  miniPhase += phaseStep;
  const targetAmp = isSpeaking ? 2 + (currentAudioData.volume / 255) * 12 : 2;
  currentMiniAmp += (targetAmp - currentMiniAmp) * 0.2;
  const amp = currentMiniAmp;

  c.beginPath();
  const steps = Math.floor(w / 3);
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const y = h/2 + Math.sin(i*0.45 + miniPhase) * amp
            + Math.sin(i*0.9 + miniPhase * 1.3) * amp * 0.5
            + Math.sin(i*0.2 + miniPhase * 0.7) * amp * 0.3;
    i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
  }
  c.strokeStyle = getNeonGradient(c, w);
  c.lineWidth = isSpeaking ? 2 : 1.2;
  c.shadowBlur = isSpeaking ? 10 : 3;
  c.shadowColor = `rgba(${accentRgb},0.55)`;
  c.stroke();
}

function drawTypeBars(c, w, h) {
  const barCount = 15, gap = 2, playArea = w * 0.8;
  const startX = (w - playArea) / 2;
  const barWidth = (playArea - (gap * (barCount - 1))) / barCount;
  c.fillStyle = getNeonGradient(c, w);
  c.shadowBlur = isSpeaking ? 8 : 2;
  c.shadowColor = `rgba(${accentRgb},0.5)`;
  for (let i = 0; i < barCount; i++) {
    const height = 2 + smoothedBins[i] * h * 0.8;
    const x = startX + i * (barWidth + gap);
    const y = h/2 - height/2;
    c.beginPath();
    c.roundRect ? c.roundRect(x, y, barWidth, height, barWidth/2) : c.rect(x, y, barWidth, height);
    c.fill();
  }
}

function drawTypePulse(c, w, h) {
  const cx = w / 2, cy = h / 2, maxR = 12, minR = 3;
  c.shadowBlur = isSpeaking ? 15 : 5;
  c.shadowColor = `rgba(${accentRgb},0.8)`;
  c.strokeStyle = `rgba(${accentRgb},0.9)`;
  c.lineWidth = 2;
  const r1 = minR + smoothedVol * maxR;
  const r2 = minR + smoothedVol * maxR * 1.6;
  c.beginPath(); c.arc(cx, cy, Math.max(0, r1), 0, Math.PI*2); c.stroke();
  if (smoothedVol > 0.1) {
    c.strokeStyle = `rgba(${accentRgb},${0.5 * smoothedVol})`;
    c.beginPath(); c.arc(cx, cy, Math.max(0, r2), 0, Math.PI*2); c.stroke();
  }
}

function drawTypeParticles(c, w, h) {
  c.shadowBlur = isSpeaking ? 6 : 2;
  c.shadowColor = `rgba(${accentRgb},0.6)`;
  c.fillStyle = `rgba(${accentRgb},0.9)`;
  const pSize = 2;
  particles.forEach((p, i) => {
    const binVal = smoothedBins[i % 15];
    p.offset += p.speed;
    const px = (p.x * w) + Math.sin(p.offset) * (10 + binVal*20);
    const py = (h/2) + Math.cos(p.offset) * 4 * (1 + binVal*5);
    c.beginPath();
    c.arc(Math.max(0, px), Math.max(0, Math.min(h, py)), pSize + binVal*2, 0, Math.PI*2);
    c.fill();
  });
}

function drawTypeLine(c, w, h) {
  const count = 15, totalPts = count * 2 - 1, step = w / (totalPts - 1);
  const maxH = h*0.4, minH = 1;
  c.beginPath();
  let x = 0;
  for (let i = count - 1; i >= 0; i--, x += step) {
    const y = h/2 - minH - smoothedBins[i] * maxH;
    i === count - 1 ? c.moveTo(x, y) : c.lineTo(x, y);
  }
  for (let i = 1; i < count; i++, x += step) {
    const y = h/2 - minH - smoothedBins[i] * maxH;
    c.lineTo(x, y);
  }
  c.strokeStyle = getNeonGradient(c, w);
  c.lineWidth = 2;
  c.shadowBlur = isSpeaking ? 10 : 3;
  c.shadowColor = `rgba(${accentRgb},0.6)`;
  c.stroke();
}

function drawTypeMatrix(c, w, h) {
  const barCount = 15, gap = 2, blocksPerBar = 3;
  const playArea = w * 0.6, startX = (w - playArea) / 2;
  const bW = playArea / barCount;
  const bH = (h * 0.6) / blocksPerBar;
  for (let i = 0; i < barCount; i++) {
    const fillBlocks = Math.max(isSpeaking ? 1 : 0, Math.round(smoothedBins[i] * blocksPerBar));
    for (let j = 0; j < blocksPerBar; j++) {
      if ((j >= fillBlocks && fillBlocks > 0) || (!isSpeaking && j > 0)) continue;
      const x = startX + i * bW;
      const y = h/2 + 5 - (j * bH) - bH;
      c.fillStyle = isSpeaking ? `rgba(${accentRgb},${0.3 + (j / blocksPerBar)*0.7})` : `rgba(${accentRgb},0.1)`;
      c.shadowBlur = isSpeaking ? 4 : 0;
      c.shadowColor = `rgba(${accentRgb},0.5)`;
      c.fillRect(x + gap/2, y + gap/2, bW - gap, bH - gap);
    }
  }
}

function drawVisualizer() {
  updateSmoothings();
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  ctx.clearRect(0, 0, W, H);

  switch (visualizerType) {
    case 'bars':      drawTypeBars(ctx, W, H); break;
    case 'pulse':     drawTypePulse(ctx, W, H); break;
    case 'particles': drawTypeParticles(ctx, W, H); break;
    case 'line':      drawTypeLine(ctx, W, H); break;
    case 'matrix':    drawTypeMatrix(ctx, W, H); break;
    default:          drawTypeWave(ctx, W, H); break;
  }

  waveAnimFrame = requestAnimationFrame(drawVisualizer);
}

function startVisualizer() {
  if (waveAnimFrame) cancelAnimationFrame(waveAnimFrame);
  drawVisualizer();
}

// Start drawing immediately (idle state shows flat line)
startVisualizer();

// ── Close button handler ──
if (dotClose) {
  dotClose.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Cancel recording and hide — release all resources
    _isStarting = false;
    _pendingStop = false;
    releaseAllMedia();
    recordedChunks = [];
    isSpeaking = false;
    window.offlineAPI.cancelRecording();
  });
}

// ── IPC Listeners ──
window.offlineAPI.onStartRecording(() => {
  startRecording();
});

window.offlineAPI.onStopRecording(() => {
  stopRecording();
});

window.offlineAPI.onPillState(({ state, detail, aiMode }) => {
  const info = STATUS_MAP[state] || { icon: '🎙', text: state };
  // Use classList instead of className to preserve ai-mode across state changes
  const allStates = ['recording', 'processing', 'transcribing', 'polishing', 'done', 'error'];
  document.body.classList.remove(...allStates);
  document.body.classList.add(state);
  // Apply ai-mode class from the payload — arrives with every state message
  if (aiMode) {
    document.body.classList.add('ai-mode');
  } else {
    document.body.classList.remove('ai-mode');
  }
  iconEl.innerHTML = info.icon;
  textEl.textContent = detail || info.text;
});

// Listen for config changes (e.g. visualizer type changed in settings)
window.offlineAPI.onConfigUpdate((cfg) => {
  if (cfg.visualizerType) visualizerType = cfg.visualizerType;
});

// ── Whisper AI Polish badge (✦) ────────────────────────────────────────
// Secondary sync — fires when the user toggles AI mode via the shortcut
// while the pill is already visible (e.g. during a recording).
window.offlineAPI.onWhisperAiMode((on) => {
  if (on) {
    document.body.classList.add('ai-mode');
  } else {
    document.body.classList.remove('ai-mode');
  }
});

// Safety net: release mic on window destroy (app quit while recording)
// macOS does not always release the mic indicator when a renderer is killed,
// so we must explicitly stop all tracks before the window goes away.
window.addEventListener('beforeunload', () => {
  releaseAllMedia();
  recordedChunks = [];
});
