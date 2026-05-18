'use strict';

const IS_MAC = window.electronAPI.platform === 'darwin';
const IS_WIN = window.electronAPI.platform === 'win32';
const DEFAULT_HOTKEY = 'Alt+C';

const SETTINGS_LANGUAGES = [
  { code:'en-US', name:'English (US)',       flag:'🇺🇸' },
  { code:'en-GB', name:'English (UK)',       flag:'🇬🇧' },
  { code:'en-CA', name:'English (CA)',       flag:'🇨🇦' },
  { code:'en-AU', name:'English (AU)',       flag:'🇦🇺' },
  { code:'en-IN', name:'English (IN)',       flag:'🇮🇳' },
  { code:'en-ZA', name:'English (ZA)',       flag:'🇿🇦' },
  { code:'es-ES', name:'Español (ES)',       flag:'🇪🇸' },
  { code:'es-MX', name:'Español (MX)',       flag:'🇲🇽' },
  { code:'es-AR', name:'Español (AR)',       flag:'🇦🇷' },
  { code:'es-US', name:'Español (US)',       flag:'🇺🇸' },
  { code:'pt-BR', name:'Português (BR)',     flag:'🇧🇷' },
  { code:'pt-PT', name:'Português (PT)',     flag:'🇵🇹' },
  { code:'fr-FR', name:'Français (FR)',      flag:'🇫🇷' },
  { code:'fr-CA', name:'Français (CA)',      flag:'🇨🇦' },
  { code:'de-DE', name:'Deutsch (DE)',       flag:'🇩🇪' },
  { code:'de-AT', name:'Deutsch (AT)',       flag:'🇦🇹' },
  { code:'de-CH', name:'Deutsch (CH)',       flag:'🇨🇭' },
  { code:'nl-NL', name:'Nederlands (NL)',    flag:'🇳🇱' },
  { code:'nl-BE', name:'Nederlands (BE)',    flag:'🇧🇪' },
  { code:'sv-SE', name:'Svenska (SE)',       flag:'🇸🇪' },
  { code:'da-DK', name:'Dansk (DK)',         flag:'🇩🇰' },
  { code:'nb-NO', name:'Norsk (NO)',         flag:'🇳🇴' },
  { code:'is-IS', name:'Íslenska (IS)',      flag:'🇮🇸' },
  { code:'it-IT', name:'Italiano (IT)',      flag:'🇮🇹' },
  { code:'ru-RU', name:'Русский (RU)',       flag:'🇷🇺' },
  { code:'pl-PL', name:'Polski (PL)',        flag:'🇵🇱' },
  { code:'cs-CZ', name:'Čeština (CZ)',       flag:'🇨🇿' },
  { code:'sk-SK', name:'Slovenčina (SK)',    flag:'🇸🇰' },
  { code:'uk-UA', name:'Українська (UA)',    flag:'🇺🇦' },
  { code:'hr-HR', name:'Hrvatski (HR)',      flag:'🇭🇷' },
  { code:'sr-RS', name:'Српски (RS)',        flag:'🇷🇸' },
  { code:'bg-BG', name:'Български (BG)',     flag:'🇧🇬' },
  { code:'sl-SI', name:'Slovenščina (SI)',   flag:'🇸🇮' },
  { code:'mk-MK', name:'Македонски (MK)',    flag:'🇲🇰' },
  { code:'ro-RO', name:'Română (RO)',        flag:'🇷🇴' },
  { code:'ca-ES', name:'Català (ES)',        flag:'🇪🇸' },
  { code:'el-GR', name:'Ελληνικά (GR)',      flag:'🇬🇷' },
  { code:'fi-FI', name:'Suomi (FI)',         flag:'🇫🇮' },
  { code:'hu-HU', name:'Magyar (HU)',        flag:'🇭🇺' },
  { code:'ja-JP', name:'Japanese (JP)',      flag:'🇯🇵' },
  { code:'zh-CN', name:'Chinese (CN)',       flag:'🇨🇳' },
  { code:'zh-TW', name:'Chinese (TW)',       flag:'🇹🇼' },
  { code:'ko-KR', name:'Korean (KR)',        flag:'🇰🇷' },
  { code:'th-TH', name:'Thai (TH)',          flag:'🇹🇭' },
  { code:'vi-VN', name:'Tiếng Việt (VN)',    flag:'🇻🇳' },
  { code:'id-ID', name:'Bahasa Indonesia',   flag:'🇮🇩' },
  { code:'ms-MY', name:'Bahasa Melayu (MY)', flag:'🇲🇾' },
  { code:'ms-BN', name:'Bahasa Melayu (BN)', flag:'🇧🇳' },
  { code:'tl-PH', name:'Filipino (PH)',      flag:'🇵🇭' },
  { code:'my-MM', name:'Myanmar (MM)',       flag:'🇲🇲' },
  { code:'km-KH', name:'Khmer (KH)',         flag:'🇰🇭' },
  { code:'lo-LA', name:'Lao (LA)',           flag:'🇱🇦' },
  { code:'mn-MN', name:'Монгол (MN)',        flag:'🇲🇳' },
  { code:'hi-IN', name:'Hindi (IN)',         flag:'🇮🇳' },
  { code:'bn-IN', name:'Bengali (IN)',       flag:'🇮🇳' },
  { code:'bn-BD', name:'Bengali (BD)',       flag:'🇧🇩' },
  { code:'ur-IN', name:'Urdu (IN)',          flag:'🇮🇳' },
  { code:'ur-PK', name:'Urdu (PK)',          flag:'🇵🇰' },
  { code:'pa-IN', name:'Punjabi (IN)',       flag:'🇮🇳' },
  { code:'gu-IN', name:'Gujarati (IN)',      flag:'🇮🇳' },
  { code:'mr-IN', name:'Marathi (IN)',       flag:'🇮🇳' },
  { code:'te-IN', name:'Telugu (IN)',        flag:'🇮🇳' },
  { code:'kn-IN', name:'Kannada (IN)',       flag:'🇮🇳' },
  { code:'ml-IN', name:'Malayalam (IN)',     flag:'🇮🇳' },
  { code:'ta-IN', name:'Tamil (IN)',         flag:'🇮🇳' },
  { code:'or-IN', name:'Odia (IN)',          flag:'🇮🇳' },
  { code:'si-LK', name:'Sinhala (LK)',       flag:'🇱🇰' },
  { code:'ne-NP', name:'Nepali (NP)',        flag:'🇳🇵' },
  { code:'dv-MV', name:'Dhivehi (MV)',       flag:'🇲🇻' },
  { code:'ar-SA', name:'Arabic (SA)',        flag:'🇸🇦' },
  { code:'ar-AE', name:'Arabic (AE)',        flag:'🇦🇪' },
  { code:'ar-EG', name:'Arabic (EG)',        flag:'🇪🇬' },
  { code:'tr-TR', name:'Türkçe (TR)',        flag:'🇹🇷' },
  { code:'he-IL', name:'עברית (IL)',         flag:'🇮🇱' },
  { code:'fa-IR', name:'فارسی (IR)',         flag:'🇮🇷' },
  { code:'sw-KE', name:'Kiswahili (KE)',     flag:'🇰🇪' },
  { code:'am-ET', name:'Amharic (ET)',       flag:'🇪🇹' },
  { code:'zu-ZA', name:'isiZulu (ZA)',       flag:'🇿🇦' },
  { code:'yo-NG', name:'Yoruba (NG)',        flag:'🇳🇬' },
  { code:'ig-NG', name:'Igbo (NG)',          flag:'🇳🇬' },
  { code:'ha-NG', name:'Hausa (NG)',         flag:'🇳🇬' },
  { code:'so-SO', name:'Soomaali (SO)',      flag:'🇸🇴' },
  { code:'rw-RW', name:'Kinyarwanda (RW)',   flag:'🇷🇼' },
  { code:'mg-MG', name:'Malagasy (MG)',      flag:'🇲🇬' },
  { code:'uz-UZ', name:"O'zbek (UZ)",        flag:'🇺🇿' },
  { code:'kk-KZ', name:'Қазақша (KZ)',       flag:'🇰🇿' },
  { code:'ky-KG', name:'Кыргызча (KG)',      flag:'🇰🇬' },
  { code:'haw-US', name:'Hawaiian (US)',     flag:'🇺🇸' },
  { code:'mi-NZ',  name:'Māori (NZ)',        flag:'🇳🇿' },
  { code:'sm-WS',  name:'Samoan (WS)',       flag:'🇼🇸' },
  { code:'to-TO',  name:'Tongan (TO)',       flag:'🇹🇴' },
  { code:'fj-FJ',  name:'Fijian (FJ)',       flag:'🇫🇯' },
  { code:'cy-GB',  name:'Cymraeg (GB)',      flag:'🇬🇧' },
];

function makeFlagEl(langCode, size = 16) {
  const lang = SETTINGS_LANGUAGES.find(l => l.code === langCode); if (!lang) return '';
  if (IS_WIN) {
    const f = lang.flag;
    if (f && f.length >= 4) {
      const p1 = f.codePointAt(0), p2 = f.codePointAt(2);
      if (p1 >= 0x1f1e6 && p1 <= 0x1f1ff && p2 >= 0x1f1e6 && p2 <= 0x1f1ff) {
        return `<img class="cfd-flag-img" draggable="false" style="width:${size}px; height:${size}px; vertical-align:-3px;" alt="${f}" src="https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${p1.toString(16)}-${p2.toString(16)}.svg"/>`;
      }
    }
    const cc = langCode.split('-')[1] ? langCode.split('-')[1].toLowerCase() : '';
    return cc ? `<img class="cfd-flag-img" src="https://flagcdn.com/${size}x12/${cc}.png" width="${size}" height="12">` : '';
  }
  return `<span class="cfd-flag-emoji">${lang.flag}</span>`;
}

function populateLangSelect(selectEl) {
  selectEl.innerHTML = '';
  SETTINGS_LANGUAGES.forEach(l => {
    const opt = document.createElement('option'); opt.value = l.code;
    opt.textContent = IS_WIN ? l.name : (l.flag + '\u00A0' + l.name);
    selectEl.appendChild(opt);
  });
}

function buildCustomLangDropdown() {
  const w = document.getElementById('lang-cfd-wrapper'), l = document.getElementById('lang-cfd-list'), s = document.getElementById('lang-cfd-selected'), h = document.getElementById('lang-select');
  populateLangSelect(h); l.innerHTML = '';
  SETTINGS_LANGUAGES.forEach(lang => {
    const item = document.createElement('div'); item.className = 'cfd-item'; item.dataset.code = lang.code;
    item.innerHTML = makeFlagEl(lang.code) + `<span>${lang.name}</span>`;
    item.addEventListener('click', () => { setCfdValue(lang.code); w.classList.remove('open'); markDirty(); });
    l.appendChild(item);
  });
  s.addEventListener('click', e => { e.stopPropagation(); w.classList.toggle('open'); });
  document.addEventListener('click', () => w.classList.remove('open'));
}

function setCfdValue(code) {
  const lang = SETTINGS_LANGUAGES.find(l => l.code === code) || SETTINGS_LANGUAGES[0];
  document.getElementById('lang-cfd-flag').innerHTML = makeFlagEl(lang.code);
  document.getElementById('lang-cfd-name').textContent = lang.name;
  document.getElementById('lang-select').value = lang.code;
  document.querySelectorAll('#lang-cfd-list .cfd-item').forEach(item => item.classList.toggle('active', item.dataset.code === lang.code));
}

let _cfdBuilt = false;
function ensureCfdBuilt() { if (_cfdBuilt) return; _cfdBuilt = true; buildCustomLangDropdown(); }

const PANELS = {
  general: { title: 'General', desc: 'Hotkeys, activation, and startup' },
  voice: { title: 'Voice & Language', desc: 'Speech recognition and language options' },
  replace: { title: 'Text Replacement', desc: 'Auto-replace your spoken words with custom text' },
  'api-vault': { title: 'AI & API', desc: 'Manage profiles and configure AI Dictation' },

  whisper: { title: 'Whisper Engine', desc: 'Cloud transcription via OpenAI or Groq' },
  stats: { title: 'My Stats', desc: 'Usage statistics and time saved by voice dictation' },
  license: { title: 'License', desc: 'Manage your subscription and trial' },
  about: { title: 'About', desc: 'MicTab information' },
};

window.switchPanel = async function(id, el) {
  if (id === 'whisper') {
    try {
      const trial = await window.electronAPI.whisperApiCheckTrial();
      if (trial.expired) {
        window.electronAPI.whisperApiShowLockedPopup();
        return;
      }
    } catch (e) {
      console.error('Whisper API trial check failed:', e);
    }
  }

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active'); el.classList.add('active');
  document.getElementById('panel-title').textContent = PANELS[id].title;
  document.getElementById('panel-desc').textContent = PANELS[id].desc;
  // Reset scroll to top so each tab starts fresh, independent of other tabs
  const contentBody = document.querySelector('.content-body');
  if (contentBody) contentBody.scrollTop = 0;
  if (id === 'stats') loadStats();
  if (id === 'whisper') loadWhisperPanel();
  if (id === 'api-vault') loadVaultPanel();
};

function formatTimeSaved(words) {
  const m = Math.round(words * (1/40 - 1/130));
  if (m < 1) return '< 1m'; if (m < 60) return `${m}m`;
  const hr = Math.floor(m / 60), min = m % 60; return min > 0 ? `${hr}h ${min}m` : `${hr}h`;
}

function loadStats() {
  window.electronAPI.getStats().then(s => {
    animateValue(document.getElementById('stat-words'), 0, s.totalWords, 1500);
    document.getElementById('stat-time').textContent = formatTimeSaved(s.totalWords);
    animateValue(document.getElementById('stat-sessions'), 0, s.totalSessions, 1000);
    const sinceEl = document.getElementById('stat-since');
    if (s.firstDate) sinceEl.textContent = `Since ${new Date(s.firstDate).toLocaleDateString(undefined, { year:'numeric', month:'short' })}`;
    const langsEl = document.getElementById('stat-langs'), entries = Object.entries(s.langUsage || {}).sort((a,b) => b[1] - a[1]);
    if (!entries.length) { langsEl.innerHTML = '<div style="font-size:12px; color:var(--muted);">No sessions recorded yet.</div>'; return; }
    const maxW = entries[0][1], total = entries.reduce((sum, [, n]) => sum + n, 0);
    langsEl.innerHTML = entries.map(([code, words]) => {
      const pct = total > 0 ? Math.round((words/total)*100) : 0, bar = Math.max(2, Math.round((words/maxW)*100));
      const langName = SETTINGS_LANGUAGES.find(l => l.code === code)?.name || code;
      return `<div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
        <div style="font-size:12px; font-weight:500; color:var(--text); width:130px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${langName}</div>
        <div style="flex:1; height:8px; border-radius:4px; background:rgba(108,99,255,0.08); overflow:hidden; position:relative;">
          <div style="position:absolute; left:0; top:0; width:${bar}%; height:100%; border-radius:4px; background:linear-gradient(90deg, var(--accent), #b485ff); transition:width 1s cubic-bezier(0.16, 1, 0.3, 1);"></div>
        </div>
        <div style="font-size:11.5px; font-weight:600; color:var(--muted); width:40px; text-align:right;">${pct}%</div>
      </div>`;
    }).join('');
  });
}

function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4);
    const val = Math.floor(progress * (end - start) + start);
    obj.innerHTML = formatWordCount(val);
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

function formatWordCount(n) {
  if (n < 1000) return String(n);
  if (n < 1000000) {
    const k = n / 1000;
    return (k % 1 < 0.05 ? k.toFixed(0) : k.toFixed(1)) + 'k';
  }
  const m = n / 1000000;
  return (m % 1 < 0.05 ? m.toFixed(0) : m.toFixed(1)) + 'm';
}

function formatCombo(str) {
  if (!str) return 'Not set';
  return str.replace('CommandOrControl', IS_MAC ? '⌘' : 'Ctrl').replace('Command', '⌘').replace('Control', 'Ctrl').replace('Shift', '⇧').replace('Alt', IS_MAC ? '⌥' : 'Alt').replace(/\+/g, ' + ');
}

function comboFromEvent(e) {
  const parts = []; if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl'); if (e.shiftKey) parts.push('Shift'); if (e.altKey) parts.push('Alt');
  let rawKey = null; const IGNORE = ['Meta','Control','Shift','Alt','CapsLock','Tab','Escape'];
  if (!IGNORE.includes(e.key) && !IGNORE.includes(e.code)) {
    if (e.code && e.code.startsWith('Key')) rawKey = e.code.substring(3); else if (e.code && e.code.startsWith('Digit')) rawKey = e.code.substring(5); else if (/^F([1-9]|1[0-2])$/.test(e.code)) rawKey = e.code; else if (e.code === 'Space' || e.key === ' ') rawKey = 'Space'; else rawKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  }
  if (rawKey) parts.push(rawKey); const hasMod = parts.some(p => ['CommandOrControl','Shift','Alt'].includes(p)), hasKey = !!rawKey;
  return (hasKey && (hasMod || /^F([1-9]|1[0-2])$/.test(rawKey))) ? parts.join('+') : null;
}

function singleKeyFromEvent(e) {
  const IGNORE = ['Meta','CapsLock','Tab','Escape']; if (IGNORE.includes(e.key) || IGNORE.includes(e.code)) return null;
  // Return e.code for modifier keys to distinguish left/right (matches backend CODE_TO_UIOHOOK)
  if (['Alt','Shift','Control'].includes(e.key)) return e.code; // e.g. 'ControlLeft', 'ShiftRight'
  let rawKey = null; if (e.code && e.code.startsWith('Key')) rawKey = e.code.substring(3); else if (e.code && e.code.startsWith('Digit')) rawKey = e.code.substring(5); else if (/^F([1-9]|1[0-2])$/.test(e.code)) rawKey = e.code; else if (e.code === 'Space' || e.key === ' ') rawKey = 'Space'; else rawKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return rawKey;
}

// Display name for hold key codes (human-readable badge text)
const HOLDKEY_DISPLAY_NAMES = { ControlLeft:'Left ⌃ Control', ControlRight:'Right ⌃ Control', AltLeft:'Left ⌥ Alt', AltRight:'Right ⌥ Alt', ShiftLeft:'Left ⇧ Shift', ShiftRight:'Right ⇧ Shift', MetaLeft:'Left ⌘', MetaRight:'Right ⌘' };
function holdKeyDisplayName(code) {
  if (IS_MAC) {
    const macNames = { ControlLeft:'⌃ Control', ControlRight:'Right ⌃ Control', AltLeft:'⌥ Alt', AltRight:'Right ⌥ Alt', ShiftLeft:'⇧ Shift', ShiftRight:'Right ⇧ Shift', MetaLeft:'⌘ Command', MetaRight:'Right ⌘ Command' };
    if (macNames[code]) return macNames[code];
  } else {
    const winNames = { ControlLeft:'Left Ctrl', ControlRight:'Right Ctrl', AltLeft:'Left Alt', AltRight:'Right Alt', ShiftLeft:'Left Shift', ShiftRight:'Right Shift' };
    if (winNames[code]) return winNames[code];
  }
  if (/^F\d+$/.test(code)) return code;
  if (code.startsWith('Key')) return code.substring(3);
  if (code.startsWith('Digit')) return code.substring(5);
  return code;
}

// ── AI send key: uses event.code to distinguish Left/Right ──
const AI_SENDKEY_DEFAULT = 'ShiftRight';
const AI_SENDKEY_NAMES = { AltRight:'Right Alt', AltLeft:'Left Alt', ShiftRight:'Right Shift', ShiftLeft:'Left Shift', ControlRight:'Right Ctrl', ControlLeft:'Left Ctrl', MetaRight:'Right ⌘', MetaLeft:'Left ⌘', Space:'Space', Backquote:'`', Minus:'-', Equal:'=', BracketLeft:'[', BracketRight:']', Backslash:'\\', Semicolon:';', Quote:"'", Comma:',', Period:'.', Slash:'/', CapsLock:'CapsLock', NumLock:'NumLock', ScrollLock:'ScrollLock', Insert:'Insert', Delete:'Delete', Home:'Home', End:'End', PageUp:'PageUp', PageDown:'PageDown', ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→' };
function aiSendKeyDisplayName(code) {
  if (AI_SENDKEY_NAMES[code]) return AI_SENDKEY_NAMES[code];
  if (code.startsWith('Key')) return code.substring(3);
  if (code.startsWith('Digit')) return code.substring(5);
  if (/^F\d+$/.test(code)) return code;
  return code;
}
let pendingAiSendKey = AI_SENDKEY_DEFAULT;

const DEFAULT_HOLD_KEY = IS_MAC ? 'ControlLeft' : 'F8';
const DEFAULT_BROWSER_SHORTCUT = 'Shift+Alt+B';
let pendingHotkey = DEFAULT_HOTKEY, pendingHoldKey = DEFAULT_HOLD_KEY, pendingBrowserShortcut = DEFAULT_BROWSER_SHORTCUT, recordingMode = null, activeBadgeNode = null;
const hotkeyBadge = document.getElementById('hotkey-display'), holdkeyBadge = document.getElementById('holdkey-display');
const aiSendKeyBadge = document.getElementById('ai-sendkey-display');
const browserShortcutBadge = document.getElementById('browser-shortcut-display');

hotkeyBadge.addEventListener('click', () => !recordingMode && startRecording('combo'));
holdkeyBadge.addEventListener('click', () => !recordingMode && startRecording('hold'));
if (aiSendKeyBadge) aiSendKeyBadge.addEventListener('click', () => !recordingMode && startRecording('ai-send'));
if (browserShortcutBadge) browserShortcutBadge.addEventListener('click', () => !recordingMode && startRecording('browser-shortcut'));

function startRecording(mode, badgeNode = null) {
  recordingMode = mode;
  activeBadgeNode = badgeNode || (mode === 'combo' ? hotkeyBadge : mode === 'ai-send' ? aiSendKeyBadge : mode === 'browser-shortcut' ? browserShortcutBadge : holdkeyBadge);
  activeBadgeNode.classList.add('recording'); activeBadgeNode.textContent = (mode === 'combo' || mode === 'lang-combo' || mode === 'browser-shortcut') ? 'Press shortcut…' : 'Press any key…';
  window.electronAPI.suspendHotkeys();
}

document.addEventListener('keydown', (e) => {
  if (!recordingMode) return; e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { stopRecording(true); return; }
  if (recordingMode === 'combo' || recordingMode === 'lang-combo' || recordingMode === 'browser-shortcut') {
    const isF = /^F([1-9]|1[0-2])$/.test(e.code || e.key), preview = [];
    if (e.metaKey || e.ctrlKey) preview.push(IS_MAC ? '⌘' : 'Ctrl'); if (e.shiftKey) preview.push('⇧'); if (e.altKey) preview.push(IS_MAC ? '⌥' : 'Alt');
    if (preview.length && !isF) activeBadgeNode.textContent = preview.join(' + ') + ' + …';
    const combo = comboFromEvent(e); if (combo) {
      if (recordingMode === 'combo') pendingHotkey = combo;
      else if (recordingMode === 'browser-shortcut') pendingBrowserShortcut = combo;
      else activeBadgeNode.dataset.rawCombo = combo;
      activeBadgeNode.textContent = formatCombo(combo); stopRecording(false);
    }
  } else if (recordingMode === 'ai-send') {
    // Capture event.code (e.g. AltRight, F5, KeyA) for left/right distinction
    const code = e.code; if (code && code !== 'Escape') { pendingAiSendKey = code; activeBadgeNode.textContent = aiSendKeyDisplayName(code); stopRecording(false); }
  } else {
    const key = singleKeyFromEvent(e); if (key) { pendingHoldKey = key; activeBadgeNode.textContent = holdKeyDisplayName(key); stopRecording(false); }
  }
});

function stopRecording(cancelled) {
  const mode = recordingMode, badge = activeBadgeNode; recordingMode = activeBadgeNode = null; badge.classList.remove('recording');
  if (cancelled) {
    if (mode === 'combo') badge.textContent = formatCombo(pendingHotkey);
    else if (mode === 'lang-combo') badge.textContent = badge.dataset.rawCombo ? formatCombo(badge.dataset.rawCombo) : 'Not set';
    else if (mode === 'ai-send') badge.textContent = aiSendKeyDisplayName(pendingAiSendKey);
    else if (mode === 'browser-shortcut') badge.textContent = formatCombo(pendingBrowserShortcut);
    else badge.textContent = pendingHoldKey ? holdKeyDisplayName(pendingHoldKey) : 'Not set';
  }
  window.electronAPI.resumeHotkeys(); if (!cancelled) markDirty();
}

window.resetHotkey = function() { if (recordingMode === 'combo') stopRecording(true); pendingHotkey = DEFAULT_HOTKEY; hotkeyBadge.textContent = formatCombo(DEFAULT_HOTKEY); markDirty(); };
window.resetHoldKey = function() { if (recordingMode === 'hold') stopRecording(true); pendingHoldKey = DEFAULT_HOLD_KEY; holdkeyBadge.textContent = holdKeyDisplayName(DEFAULT_HOLD_KEY); markDirty(); };
window.resetAiSendKey = function() { if (recordingMode === 'ai-send') stopRecording(true); pendingAiSendKey = AI_SENDKEY_DEFAULT; if (aiSendKeyBadge) aiSendKeyBadge.textContent = aiSendKeyDisplayName(AI_SENDKEY_DEFAULT); markDirty(); };
window.resetBrowserShortcut = function() { if (recordingMode === 'browser-shortcut') stopRecording(true); pendingBrowserShortcut = DEFAULT_BROWSER_SHORTCUT; if (browserShortcutBadge) browserShortcutBadge.textContent = formatCombo(DEFAULT_BROWSER_SHORTCUT); markDirty(); };

window.syncHotkeyEnable = function() { document.getElementById('row-hotkey-combo').classList.toggle('disabled-row', !document.getElementById('toggle-hotkey').checked); };
window.syncHoldEnable = function() { const on = document.getElementById('toggle-holdkey').checked; document.getElementById('row-hold-key').classList.toggle('disabled-row', !on); };
window.syncSilenceEnable = function() { document.getElementById('row-silence-timeout').classList.toggle('disabled-row', !document.getElementById('toggle-silence').checked); };
window.syncReplaceEnable = function() { const off = !document.getElementById('toggle-replace').checked; document.getElementById('row-replacements').classList.toggle('disabled-row', off); document.getElementById('row-replace-inline').classList.toggle('disabled-row', off); };

// ── Clipboard Manager toggle (instant on/off) ────────────────────────
window.onClipboardToggle = async function() {
  const enabled = document.getElementById('toggle-clipboard-enabled').checked;
  try {
    await window.electronAPI.cbSetEnabled(enabled);
  } catch (e) {
    console.error('Failed to toggle clipboard:', e);
  }
  markDirty();
};

// ── AI Dictation panel functions ──────────────────────────────────────

/* AI_PROVIDER_MODELS is defined in model-registry.js (loaded before this script) */


/** Populate the ai-model <select> with models for the given provider */
function populateAiModels(provider, currentValue) {
  const sel = document.getElementById('ai-model');
  sel.innerHTML = '';
  const models = AI_PROVIDER_MODELS[provider] || [];
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    sel.appendChild(opt);
  });
  // Always add a "Custom..." option at the end
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__'; customOpt.textContent = '✎ Custom...';
  sel.appendChild(customOpt);

  // Restore saved value
  if (currentValue) {
    if ([...sel.options].some(o => o.value === currentValue)) {
      sel.value = currentValue;
    } else {
      // Saved model isn't in the list — treat as custom
      sel.value = '__custom__';
      document.getElementById('ai-model-custom').value = currentValue;
    }
  }
  onAiModelChange();
}

/** Show/hide custom model input based on dropdown selection */
window.onAiModelChange = function() {
  const sel = document.getElementById('ai-model');
  const customRow = document.getElementById('row-ai-custom-model');
  customRow.style.display = sel.value === '__custom__' ? 'flex' : 'none';
};

/** Get the effective AI model value (dropdown or custom input) */
function getAiModelValue() {
  const sel = document.getElementById('ai-model');
  if (sel.value === '__custom__') {
    return document.getElementById('ai-model-custom').value;
  }
  return sel.value;
}

window.syncAiEnable = async function() {
  const toggle = document.getElementById('toggle-ai-mode');
  const on = toggle.checked;
  const grp1 = document.getElementById('ai-provider-group');
  const grp2 = document.getElementById('ai-prompt-group');

  if (on) {
    // Check if user's AI trial is expired (free/trial users only)
    try {
      const trial = await window.electronAPI.aiCheckTrial();
      if (trial.expired) {
        // Trial over — revert toggle and show popup
        toggle.checked = false;
        if (grp1) grp1.classList.add('disabled-row');
        if (grp2) grp2.classList.add('disabled-row');
        window.electronAPI.aiShowTrialPopup();
        return;
      }
      // First time enabling — stamp the start date
      const cfg = await window.electronAPI.getConfig();
      if (!cfg.aiFirstEnabledDate) {
        window.electronAPI.saveConfig({ aiFirstEnabledDate: Date.now() });
      }
    } catch (e) {
      console.error('AI trial check failed:', e);
    }
  }

  if (grp1) grp1.classList.toggle('disabled-row', !on);
  if (grp2) grp2.classList.toggle('disabled-row', !on);
};

window.onAiProviderChange = function() {
  const provider = document.getElementById('ai-provider').value;
  const isCustom = provider === 'custom';
  const baseUrlRow = document.getElementById('row-ai-baseurl');
  const apiKeyRow = document.getElementById('row-ai-apikey');
  const ollamaBtn = document.getElementById('btn-ollama-refresh');
  const ollamaStatusRow = document.getElementById('ollama-status-row');

  baseUrlRow.style.display = isCustom ? 'flex' : 'none';
  ollamaBtn.style.display = isCustom ? 'inline-block' : 'none';
  apiKeyRow.style.display = 'flex';

  if (isCustom) {
    refreshOllamaModels();
  } else {
    ollamaStatusRow.style.display = 'none';
  }

  // Re-populate model dropdown for new provider
  populateAiModels(provider, '');
};

window.refreshOllamaModels = async function() {
  const statusRow = document.getElementById('ollama-status-row');
  statusRow.style.display = 'block';
  statusRow.innerHTML = '<span style="color:var(--muted)">🔍 Checking Ollama...</span>';

  try {
    const result = await window.electronAPI.aiGetOllamaModels();
    if (result.running) {
      const modelList = result.models.map(m => m.name).join(', ') || 'No models installed';
      statusRow.innerHTML = `<span style="color:#4ade80">✓ Ollama running</span> — Models: <strong>${modelList}</strong>`;

      // Auto-fill first model if model field is empty
      // Add Ollama models to the dropdown
      const sel = document.getElementById('ai-model');
      sel.innerHTML = '';
      result.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name; opt.textContent = m.name;
        sel.appendChild(opt);
      });
      const customOpt = document.createElement('option');
      customOpt.value = '__custom__'; customOpt.textContent = '✎ Custom...';
      sel.appendChild(customOpt);
      if (result.models.length > 0) sel.value = result.models[0].name;
      onAiModelChange();
      markDirty();

      // Auto-fill base URL if empty
      const baseUrlInput = document.getElementById('ai-baseurl');
      if (!baseUrlInput.value) {
        baseUrlInput.value = 'http://localhost:11434/v1';
        markDirty();
      }
    } else {
      statusRow.innerHTML = '<span style="color:#fb923c">⚠ Ollama not detected.</span> Start Ollama or enter a custom endpoint.';
    }
  } catch {
    statusRow.innerHTML = '<span style="color:#f87171">✕ Could not reach Ollama.</span>';
  }
};

window.testAiConnection = async function() {
  const btn = document.getElementById('btn-ai-test');
  const status = document.getElementById('ai-test-status');
  btn.disabled = true;
  status.textContent = 'Testing...';
  status.style.color = 'var(--muted)';

  const profile = {
    provider: document.getElementById('ai-provider').value,
    model: getAiModelValue(),
    apiKey: document.getElementById('ai-apikey').value,
    baseUrl: document.getElementById('ai-baseurl').value,
  };

  try {
    const result = await window.electronAPI.aiTestConnection(profile);
    if (result.error) {
      status.textContent = '✕ ' + result.error;
      status.style.color = '#f87171';
    } else {
      status.textContent = '✓ Connected! Response: ' + (result.text || '').slice(0, 50);
      status.style.color = '#4ade80';
    }
  } catch (e) {
    status.textContent = '✕ ' + (e.message || 'Connection failed');
    status.style.color = '#f87171';
  } finally {
    btn.disabled = false;
  }
};

// ── AI Profile Management ────────────────────────────────────────────
let _aiProfiles = [];
let _aiActiveProfileId = '';

function escAiHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.addAiProfile = function() {
  const nameInput = document.getElementById('ai-profile-name');
  const name = nameInput.value.trim();
  if (!name) { showSaveStatus('Enter a profile name'); return; }
  const apiKey = document.getElementById('ai-apikey').value.trim();
  if (!apiKey) { showSaveStatus('Enter an API key'); return; }

  const profile = {
    id: Date.now().toString(),
    name,
    provider: document.getElementById('ai-provider').value,
    model: getAiModelValue(),
    apiKey,
    baseUrl: document.getElementById('ai-baseurl').value.trim(),
  };

  _aiProfiles.push(profile);
  if (!_aiActiveProfileId) _aiActiveProfileId = profile.id;

  // Persist immediately
  saveAiProfiles();

  // Clear form
  nameInput.value = '';
  document.getElementById('ai-apikey').value = '';
  document.getElementById('ai-baseurl').value = '';

  renderAiProfiles();
  showSaveStatus('✓ Profile saved');
  markDirty();
};

function renderAiProfiles() {
  const container = document.getElementById('ai-profile-list');
  if (!container) return; // container removed — legacy section no longer shown


  if (!_aiProfiles.length) {
    container.innerHTML = '<div class="ai-profile-empty">No profiles yet. Add one below.</div>';
    return;
  }

  _aiProfiles.forEach(p => {
    const div = document.createElement('div');
    div.className = 'ai-profile-chip' + (p.id === _aiActiveProfileId ? ' active' : '');
    div.innerHTML = `
      <div class="ai-profile-name">${escAiHtml(p.name)}</div>
      <div class="ai-profile-badge">${escAiHtml(p.provider)} · ${escAiHtml(p.model || '')}</div>
      <button class="ai-profile-del" title="Delete">✕</button>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('ai-profile-del')) {
        // Delete profile
        _aiProfiles = _aiProfiles.filter(x => x.id !== p.id);
        if (_aiActiveProfileId === p.id) {
          _aiActiveProfileId = _aiProfiles[0]?.id || '';
        }
        saveAiProfiles();
        renderAiProfiles();
        syncActiveProfileToFlatConfig();
        markDirty();
      } else {
        // Set as active
        _aiActiveProfileId = p.id;
        saveAiProfiles();
        renderAiProfiles();
        syncActiveProfileToFlatConfig();
        showSaveStatus('✓ Default: ' + p.name);
        markDirty();
      }
    });
    container.appendChild(div);
  });
}

function getActiveAiProfile() {
  return _aiProfiles.find(p => p.id === _aiActiveProfileId) || _aiProfiles[0] || null;
}

/** Writes the active profile's provider/model/key/url into the flat config keys the backend reads */
function syncActiveProfileToFlatConfig() {
  const p = getActiveAiProfile();
  if (!p) return;
  window.electronAPI.saveConfig({
    aiProvider: p.provider,
    aiModel: p.model,
    aiApiKey: p.apiKey,
    aiBaseUrl: p.baseUrl || '',
    aiProfiles: _aiProfiles,
    aiActiveProfileId: _aiActiveProfileId,
  });
}

function saveAiProfiles() {
  window.electronAPI.saveConfig({
    aiProfiles: _aiProfiles,
    aiActiveProfileId: _aiActiveProfileId,
  });
  syncActiveProfileToFlatConfig();
}

function showSaveStatus(msg) {
  const s = document.getElementById('ai-test-status');
  if (s) { s.textContent = msg; s.style.color = 'var(--muted)'; }
}

function applyTheme(t) { if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', t); }
window.previewTheme = function() { applyTheme(document.getElementById('theme-select').value); };
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { const s = document.getElementById('theme-select'); if (s && s.value === 'system') applyTheme('system'); });

async function loadConfig() {
  const cfg = await window.electronAPI.getConfig(), v = await window.electronAPI.getVersion(); document.getElementById('about-version').textContent = v;
  pendingHotkey = cfg.hotkey || DEFAULT_HOTKEY; hotkeyBadge.textContent = formatCombo(pendingHotkey);
  document.getElementById('toggle-hotkey').checked = cfg.hotkeyEnabled !== false; syncHotkeyEnable();
  // Migrate old e.key format holdKey values to e.code format
  const OLD_HOLDKEY_MAP = { 'Control':'ControlLeft', 'Alt':'AltLeft', 'Shift':'ShiftLeft' };
  let rawHoldKey = cfg.holdKey || DEFAULT_HOLD_KEY;
  if (OLD_HOLDKEY_MAP[rawHoldKey]) rawHoldKey = OLD_HOLDKEY_MAP[rawHoldKey];
  pendingHoldKey = rawHoldKey; holdkeyBadge.textContent = pendingHoldKey ? holdKeyDisplayName(pendingHoldKey) : 'Not set';
  document.getElementById('toggle-holdkey').checked = cfg.holdKeyEnabled === true; syncHoldEnable();
  const dS = document.getElementById('hold-duration'); if (dS && [...dS.options].some(o => o.value === String(cfg.holdDuration || '2'))) dS.value = String(cfg.holdDuration || '2');
  const mB = document.getElementById('mouse-button'); if (mB) mB.value = String(cfg.mouseButton || '3');
  const mA = document.getElementById('mouse-action'); if (mA) mA.value = cfg.mouseAction || 'none';
  document.getElementById('toggle-autolunch').checked = cfg.autoLaunch !== false; ensureCfdBuilt(); setCfdValue(cfg.language || 'en-US');
  // Clipboard Manager master toggle
  document.getElementById('toggle-clipboard-enabled').checked = cfg.clipboardEnabled !== false;
  document.getElementById('toggle-silence').checked = cfg.silenceTimeoutEnabled === true; syncSilenceEnable(); document.getElementById('silence-timeout-val').value = String(cfg.silenceTimeoutVal ?? '10'); const tU = document.getElementById('silence-timeout-unit'); if ([...tU.options].some(o => o.value === String(cfg.silenceTimeoutUnit || 'sec'))) tU.value = String(cfg.silenceTimeoutUnit || 'sec');
  document.getElementById('toggle-sim-typing').checked = cfg.simulateTyping === true; loadMicList(false, cfg.selectedMicId || '');
  document.getElementById('toggle-replace').checked = cfg.textReplaceEnabled === true; document.getElementById('toggle-replace-inline').checked = cfg.textReplaceInline !== false; syncReplaceEnable();
  const rL = document.getElementById('replacement-list'); rL.innerHTML = ''; if (!(cfg.textReplacements || []).length) addReplacementRow('', ''); else cfg.textReplacements.forEach(r => addReplacementRow(r.say || '', r.replace || ''));
  const lHL = document.getElementById('lang-hotkeys-list'); lHL.innerHTML = ''; (cfg.langHotkeys || []).forEach(lh => addLangHotkeyRow(lh.combo || '', lh.lang || 'bn-BD'));
  const lI = document.getElementById('input-license'); lI.value = cfg.licenseKey || ''; lI.type = cfg.licenseKey ? 'password' : 'text';
  // Fetch extra license info (daily words, activated date) for richer UI
  const licenseInfoP = window.electronAPI.getLicenseInfo ? window.electronAPI.getLicenseInfo() : Promise.resolve({});
  licenseInfoP.then(extra => {
    updateLicenseUI(cfg.licenseStatus || 'trial', cfg.firstLaunchDate || Date.now(), cfg.licensePurchase, extra);
  }).catch(() => {
    updateLicenseUI(cfg.licenseStatus || 'trial', cfg.firstLaunchDate || Date.now(), cfg.licensePurchase, {});
  });
  const thS = document.getElementById('theme-select'); if (thS) thS.value = cfg.theme || 'system'; previewTheme();
  const vS = document.getElementById('visualizer-style'); if (vS) vS.value = cfg.visualizerType || 'wave';
  const svS = document.getElementById('sound-volume'), svL = document.getElementById('label-sound-volume'); if (svS) { svS.value = cfg.soundVolume ?? 80; if (svL) svL.textContent = svS.value + '%'; }
  const mS = document.getElementById('mic-sensitivity'), sL = document.getElementById('label-sensitivity'); if (mS) { mS.value = cfg.micSensitivity || 1.0; if (sL) sL.textContent = parseFloat(mS.value).toFixed(1); }
  // ── AI Dictation ──
  document.getElementById('toggle-ai-mode').checked = cfg.aiModeEnabled === true; syncAiEnable();

  const aiSilenceInput = document.getElementById('ai-silence-timeout');
  if (aiSilenceInput) aiSilenceInput.value = cfg.aiSilenceTimeout ?? 8;
  // AI Instant Send Key
  pendingAiSendKey = cfg.aiActivationKey || AI_SENDKEY_DEFAULT;
  if (aiSendKeyBadge) aiSendKeyBadge.textContent = aiSendKeyDisplayName(pendingAiSendKey);
  // Floating Browser Shortcut
  pendingBrowserShortcut = cfg.floatingBrowserShortcut || DEFAULT_BROWSER_SHORTCUT;
  if (browserShortcutBadge) browserShortcutBadge.textContent = formatCombo(pendingBrowserShortcut);
  // Load profiles
  _aiProfiles = cfg.aiProfiles || [];
  _aiActiveProfileId = cfg.aiActiveProfileId || '';
  // Backward compat: if no profiles but old flat config exists, migrate
  if (!_aiProfiles.length && cfg.aiApiKey) {
    _aiProfiles = [{ id: Date.now().toString(), name: 'Default', provider: cfg.aiProvider || 'openai', model: cfg.aiModel || '', apiKey: cfg.aiApiKey, baseUrl: cfg.aiBaseUrl || '' }];
    _aiActiveProfileId = _aiProfiles[0].id;
    saveAiProfiles();
  }
  renderAiProfiles();
  // Set form defaults for 'Add new' (use first provider)
  const aiProviderEl = document.getElementById('ai-provider');
  if (aiProviderEl) { aiProviderEl.value = 'openai'; populateAiModels('openai', ''); onAiProviderChange(); }
  // Load non-profile settings
  document.getElementById('ai-system-prompt').value = cfg.aiSystemPrompt || '';
  document.getElementById('ai-personal-dict').value = cfg.aiPersonalDictionary || '';
  const aiTempSlider = document.getElementById('ai-temperature');
  if (aiTempSlider) { aiTempSlider.value = cfg.aiTemperature ?? 0.3; document.getElementById('label-ai-temp').textContent = parseFloat(aiTempSlider.value).toFixed(1); }
  // ── Speech Engine Browser ──
  loadBrowserSettings(cfg.preferredBrowser || 'auto');
}

/* ═══════════════════════════════════════════════════════════════════
   ██  SPEECH ENGINE — BROWSER SELECTION & STATUS
   ═══════════════════════════════════════════════════════════════════ */

async function loadBrowserSettings(savedPref) {
  const sel = document.getElementById('preferred-browser');
  if (!sel) return;

  // Populate dropdown with installed browsers
  try {
    const browsers = await window.electronAPI.getAvailableBrowsers();
    // Keep the "Auto" option, remove any old dynamic options
    sel.querySelectorAll('option:not([value="auto"])').forEach(o => o.remove());
    const ICONS = { 'Google Chrome': '🟢', 'Microsoft Edge': '🔵', 'Brave': '🟠' };
    browsers.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = `${ICONS[b.name] || '●'} ${b.name}  (${b.engineLabel})`;
      sel.appendChild(opt);
    });

    // If no browsers found (extremely unlikely), show a hint
    if (!browsers.length) {
      const opt = document.createElement('option');
      opt.value = ''; opt.disabled = true;
      opt.textContent = '⚠ No compatible browser found';
      sel.appendChild(opt);
    }
  } catch (e) {
    console.warn('Could not list browsers:', e);
  }

  // Restore saved preference
  if ([...sel.options].some(o => o.value === savedPref)) {
    sel.value = savedPref;
  } else {
    sel.value = 'auto';
  }

  // Update the active engine status badge
  refreshSttEngineBadge();
}

async function refreshSttEngineBadge() {
  const badge = document.getElementById('stt-engine-badge');
  const label = document.getElementById('stt-engine-label');
  const dot   = document.getElementById('stt-engine-dot');
  const desc  = document.getElementById('stt-engine-status');
  if (!badge || !label) return;

  try {
    const info = await window.electronAPI.getSttEngineInfo();
    if (info && info.name !== 'Unknown') {
      const ENGINE_STYLES = {
        google: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)' },
        azure:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.25)' },
        apple:  { color: '#f472b6', bg: 'rgba(244,114,182,0.1)', border: 'rgba(244,114,182,0.25)' },
      };
      const s = ENGINE_STYLES[info.engine] || ENGINE_STYLES.google;
      label.textContent = info.name === 'Google Chrome' ? info.engineLabel : `${info.engineLabel} via ${info.name}`;
      dot.style.background = s.color;
      badge.style.color = s.color;
      badge.style.background = s.bg;
      badge.style.borderColor = s.border;
      desc.textContent = `Requires to run in the default mode.`;
    } else {
      label.textContent = 'Not connected';
      dot.style.background = '#6b7280';
      badge.style.color = '#6b7280';
      badge.style.background = 'rgba(107,114,128,0.1)';
      badge.style.borderColor = 'rgba(107,114,128,0.25)';
      desc.textContent = 'No browser engine is currently active. Start dictation to initialize.';
    }
  } catch {
    label.textContent = '—';
    desc.textContent = 'Could not detect speech engine.';
  }
}

window.onPreferredBrowserChange = async function() {
  const sel = document.getElementById('preferred-browser');
  if (!sel) return;

  // 1. Persist the preference first so the bridge launcher reads it on restart
  window.electronAPI.saveConfig({ preferredBrowser: sel.value });
  markDirty();

  // 2. Show "switching…" feedback while the bridge restarts
  const desc   = document.getElementById('stt-engine-status');
  const badge  = document.getElementById('stt-engine-badge');
  const label  = document.getElementById('stt-engine-label');
  if (desc)  desc.textContent  = '⟳ Switching browser engine…';
  if (label) label.textContent = 'Restarting…';

  try {
    // Wait briefly to ensure the IPC `save-config` event reaches the main process
    // before we trigger the `restart-stt-bridge` IPC handler.
    await new Promise(r => setTimeout(r, 200));

    // 3. Restart the running bridge with the new browser (no app restart needed)
    await window.electronAPI.restartSttBridge();

    // 4. Give the bridge a moment to initialize and reconnect
    await new Promise(r => setTimeout(r, 2000));

    // 5. Refresh the Active Engine badge so it shows the new engine
    await refreshSttEngineBadge();

    if (desc) desc.textContent = 'Engine switched successfully.';
    setTimeout(() => {
      if (desc) desc.textContent = 'Requires to run in the default mode.';
    }, 3000);
  } catch (e) {
    console.error('Failed to restart STT bridge:', e);
    if (desc) desc.textContent = '⚠ Could not switch engine. Try restarting the app.';
  }
};

window.addReplacementRow = function(say, rep) {
  const row = document.createElement('div'); row.className = 'replace-row'; row.innerHTML = `<input type="text" class="replace-input val-say" placeholder="I will say..."><span style="font-size:12px; color:var(--muted); margin-top:12px;">→</span><textarea class="replace-input val-replace" placeholder="Replace with..."></textarea><button class="btn-del-row" onclick="this.parentElement.remove(); markDirty();">✕</button>`;
  row.querySelector('.val-say').value = say; row.querySelector('.val-replace').value = rep; document.getElementById('replacement-list').appendChild(row);
};

window.addLangHotkeyRow = function(combo = '', lang = 'bn-BD') {
  const sel = document.createElement('select'); sel.className = 'lang-select val-lang'; SETTINGS_LANGUAGES.forEach(l => { const o = document.createElement('option'); o.value = l.code; o.textContent = IS_WIN ? l.name : (l.flag + '\u00A0' + l.name); sel.appendChild(o); });
  const row = document.createElement('div'); row.className = 'settings-row lang-hotkey-row'; row.style.borderTop = '1px solid var(--border)'; row.style.marginTop = '4px'; row.style.paddingTop = '12px';
  row.innerHTML = `<div class="row-icon" style="background:rgba(108,99,255,0.08);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg></div><div class="row-info" style="flex-direction:row; align-items:center; gap:8px;"><div class="key-badge val-combo" style="cursor:pointer;">${combo ? formatCombo(combo) : 'Not set'}</div><span style="font-size:12px; color:var(--muted)">triggers</span><div class="select-wrapper"></div></div><div class="key-controls"><button class="btn-action btn-del-row" style="color:#ff6b6b; border-color:rgba(255,107,107,0.3)">✕</button></div>`;
  row.querySelector('.select-wrapper').appendChild(sel); sel.value = lang; const badge = row.querySelector('.val-combo'); badge.dataset.rawCombo = combo;
  badge.addEventListener('click', () => !recordingMode && startRecording('lang-combo', badge)); row.querySelector('.btn-del-row').addEventListener('click', () => { row.remove(); markDirty(); }); document.getElementById('lang-hotkeys-list').appendChild(row);
};

let licenseTimer = null;
function updateLicenseUI(status, firstLaunch, purchase, extra) {
  if (licenseTimer) clearInterval(licenseTimer);
  const h = document.getElementById('license-headline'),
        s = document.getElementById('license-subtext'),
        c = document.getElementById('license-status-card'),
        b = document.getElementById('btn-verify-license');

  if (status === 'active') {
    const activatedDate = extra?.licenseActivatedDate || 0;
    const dateStr = activatedDate
      ? new Date(activatedDate).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' })
      : null;
    h.textContent = '✦ Pro Version Unlocked';
    c.style.background = 'rgba(72, 199, 116, 0.15)';
    c.style.borderColor = '#48c774';
    h.style.color = '#48c774';
    b.textContent = 'Verified'; b.disabled = true;
    const isSubscription = purchase?.subscription_id && !purchase?.subscription_ended_at;
    const planLabel = isSubscription ? 'Active Subscription' : 'Lifetime License';

    // Live count-up timer from activation date
    s.style.whiteSpace = 'pre-line';
    const updateActiveTimer = () => {
      if (!activatedDate) {
        s.textContent = `${planLabel} — Thank you! ⭐`;
        return;
      }
      const elapsed = Date.now() - activatedDate;
      const d   = Math.floor(elapsed / 86400000);
      const hr  = Math.floor((elapsed % 86400000) / 3600000);
      const min = Math.floor((elapsed % 3600000) / 60000);
      const sec = Math.floor((elapsed % 60000) / 1000);
      s.textContent = `${planLabel} — Thank you! ⭐\nLicensed since: ${dateStr}\nPro for: ${d}d ${hr}h ${min}m ${sec}s`;
    };
    updateActiveTimer();
    licenseTimer = setInterval(updateActiveTimer, 1000);

  } else if (status === 'expired') {
    h.textContent = 'License Expired';
    s.textContent = 'Your paid license has expired or was revoked. Please enter a new license key.';
    c.style.background = 'rgba(248, 113, 113, 0.15)';
    c.style.borderColor = '#f87171';
    h.style.color = '#f87171';
    b.disabled = false; b.textContent = 'Activate';

  } else if (status === 'free') {
    const used = extra?.freeDailyWords || 0;
    const remaining = Math.max(0, 500 - used);
    const pct = Math.min(100, Math.round((used / 500) * 100));
    h.textContent = 'Free Tier';
    h.style.color = '#fb923c';
    c.style.background = 'rgba(251,146,60,0.1)';
    c.style.borderColor = '#fb923c';
    b.disabled = false; b.textContent = 'Get License';
    s.style.whiteSpace = 'normal';
    s.innerHTML = `Today: <strong style="color:#fb923c">${used} / 500</strong> words used &nbsp;·&nbsp; <strong style="color:#fff">${remaining}</strong> remaining<br>
      <div style="margin-top:8px;background:rgba(255,255,255,0.07);border-radius:6px;height:5px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#fb923c,#f97316);border-radius:6px;transition:width 0.5s;"></div>
      </div>
      <span style="font-size:11px;color:rgba(255,255,255,0.4);">Resets at midnight &bull; Translator locked (paid feature)</span>`;

  } else {
    // trial
    c.style.background = 'rgba(124,111,255,0.1)'; c.style.borderColor = 'var(--accent)'; h.style.color = 'var(--text)';
    b.disabled = false; b.textContent = 'Activate Pro';
    s.style.whiteSpace = 'normal';
    s.textContent = 'You are currently enjoying the fully-featured 15-day free trial.';
    const update = () => {
      const left = Math.max(0, firstLaunch + (15*24*60*60*1000) - Date.now());
      if (!left) { h.textContent = 'Free Trial: Expired'; clearInterval(licenseTimer); return; }
      const d = Math.floor(left/86400000), hr = Math.floor((left%86400000)/3600000),
            min = Math.floor((left%3600000)/60000), sec = Math.floor((left%60000)/1000);
      h.textContent = `Free Trial: ${d}d ${hr}h ${min}m ${sec}s left`;
    };
    update(); licenseTimer = setInterval(update, 1000);
  }
}

window.activateLicense = async function() {
  const k = document.getElementById('input-license').value.trim();
  if (!k) return;
  const b = document.getElementById('btn-verify-license');
  b.textContent = 'Verifying...'; b.disabled = true;
  const res = await window.electronAPI.verifyLicense(k);
  if (res.success) {
    // Show celebration popup (3s countdown + 2.5s success = ~5.5s total)
    window.electronAPI.showLicenseCelebration();
    // Reload config after celebration finishes so the license UI updates
    setTimeout(() => loadConfig(), 6000);
  } else {
    alert(res.message);
    b.textContent = 'Activate';
    b.disabled = false;
  }
};

window.markDirty = function() { document.getElementById('header-save-container').classList.add('dirty'); };
window.clearDirty = function() { document.getElementById('header-save-container').classList.remove('dirty'); };

document.addEventListener('DOMContentLoaded', () => {
  const b = document.querySelector('.content-body'); if (b) { b.addEventListener('input', markDirty); b.addEventListener('change', markDirty); }
  document.getElementById('btn-export-settings')?.addEventListener('click', async () => {
    const res = await window.electronAPI.exportSettings(), s = document.getElementById('backup-status-text');
    if (res?.ok) { s.textContent = 'Settings exported successfully!'; s.style.color = 'var(--accent2)'; } else { s.textContent = res?.cancelled ? 'Export cancelled.' : 'Export failed.'; s.style.color = res?.cancelled ? 'var(--muted)' : '#ff6b6b'; }
    setTimeout(() => { s.textContent = 'Backup or restore shortcuts and configurations'; s.style.color = 'var(--muted)'; }, 4000);
  });
  document.getElementById('btn-import-settings')?.addEventListener('click', async () => {
    const res = await window.electronAPI.importSettingsPick(), s = document.getElementById('backup-status-text');
    if (res?.error) { s.textContent = 'Failed: ' + res.error; s.style.color = '#ff6b6b'; } else if (res?.cancelled) { s.textContent = 'Import cancelled.'; s.style.color = 'var(--muted)'; } else if (res?.config) { if (res.conflicts?.length) alert("Imported Shortcuts Conflict!"); const cR = await window.electronAPI.importSettingsCommit(res.config); if (cR?.ok) { s.textContent = 'Import successful! Reloading...'; s.style.color = 'var(--accent2)'; setTimeout(loadConfig, 1000); } }
    setTimeout(() => { s.textContent = 'Backup or restore shortcuts and configurations'; s.style.color = 'var(--muted)'; }, 4000);
  });
});

window.saveSettings = function() {
  if (recordingMode) stopRecording(true); const b = document.getElementById('btn-save'); b.disabled = true;
  const reps = [], lH = []; document.querySelectorAll('#replacement-list .replace-row').forEach(r => { const s = r.querySelector('.val-say').value.trim(), rep = r.querySelector('.val-replace').value.trim(); if (s) reps.push({ say:s, replace:rep }); });
  document.querySelectorAll('#lang-hotkeys-list .lang-hotkey-row').forEach(r => { const c = r.querySelector('.val-combo').dataset.rawCombo, l = r.querySelector('.val-lang').value; if (c && l) lH.push({ combo:c, lang:l }); });
  const silenceEnabled = document.getElementById('toggle-silence').checked;
  const silenceVal = parseFloat(document.getElementById('silence-timeout-val').value) || 1;
  const silenceUnit = document.getElementById('silence-timeout-unit').value;
  let silenceMult = 1; if (silenceUnit === 'min') silenceMult = 60; else if (silenceUnit === 'hr') silenceMult = 3600; else if (silenceUnit === 'days') silenceMult = 86400;
  const silenceSecs = silenceEnabled ? (silenceVal * silenceMult) : 0;
  // Get active profile values for flat config (backend compatibility)
  const activeP = getActiveAiProfile();
  window.electronAPI.saveConfig({ hotkey: pendingHotkey || DEFAULT_HOTKEY, hotkeyEnabled: document.getElementById('toggle-hotkey').checked, holdKey: pendingHoldKey || DEFAULT_HOLD_KEY, holdKeyEnabled: document.getElementById('toggle-holdkey').checked, holdDuration: parseFloat(document.getElementById('hold-duration')?.value || 2), mouseButton: document.getElementById('mouse-button')?.value || '3', mouseAction: document.getElementById('mouse-action')?.value || 'none', autoLaunch: document.getElementById('toggle-autolunch').checked, language: document.getElementById('lang-select').value, preferredBrowser: document.getElementById('preferred-browser')?.value || 'auto', clipboardEnabled: document.getElementById('toggle-clipboard-enabled').checked, silenceTimeoutEnabled: silenceEnabled, silenceTimeoutVal: silenceVal, silenceTimeoutUnit: silenceUnit, silenceTimeout: silenceSecs, simulateTyping: document.getElementById('toggle-sim-typing').checked, theme: document.getElementById('theme-select').value, visualizerType: document.getElementById('visualizer-style')?.value || 'wave', soundVolume: parseInt(document.getElementById('sound-volume')?.value ?? 80, 10), micSensitivity: parseFloat(document.getElementById('mic-sensitivity')?.value || 1.0), textReplaceEnabled: document.getElementById('toggle-replace').checked, textReplaceInline: document.getElementById('toggle-replace-inline').checked, textReplacements: reps, langHotkeys: lH, aiModeEnabled: document.getElementById('toggle-ai-mode').checked,  aiSilenceTimeout: parseInt(document.getElementById('ai-silence-timeout')?.value || '8', 10), aiActivationKey: pendingAiSendKey || AI_SENDKEY_DEFAULT, floatingBrowserShortcut: pendingBrowserShortcut || DEFAULT_BROWSER_SHORTCUT, aiProfiles: _aiProfiles, aiActiveProfileId: _aiActiveProfileId, aiProvider: activeP?.provider || 'openai', aiModel: activeP?.model || '', aiApiKey: activeP?.apiKey || '', aiBaseUrl: activeP?.baseUrl || '', aiSystemPrompt: document.getElementById('ai-system-prompt').value, aiPersonalDictionary: document.getElementById('ai-personal-dict').value, aiTemperature: parseFloat(document.getElementById('ai-temperature')?.value || 0.3) });
  b.disabled = false; clearDirty();
};

window.checkUpdates = function() { const m = document.getElementById('update-status-msg'); m.textContent = 'Checking...'; m.style.color = 'var(--muted)'; window.electronAPI.checkUpdates(); };
window.electronAPI.onUpdateStatus((info) => {
  const m = document.getElementById('update-status-msg'), b = document.getElementById('btn-update');
  if (info.type === 'available') { m.style.color = 'var(--accent2)'; m.textContent = `V${info.version} available!`; b.textContent = 'Download Update'; b.onclick = () => { m.textContent = 'Starting download...'; b.style.display = 'none'; window.electronAPI.downloadUpdate(); }; }
  else if (info.type === 'not-available') { m.style.color = 'var(--muted)'; m.textContent = 'Up to date'; setTimeout(() => { m.textContent = ''; }, 3000); }
  else if (info.type === 'progress') { m.style.color = 'var(--accent2)'; m.textContent = `Downloading: ${Math.round(info.percent)}%`; }
  else if (info.type === 'downloaded') { m.style.color = '#4ade80'; m.textContent = 'Ready to install'; b.style.display = 'inline-block'; b.textContent = 'Restart to Install'; b.onclick = () => window.electronAPI.installUpdate(); }
  else if (info.type === 'error') { m.style.color = '#f87171'; m.textContent = 'Update error occurred.'; console.error(info.message); }
});

window.loadMicList = async function(force, savedId) {
  const sel = document.getElementById('mic-select'), sR = document.getElementById('mic-status-row'); if (!sel) return;
  if (force) { sel.innerHTML = '<option value="">Loading…</option>'; sel.disabled = true; }
  try {
    const devices = await window.electronAPI.getMicList(); sel.innerHTML = '<option value="">🎙 System Default</option>';
    if (!devices.length) { sR.textContent = 'ℹ️ Microphone list not available yet. Start recording once, then refresh.'; sR.style.display = 'block'; }
    else { sR.style.display = 'none'; devices.forEach(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.label.length > 40 ? d.label.slice(0, 37) + '…' : d.label; o.title = d.label; sel.appendChild(o); }); }
    const id = savedId !== undefined ? savedId : (sel.dataset.pendingSavedId || ''); sel.value = (id && [...sel.options].some(o => o.value === id)) ? id : '';
  } catch (e) { sR.textContent = '⚠ Could not load microphone list.'; sR.style.display = 'block'; } finally { sel.disabled = false; }
};

window.onMicChange = function(id) { window.electronAPI.setMic(id); };

function showIEMsg(t, isE) { const e = document.getElementById('import-export-msg'); e.textContent = t; e.style.color = isE ? '#f87171' : 'var(--accent)'; e.style.display = 'inline'; e.style.opacity = '1'; clearTimeout(e._t); e._t = setTimeout(() => { e.style.opacity = '0'; setTimeout(() => { e.style.display = 'none'; }, 300); }, 3000); }

window.doExportReplacements = async function() {
  const b = document.getElementById('btn-export-replacements'); b.disabled = true; b.textContent = 'Saving…';
  try { const res = await window.electronAPI.exportReplacements(); if (res.ok) showIEMsg(`✓ Exported ${res.count} replacements`, false); else if (res.reason !== 'canceled') showIEMsg('Export failed: ' + res.reason, true); }
  finally { b.disabled = false; b.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Export JSON`; }
};

let pendingImport = null;
window.doImportReplacements = async function() {
  const b = document.getElementById('btn-import-replacements'); b.disabled = true; b.textContent = 'Opening…';
  try { const res = await window.electronAPI.importReplacementsPick(); if (!res.ok) { if (res.reason !== 'canceled') showIEMsg('Import error: ' + res.reason, true); return; } pendingImport = res.items; document.getElementById('import-modal-count').textContent = res.count; document.getElementById('import-modal').classList.add('open'); }
  finally { b.disabled = false; b.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Import JSON`; }
};

window.factoryReset = async function() { if (confirm("Are you sure?")) await window.electronAPI.factoryReset(); };
window.browserReset = async function() {
  if (!confirm("This will clear all browser data — logged-in accounts, cookies, tabs, and history. Are you sure?")) return;
  const btn = document.getElementById('btn-browser-reset');
  if (btn) { btn.textContent = 'Resetting…'; btn.disabled = true; }
  try {
    await window.electronAPI.hardResetBrowser();
    if (btn) { btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Done`; btn.style.color = '#4ade80'; btn.style.borderColor = 'rgba(74,222,128,0.3)'; }
    setTimeout(() => {
      if (btn) { btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Reset Browser Data`; btn.style.color = 'var(--accent)'; btn.style.borderColor = 'rgba(124,111,255,0.2)'; btn.disabled = false; }
    }, 2500);
  } catch(e) {
    if (btn) { btn.textContent = 'Reset Failed'; btn.disabled = false; }
  }
};
window.closeImportModal = function() { document.getElementById('import-modal').classList.remove('open'); pendingImport = null; };
window.confirmImport = async function(mode) {
  if (!pendingImport) return; const items = pendingImport; closeImportModal();
  const res = await window.electronAPI.importReplacementsCommit({ items, mode });
  if (res.ok) { const cfg = await window.electronAPI.getConfig(), l = document.getElementById('replacement-list'); l.innerHTML = ''; if (!(cfg.textReplacements || []).length) addReplacementRow('', ''); else cfg.textReplacements.forEach(r => addReplacementRow(r.say || '', r.replace || '')); showIEMsg(`✓ ${mode === 'replace' ? 'Replaced all' : 'Merged'} successfully`, false); markDirty(); } else showIEMsg('Import commit failed', true);
};

document.getElementById('import-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeImportModal(); });
window.electronAPI.onLicenseExpired?.(() => document.querySelector('.nav-item[data-panel="license"]')?.click());
loadConfig();

// ── Live sync: AI mode toggled via Alt+Shift+C while settings is open ──
if (window.electronAPI.onAiModeToggled) {
  window.electronAPI.onAiModeToggled((on) => {
    const toggle = document.getElementById('toggle-ai-mode');
    if (toggle) { toggle.checked = on; syncAiEnable(); }
  });
}

// ── Live sync: Whisper AI Polish toggled via Right Alt+Right Shift+/ while settings is open ──
if (window.electronAPI.onWhisperAiModeToggled) {
  window.electronAPI.onWhisperAiModeToggled((on) => {
    const chk = document.getElementById('chk-whisper-ai-enabled');
    const section = document.getElementById('whisper-ai-section');
    if (chk) {
      chk.checked = on;
      if (section) section.style.display = on ? 'block' : 'none';
    }
  });
}



/* ═══════════════════════════════════════════════════════════════════
   ██  WHISPER API (CLOUD) — PROFILE-BASED PANEL LOGIC
   ═══════════════════════════════════════════════════════════════════ */

let _whisperProfiles = [];
let _whisperActiveProfileId = '';

function escWHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadWhisperPanel() {
  if (!window.electronAPI.whisperApiGetConfig) return;

  const cfg = await window.electronAPI.whisperApiGetConfig();

  // Master toggle
  const chk = document.getElementById('chk-whisper-enabled');
  if (chk) {
    chk.checked = cfg.enabled;
    chk.onchange = async () => {
      if (chk.checked) {
        // ── Whisper API Trial Gate ──
        try {
          const trial = await window.electronAPI.whisperApiCheckTrial();
          if (trial.expired) {
            // Trial over — revert toggle and show locked popup
            chk.checked = false;
            window.electronAPI.whisperApiShowLockedPopup();
            return;
          }
        } catch (e) {
          console.error('Whisper API trial check failed:', e);
        }
      }
      const result = await window.electronAPI.whisperApiEnable(chk.checked);
      if (result && result.trialExpired) {
        // Backend rejected — trial expired
        chk.checked = false;
        window.electronAPI.whisperApiShowLockedPopup();
        return;
      }
      updateWhisperStatus();
    };
  }

  // Load profiles from vault (single source of truth — engine reads from here)
  try {
    _whisperProfiles = await window.electronAPI.vaultGetWhisperProfiles() || [];
    const vaultDefaults = await window.electronAPI.vaultGetDefaults();
    _whisperActiveProfileId = vaultDefaults['whisper-stt'] || _whisperProfiles[0]?.id || '';
  } catch (e) {
    // fallback to legacy if vault unavailable
    _whisperProfiles = cfg.profiles || [];
    _whisperActiveProfileId = cfg.activeProfileId || (_whisperProfiles[0]?.id || '');
  }
  renderWhisperProfiles();

  // Populate model dropdown default (for the "Add New Profile" form)
  await populateWhisperModels('openai', '');

  // Fallback toggle
  const fbChk = document.getElementById('chk-whisper-fallback');
  if (fbChk) {
    fbChk.checked = cfg.fallbackEnabled !== false;
    fbChk.onchange = () => {
      window.electronAPI.whisperApiSetConfig({ fallbackEnabled: fbChk.checked });
    };
  }

  // Populate language dropdown
  try {
    const langs = await window.electronAPI.whisperApiGetLanguages();
    const langSel = document.getElementById('sel-whisper-lang');
    if (langSel && langs) {
      langSel.innerHTML = '';
      langs.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.code;
        opt.textContent = l.code ? `${l.name} (${l.code})` : `🌐 ${l.name}`;
        langSel.appendChild(opt);
      });
      langSel.value = cfg.language || '';
    }
  } catch {}

  // Save language changes immediately
  const langSel2 = document.getElementById('sel-whisper-lang');
  if (langSel2) langSel2.onchange = () => {
    window.electronAPI.whisperApiSetConfig({ language: langSel2.value });
  };

  // Activation key button
  const keyBtn = document.getElementById('btn-whisper-key');
  if (keyBtn) {
    keyBtn.textContent = formatKeyName(cfg.activationKey || (navigator.platform?.includes('Mac') ? 'MetaRight' : 'ControlRight'));
    keyBtn.onclick = () => startWhisperKeyCapture();
  }

  // ── Load AI Polish settings ──
  await loadWhisperAiSection();

  // Update status display
  updateWhisperStatus();
}

function renderWhisperProfiles() {
  const container = document.getElementById('whisper-profile-list');
  if (!container) return;
  container.innerHTML = '';

  if (!_whisperProfiles.length) {
    container.innerHTML = '<div class="ai-profile-empty">No profiles yet. Add one below.</div>';
    return;
  }

  _whisperProfiles.forEach(p => {
    const div = document.createElement('div');
    div.className = 'ai-profile-chip' + (p.id === _whisperActiveProfileId ? ' active' : '');
    const provLabel = p.provider === 'groq' ? '⚡ Groq' : '🟢 OpenAI';
    div.innerHTML = `
      <div class="ai-profile-name">${escWHtml(p.name)}</div>
      <div class="ai-profile-meta">
        <div class="ai-profile-badge">${provLabel} · ${escWHtml(p.model || '')}</div>
        <div class="ai-profile-actions">
          <button class="ai-profile-del" title="Delete">✕</button>
        </div>
      </div>
    `;
    div.addEventListener('click', async (e) => {
      if (e.target.classList.contains('ai-profile-del')) {
        // Delete from vault
        try { await window.electronAPI.vaultRemoveWhisperProfile(p.id); } catch (_) {}
        _whisperProfiles = _whisperProfiles.filter(x => x.id !== p.id);
        if (_whisperActiveProfileId === p.id) {
          _whisperActiveProfileId = _whisperProfiles[0]?.id || '';
          if (_whisperActiveProfileId) {
            try { await window.electronAPI.vaultSetDefault('whisper-stt', _whisperActiveProfileId); } catch (_) {}
          }
        }
        renderWhisperProfiles();
        updateWhisperStatus();
        showWhisperStatus('✓ Profile deleted');
      } else if (!e.target.closest('button')) {
        // Set as default in vault
        _whisperActiveProfileId = p.id;
        try { await window.electronAPI.vaultSetDefault('whisper-stt', p.id); } catch (_) {}
        renderWhisperProfiles();
        showWhisperStatus('✓ Default: ' + p.name);
        updateWhisperStatus();
      }
    });
    container.appendChild(div);
  });
}

function saveWhisperProfiles() {
  // Sync non-profile settings to legacy store (enabled, language, key, etc.)
  // Profile data and defaults live in the vault — engine reads from there
  if (_whisperActiveProfileId && window.electronAPI.vaultSetDefault) {
    window.electronAPI.vaultSetDefault('whisper-stt', _whisperActiveProfileId);
  }
}

function showWhisperStatus(msg, color) {
  const s = document.getElementById('whisper-key-status');
  if (s) {
    s.textContent = msg;
    s.style.color = color || 'var(--muted)';
    setTimeout(() => { if (s) s.textContent = ''; }, 3000);
  }
}

async function populateWhisperModels(provider, selectedModel) {
  try {
    const providers = await window.electronAPI.whisperApiGetProviders();
    const providerData = providers[provider] || providers.openai;
    const modelSel = document.getElementById('sel-whisper-model');
    if (!modelSel || !providerData) return;

    modelSel.innerHTML = '';
    providerData.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      modelSel.appendChild(opt);
    });

    const validIds = providerData.models.map(m => m.id);
    if (selectedModel && validIds.includes(selectedModel)) {
      modelSel.value = selectedModel;
    } else {
      modelSel.value = providerData.defaultModel;
    }
  } catch {}
}

window.onWhisperProviderChange = async function(provider) {
  await populateWhisperModels(provider, '');
};

async function updateWhisperStatus() {
  const dot = document.getElementById('whisper-status-dot');
  const label = document.getElementById('whisper-status-label');
  const detail = document.getElementById('whisper-status-detail');
  if (!dot) return;

  try {
    const cfg = await window.electronAPI.whisperApiGetConfig();
    const profiles = cfg.profiles || [];
    const activeProfile = profiles.find(p => p.id === cfg.activeProfileId) || profiles[0];

    if (!cfg.enabled) {
      dot.style.background = '#6b7280';
      label.textContent = 'Disabled';
      detail.textContent = 'Enable Whisper Engine to use cloud transcription.';
    } else if (!profiles.length) {
      dot.style.background = '#fb923c';
      label.textContent = 'No Profiles';
      detail.textContent = 'Add a Whisper Engine profile above to get started.';
    } else if (activeProfile) {
      const provName = activeProfile.provider === 'groq' ? 'Groq' : 'OpenAI';
      dot.style.background = '#4ade80';
      label.textContent = 'Ready';
      detail.textContent = `Active: ${activeProfile.name} (${provName} / ${activeProfile.model})\nHold ${formatKeyName(cfg.activationKey || (navigator.platform?.includes('Mac') ? 'MetaRight' : 'ControlRight'))} to record, release to transcribe.`;
    }
  } catch {
    dot.style.background = '#ef4444';
    label.textContent = 'Error';
    detail.textContent = 'Could not load Whisper API configuration.';
  }
}

function formatKeyName(code) {
  const MAP = {
    'AltRight': 'Right Alt', 'AltLeft': 'Left Alt', 'Alt': 'Alt',
    'ShiftRight': 'Right Shift', 'ShiftLeft': 'Left Shift', 'Shift': 'Shift',
    'ControlRight': 'Right Ctrl', 'ControlLeft': 'Left Ctrl', 'Ctrl': 'Ctrl',
    'MetaRight': 'Right ⌘', 'MetaLeft': 'Left ⌘', 'Meta': '⌘',
    'Space': 'Space', 'F1':'F1', 'F2':'F2', 'F3':'F3', 'F4':'F4',
    'F5':'F5', 'F6':'F6', 'F7':'F7', 'F8':'F8', 'F9':'F9',
    'F10':'F10', 'F11':'F11', 'F12':'F12',
  };
  return MAP[code] || code;
}

let whisperKeyCaptureActive = false;
function startWhisperKeyCapture() {
  whisperKeyCaptureActive = true;
  document.getElementById('whisper-key-capture').style.display = 'block';
  document.addEventListener('keydown', onWhisperKeyCaptured, { once: true });
}

function onWhisperKeyCaptured(e) {
  e.preventDefault();
  const keyCode = e.code;
  whisperKeyCaptureActive = false;
  document.getElementById('whisper-key-capture').style.display = 'none';
  document.getElementById('btn-whisper-key').textContent = formatKeyName(keyCode);
  window.electronAPI.whisperApiSetKey(keyCode);
  updateWhisperStatus();
}

window.cancelWhisperKeyCapture = function() {
  whisperKeyCaptureActive = false;
  document.getElementById('whisper-key-capture').style.display = 'none';
  document.removeEventListener('keydown', onWhisperKeyCaptured);
};

window.resetWhisperKey = function() {
  if (whisperKeyCaptureActive) cancelWhisperKeyCapture();
  const defaultKey = navigator.platform?.includes('Mac') ? 'MetaRight' : 'ControlRight';
  const keyBtn = document.getElementById('btn-whisper-key');
  if (keyBtn) keyBtn.textContent = formatKeyName(defaultKey);
  window.electronAPI.whisperApiSetKey(defaultKey);
  updateWhisperStatus();
};

window.addWhisperProfile = async function() {
  const nameInput = document.getElementById('whisper-profile-name');
  const name = nameInput?.value.trim();
  if (!name) { showWhisperStatus('⚠ Enter a profile name', '#fb923c'); return; }

  const apiKey = document.getElementById('whisper-api-key')?.value.trim();
  if (!apiKey) { showWhisperStatus('⚠ Enter an API key', '#fb923c'); return; }

  const profileData = {
    name,
    provider: document.getElementById('sel-whisper-provider')?.value || 'openai',
    model: document.getElementById('sel-whisper-model')?.value || 'whisper-1',
    apiKey,
    baseUrl: '',
  };

  try {
    // Write to vault first — engine reads from here
    const saved = await window.electronAPI.vaultAddWhisperProfile(profileData);
    const profile = saved?.profile || saved || { ...profileData, id: Date.now().toString() };

    _whisperProfiles.push(profile);

    // If first profile, auto-set as default
    if (!_whisperActiveProfileId || _whisperProfiles.length === 1) {
      _whisperActiveProfileId = profile.id;
      await window.electronAPI.vaultSetDefault('whisper-stt', profile.id);
    }

    // Clear form
    if (nameInput) nameInput.value = '';
    const keyInput = document.getElementById('whisper-api-key');
    if (keyInput) keyInput.value = '';

    renderWhisperProfiles();
    updateWhisperStatus();
    showWhisperStatus('✓ Profile saved!', '#4ade80');
  } catch (e) {
    console.error('[Whisper] Failed to save profile:', e);
    showWhisperStatus('✕ Save failed: ' + (e.message || 'unknown error'), '#f87171');
  }
};

window.testWhisperProfile = async function() {
  const statusEl = document.getElementById('whisper-key-status');
  const btn = document.getElementById('btn-whisper-test-key');
  if (!statusEl) return;

  const provider = document.getElementById('sel-whisper-provider')?.value || 'openai';
  const apiKey = document.getElementById('whisper-api-key')?.value.trim() || '';

  if (!apiKey) {
    showWhisperStatus('⚠ Enter an API key first', '#fb923c');
    return;
  }

  if (btn) btn.disabled = true;
  statusEl.textContent = 'Testing connection…';
  statusEl.style.color = 'var(--muted)';

  try {
    const result = await window.electronAPI.whisperApiTestKey({ provider, apiKey });
    if (result.ok) {
      showWhisperStatus('✓ Connected!', '#4ade80');
    } else {
      showWhisperStatus('✕ ' + (result.error || 'Connection failed'), '#f87171');
    }
  } catch (e) {
    showWhisperStatus('✕ ' + (e.message || 'Test failed'), '#f87171');
  } finally {
    if (btn) btn.disabled = false;
  }
};

/* ═══════════════════════════════════════════════════════════════════
   ██  WHISPER API — AI POST-PROCESSING (POLISH) FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

/* ── Whisper API — AI Polish (Profile-based, mirrors AI Dictation) ─ */

let _whisperAiProfiles = [];
let _whisperAiActiveProfileId = '';

function escWhisperHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadWhisperAiSection() {
  if (!window.electronAPI.whisperApiAiGetConfig) return;

  const cfg = await window.electronAPI.whisperApiAiGetConfig();

  // Enable toggle
  const chk = document.getElementById('chk-whisper-ai-enabled');
  const section = document.getElementById('whisper-ai-section');
  if (chk) {
    chk.checked = cfg.enabled;
    if (section) section.style.display = cfg.enabled ? 'block' : 'none';
    chk.onchange = async () => {
      await window.electronAPI.whisperApiAiEnable(chk.checked);
      if (section) section.style.display = chk.checked ? 'block' : 'none';
    };
  }

  // Load profiles
  _whisperAiProfiles = cfg.profiles || [];
  _whisperAiActiveProfileId = cfg.activeProfileId || (_whisperAiProfiles[0]?.id || '');
  renderWhisperAiProfiles();

  // Fallback toggle
  const fbChk = document.getElementById('chk-whisper-ai-fallback');
  if (fbChk) {
    fbChk.checked = cfg.fallbackEnabled !== false;
    fbChk.onchange = () => {
      window.electronAPI.whisperApiAiSetConfig({ fallbackEnabled: fbChk.checked });
    };
  }

  // Populate the "Add New Profile" form default state
  populateWhisperAiModels('openai', '');

  // System prompt
  const promptArea = document.getElementById('whisper-ai-system-prompt');
  if (promptArea) promptArea.value = cfg.systemPrompt || '';

  // Temperature
  const tempSlider = document.getElementById('whisper-ai-temperature');
  const tempLabel = document.getElementById('label-whisper-ai-temp');
  if (tempSlider) {
    tempSlider.value = cfg.temperature ?? 0.3;
    if (tempLabel) tempLabel.textContent = parseFloat(tempSlider.value).toFixed(1);
  }
}

async function renderWhisperAiProfiles() {
  const container = document.getElementById('whisper-ai-profile-list');
  if (!container) return;
  container.innerHTML = '';

  // Read LLM profiles from the central vault (not the legacy separate store)
  let vaultProfiles = [];
  try {
    vaultProfiles = await window.electronAPI.vaultGetLlmProfiles() || [];
  } catch (e) {
    console.warn('[WhisperAI] Failed to load vault LLM profiles:', e);
  }

  if (!vaultProfiles.length) {
    container.innerHTML = '<div class="ai-profile-empty">No LLM profiles found. <a href="#" onclick="switchPanel(\'api-vault\', document.querySelector(\'[data-panel=api-vault]\')); return false;" style="color:var(--accent);">Add one in AI & API →</a></div>';
    return;
  }

  // Get the per-feature default for whisper-polish
  let defaultId = '';
  try {
    const defProfile = await window.electronAPI.vaultGetDefaultForFeature('whisper-polish');
    defaultId = defProfile?.id || '';
  } catch (e) { /* ignore */ }
  // Fallback: if no whisper-polish default, use the global ai-dictation default
  if (!defaultId) {
    try {
      const summary = await window.electronAPI.vaultGetSummary();
      defaultId = summary?.defaults?.['whisper-polish'] || summary?.defaults?.['ai-dictation'] || vaultProfiles[0]?.id || '';
    } catch (e) { /* ignore */ }
  }

  vaultProfiles.forEach(p => {
    const isActive = p.id === defaultId;
    const div = document.createElement('div');
    div.className = 'ai-profile-chip' + (isActive ? ' active' : '');
    div.innerHTML = `
      ${isActive ? '<span style="color:var(--accent);font-size:10px;margin-right:4px;">●</span>' : ''}
      <div class="ai-profile-name">${escWhisperHtml(p.name)}</div>
      <div class="ai-profile-badge">${escWhisperHtml(p.provider)} · ${escWhisperHtml(p.model || '')}</div>
    `;
    div.style.cursor = 'pointer';
    div.addEventListener('click', async () => {
      // Set as the whisper-polish default in the vault (independent from other features)
      try {
        await window.electronAPI.vaultSetDefault('whisper-polish', p.id);
      } catch (e) {
        console.error('[WhisperAI] Failed to set vault default:', e);
      }
      renderWhisperAiProfiles();
      showWhisperAiStatus('✓ Default: ' + p.name);
    });
    container.appendChild(div);
  });
}

/* Legacy save kept for backwards compat with system prompt / temperature */
function saveWhisperAiProfiles() {
  window.electronAPI.whisperApiAiSetConfig({
    profiles: _whisperAiProfiles,
    activeProfileId: _whisperAiActiveProfileId,
  });
}

function showWhisperAiStatus(msg, color) {
  const s = document.getElementById('whisper-ai-test-status');
  if (s) {
    s.textContent = msg;
    s.style.color = color || 'var(--muted)';
    setTimeout(() => { if (s) s.textContent = ''; }, 3000);
  }
}

function populateWhisperAiModels(provider, currentValue) {
  const sel = document.getElementById('whisper-ai-model');
  if (!sel) return;
  sel.innerHTML = '';

  const models = AI_PROVIDER_MODELS[provider] || [];
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  });

  if (currentValue && [...sel.options].some(o => o.value === currentValue)) {
    sel.value = currentValue;
  } else if (models.length > 0) {
    sel.value = models[0];
  }
}

window.onWhisperAiProviderChange = function(provider) {
  const isCustom = provider === 'custom';
  const baseUrlRow = document.getElementById('row-whisper-ai-baseurl');
  const ollamaBtn = document.getElementById('btn-whisper-ai-ollama-refresh');
  const ollamaStatus = document.getElementById('whisper-ai-ollama-status');

  if (baseUrlRow) baseUrlRow.style.display = isCustom ? 'flex' : 'none';
  if (ollamaBtn) ollamaBtn.style.display = isCustom ? 'inline-block' : 'none';

  if (isCustom) {
    refreshWhisperAiOllamaModels();
  } else if (ollamaStatus) {
    ollamaStatus.style.display = 'none';
  }

  populateWhisperAiModels(provider, '');
};

window.addWhisperAiProfile = function() {
  const nameInput = document.getElementById('whisper-ai-profile-name');
  const name = nameInput?.value.trim();
  if (!name) { showWhisperAiStatus('⚠ Enter a profile name', '#fb923c'); return; }
  const apiKey = document.getElementById('whisper-ai-apikey')?.value.trim();
  const provider = document.getElementById('whisper-ai-provider')?.value || 'openai';
  if (!apiKey && provider !== 'custom') { showWhisperAiStatus('⚠ Enter an API key', '#fb923c'); return; }

  const profile = {
    id: Date.now().toString(),
    name,
    provider,
    model: document.getElementById('whisper-ai-model')?.value || '',
    apiKey: apiKey || '',
    baseUrl: document.getElementById('whisper-ai-baseurl')?.value.trim() || '',
  };

  _whisperAiProfiles.push(profile);
  if (!_whisperAiActiveProfileId) _whisperAiActiveProfileId = profile.id;

  saveWhisperAiProfiles();

  // Clear form
  if (nameInput) nameInput.value = '';
  const keyInput = document.getElementById('whisper-ai-apikey');
  if (keyInput) keyInput.value = '';
  const baseUrlInput = document.getElementById('whisper-ai-baseurl');
  if (baseUrlInput) baseUrlInput.value = '';

  renderWhisperAiProfiles();
  showWhisperAiStatus('✓ Profile saved!', '#4ade80');
};

window.testWhisperAiConnection = async function() {
  const statusEl = document.getElementById('whisper-ai-test-status');
  const btn = document.getElementById('btn-whisper-ai-test');
  if (!statusEl) return;

  const provider = document.getElementById('whisper-ai-provider')?.value || 'openai';
  const model = document.getElementById('whisper-ai-model')?.value || '';
  const apiKey = document.getElementById('whisper-ai-apikey')?.value.trim() || '';
  const baseUrl = document.getElementById('whisper-ai-baseurl')?.value.trim() || '';

  if (!apiKey && provider !== 'custom') {
    showWhisperAiStatus('⚠ Enter an API key first', '#fb923c');
    return;
  }

  if (btn) btn.disabled = true;
  statusEl.textContent = 'Testing connection…';
  statusEl.style.color = 'var(--muted)';

  try {
    const profile = { provider, model, modelName: model, apiKey, baseUrl };
    const result = await window.electronAPI.whisperApiAiTest(profile);

    if (result.text) {
      showWhisperAiStatus('✓ Connected!', '#4ade80');
    } else if (result.error) {
      showWhisperAiStatus('✕ ' + result.error, '#f87171');
    } else {
      showWhisperAiStatus('✕ No response', '#f87171');
    }
  } catch (e) {
    showWhisperAiStatus('✕ ' + (e.message || 'Test failed'), '#f87171');
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.saveWhisperAiSettings = async function() {
  const systemPrompt = document.getElementById('whisper-ai-system-prompt')?.value || '';
  const temperature = parseFloat(document.getElementById('whisper-ai-temperature')?.value || '0.3');
  const statusEl = document.getElementById('whisper-ai-settings-status');

  await window.electronAPI.whisperApiAiSetConfig({ systemPrompt, temperature });

  if (statusEl) {
    statusEl.textContent = '✓ Settings saved!';
    statusEl.style.color = '#4ade80';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
  }
};

window.refreshWhisperAiOllamaModels = async function() {
  const statusDiv = document.getElementById('whisper-ai-ollama-status');
  if (!statusDiv) return;

  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<span style="color:var(--muted)">🔍 Checking Ollama...</span>';

  try {
    const result = await window.electronAPI.aiGetOllamaModels();
    if (result.running) {
      const modelList = result.models.map(m => m.name).join(', ') || 'No models installed';
      statusDiv.innerHTML = `<span style="color:#4ade80">✓ Ollama running</span> — Models: <strong>${modelList}</strong>`;

      const sel = document.getElementById('whisper-ai-model');
      if (sel) {
        sel.innerHTML = '';
        result.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name;
          opt.textContent = m.name;
          sel.appendChild(opt);
        });
        if (result.models.length > 0) sel.value = result.models[0].name;
      }
    } else {
      statusDiv.innerHTML = '<span style="color:#fb923c">⚠ Ollama not running</span> — Start Ollama first, then click ↺';
    }
  } catch (e) {
    statusDiv.innerHTML = `<span style="color:#f87171">✕ Error: ${e.message}</span>`;
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   ██  API VAULT — Central Profile Manager (LLM + Whisper STT)
   ═══════════════════════════════════════════════════════════════════════ */

let _vaultLlmProfiles = [];
let _vaultDefaults = {};
let _vaultFallbackEnabled = true;

function escVaultHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const VAULT_PROVIDER_LABELS = {
  openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini',
  groq: 'Groq', openrouter: 'OpenRouter', nvidia: 'NVIDIA NIM',
  custom: 'Custom / Ollama',
};

async function loadVaultPanel() {
  try {
    _vaultLlmProfiles = await window.electronAPI.vaultGetLlmProfiles() || [];
    _vaultDefaults = await window.electronAPI.vaultGetDefaults() || {};
    _vaultFallbackEnabled = await window.electronAPI.vaultGetFallback();
  } catch (e) {
    console.error('[Vault] Failed to load vault data:', e);
  }

  // Fallback toggle
  const fbChk = document.getElementById('vault-fallback-toggle');
  if (fbChk) {
    fbChk.checked = _vaultFallbackEnabled !== false;
    fbChk.onchange = async () => {
      await window.electronAPI.vaultSetFallback(fbChk.checked);
      _vaultFallbackEnabled = fbChk.checked;
    };
  }

  renderVaultLlmProfiles();

  // Set form defaults
  const prov = document.getElementById('vault-llm-provider');
  if (prov) { prov.value = 'openai'; onVaultLlmProviderChange(); }
}

// ── LLM Profile Rendering ─────────────────────────────────────────
function renderVaultLlmProfiles() {
  const container = document.getElementById('vault-llm-profile-list');
  if (!container) return;
  container.innerHTML = '';

  if (!_vaultLlmProfiles.length) {
    container.innerHTML = '<div class="ai-profile-empty">No LLM profiles yet. Add one below.</div>';
    return;
  }

  // Only highlight the profile set as the general (ai-dictation) default.
  // Translator and whisper-polish have their own independent defaults managed in their own panels.
  const generalDefaultId = _vaultDefaults['ai-dictation'] || '';

  _vaultLlmProfiles.forEach(p => {
    const div = document.createElement('div');
    const isDefault = p.id === generalDefaultId;
    div.className = 'ai-profile-chip' + (isDefault ? ' active' : '');
    const provLabel = VAULT_PROVIDER_LABELS[p.provider] || p.provider;

    // Build the model dropdown for this profile's provider
    const models = (typeof AI_PROVIDER_MODELS !== 'undefined' ? AI_PROVIDER_MODELS[p.provider] : null) || [];
    let modelSelectHtml;
    if (models.length > 0) {
      const options = models.map(m =>
        `<option value="${escVaultHtml(m)}"${m === p.model ? ' selected' : ''}>${escVaultHtml(m)}</option>`
      ).join('');
      // Add current model as option if it's not in the list (custom/old model)
      const currentInList = models.includes(p.model);
      const extraOpt = (!currentInList && p.model)
        ? `<option value="${escVaultHtml(p.model)}" selected>${escVaultHtml(p.model)}</option>`
        : '';
      modelSelectHtml = `<select class="vault-model-select" data-profile-id="${p.id}" title="Change model">${extraOpt}${options}</select>`;
    } else {
      // No predefined models (custom/ollama) — show editable text
      modelSelectHtml = `<span class="ai-profile-badge" style="cursor:default;">${escVaultHtml(p.model || 'custom')}</span>`;
    }

    div.innerHTML = `
      <div class="ai-profile-name">${escVaultHtml(p.name)}</div>
      <div class="ai-profile-meta">
        <div class="ai-profile-badge">${escVaultHtml(provLabel)}</div>
        ${modelSelectHtml}
        <div class="ai-profile-actions">
          <button class="ai-profile-test" title="Test connection">⚡</button>
          <button class="ai-profile-dup" title="Duplicate profile">⧉</button>
          <button class="ai-profile-del" title="Delete">✕</button>
        </div>
      </div>
    `;

    // Model dropdown change handler
    const sel = div.querySelector('.vault-model-select');
    if (sel) {
      sel.addEventListener('click', (e) => e.stopPropagation()); // Don't trigger default-set
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const newModel = sel.value;
        try {
          await window.electronAPI.vaultUpdateLlmProfile(p.id, { model: newModel });
          p.model = newModel; // Update local cache
          showVaultLlmStatus(`✓ Model → ${newModel}`);
        } catch (err) {
          console.error('[Vault] Failed to update model:', err);
          showVaultLlmStatus('⚠ Failed to update model', '#f87171');
        }
      });
    }

    div.addEventListener('click', async (e) => {
      if (e.target.classList.contains('ai-profile-test')) {
        const btn = e.target;

        // If already testing → user wants to cancel
        if (btn.dataset.testing === '1') {
          btn.dataset.aborted = '1';
          btn.dataset.testing = '0';
          btn.textContent = '⚡';
          btn.classList.remove('testing');
          div.style.boxShadow = '';
          return;
        }

        // Start test
        btn.dataset.testing = '1';
        btn.dataset.aborted = '0';
        btn.textContent = '■'; // stop icon
        btn.classList.add('testing');

        try {
          const result = await window.electronAPI.aiTestConnection(p);
          if (btn.dataset.aborted === '1') return; // user cancelled
          btn.dataset.testing = '0';
          btn.classList.remove('testing');
          const ok = result?.text && !result?.error;
          div.style.boxShadow = ok
            ? '0 0 0 2px #4ade80, 0 0 14px 2px rgba(74,222,128,0.4)'
            : '0 0 0 2px #f87171, 0 0 14px 2px rgba(248,113,113,0.4)';
          btn.textContent = ok ? '✓' : '✕';
          setTimeout(() => { if (btn.dataset.aborted !== '1') { div.style.boxShadow = ''; btn.textContent = '⚡'; } }, 4000);
        } catch (err) {
          if (btn.dataset.aborted === '1') return;
          btn.dataset.testing = '0';
          btn.classList.remove('testing');
          div.style.boxShadow = '0 0 0 2px #f87171, 0 0 14px 2px rgba(248,113,113,0.4)';
          btn.textContent = '✕';
          setTimeout(() => { if (btn.dataset.aborted !== '1') { div.style.boxShadow = ''; btn.textContent = '⚡'; } }, 4000);
        }
      } else if (e.target.classList.contains('ai-profile-del')) {
        await window.electronAPI.vaultRemoveLlmProfile(p.id);
        _vaultLlmProfiles = _vaultLlmProfiles.filter(x => x.id !== p.id);
        _vaultDefaults = await window.electronAPI.vaultGetDefaults();
        renderVaultLlmProfiles();
        showVaultLlmStatus('✓ Profile deleted');
      } else if (e.target.classList.contains('ai-profile-dup')) {
        // Show rename modal pre-filled with "Name (Copy)"
        openDupRenameModal(p);
      } else {
        // Set as default for the general AI dictation feature only.
        // Translator and whisper-polish manage their own independent defaults.
        await window.electronAPI.vaultSetDefault('ai-dictation', p.id);
        _vaultDefaults = await window.electronAPI.vaultGetDefaults();
        renderVaultLlmProfiles();
        showVaultLlmStatus('✓ Default: ' + p.name);
      }
    });
    container.appendChild(div);
  });
}

// ── Duplicate Profile Rename Modal ────────────────────────────────
let _dupRenameSourceProfile = null;

function openDupRenameModal(sourceProfile) {
  _dupRenameSourceProfile = sourceProfile;
  const input = document.getElementById('dup-rename-input');
  input.value = sourceProfile.name + ' (Copy)';
  document.getElementById('dup-rename-modal').classList.add('open');
  // Select all text so user can immediately type a new name
  setTimeout(() => { input.focus(); input.select(); }, 60);
}

window.closeDupRenameModal = function() {
  document.getElementById('dup-rename-modal').classList.remove('open');
  _dupRenameSourceProfile = null;
};

window.confirmDupRename = async function() {
  const input = document.getElementById('dup-rename-input');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }

  const p = _dupRenameSourceProfile;
  if (!p) { closeDupRenameModal(); return; }

  const clone = {
    id: Date.now().toString(),
    name,
    provider: p.provider,
    model: p.model,
    apiKey: p.apiKey || '',
    baseUrl: p.baseUrl || '',
  };

  closeDupRenameModal();

  try {
    const saved = await window.electronAPI.vaultAddLlmProfile(clone);
    _vaultLlmProfiles.push(saved?.profile || saved);
    renderVaultLlmProfiles();
    showVaultLlmStatus('✓ Duplicated: ' + clone.name);
  } catch (err) {
    console.error('[Vault] Failed to duplicate profile:', err);
    showVaultLlmStatus('⚠ Failed to duplicate', '#f87171');
  }
};

// Close modal on backdrop click
document.getElementById('dup-rename-modal')?.addEventListener('click', function(e) {
  if (e.target === this) closeDupRenameModal();
});


// ── LLM Provider Change ───────────────────────────────────────────
window.onVaultLlmProviderChange = function() {
  const prov = document.getElementById('vault-llm-provider')?.value || 'openai';
  const isCustom = prov === 'custom';

  // Show/hide custom-specific fields
  const baseUrlRow = document.getElementById('row-vault-llm-baseurl');
  const customModelRow = document.getElementById('row-vault-llm-custom-model');
  const ollamaBtn = document.getElementById('btn-vault-ollama-refresh');
  const ollamaStatus = document.getElementById('vault-ollama-status-row');
  const apiKeyRow = document.getElementById('row-vault-llm-apikey');

  if (baseUrlRow) baseUrlRow.style.display = isCustom ? 'flex' : 'none';
  if (customModelRow) customModelRow.style.display = isCustom ? 'flex' : 'none';
  if (ollamaBtn) ollamaBtn.style.display = isCustom ? 'inline-block' : 'none';
  if (apiKeyRow) apiKeyRow.style.display = 'flex'; // Always show API key

  // Reset inline custom model input when provider changes
  const inlineCustomInput = document.getElementById('vault-llm-model-inline-custom');
  if (inlineCustomInput) { inlineCustomInput.style.display = 'none'; inlineCustomInput.value = ''; }

  if (isCustom) {
    refreshVaultOllamaModels();
  } else if (ollamaStatus) {
    ollamaStatus.style.display = 'none';
  }

  populateVaultLlmModels(prov, '');
};

function populateVaultLlmModels(provider, currentValue) {
  const sel = document.getElementById('vault-llm-model');
  if (!sel) return;
  sel.innerHTML = '';

  const models = (typeof AI_PROVIDER_MODELS !== 'undefined' ? AI_PROVIDER_MODELS[provider] : null) || [];
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  });

  // Always add a sentinel at the bottom for custom model entry
  if (provider !== 'custom') {
    const sep = document.createElement('option');
    sep.value = '__custom__';
    sep.textContent = '— Enter custom model —';
    sel.appendChild(sep);
  }

  // Bind the show/hide logic for the inline input
  sel.onchange = function() {
    const inlineInput = document.getElementById('vault-llm-model-inline-custom');
    const inlineRow   = document.getElementById('row-vault-llm-model-inline');
    if (inlineInput) {
      const isCustomSentinel = sel.value === '__custom__';
      inlineInput.style.display = isCustomSentinel ? 'block' : 'none';
      if (inlineRow) inlineRow.style.display = isCustomSentinel ? 'flex' : 'none';
      if (isCustomSentinel) { inlineInput.focus(); }
    }
  };

  if (currentValue && [...sel.options].some(o => o.value === currentValue)) {
    sel.value = currentValue;
  } else if (models.length > 0) {
    sel.value = models[0];
  }

  // Ensure inline input and row are hidden on populate
  const inlineInput = document.getElementById('vault-llm-model-inline-custom');
  const inlineRow   = document.getElementById('row-vault-llm-model-inline');
  if (inlineInput) { inlineInput.style.display = 'none'; inlineInput.value = ''; }
  if (inlineRow)   { inlineRow.style.display = 'none'; }
}

// ── Add LLM Profile ───────────────────────────────────────────────
window.vaultAddLlmProfile = async function() {
  const name = document.getElementById('vault-llm-name')?.value.trim();
  if (!name) { showVaultLlmStatus('⚠ Enter a profile name', '#fb923c'); return; }

  const provider = document.getElementById('vault-llm-provider')?.value || 'openai';
  const apiKey = document.getElementById('vault-llm-apikey')?.value.trim();
  if (!apiKey && provider !== 'custom') { showVaultLlmStatus('⚠ Enter an API key', '#fb923c'); return; }

  let model = '';
  if (provider === 'custom') {
    model = document.getElementById('vault-llm-model-custom')?.value.trim() || document.getElementById('vault-llm-model')?.value || '';
  } else {
    const selVal = document.getElementById('vault-llm-model')?.value || '';
    if (selVal === '__custom__') {
      model = document.getElementById('vault-llm-model-inline-custom')?.value.trim() || '';
      if (!model) { showVaultLlmStatus('⚠ Enter a custom model name', '#fb923c'); return; }
    } else {
      model = selVal;
    }
  }

  const baseUrl = document.getElementById('vault-llm-baseurl')?.value.trim() || '';

  const profile = { name, provider, model, apiKey: apiKey || '', baseUrl };

  try {
    const saved = await window.electronAPI.vaultAddLlmProfile(profile);
    const newProfile = saved?.profile || saved;
    _vaultLlmProfiles.push(newProfile);

    // If this is the first profile, auto-set as default for all LLM features
    if (_vaultLlmProfiles.length === 1) {
      await window.electronAPI.vaultSetDefault('ai-dictation', newProfile.id);
      await window.electronAPI.vaultSetDefault('translator', newProfile.id);
      await window.electronAPI.vaultSetDefault('whisper-polish', newProfile.id);
    }
    _vaultDefaults = await window.electronAPI.vaultGetDefaults();

    // Clear form
    document.getElementById('vault-llm-name').value = '';
    document.getElementById('vault-llm-apikey').value = '';
    if (document.getElementById('vault-llm-baseurl')) document.getElementById('vault-llm-baseurl').value = '';
    if (document.getElementById('vault-llm-model-custom')) document.getElementById('vault-llm-model-custom').value = '';

    renderVaultLlmProfiles();
    showVaultLlmStatus('✓ Profile saved!', '#4ade80');
  } catch (e) {
    showVaultLlmStatus('✕ ' + (e.message || 'Save failed'), '#f87171');
  }
};

// ── Test LLM Connection ───────────────────────────────────────────
window.vaultTestLlmConnection = async function() {
  const btn = document.getElementById('btn-vault-llm-test');
  const provider = document.getElementById('vault-llm-provider')?.value || 'openai';
  const apiKey = document.getElementById('vault-llm-apikey')?.value.trim();
  let model = '';
  if (provider === 'custom') {
    model = document.getElementById('vault-llm-model-custom')?.value.trim() || document.getElementById('vault-llm-model')?.value || '';
  } else {
    const selVal = document.getElementById('vault-llm-model')?.value || '';
    model = (selVal === '__custom__')
      ? (document.getElementById('vault-llm-model-inline-custom')?.value.trim() || '')
      : selVal;
  }
  const baseUrl = document.getElementById('vault-llm-baseurl')?.value.trim() || '';

  if (!apiKey && provider !== 'custom') {
    showVaultLlmStatus('⚠ Enter an API key first', '#fb923c');
    return;
  }

  if (btn) btn.disabled = true;
  showVaultLlmStatus('Testing connection…');

  try {
    const result = await window.electronAPI.aiTestConnection({ provider, model, modelName: model, apiKey, baseUrl });
    if (result.text) {
      showVaultLlmStatus('✓ Connected! Response: ' + result.text.substring(0, 80), '#4ade80');
    } else if (result.error) {
      showVaultLlmStatus('✕ ' + result.error, '#f87171');
    } else {
      showVaultLlmStatus('✕ No response', '#f87171');
    }
  } catch (e) {
    showVaultLlmStatus('✕ ' + (e.message || 'Test failed'), '#f87171');
  } finally {
    if (btn) btn.disabled = false;
  }
};

// ── Refresh Ollama models (vault) ─────────────────────────────────
window.refreshVaultOllamaModels = async function() {
  const statusDiv = document.getElementById('vault-ollama-status-row');
  if (!statusDiv) return;

  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<span style="color:var(--muted)">🔍 Checking Ollama...</span>';

  try {
    const result = await window.electronAPI.aiGetOllamaModels();
    if (result.running) {
      const modelList = result.models.map(m => m.name).join(', ') || 'No models installed';
      statusDiv.innerHTML = `<span style="color:#4ade80">✓ Ollama running</span> — Models: <strong>${modelList}</strong>`;

      const sel = document.getElementById('vault-llm-model');
      if (sel) {
        sel.innerHTML = '';
        result.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name;
          opt.textContent = m.name;
          sel.appendChild(opt);
        });
        if (result.models.length > 0) sel.value = result.models[0].name;
      }
    } else {
      statusDiv.innerHTML = '<span style="color:#fb923c">⚠ Ollama not running</span> — Start Ollama first, then click ↺';
    }
  } catch (e) {
    statusDiv.innerHTML = `<span style="color:#f87171">✕ Error: ${e.message}</span>`;
  }
};



// ── Status Helpers ────────────────────────────────────────────────
function showVaultLlmStatus(msg, color) {
  const s = document.getElementById('vault-llm-status');
  if (s) {
    s.textContent = msg;
    s.style.color = color || 'var(--muted)';
    if (color) setTimeout(() => { if (s) s.textContent = ''; }, 4000);
}

}

