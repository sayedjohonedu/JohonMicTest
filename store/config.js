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
  licenseActivatedDate: {
    type: 'number',
    default: 0        // timestamp when license was first activated via Gumroad
  },
  // ── Free Tier Daily Limit ──────────────────────────────────────
  freeDailyWords: {
    type: 'number',
    default: 0        // words used today on the free tier
  },
  freeDailyReset: {
    type: 'number',
    default: 0        // midnight timestamp of when freeDailyWords was last reset
  },
  // ── Appearance ────────────────────────────────────────────
  theme: {
    type: 'string',
    default: 'system'   // 'system' | 'dark' | 'light'
  },
  // ── Voice Behaviour ───────────────────────────────────────
  silenceTimeoutEnabled: {
    type: 'boolean',
    default: true
  },
  silenceTimeoutVal: {
    type: 'number',
    default: 1
  },
  silenceTimeoutUnit: {
    type: 'string',
    default: 'sec'
  },
  silenceTimeout: {
    type: 'number',
    default: 1       // calculated seconds (0 = disabled/infinite)
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
  },
  // ── Translator ────────────────────────────────────────────────
  translatorOpenShortcut: {
    type: 'string',
    default: 'Shift+Alt+T'
  },
  translatorPasteShortcut: {
    type: 'string',
    default: 'Shift+Alt+P'
  },
  translatorMode: {
    type: 'string',
    default: 'regular'  // 'regular' | 'ai'
  },
  translatorAiProvider: {
    type: 'string',
    default: 'openai'   // 'openai' | 'anthropic' | 'gemini' | 'custom'
  },
  translatorAiModel: {
    type: 'string',
    default: 'gpt-4o'
  },
  // Multiple saved API profiles: [{ id, name, provider, model, apiKey, baseUrl, modelName }]
  translatorApiProfiles: {
    type: 'array',
    default: []
  },
  translatorActiveProfileId: {
    type: 'string',
    default: ''
  },
  translatorSystemPrompt: {
    type: 'string',
    default: ''
  },
  translatorSystemInstructions: {
    type: 'string',
    default: ''
  },
  translatorLangPresets: {
    type: 'array',
    default: []   // [{ id, src, target, shortcut }]
  },
  translatorHistory: {
    type: 'array',
    default: []   // [{ ts, src, target, original, translated, humanized, mode }]
  },
  translatorWindowPosition: {
    type: 'object',
    default: {}
  },
  translatorSilenceAutoAction: {
    type: 'boolean',
    default: true  // auto-translate+paste+close on 30s silence
  },
  // ── Translator Silence Timer ─────────────────────────────────
  translatorSilenceEnabled: {
    type: 'boolean',
    default: false   // disabled by default in translator (user talks at their own pace)
  },
  translatorSilenceVal: {
    type: 'number',
    default: 30
  },
  translatorSilenceUnit: {
    type: 'string',
    default: 'sec'   // 'sec' | 'min' | 'hr'
  },
  // Computed seconds (0 = disabled/infinite)
  translatorSilenceTimeout: {
    type: 'number',
    default: 0
  },
  translatorSrcLang: {
    type: 'string',
    default: 'en'
  },
  translatorTgtLang: {
    type: 'string',
    default: 'bn'
  },
  // ── Clipboard Manager ────────────────────────────────────────────
  clipboardEnabled: {
    type: 'boolean',
    default: true          // Master toggle: when false, clipboard monitor doesn't start
  },
  clipboardHotkey: {
    type: 'string',
    default: 'Alt+V'
  },
  clipboardHotkeyEnabled: {
    type: 'boolean',
    default: true
  },
  // 'trial'/'active' users: '7days'. Paid options: '30days','90days','6months','lifetime'
  clipboardRetention: {
    type: 'string',
    default: '7days'
  },
  // true = silently delete oldest day when TTL exceeded (no popup)
  clipboardAutoDelete: {
    type: 'boolean',
    default: false
  },
  // true = hide clipboard window after pasting
  clipboardPasteAndClose: {
    type: 'boolean',
    default: false
  },
  // saved position of clipboard manager window
  clipboardWindowPosition: {
    type: 'object',
    default: {}
  },
  // ── AI Dictation ──────────────────────────────────────────────
  aiModeEnabled: {
    type: 'boolean',
    default: false          // Master toggle for AI dictation
  },
  aiProvider: {
    type: 'string',
    default: 'openai'       // 'openai' | 'anthropic' | 'gemini' | 'groq' | 'openrouter' | 'custom'
  },
  aiModel: {
    type: 'string',
    default: 'gpt-4o-mini'  // Default model (fast + cheap)
  },
  aiApiKey: {
    type: 'string',
    default: ''
  },
  aiBaseUrl: {
    type: 'string',
    default: ''              // For custom/Ollama endpoints
  },
  aiSystemPrompt: {
    type: 'string',
    default: ''              // Empty = use built-in default constant
  },
  aiPersonalDictionary: {
    type: 'string',
    default: ''              // Comma-separated words
  },
  aiActivationMode: {
    type: 'string',
    default: 'push-to-talk'  // 'push-to-talk' | 'hold' | 'combo'
  },
  aiActivationKey: {
    type: 'string',
    default: 'AltRight'      // uiohook key name
  },
  aiTemperature: {
    type: 'number',
    default: 0.3
  },
  aiSilenceTimeout: {
    type: 'number',
    default: 8              // seconds — auto-send after this much silence (AI mode only)
  },
  // Timestamp when user first enabled AI mode (for 7-day free trial tracking)
  aiFirstEnabledDate: {
    type: 'number',
    default: 0
  }
};

const store = new Store({ schema });

module.exports = store;
