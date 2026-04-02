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
  stats: { title: 'My Stats', desc: 'Usage statistics and time saved by voice dictation' },
  license: { title: 'License', desc: 'Manage your subscription and trial' },
  about: { title: 'About', desc: 'Juno Global Voice information' },
};

window.switchPanel = function(id, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active'); el.classList.add('active');
  document.getElementById('panel-title').textContent = PANELS[id].title;
  document.getElementById('panel-desc').textContent = PANELS[id].desc;
  if (id === 'stats') loadStats();
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
    obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
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
  if (['Alt','Shift','Control'].includes(e.key)) return e.key;
  let rawKey = null; if (e.code && e.code.startsWith('Key')) rawKey = e.code.substring(3); else if (e.code && e.code.startsWith('Digit')) rawKey = e.code.substring(5); else if (/^F([1-9]|1[0-2])$/.test(e.code)) rawKey = e.code; else if (e.code === 'Space' || e.key === ' ') rawKey = 'Space'; else rawKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return rawKey;
}

let pendingHotkey = DEFAULT_HOTKEY, pendingHoldKey = '', recordingMode = null, activeBadgeNode = null;
const hotkeyBadge = document.getElementById('hotkey-display'), holdkeyBadge = document.getElementById('holdkey-display');

hotkeyBadge.addEventListener('click', () => !recordingMode && startRecording('combo'));
holdkeyBadge.addEventListener('click', () => !recordingMode && startRecording('hold'));

function startRecording(mode, badgeNode = null) {
  recordingMode = mode; activeBadgeNode = badgeNode || (mode === 'combo' ? hotkeyBadge : holdkeyBadge);
  activeBadgeNode.classList.add('recording'); activeBadgeNode.textContent = (mode === 'combo' || mode === 'lang-combo') ? 'Press shortcut…' : 'Press any key…';
  window.electronAPI.suspendHotkeys();
}

document.addEventListener('keydown', (e) => {
  if (!recordingMode) return; e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { stopRecording(true); return; }
  if (recordingMode === 'combo' || recordingMode === 'lang-combo') {
    const isF = /^F([1-9]|1[0-2])$/.test(e.code || e.key), preview = [];
    if (e.metaKey || e.ctrlKey) preview.push(IS_MAC ? '⌘' : 'Ctrl'); if (e.shiftKey) preview.push('⇧'); if (e.altKey) preview.push(IS_MAC ? '⌥' : 'Alt');
    if (preview.length && !isF) activeBadgeNode.textContent = preview.join(' + ') + ' + …';
    const combo = comboFromEvent(e); if (combo) { if (recordingMode === 'combo') pendingHotkey = combo; else activeBadgeNode.dataset.rawCombo = combo; activeBadgeNode.textContent = formatCombo(combo); stopRecording(false); }
  } else {
    const key = singleKeyFromEvent(e); if (key) { pendingHoldKey = key; activeBadgeNode.textContent = key; stopRecording(false); }
  }
});

function stopRecording(cancelled) {
  const mode = recordingMode, badge = activeBadgeNode; recordingMode = activeBadgeNode = null; badge.classList.remove('recording');
  if (cancelled) {
    if (mode === 'combo') badge.textContent = formatCombo(pendingHotkey);
    else if (mode === 'lang-combo') badge.textContent = badge.dataset.rawCombo ? formatCombo(badge.dataset.rawCombo) : 'Not set';
    else badge.textContent = pendingHoldKey || 'Not set';
  }
  window.electronAPI.resumeHotkeys(); if (!cancelled) markDirty();
}

window.resetHotkey = function() { if (recordingMode === 'combo') stopRecording(true); pendingHotkey = DEFAULT_HOTKEY; hotkeyBadge.textContent = formatCombo(DEFAULT_HOTKEY); markDirty(); };
window.clearHoldKey = function() { if (recordingMode === 'hold') stopRecording(true); pendingHoldKey = ''; holdkeyBadge.textContent = 'Not set'; markDirty(); };

window.syncHotkeyEnable = function() { document.getElementById('row-hotkey-combo').classList.toggle('disabled-row', !document.getElementById('toggle-hotkey').checked); };
window.syncHoldEnable = function() { const on = document.getElementById('toggle-holdkey').checked; document.getElementById('row-hold-key').classList.toggle('disabled-row', !on); document.getElementById('row-hold-dur').classList.toggle('disabled-row', !on); };
window.syncSilenceEnable = function() { document.getElementById('row-silence-timeout').classList.toggle('disabled-row', !document.getElementById('toggle-silence').checked); };
window.syncReplaceEnable = function() { document.getElementById('row-replacements').classList.toggle('disabled-row', !document.getElementById('toggle-replace').checked); };

function applyTheme(t) { if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', t); }
window.previewTheme = function() { applyTheme(document.getElementById('theme-select').value); };
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { const s = document.getElementById('theme-select'); if (s && s.value === 'system') applyTheme('system'); });

async function loadConfig() {
  const cfg = await window.electronAPI.getConfig(), v = await window.electronAPI.getVersion(); document.getElementById('about-version').textContent = v;
  pendingHotkey = cfg.hotkey || DEFAULT_HOTKEY; hotkeyBadge.textContent = formatCombo(pendingHotkey);
  document.getElementById('toggle-hotkey').checked = cfg.hotkeyEnabled !== false; syncHotkeyEnable();
  pendingHoldKey = cfg.holdKey || 'Alt'; holdkeyBadge.textContent = pendingHoldKey || 'Not set';
  document.getElementById('toggle-holdkey').checked = cfg.holdKeyEnabled === true; syncHoldEnable();
  const dS = document.getElementById('hold-duration'); if ([...dS.options].some(o => o.value === String(cfg.holdDuration || '2'))) dS.value = String(cfg.holdDuration || '2');
  const mB = document.getElementById('mouse-button'); if (mB) mB.value = String(cfg.mouseButton || '3');
  const mA = document.getElementById('mouse-action'); if (mA) mA.value = cfg.mouseAction || 'none';
  document.getElementById('toggle-autolunch').checked = cfg.autoLaunch !== false; ensureCfdBuilt(); setCfdValue(cfg.language || 'en-US');
  document.getElementById('toggle-silence').checked = cfg.silenceTimeoutEnabled !== false; syncSilenceEnable(); document.getElementById('silence-timeout-val').value = String(cfg.silenceTimeoutVal ?? '1'); const tU = document.getElementById('silence-timeout-unit'); if ([...tU.options].some(o => o.value === String(cfg.silenceTimeoutUnit || 'sec'))) tU.value = String(cfg.silenceTimeoutUnit || 'sec');
  document.getElementById('toggle-sim-typing').checked = cfg.simulateTyping === true; loadMicList(false, cfg.selectedMicId || '');
  document.getElementById('toggle-replace').checked = cfg.textReplaceEnabled === true; syncReplaceEnable();
  const rL = document.getElementById('replacement-list'); rL.innerHTML = ''; if (!(cfg.textReplacements || []).length) addReplacementRow('', ''); else cfg.textReplacements.forEach(r => addReplacementRow(r.say || '', r.replace || ''));
  const lHL = document.getElementById('lang-hotkeys-list'); lHL.innerHTML = ''; (cfg.langHotkeys || []).forEach(lh => addLangHotkeyRow(lh.combo || '', lh.lang || 'bn-BD'));
  const lI = document.getElementById('input-license'); lI.value = cfg.licenseKey || ''; lI.type = cfg.licenseKey ? 'password' : 'text';
  updateLicenseUI(cfg.licenseStatus || 'trial', cfg.firstLaunchDate || Date.now(), cfg.licensePurchase);
  const thS = document.getElementById('theme-select'); if (thS) thS.value = cfg.theme || 'system'; previewTheme();
  const vS = document.getElementById('visualizer-style'); if (vS) vS.value = cfg.visualizerType || 'wave';
  const mS = document.getElementById('mic-sensitivity'), sL = document.getElementById('label-sensitivity'); if (mS) { mS.value = cfg.micSensitivity || 1.0; if (sL) sL.textContent = parseFloat(mS.value).toFixed(1); }
}

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
function updateLicenseUI(status, firstLaunch, purchase) {
  if (licenseTimer) clearInterval(licenseTimer); const h = document.getElementById('license-headline'), s = document.getElementById('license-subtext'), c = document.getElementById('license-status-card'), b = document.getElementById('btn-verify-license');
  if (status === 'active') { h.textContent = 'Pro Version Unlocked'; c.style.background = 'rgba(72, 199, 116, 0.15)'; c.style.borderColor = '#48c774'; h.style.color = '#48c774'; b.textContent = 'Verified'; b.disabled = true; s.textContent = (purchase?.subscription_id && !purchase?.subscription_ended_at) ? 'Your license is verified and active (Subscription). Thank you! ⭐' : 'Lifetime License — Valid Forever. Thank you! ⭐'; }
  else if (status === 'expired') { h.textContent = 'Trial or License Expired'; s.textContent = 'To continue using Juno Voice, please enter a valid license key below.'; c.style.background = 'rgba(248, 113, 113, 0.15)'; c.style.borderColor = '#f87171'; h.style.color = '#f87171'; b.disabled = false; b.textContent = 'Activate'; }
  else {
    c.style.background = 'rgba(124,111,255,0.1)'; c.style.borderColor = 'var(--accent)'; h.style.color = 'var(--text)'; b.disabled = false; b.textContent = 'Activate Pro'; s.textContent = 'You are currently enjoying the fully-featured 7-day free trial.';
    const update = () => { const left = Math.max(0, firstLaunch + (7*24*60*60*1000) - Date.now()); if (!left) { h.textContent = 'Free Trial: Expired'; clearInterval(licenseTimer); return; } const d = Math.floor(left/86400000), hr = Math.floor((left%86400000)/3600000), min = Math.floor((left%3600000)/60000), sec = Math.floor((left%60000)/1000); h.textContent = `Free Trial: ${d}d ${hr}h ${min}m ${sec}s left`; };
    update(); licenseTimer = setInterval(update, 1000);
  }
}

window.activateLicense = async function() {
  const k = document.getElementById('input-license').value.trim(); if (!k) return; const b = document.getElementById('btn-verify-license'); b.textContent = 'Verifying...'; b.disabled = true;
  const res = await window.electronAPI.verifyLicense(k); res.success ? loadConfig() : (alert(res.message), b.textContent = 'Activate', b.disabled = false);
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
  window.electronAPI.saveConfig({ hotkey: pendingHotkey || DEFAULT_HOTKEY, hotkeyEnabled: document.getElementById('toggle-hotkey').checked, holdKey: pendingHoldKey || 'Alt', holdKeyEnabled: document.getElementById('toggle-holdkey').checked, holdDuration: parseFloat(document.getElementById('hold-duration').value), mouseButton: document.getElementById('mouse-button')?.value || '3', mouseAction: document.getElementById('mouse-action')?.value || 'none', autoLaunch: document.getElementById('toggle-autolunch').checked, language: document.getElementById('lang-select').value, silenceTimeoutEnabled: silenceEnabled, silenceTimeoutVal: silenceVal, silenceTimeoutUnit: silenceUnit, silenceTimeout: silenceSecs, simulateTyping: document.getElementById('toggle-sim-typing').checked, theme: document.getElementById('theme-select').value, visualizerType: document.getElementById('visualizer-style')?.value || 'wave', micSensitivity: parseFloat(document.getElementById('mic-sensitivity')?.value || 1.0), textReplaceEnabled: document.getElementById('toggle-replace').checked, textReplacements: reps, langHotkeys: lH });
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
window.closeImportModal = function() { document.getElementById('import-modal').classList.remove('open'); pendingImport = null; };
window.confirmImport = async function(mode) {
  if (!pendingImport) return; const items = pendingImport; closeImportModal();
  const res = await window.electronAPI.importReplacementsCommit({ items, mode });
  if (res.ok) { const cfg = await window.electronAPI.getConfig(), l = document.getElementById('replacement-list'); l.innerHTML = ''; if (!(cfg.textReplacements || []).length) addReplacementRow('', ''); else cfg.textReplacements.forEach(r => addReplacementRow(r.say || '', r.replace || '')); showIEMsg(`✓ ${mode === 'replace' ? 'Replaced all' : 'Merged'} successfully`, false); markDirty(); } else showIEMsg('Import commit failed', true);
};

document.getElementById('import-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeImportModal(); });
window.electronAPI.onLicenseExpired?.(() => document.querySelector('.nav-item[data-panel="license"]')?.click());
loadConfig();
