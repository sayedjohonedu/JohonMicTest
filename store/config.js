let Store = require('electron-store');
if (Store.default) Store = Store.default;

const schema = {
  language: {
    type: 'string',
    default: 'en-US'
  },
  // ── Combo Hotkey ─────────────────────────────
  hotkey: {
    type: 'string',
    default: 'Alt+C'
  },
  hotkeyEnabled: {
    type: 'boolean',
    default: true
  },
  // ── Hold-Key Trigger ──────────────────────────
  holdKey: {
    type: 'string',
    default: ''           // e.g. 'F8', 'CapsLock', etc.
  },
  holdKeyEnabled: {
    type: 'boolean',
    default: false
  },
  holdDuration: {
    type: 'number',
    default: 1            // seconds (0.5, 1, 2, 3)
  },
  // ── Other ─────────────────────────────────────
  autoStop: {
    type: 'boolean',
    default: true
  },
  autoLaunch: {
    type: 'boolean',
    default: true
  },
  // ── Text Replacement ──────────────────────────
  textReplaceEnabled: {
    type: 'boolean',
    default: false
  },
  textReplacements: {
    type: 'array',
    default: []
  },
  // ── Licensing ─────────────────────────────────
  licenseKey: {
    type: 'string',
    default: ''
  },
  firstLaunchDate: {
    type: 'number',
    default: 0
  },
  licenseStatus: {
    type: 'string',
    default: 'trial' // trial, active, expired
  },
  licensePurchase: {
    type: 'object',
    default: {}
  },
  // ── Appearance ────────────────────────────────────────────
  theme: {
    type: 'string',
    default: 'system'   // 'system' | 'dark' | 'light'
  },
  // ── Voice Behaviour ───────────────────────────────────────
  silenceTimeout: {
    type: 'number',
    default: 15       // seconds (0 = infinite)
  },
  // ── Overlay mode ─────────────────────────────────────────
  overlayMini: {
    type: 'boolean',
    default: false    // false = full mode, true = pill/mini mode
  },
  overlayMiniPosition: {
    type: 'object',
    default: {}       // { x, y } last pill position
  },
  // ── Usage Stats ───────────────────────────────────────────
  statsWords: {
    type: 'number',
    default: 0        // cumulative word count across all sessions
  },
  statsSessions: {
    type: 'number',
    default: 0        // total number of listening sessions started
  },
  statsLangUsage: {
    type: 'object',
    default: {}       // { 'en-US': 1200, 'bn-BD': 350, ... }
  },
  statsFirstDate: {
    type: 'number',
    default: 0        // timestamp of first dictation session
  },
  // ── Mic Selector ──────────────────────────────────────────────
  selectedMicId: {
    type: 'string',
    default: ''       // '' = use system default (Web Speech API default)
  },
  // ── Language Hotkeys ────────────────────────────────────────
  langHotkeys: {
    type: 'array',
    default: []       // [{ combo: 'Alt+B', lang: 'bn-BD' }, ...]
  },
  // ── Visualizer & Audio ──────────────────────────────────────────────
  micSensitivity: {
    type: 'number',
    default: 1.0
  },
  visualizerType: {
    type: 'string',
    default: 'wave'   // 'wave' | 'bars' | 'pulse' | 'particles' | 'line' | 'matrix'
  }
};

const store = new Store({ schema });

module.exports = store;
