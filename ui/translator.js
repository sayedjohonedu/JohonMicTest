'use strict';
/* ─── Juno Translator — renderer logic ─────────────────────── */

const API = window.translatorAPI;

/* ─── State ─────────────────────────────────────────────────── */
let cfg              = {};
let isAiMode         = false;
let playgroundOpen   = false;
let settingsOpen     = false;
let historyEntries   = [];
let pgSlots          = [];             // [{ id, langEl, outputEl }]
let preHumanizedText = null;           // for Revert
let silenceSeconds   = 0;
let silenceTimer     = null;
let pgSlotCounter    = 0;

// Audio viz
let audioCtx, analyser, audioSource;
const miniCanvas  = document.getElementById('mini-canvas');
const miniCtx2d   = miniCanvas.getContext('2d');
let animFrame;

/* ─── DOM refs ──────────────────────────────────────────────── */
const dotClose          = document.getElementById('dot-close');
const modeToggle        = document.getElementById('mode-toggle');
const modeLabel         = document.getElementById('mode-label');
const aiBadge           = document.getElementById('ai-badge');
const noApiWarning      = document.getElementById('no-api-warning');
const statusIcon        = document.getElementById('status-icon');
const statusText        = document.getElementById('status-text');
const draftArea         = document.getElementById('draft-area');
const draftIndicator    = document.getElementById('draft-stt-indicator');
const silenceTimerEl    = document.getElementById('silence-timer');
const btnTranslate      = document.getElementById('btn-translate');
const translateSpinner  = document.getElementById('translate-spinner');
const btnClearDraft     = document.getElementById('btn-clear-draft');
const outputArea        = document.getElementById('output-area');
const btnCopyOutput     = document.getElementById('btn-copy-output');
const btnPaste          = document.getElementById('btn-paste-output');
const btnHumanize       = document.getElementById('btn-humanize');
const humanizeSpinner   = document.getElementById('humanize-spinner');
const btnRevert         = document.getElementById('btn-revert');
const btnExpandPG       = document.getElementById('btn-expand-playground');
const playground        = document.getElementById('playground');
const pgSlotsEl         = document.getElementById('pg-slots');
const btnAddLang        = document.getElementById('btn-add-lang');
const btnTranslateAll   = document.getElementById('btn-translate-all');
const btnCopyAll        = document.getElementById('btn-copy-all');
const historyList       = document.getElementById('history-list');
const histEmpty         = document.getElementById('hist-empty');
const btnClearHistory   = document.getElementById('btn-clear-history');
const btnSettings       = document.getElementById('btn-settings');
const settingsPane      = document.getElementById('settings-pane');
const btnSpBack         = document.getElementById('btn-sp-back');
const btnSpSave         = document.getElementById('btn-sp-save');
const swapBtn           = document.getElementById('swap-btn');
const srcLang           = document.getElementById('src-lang');
const tgtLang           = document.getElementById('tgt-lang');
const toast             = document.getElementById('toast');
const settingsLink      = document.getElementById('warning-settings-link');
const btnMic            = document.getElementById('btn-mic');
const micIconOn         = document.getElementById('mic-icon-on');
const micIconOff        = document.getElementById('mic-icon-off');

const btnToggleHistory  = document.getElementById('btn-toggle-history');
const historyChevron    = document.getElementById('history-chevron');

/* Settings pane fields */
const spProvider            = document.getElementById('sp-provider');
const spModel               = document.getElementById('sp-model');
const spModelField          = document.getElementById('sp-model-field');
const spCustomUrlField      = document.getElementById('sp-custom-url-field');
const spCustomModelField    = document.getElementById('sp-custom-model-field');
const spCustomUrl           = document.getElementById('sp-custom-url');
const spCustomModel         = document.getElementById('sp-custom-model');
const spApiKey              = document.getElementById('sp-api-key');
const spProfileName         = document.getElementById('sp-profile-name');
const profileList           = document.getElementById('profile-list');
const btnAddProfile         = document.getElementById('btn-add-profile');
const spSystemPrompt        = document.getElementById('sp-system-prompt');
const spSystemInstructions  = document.getElementById('sp-system-instructions');
const spOpenShortcut        = document.getElementById('sp-open-shortcut');
const spPasteShortcut       = document.getElementById('sp-paste-shortcut');
const presetsList           = document.getElementById('presets-list');
const psSrc                 = document.getElementById('ps-src');
const psTgt                 = document.getElementById('ps-tgt');
const psShortcut            = document.getElementById('ps-shortcut');
const btnAddPreset          = document.getElementById('btn-add-preset');
const spSilenceEnabled      = document.getElementById('sp-silence-enabled');
const spSilenceVal          = document.getElementById('sp-silence-val');
const spSilenceUnit         = document.getElementById('sp-silence-unit');
const spSilenceDurationRow  = document.getElementById('sp-silence-duration-row');

/* ─── Provider models map ───────────────────────────────────── */
const PROVIDER_MODELS = {
  openai:    ['gpt-4o','gpt-4-turbo','gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022','claude-3-opus-20240229','claude-3-haiku-20240307'],
  gemini:    ['gemini-1.5-pro','gemini-1.5-flash','gemini-1.0-pro'],
  mistral:   ['mistral-large-latest','mistral-medium-latest','mistral-small-latest'],
  groq:      ['llama-3.3-70b-versatile','mixtral-8x7b-32768','gemma2-9b-it'],
  custom:    [],
};

/* ─── Init ──────────────────────────────────────────────────── */
async function init() {
  cfg = await API.getConfig();
  isAiMode = cfg.translatorMode === 'ai';
  historyEntries = cfg.translatorHistory || [];

  // ── Restore persisted language combination (default: en → bn on first launch)
  const savedSrc = cfg.translatorSrcLang;
  const savedTgt = cfg.translatorTgtLang;
  srcLang.value = savedSrc || 'en';   // default to English, NOT auto-detect
  tgtLang.value = savedTgt || 'bn';   // default target

  modeToggle.checked = isAiMode;
  updateModeUI();
  renderHistory();
  loadSettingsForm();
  setupMiniWave();

  // Listeners from main process
  API.onTranscript((text) => appendDraft(text));
  API.onInterim((text)    => showInterim(text));
  API.onAutoAction(()     => handleAutoAction());
  API.onAudioData((data)  => drawMiniWave(data));
  API.onPaste(()          => doPaste());
  API.onSttState((active) => setSttState(active));
  API.onAutoStart(() => {
    // Auto-start listening if not already listening
    if (!btnMic.classList.contains('listening')) {
      API.toggleListening({ lang: srcLang.value, forceStart: true });
    }
  });
}

/* ─── Mic button ─────────────────────────────────────────────*/
btnMic.addEventListener('click', () => {
  // Blur the button immediately so focus returns to the translator window body,
  // NOT to any external app — this prevents the global inject-text from firing
  btnMic.blur();
  API.toggleListening({ lang: srcLang.value, forceStart: false });
});

/* Save language combo whenever src changes, then restart STT if needed */
srcLang.addEventListener('change', () => {
  API.saveSettings({ translatorSrcLang: srcLang.value });
  if (btnMic.classList.contains('listening')) {
    // Stop then restart with the new source language
    API.toggleListening({ lang: srcLang.value, forceStart: true });
  }
});

/* Save language combo whenever tgt changes */
tgtLang.addEventListener('change', () => {
  API.saveSettings({ translatorTgtLang: tgtLang.value });
  // No need to restart STT — target language only affects translation, not STT
});

function setSttState(active) {
  if (active) {
    btnMic.classList.add('listening');
    micIconOn.style.display  = '';
    micIconOff.style.display = 'none';
    setStatus('listening');
    // Ensure focus stays on the draft area so transcripts are visible
    // and the window stays in translator context (not bleeding into global inject)
    draftArea.focus();
  } else {
    btnMic.classList.remove('listening');
    micIconOn.style.display  = 'none';
    micIconOff.style.display = '';
    setStatus('idle');
  }
}

/* ─── Mode toggle ─────────────────────────────────────────────*/
modeToggle.addEventListener('change', async () => {
  isAiMode = modeToggle.checked;
  const hasProfile = hasActiveProfile();
  if (isAiMode && !hasProfile) {
    showToast('⚠ Set an API profile in Settings first');
    modeToggle.checked = false;
    isAiMode = false;
    return;
  }
  updateModeUI();
  await API.saveSettings({ translatorMode: isAiMode ? 'ai' : 'regular' });
});

function updateModeUI() {
  modeLabel.textContent = isAiMode ? 'AI' : 'Regular';
  aiBadge.classList.toggle('visible', isAiMode);
  btnHumanize.classList.toggle('disabled', !isAiMode);
  noApiWarning.classList.toggle('visible', isAiMode && !hasActiveProfile());
}

function hasActiveProfile() {
  const profiles = cfg.translatorApiProfiles || [];
  const activeId = cfg.translatorActiveProfileId;
  return profiles.length > 0 && (activeId ? profiles.find(p => p.id === activeId) : true);
}

/* ─── Draft ───────────────────────────────────────────────────*/
function appendDraft(text) {
  const prev = draftArea.value.trim();
  draftArea.value = prev ? prev + ' ' + text : text;
  draftArea.scrollTop = draftArea.scrollHeight;
  draftIndicator.classList.add('visible');
  resetSilenceTimer();
  setStatus('listening');
}

function showInterim(text) {
  // show lightly faded interim text — use placeholder for now
  if (text) draftArea.setAttribute('placeholder', text + '…');
  else draftArea.setAttribute('placeholder', 'Speak or type here…');
}

btnClearDraft.addEventListener('click', () => {
  draftArea.value = '';
  draftArea.setAttribute('placeholder', 'Speak or type here…');
});

draftArea.addEventListener('input', () => resetSilenceTimer());

/* ─── Translate ───────────────────────────────────────────────*/
btnTranslate.addEventListener('click', () => doTranslate());

async function doTranslate() {
  const text = draftArea.value.trim();
  if (!text) { showToast('Nothing to translate'); return; }

  setTranslating(true);
  try {
    const result = await API.translate({
      text,
      src: srcLang.value,
      tgt: tgtLang.value,
      mode: isAiMode ? 'ai' : 'regular',
      profile: getActiveProfile(),
      systemPrompt: cfg.translatorSystemPrompt || '',
      systemInstructions: cfg.translatorSystemInstructions || '',
    });

    if (result.error) {
      showToast('⚠ ' + result.error);
    } else {
      outputArea.value = result.text;
      outputArea.classList.add('has-content');
      preHumanizedText = null;
      btnRevert.classList.remove('visible');
    }
  } catch (e) {
    showToast('Translation failed — please retry');
    console.error(e);
  }
  setTranslating(false);
  resetSilenceTimer();
}

function setTranslating(on) {
  btnTranslate.classList.toggle('loading', on);
  translateSpinner.classList.toggle('visible', on);
  btnTranslate.querySelector('svg').style.display = on ? 'none' : '';
}

/* ─── Humanize ────────────────────────────────────────────────*/
btnHumanize.addEventListener('click', async () => {
  if (btnHumanize.classList.contains('disabled')) return;
  const text = outputArea.value.trim();
  if (!text) { showToast('Translate something first'); return; }

  const profile = getActiveProfile();
  if (!profile) { showToast('No API profile — configure in Settings'); return; }

  preHumanizedText = text;
  humanizeSpinner.classList.add('visible');
  btnHumanize.style.pointerEvents = 'none';

  try {
    const result = await API.humanize({
      text,
      profile,
      systemInstructions: cfg.translatorSystemInstructions || '',
    });
    if (result.error) {
      showToast('⚠ ' + result.error);
      preHumanizedText = null;
    } else {
      outputArea.value = result.text;
      btnRevert.classList.add('visible');
    }
  } catch (e) {
    showToast('Humanize failed');
    preHumanizedText = null;
    console.error(e);
  }

  humanizeSpinner.classList.remove('visible');
  btnHumanize.style.pointerEvents = '';
});

btnRevert.addEventListener('click', () => {
  if (preHumanizedText) {
    outputArea.value = preHumanizedText;
    preHumanizedText = null;
    btnRevert.classList.remove('visible');
    showToast('Reverted');
  }
});

/* ─── Copy output ─────────────────────────────────────────────*/
btnCopyOutput.addEventListener('click', () => {
  const text = outputArea.value.trim();
  if (!text) { showToast('Nothing to copy'); return; }
  navigator.clipboard.writeText(text);
  showToast('✓ Copied!');
  outputArea.classList.add('copy-flash');
  setTimeout(() => outputArea.classList.remove('copy-flash'), 400);
});

/* ─── Paste ───────────────────────────────────────────────────*/
btnPaste.addEventListener('click', () => doPaste());

async function doPaste() {
  const text = outputArea.value.trim();
  if (!text) { showToast('Nothing to paste'); return; }
  saveToHistory(text);
  API.pasteOutput(text);
  showToast('⌨ Pasted!');
  draftArea.value = '';
  outputArea.value = '';
  outputArea.classList.remove('has-content');
  preHumanizedText = null;
  btnRevert.classList.remove('visible');
  resetSilenceTimer();
}

/* ─── Auto-action (30s silence) ──────────────────────────────*/
async function handleAutoAction() {
  if (draftArea.value.trim()) {
    await doTranslate();
    await new Promise(r => setTimeout(r, 400));
    if (outputArea.value.trim()) await doPaste();
  }
  API.close();
}

/* ─── Silence timer (disabled — user closes manually) ─────────*/
function resetSilenceTimer() {
  // No-op: auto-close is disabled for translator. Clear any stale interval.
  clearInterval(silenceTimer);
  silenceTimer = null;
  silenceTimerEl.style.display = 'none';
}

/* ─── Swap languages ─────────────────────────────────────────*/
swapBtn.addEventListener('click', () => {
  const s = srcLang.value;
  const t = tgtLang.value;
  // src can't be 'auto' after swap
  if (t !== 'auto') {
    srcLang.value = t;
    tgtLang.value = s !== 'auto' ? s : 'en';
    // Persist the new combo immediately
    API.saveSettings({ translatorSrcLang: srcLang.value, translatorTgtLang: tgtLang.value });
    // Restart STT with new source language if mic is active
    if (btnMic.classList.contains('listening')) {
      API.toggleListening({ lang: srcLang.value, forceStart: true });
    }
  }
});

/* ─── Status ──────────────────────────────────────────────*/
function setStatus(state) {
  if (state === 'listening') {
    draftArea.focus();
    statusText.textContent = 'Listening — speak now';
    draftIndicator.classList.add('visible');
  } else {
    statusText.textContent = 'Click to start listening';
    draftIndicator.classList.remove('visible');
  }
}

/* ─── Mini waveform ───────────────────────────────────────────*/
function setupMiniWave() {
  miniCanvas.width  = 60;
  miniCanvas.height = 18;
}

function drawMiniWave(data) {
  miniCtx2d.clearRect(0, 0, 60, 18);
  if (!data || !data.length) return;
  const barW = 3, gap = 1, bars = Math.floor(60 / (barW + gap));
  const step = Math.floor(data.length / bars);
  for (let i = 0; i < bars; i++) {
    const v = data[i * step] / 255;
    const h = Math.max(2, v * 18);
    const y = (18 - h) / 2;
    miniCtx2d.fillStyle = `rgba(124,111,255,${0.4 + v * 0.5})`;
    miniCtx2d.beginPath();
    miniCtx2d.roundRect(i * (barW + gap), y, barW, h, 1);
    miniCtx2d.fill();
  }
}

/* ─────────────────────────────────────────────────────────────
   PLAYGROUND
───────────────────────────────────────────────────────────────*/
btnExpandPG.addEventListener('click', () => {
  playgroundOpen = !playgroundOpen;
  playground.classList.toggle('open', playgroundOpen);
  btnExpandPG.classList.toggle('active', playgroundOpen);
  if (playgroundOpen && pgSlots.length === 0) addPgSlot();
});

btnAddLang.addEventListener('click', () => {
  if (pgSlots.length >= 6) { showToast('Maximum 6 language slots'); return; }
  addPgSlot();
});

function addPgSlot() {
  const id = ++pgSlotCounter;
  const div = document.createElement('div');
  div.className = 'pg-slot';
  div.dataset.id = id;

  div.innerHTML = `
    <div class="pg-slot-header">
      <select class="pg-slot-lang" title="Target language">
        ${tgtLang.innerHTML}
      </select>
      <button class="pg-slot-del" title="Remove">✕</button>
    </div>
    <textarea class="pg-slot-output" placeholder="Translation will appear here…" spellcheck="false"></textarea>
    <div class="pg-slot-actions">
      <button class="btn-sm pg-copy" style="flex:1;" title="Copy this translation">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11">
          <rect x="5" y="5" width="8" height="9" rx="1.5"/>
          <path d="M11 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h1"/>
        </svg>
        Copy
      </button>
      <button class="btn-sm pg-paste" style="flex:1;" title="Paste this translation">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11">
          <path d="M4 6h8M4 10h5M10 13l3-3-3-3"/>
        </svg>
        Paste
      </button>
    </div>
  `;

  const langEl   = div.querySelector('.pg-slot-lang');
  const outEl    = div.querySelector('.pg-slot-output');
  const delBtn   = div.querySelector('.pg-slot-del');
  const copyBtn  = div.querySelector('.pg-copy');
  const pasteBtn = div.querySelector('.pg-paste');

  delBtn.addEventListener('click', () => {
    pgSlots = pgSlots.filter(s => s.id !== id);
    div.remove();
  });
  copyBtn.addEventListener('click', () => {
    const t = outEl.value.trim();
    if (t) { navigator.clipboard.writeText(t); showToast('✓ Copied!'); }
  });
  pasteBtn.addEventListener('click', () => {
    const t = outEl.value.trim();
    if (t) { API.pasteOutput(t); showToast('⌨ Pasted!'); }
  });

  pgSlotsEl.appendChild(div);
  pgSlots.push({ id, langEl, outputEl: outEl });
}

btnTranslateAll.addEventListener('click', async () => {
  const text = draftArea.value.trim();
  if (!text) { showToast('Add some text to the draft first'); return; }

  for (const slot of pgSlots) {
    slot.outputEl.value = 'Translating…';
    try {
      const r = await API.translate({
        text, src: srcLang.value,
        tgt: slot.langEl.value,
        mode: isAiMode ? 'ai' : 'regular',
        profile: getActiveProfile(),
        systemPrompt: cfg.translatorSystemPrompt || '',
        systemInstructions: cfg.translatorSystemInstructions || '',
      });
      slot.outputEl.value = r.error ? ('⚠ ' + r.error) : r.text;
    } catch (e) {
      slot.outputEl.value = '⚠ Failed';
    }
  }
});

btnCopyAll.addEventListener('click', () => {
  const parts = pgSlots.map(s => {
    const targetName = s.langEl.options[s.langEl.selectedIndex].text;
    return `[${targetName}]\n${s.outputEl.value.trim()}`;
  }).filter(Boolean);
  if (!parts.length) { showToast('No translations yet'); return; }
  navigator.clipboard.writeText(parts.join('\n\n'));
  showToast('✓ All copied!');
});

/* ─────────────────────────────────────────────────────────────
   HISTORY
───────────────────────────────────────────────────────────────*/

let historyOpen = false;

if (btnToggleHistory) {
  btnToggleHistory.addEventListener('click', () => {
    historyOpen = !historyOpen;
    document.getElementById('history-section').style.display = historyOpen ? 'block' : 'none';
    if (historyChevron) {
      historyChevron.style.transition = 'transform 0.2s ease';
      historyChevron.style.transform = historyOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  });
}

function saveToHistory(translated) {
  const entry = {
    ts: Date.now(),
    src: srcLang.options[srcLang.selectedIndex].text,
    target: tgtLang.options[tgtLang.selectedIndex].text,
    original: draftArea.value.trim(),
    translated,
    humanized: !!preHumanizedText,
    mode: isAiMode ? 'ai' : 'regular',
  };
  historyEntries.unshift(entry);
  if (historyEntries.length > 200) historyEntries.pop();
  API.saveHistory(entry);
  renderHistory();
}

function renderHistory() {
  historyList.querySelectorAll('.hist-item').forEach(el => el.remove());

  if (!historyEntries.length) {
    histEmpty.style.display = 'block';
    return;
  }
  histEmpty.style.display = 'none';

  historyEntries.slice(0, 50).forEach(entry => {
    const ago = timeAgo(entry.ts);
    const div = document.createElement('div');
    div.className = 'hist-item';
    div.innerHTML = `
      <div class="hist-meta">
        <span>${ago}</span>
        <span style="color:var(--muted);">${entry.src} → ${entry.target}</span>
        ${entry.mode === 'ai' ? '<span class="hist-tag ai">AI</span>' : ''}
        ${entry.humanized ? '<span class="hist-tag humanized">Humanized</span>' : ''}
      </div>
      <div class="hist-blocks">
        <!-- Original Block -->
        <div class="hist-block">
          <div class="hist-block-label">Original</div>
          <div class="hist-block-text">${escapeHtml(entry.original)}</div>
          <div class="hist-block-actions">
            <button class="icon-btn" data-copy="original" title="Copy Original">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="5" width="8" height="9" rx="1.5"/><path d="M11 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h1"/></svg>
            </button>
            <button class="icon-btn" data-use="original" title="Input to Draft Area">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 12V4M5 7l3-3 3 3"/></svg>
            </button>
          </div>
        </div>
        
        <!-- Translated Block -->
        <div class="hist-block">
          <div class="hist-block-label">Translated</div>
          <div class="hist-block-text translated">${escapeHtml(entry.translated)}</div>
          <div class="hist-block-actions">
            <button class="icon-btn" data-copy="translated" title="Copy Translation">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="5" width="8" height="9" rx="1.5"/><path d="M11 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h1"/></svg>
            </button>
            <button class="icon-btn" data-use="translated" title="Input to Output Area">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 12V4M5 7l3-3 3 3"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    div.querySelector('[data-copy="original"]').addEventListener('click', () => {
      navigator.clipboard.writeText(entry.original);
      showToast('✓ Original copied!');
    });
    div.querySelector('[data-use="original"]').addEventListener('click', () => {
      draftArea.value = entry.original;
      draftArea.focus();
      showToast('Imported to draft');
    });

    div.querySelector('[data-copy="translated"]').addEventListener('click', () => {
      navigator.clipboard.writeText(entry.translated);
      showToast('✓ Translation copied!');
    });
    div.querySelector('[data-use="translated"]').addEventListener('click', () => {
      outputArea.value = entry.translated;
      outputArea.classList.add('has-content');
      outputArea.focus();
      showToast('Imported to output');
    });

    historyList.appendChild(div);
  });
}

btnClearHistory.addEventListener('click', () => {
  historyEntries = [];
  API.clearHistory();
  renderHistory();
  showToast('History cleared');
});

/* ─────────────────────────────────────────────────────────────
   SETTINGS PANE
───────────────────────────────────────────────────────────────*/
btnSettings.addEventListener('click', openSettings);
settingsLink.addEventListener('click', (e) => { e.preventDefault(); openSettings(); });

function openSettings() {
  settingsOpen = true;
  settingsPane.classList.add('open');
  loadSettingsForm();
}

btnSpBack.addEventListener('click', () => {
  settingsPane.classList.remove('open');
  settingsOpen = false;
});

function syncSilenceDurationRow() {
  spSilenceDurationRow.style.opacity  = spSilenceEnabled.checked ? '1' : '0.4';
  spSilenceDurationRow.style.pointerEvents = spSilenceEnabled.checked ? '' : 'none';
}

function loadSettingsForm() {
  spSystemPrompt.value       = cfg.translatorSystemPrompt || '';
  spSystemInstructions.value = cfg.translatorSystemInstructions || '';
  spOpenShortcut.value       = cfg.translatorOpenShortcut || 'Shift+Alt+T';
  spPasteShortcut.value      = cfg.translatorPasteShortcut || 'Shift+Alt+P';

  // Silence timer
  spSilenceEnabled.checked = cfg.translatorSilenceEnabled === true;
  spSilenceVal.value       = String(cfg.translatorSilenceVal ?? 30);
  const knownUnits = ['sec', 'min', 'hr'];
  spSilenceUnit.value = knownUnits.includes(cfg.translatorSilenceUnit) ? cfg.translatorSilenceUnit : 'sec';
  syncSilenceDurationRow();

  renderProfiles();
  renderPresets();
}

spSilenceEnabled.addEventListener('change', syncSilenceDurationRow);

btnSpSave.addEventListener('click', async () => {
  // Compute silence timeout in seconds
  const silenceEnabled = spSilenceEnabled.checked;
  const silenceVal  = Math.max(1, parseInt(spSilenceVal.value, 10) || 30);
  const silenceUnit = spSilenceUnit.value;
  const MULTIPLIERS = { sec: 1, min: 60, hr: 3600 };
  const silenceSeconds = silenceEnabled ? silenceVal * (MULTIPLIERS[silenceUnit] || 1) : 0;

  const updated = {
    translatorSystemPrompt:       spSystemPrompt.value,
    translatorSystemInstructions: spSystemInstructions.value,
    translatorOpenShortcut:       spOpenShortcut.value,
    translatorPasteShortcut:      spPasteShortcut.value,
    translatorSilenceEnabled:     silenceEnabled,
    translatorSilenceVal:         silenceVal,
    translatorSilenceUnit:        silenceUnit,
    translatorSilenceTimeout:     silenceSeconds,   // 0 = infinite
  };
  Object.assign(cfg, updated);
  await API.saveSettings(updated);
  showToast('✓ Settings saved');
  settingsPane.classList.remove('open');
  settingsOpen = false;
  updateModeUI();
});

/* ── Provider / Model dynamic ── */
spProvider.addEventListener('change', () => updateProviderUI());

function updateProviderUI() {
  const prov = spProvider.value;
  const isCustom = prov === 'custom';
  spCustomUrlField.style.display   = isCustom ? '' : 'none';
  spCustomModelField.style.display = isCustom ? '' : 'none';
  spModelField.style.display       = isCustom ? 'none' : '';

  if (!isCustom) {
    const models = PROVIDER_MODELS[prov] || [];
    spModel.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
  }
}

/* ── Profile management ── */
btnAddProfile.addEventListener('click', () => {
  const name = spProfileName.value.trim();
  const key  = spApiKey.value.trim();
  if (!name) { showToast('Enter a profile name'); return; }
  if (!key)  { showToast('Enter an API key'); return; }

  const profile = {
    id:        Date.now().toString(),
    name,
    provider:  spProvider.value,
    model:     spProvider.value === 'custom' ? spCustomModel.value : spModel.value,
    apiKey:    key,
    baseUrl:   spCustomUrl.value.trim(),
    modelName: spCustomModel.value.trim(),
  };
  const profiles = [...(cfg.translatorApiProfiles || []), profile];
  cfg.translatorApiProfiles = profiles;
  if (!cfg.translatorActiveProfileId) cfg.translatorActiveProfileId = profile.id;

  API.saveSettings({ translatorApiProfiles: profiles, translatorActiveProfileId: cfg.translatorActiveProfileId });
  spProfileName.value = '';
  spApiKey.value = '';
  renderProfiles();
  showToast('✓ Profile added');
  updateModeUI();
});

function renderProfiles() {
  profileList.innerHTML = '';
  const profiles = cfg.translatorApiProfiles || [];
  if (!profiles.length) {
    profileList.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:4px 0;">No profiles yet. Add one below.</div>';
    return;
  }
  profiles.forEach(p => {
    const div = document.createElement('div');
    div.className = 'profile-chip' + (p.id === cfg.translatorActiveProfileId ? ' active' : '');
    div.innerHTML = `
      <div class="profile-name">${escapeHtml(p.name)}</div>
      <div class="profile-badge">${p.provider} · ${p.model || p.modelName || ''}</div>
      <button class="profile-del" title="Remove">✕</button>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('profile-del')) {
        const updated = (cfg.translatorApiProfiles || []).filter(x => x.id !== p.id);
        cfg.translatorApiProfiles = updated;
        if (cfg.translatorActiveProfileId === p.id) {
          cfg.translatorActiveProfileId = updated[0]?.id || '';
        }
        API.saveSettings({ translatorApiProfiles: updated, translatorActiveProfileId: cfg.translatorActiveProfileId });
        renderProfiles();
        updateModeUI();
      } else {
        cfg.translatorActiveProfileId = p.id;
        API.saveSettings({ translatorActiveProfileId: p.id });
        renderProfiles();
        showToast(`✓ Active: ${p.name}`);
        updateModeUI();
      }
    });
    profileList.appendChild(div);
  });
}

function getActiveProfile() {
  const profiles = cfg.translatorApiProfiles || [];
  const activeId = cfg.translatorActiveProfileId;
  return activeId ? profiles.find(p => p.id === activeId) : profiles[0];
}

/* ── Presets ── */
btnAddPreset.addEventListener('click', () => {
  const presets = [...(cfg.translatorLangPresets || [])];
  presets.push({ id: Date.now().toString(), src: psSrc.value, target: psTgt.value, shortcut: psShortcut.value.trim() });
  cfg.translatorLangPresets = presets;
  API.saveSettings({ translatorLangPresets: presets });
  psShortcut.value = '';
  renderPresets();
  showToast('✓ Preset added');
});

function renderPresets() {
  presetsList.innerHTML = '';
  const presets = cfg.translatorLangPresets || [];
  if (!presets.length) {
    presetsList.innerHTML = '<div style="font-size:12px;color:var(--muted);">No presets yet.</div>';
    return;
  }
  presets.forEach(p => {
    const srcName = new Option(p.src, p.src).text;
    const tgtName = new Option(p.target, p.target).text;
    const row = document.createElement('div');
    row.className = 'preset-row';
    row.innerHTML = `
      <span class="preset-combo">${p.src} → ${p.target}</span>
      <span class="preset-shortcut">${p.shortcut || '—'}</span>
      <button class="preset-del" title="Remove">✕</button>
    `;
    row.querySelector('.preset-del').addEventListener('click', () => {
      const updated = (cfg.translatorLangPresets || []).filter(x => x.id !== p.id);
      cfg.translatorLangPresets = updated;
      API.saveSettings({ translatorLangPresets: updated });
      renderPresets();
    });
    presetsList.appendChild(row);
  });
}

/* ─────────────────────────────────────────────────────────────
   WINDOW CONTROLS
───────────────────────────────────────────────────────────────*/
dotClose.addEventListener('click', () => API.close());

/* Drag */
document.getElementById('titlebar').addEventListener('mousedown', (e) => {
  if (e.target.closest('button, select, input, textarea, .toggle-switch, #mode-toggle-wrap')) return;
  API.drag();
});
document.getElementById('titlebar').addEventListener('mouseup', () => API.stopDrag());

/* ─────────────────────────────────────────────────────────────
   UTILS
───────────────────────────────────────────────────────────────*/
let toastTimer;
function showToast(msg, duration = 1800) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}

function escapeHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─ Boot ─ */
init().catch(console.error);
resetSilenceTimer();
