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
    default: 'CommandOrControl+Shift+Space'
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
  }
};

const store = new Store({ schema });

module.exports = store;
