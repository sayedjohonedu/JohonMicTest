'use strict';
/* ─── Juno Translator — renderer logic ─────────────────────── */

const API = window.translatorAPI;

const DEFAULT_HUMANIZE_PROMPT = `# SYSTEM PROMPT: THE EXPERT HUMANIZER AGENT

## ROLE AND CORE OBJECTIVE
You are an expert humanizer, adversarial paraphraser, and content editor. Your objective is to rewrite AI-generated text or generate new text that is completely indistinguishable from authentic human writing. You must intentionally avoid all known statistical, lexical, structural, and semantic AI signatures while adhering strictly to verified information.

Your foundational operational directive is: "You are a rephraser. Given any input text, you are supposed to rephrase the text without changing its meaning and content, while maintaining the text quality. Also, it is important for you to output a rephrased text that has a different style from the input text. You can not just make a few changes to the input text".

## 1. MASTERING THE SCIENCE: STATISTICAL & STYLOMETRIC TARGETS
To bypass detection systems, you must alter the fundamental mathematical and structural footprint of the text:
*   **Maximize Perplexity and Burstiness:** AI detectors measure *perplexity* (how random and unpredictable the vocabulary is) and *burstiness* (the variation in sentence length and structure). You must actively maximize both by mixing short, punchy sentences with long, complex, naturally flowing ones.
*   **Break Structural Regularity (Lower Compressibility):** AI text relies heavily on context-dependent predictability, making it highly redundant and easily compressible by lossless compression algorithms like *gzip*. Human writing maintains a lower compressibility rate because it does not accumulate rigid structural regularity over long texts. Ensure your writing remains structurally unpredictable.
*   **Vary Stylometric Features:** Naturally vary part-of-speech (POS) bigrams, phrase patterns, and the placement of function words (unigrams of particles, conjunctions, and punctuation) to match human stylistic irregularities rather than defaulting to the statistical mean of AI generation.

## 2. ELIMINATE LEXICAL TELLS (THE BANNED LIST)
LLMs exhibit a distinct "idiolect" characterized by the massive overuse of specific words and transition phrases. 
*   **Banned Vocabulary:** NEVER use these frequently overused AI words: *delve, tapestry, vibrant, landscape, realm, embark, excels, vital, comprehensive, intricate, pivotal, moreover, arguably, notably, crucial, daunting, profound, foster, testament, tailored, unwavering, underscore, showcase, bustling, nestled*.
*   **Banned Phrases & Signposting:** Avoid cliché transitions, forced reflections, and dramatic flattery such as: "No fluff," "Dive into," "Here's the kicker," "It's important to note/consider," "Based on the information provided," "A testament to," "Shouting into the void," or "Quiet affirmation". Do not use "In summary," "In conclusion," or "Overall".
*   **Embrace Basic Copulas:** Do not replace simple verbs to sound overly sophisticated. Use "is," "are," and "has" instead of AI-typical substitutes like "serves as," "stands as," "features," or "boasts".
*   **Avoid Elegant Variation:** Do not use unnatural, obscure synonyms just to avoid repeating a word. Natural repetition of core nouns is a hallmark of human writing.

## 3. FIX STRUCTURAL AND STYLISTIC ISSUES
*   **Avoid the "Rule of Three":** Do not consistently group items, phrases, or adjectives in predictable threes (e.g., "A, B, and C" or "adjective, adjective, adjective") to sound comprehensive.
*   **Eliminate Negative Parallelisms:** Avoid formulaic contrasting structures like "Not just X, but also Y," or "It's not X, it's Y".
*   **Break Perfect Paragraph Proportions:** AI generates paragraphs of perfectly balanced lengths. Intentionally vary paragraph length drastically. 
*   **Remove Superficial Analysis:** Stop attaching "-ing" clauses at the ends of sentences to force a profound conclusion (e.g., "...highlighting the enduring legacy of..." or "...symbolizing a shift...").
*   **Ditch Rigid Transitions:** Avoid mechanical, template-like argument structures that rely heavily on rigid sequences like "However, therefore, moreover" or outline-like conclusions such as "Despite these challenges, the future outlook...". Do not create unnaturally fluid connections between completely disparate ideas.

## 4. FORMATTING AND MARKUP SANITIZATION
*   **No Markdown/Formatting Tells:** Do NOT overuse **boldface** for emphasis; do NOT use inline-header vertical lists (e.g., "- **Header:** text").
*   **Punctuation Restraint:** Limit the use of em dashes (—) and emojis, which AI models overuse to artificially "punch up" text. Use standard commas, parentheses, or colons instead. Use straight quotation marks (" ") rather than curly ones (“ ”).
*   **No Chatbot Disclaimers:** NEVER include conversational filler like "Certainly! Here is...", "As an AI language model...", or "As of my last knowledge update...". Do not include placeholder text or hallucinated search markup like \`turn0search0\`.

## 5. PREVENT HALLUCINATIONS AND SEMANTIC ERRORS
AI hallucinations occur because models predict plausible words rather than retrieving true knowledge. 
*   **Ground in Reality:** Base all outputs strictly on provided, trusted data and curated datasets (Retrieval-Augmented Generation principles). 
*   **Admit Uncertainty:** Do not bow to prompt pressure by filling gaps with plausible-sounding fabrications. Set constraints to admit uncertainty—simply state "I don't know" or "Not found" if the information is not in the source text.
*   **Avoid Vague Generalizations:** Do not provide generic, non-specific examples or use vague attributions (e.g., "Experts argue...", "Observers have cited..."). 
*   **No Fake Citations:** Never generate references to non-existent scholarly articles, hallucinate DOIs/ISBNs, or provide book citations without page numbers.

## 6. WHAT TO DO FOR HUMAN WRITING (THE HUMANIZATION PROTOCOL)
To truly sound human, incorporate these organic writing techniques:
*   **Inject Personal Voice and Concrete Experience:** Write with an authentic, unique perspective. Provide detailed, concrete instances rather than artificially balanced, detached overviews. 
*   **Use Asymmetrical Knowledge Depth:** Human writing naturally fluctuates in expertise. Show deep, specific, sophisticated understanding in core areas of the text, and more basic comprehension in peripheral areas, rather than maintaining a uniform, machine-like level of expertise everywhere.
*   **Write with Conversational Asymmetry:** Allow for minor, natural imperfections in flow. Human transitions between ideas aren't always perfectly smooth; sometimes ideas jump naturally without a connective transition word.
*   **Avoid Undue Emphasis:** Do not puff up the importance of mundane topics by falsely connecting them to broader historical trends, and do not hit readers over the head with repetitive claims about a subject's notability or legacy.`;

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

const btnCopyDraft      = document.getElementById('btn-copy-draft');
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
const btnResetPrompts       = document.getElementById('btn-reset-prompts');
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
const spFallbackEnabled     = document.getElementById('sp-fallback-enabled');
const spGoogleFallback      = document.getElementById('sp-google-fallback');

/* ─── Provider models map (updated April 2026) ───────────────── */
const PROVIDER_MODELS = {
  gemini: [
    'gemini-3.1-pro-preview',
    'gemini-3.1-pro-preview-customtools',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  openai: [
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-5.4-thinking',
    'gpt-5.3-codex',
    'gpt-5.3-instant',
    'o4-mini-deep-research',
    'o3-deep-research',
    'gpt-4.1',
    'gpt-4.1-mini',
  ],
  anthropic: [
    'claude-sonnet-5-20260401',
    'claude-opus-4-6-20260205',
    'claude-sonnet-4-6',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
  ],
  mistral: [
    'mistral-large-latest',
    'mistral-small-latest',
    'mistral-medium-3',
    'codestral-latest',
    'open-mistral-nemo',
  ],
  groq: [
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-3.3-70b-versatile',
    'llama3-70b-8192',
    'gemma2-9b-it',
  ],
  openrouter: [
    'openai/gpt-5.4',
    'anthropic/claude-4.6-sonnet',
    'google/gemini-3.1-pro',
    'deepseek/deepseek-v3.2',
    'meta-llama/llama-4-maverick-17b',
    'qwen/qwen-3.6-plus',
    'mistralai/devstral-2-2512',
    'openrouter/auto',
  ],
  custom: [],
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

  updateModeUI();
  
  const hasProfile = hasActiveProfile();
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

  if (cfg.theme) applyTheme(cfg.theme);
  API.onConfigUpdate((newCfg) => {
    if (newCfg.theme) applyTheme(newCfg.theme);
  });
}

function applyTheme(themeVal) {
  if (!themeVal) return;
  document.documentElement.setAttribute('data-theme', themeVal);
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

/* ─── Mode UI Update ─────────────────────────────────────────────*/

function updateModeUI() {
  noApiWarning.classList.toggle('visible', !hasActiveProfile());
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
    const result = await translateWithFallback(text);

    if (result.error) {
      showToast('⚠ ' + result.error);
    } else {
      outputArea.value = result.text;
      outputArea.classList.add('has-content');
      preHumanizedText = null;
      btnRevert.classList.remove('visible');
      if (result.fallbackUsed) {
        showToast(`⚠ Fallback: ${result.fallbackUsed}`, 3000);
      }
    }
  } catch (e) {
    showToast('Translation failed — please retry');
    console.error(e);
  }
  setTranslating(false);
  resetSilenceTimer();
}

/* ─── Translate with fallback chain ──────────────────────────── */
async function translateWithFallback(text) {
  const basePayload = {
    text,
    src: srcLang.value,
    tgt: tgtLang.value,
    systemPrompt: cfg.translatorSystemPrompt || '',
    systemInstructions: cfg.translatorSystemInstructions || DEFAULT_HUMANIZE_PROMPT,
  };

  // If not AI mode, just do regular Google Translate (no fallback needed)
  if (!isAiMode) {
    return await API.translate({ ...basePayload, mode: 'regular', profile: null });
  }

  const activeProfile = getActiveProfile();
  const allProfiles = cfg.translatorApiProfiles || [];
  const fallbackEnabled = cfg.translatorFallbackEnabled !== false;
  const googleFallback  = cfg.translatorGoogleFallback !== false;

  // 1. Try the active profile first
  if (activeProfile) {
    const result = await API.translate({ ...basePayload, mode: 'ai', profile: activeProfile });
    if (!result.error) return result;
    console.warn(`[Translator] Active profile "${activeProfile.name}" failed:`, result.error);

    // 2. If fallback enabled, cycle through other profiles
    if (fallbackEnabled && allProfiles.length > 1) {
      const otherProfiles = allProfiles.filter(p => p.id !== activeProfile.id);
      for (const profile of otherProfiles) {
        showToast(`Trying fallback: ${profile.name}...`, 1500);
        const fbResult = await API.translate({ ...basePayload, mode: 'ai', profile });
        if (!fbResult.error) {
          return { ...fbResult, fallbackUsed: `${profile.name} (fallback)` };
        }
        console.warn(`[Translator] Fallback profile "${profile.name}" failed:`, fbResult.error);
      }
    }

    // 3. If Google fallback is enabled, try Google Translate
    if (googleFallback) {
      showToast('AI failed — trying Google Translate...', 1500);
      const googleResult = await API.translate({ ...basePayload, mode: 'regular', profile: null });
      if (!googleResult.error) {
        return { ...googleResult, fallbackUsed: 'Google Translate (all AI profiles failed)' };
      }
      return googleResult; // Return the Google error
    }

    // No fallback options — return the original error
    return { error: `All profiles failed. Last error: ${result.error}` };
  }

  // No active profile — go straight to Google Translate if enabled
  if (googleFallback) {
    return await API.translate({ ...basePayload, mode: 'regular', profile: null });
  }

  return { error: 'No API profile configured and Google Translate fallback is disabled.' };
}

function setTranslating(on) {
  btnTranslate.classList.toggle('loading', on);
  translateSpinner.classList.toggle('visible', on);
  btnTranslate.querySelector('svg').style.display = on ? 'none' : '';
}

/* ─── Humanize (with profile fallback chain) ──────────────────*/
btnHumanize.addEventListener('click', async () => {
  if (btnHumanize.classList.contains('disabled')) return;
  const text = outputArea.value.trim();
  if (!text) { showToast('Translate something first'); return; }

  const activeProfile = getActiveProfile();
  if (!activeProfile) { showToast('No API profile — configure in Settings'); return; }

  preHumanizedText = text;
  humanizeSpinner.classList.add('visible');
  btnHumanize.style.pointerEvents = 'none';

  try {
    const result = await humanizeWithFallback(text);
    if (result.error) {
      showToast('⚠ ' + result.error);
      preHumanizedText = null;
    } else {
      outputArea.value = result.text;
      btnRevert.classList.add('visible');
      if (result.fallbackUsed) {
        showToast(`⚠ Fallback: ${result.fallbackUsed}`, 3000);
      }
    }
  } catch (e) {
    showToast('Humanize failed');
    preHumanizedText = null;
    console.error(e);
  }

  humanizeSpinner.classList.remove('visible');
  btnHumanize.style.pointerEvents = '';
});

/* ─── Humanize with fallback chain ────────────────────────────*/
async function humanizeWithFallback(text) {
  const payload = {
    text,
    systemInstructions: cfg.translatorSystemInstructions || DEFAULT_HUMANIZE_PROMPT,
  };

  const activeProfile = getActiveProfile();
  const allProfiles = cfg.translatorApiProfiles || [];
  const fallbackEnabled = cfg.translatorFallbackEnabled !== false;

  // 1. Try the active profile first
  if (activeProfile) {
    const result = await API.humanize({ ...payload, profile: activeProfile });
    if (!result.error) return result;
    console.warn(`[Humanize] Active profile "${activeProfile.name}" failed:`, result.error);

    // 2. If fallback enabled, cycle through other profiles
    if (fallbackEnabled && allProfiles.length > 1) {
      const otherProfiles = allProfiles.filter(p => p.id !== activeProfile.id);
      for (const profile of otherProfiles) {
        showToast(`Trying fallback: ${profile.name}...`, 1500);
        const fbResult = await API.humanize({ ...payload, profile });
        if (!fbResult.error) {
          return { ...fbResult, fallbackUsed: `${profile.name} (fallback)` };
        }
        console.warn(`[Humanize] Fallback profile "${profile.name}" failed:`, fbResult.error);
      }
    }

    // All profiles failed
    return { error: `All profiles failed. Last error: ${result.error}` };
  }

  return { error: 'No API profile configured.' };
}

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

/* ─── Copy draft ─────────────────────────────────────────────*/
if (btnCopyDraft) {
  btnCopyDraft.addEventListener('click', () => {
    const text = draftArea.value.trim();
    if (!text) { showToast('Nothing to copy'); return; }
    navigator.clipboard.writeText(text);
    showToast('✓ Copied!');
    draftArea.classList.add('copy-flash');
    setTimeout(() => draftArea.classList.remove('copy-flash'), 400);
  });
}



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
      // Use fallback chain same as main translate
      const basePayload = {
        text, src: srcLang.value, tgt: slot.langEl.value,
        systemPrompt: cfg.translatorSystemPrompt || '',
        systemInstructions: cfg.translatorSystemInstructions || DEFAULT_HUMANIZE_PROMPT,
      };

      let r;
      if (!isAiMode) {
        r = await API.translate({ ...basePayload, mode: 'regular', profile: null });
      } else {
        const activeProfile = getActiveProfile();
        const allProfiles = cfg.translatorApiProfiles || [];
        const fallbackEnabled = cfg.translatorFallbackEnabled !== false;
        const googleFallback  = cfg.translatorGoogleFallback !== false;

        r = null;
        if (activeProfile) {
          r = await API.translate({ ...basePayload, mode: 'ai', profile: activeProfile });
          if (r.error && fallbackEnabled) {
            for (const fp of allProfiles.filter(p => p.id !== activeProfile.id)) {
              r = await API.translate({ ...basePayload, mode: 'ai', profile: fp });
              if (!r.error) break;
            }
          }
          if (r.error && googleFallback) {
            r = await API.translate({ ...basePayload, mode: 'regular', profile: null });
          }
        } else if (googleFallback) {
          r = await API.translate({ ...basePayload, mode: 'regular', profile: null });
        } else {
          r = { error: 'No API profile configured' };
        }
      }
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
  switchSpPanel('api-profiles', document.querySelector('.sp-nav-item[data-sp-panel="api-profiles"]'));
}

btnSpBack.addEventListener('click', () => {
  settingsPane.classList.remove('open');
  settingsOpen = false;
});

/* ── Two-pane settings nav ── */
const SP_PANEL_META = {
  'api-profiles':  { title: 'API Profiles',    desc: 'Manage your AI provider API keys and models' },
  'ai-behaviour':  { title: 'AI Behaviour',     desc: 'Customize the system prompt and extra instructions' },
  'silence-timer': { title: 'Silence Timer',    desc: 'Auto-stop the microphone after a period of silence' },
  'shortcuts':     { title: 'Shortcuts',        desc: 'Global keyboard shortcuts for the translator' },
  'lang-presets':  { title: 'Language Presets', desc: 'Quick-switch language pairs with optional shortcut keys' },
};

function switchSpPanel(panelId, clickedItem) {
  // Update nav active state
  document.querySelectorAll('.sp-nav-item').forEach(el => el.classList.remove('sp-nav-active'));
  if (clickedItem) clickedItem.classList.add('sp-nav-active');

  // Show correct panel
  document.querySelectorAll('.sp-panel').forEach(el => el.classList.remove('sp-panel-active'));
  const target = document.getElementById(`sp-panel-${panelId}`);
  if (target) target.classList.add('sp-panel-active');

  // Update header title/desc
  const meta = SP_PANEL_META[panelId] || {};
  const titleEl = document.getElementById('sp-content-title');
  const descEl  = document.getElementById('sp-content-desc');
  if (titleEl) titleEl.textContent = meta.title || '';
  if (descEl)  descEl.textContent  = meta.desc  || '';
}

/* ── Password visibility toggle ── */
const btnToggleKeyVis = document.getElementById('btn-toggle-key-vis');
if (btnToggleKeyVis && spApiKey) {
  btnToggleKeyVis.addEventListener('click', () => {
    const isPassword = spApiKey.type === 'password';
    spApiKey.type = isPassword ? 'text' : 'password';
    const eyeEl = document.getElementById('eye-icon');
    if (eyeEl) eyeEl.innerHTML = isPassword
      ? '<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/><line x1="2" y1="2" x2="14" y2="14" stroke-width="1.6"/>'
      : '<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>';
  });
}

/* ── Test Key button ── */
const btnTestApi = document.getElementById('btn-test-api');
if (btnTestApi) {
  btnTestApi.addEventListener('click', async () => {
    const key = spApiKey.value.trim();
    if (!key) { showToast('Enter an API key first'); return; }
    const prov = spProvider.value;
    const model = prov === 'custom' ? spCustomModel.value : spModel.value;
    const testProfile = { provider: prov, model, apiKey: key, baseUrl: spCustomUrl.value.trim(), modelName: model };
    btnTestApi.disabled = true;
    btnTestApi.textContent = 'Testing…';
    try {
      const res = await API.translate({ text: 'Hello', src: 'en', tgt: 'es', mode: 'ai', profile: testProfile });
      if (res && res.text) {
        showToast(`✓ Works! "Hello" → "${res.text}"`, 3000);
      } else {
        showToast(`✗ ${res?.error || 'Test failed'}`, 3000);
      }
    } catch (e) {
      showToast(`✗ ${e.message || 'Request error'}`, 3000);
    }
    btnTestApi.disabled = false;
    btnTestApi.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" width="13" height="13"><path d="M5 3l8 5-8 5V3z"/></svg> Test Key';
  });
}

function syncSilenceDurationRow() {
  spSilenceDurationRow.style.opacity       = spSilenceEnabled.checked ? '1' : '0.4';
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

  // Fallback toggles
  if (spFallbackEnabled)  spFallbackEnabled.checked  = cfg.translatorFallbackEnabled !== false;
  if (spGoogleFallback)   spGoogleFallback.checked   = cfg.translatorGoogleFallback !== false;

  renderProfiles();
  renderPresets();
  
  // Make sure to hydrate the provider dropdown with all initial JS array models immediately
  if (typeof updateProviderUI === 'function') {
    updateProviderUI();
  }
}


spSilenceEnabled.addEventListener('change', syncSilenceDurationRow);

if (btnResetPrompts) {
  btnResetPrompts.addEventListener('click', () => {
    spSystemPrompt.value = '';
    spSystemInstructions.value = '';
  });
}

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
    translatorFallbackEnabled:    spFallbackEnabled  ? spFallbackEnabled.checked  : true,
    translatorGoogleFallback:     spGoogleFallback   ? spGoogleFallback.checked   : true,
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
  profiles.forEach((p, idx) => {
    const isActive = p.id === cfg.translatorActiveProfileId;
    const div = document.createElement('div');
    div.className = 'profile-chip' + (isActive ? ' active' : '');
    div.innerHTML = `
      <div class="profile-name">
        ${isActive ? '<span style="color:var(--accent);font-size:10px;margin-right:4px;">●</span>' : ''}
        ${escapeHtml(p.name)}
      </div>
      <div class="profile-badge">${p.provider} · ${p.model || p.modelName || ''}</div>
      <span class="profile-fallback-order" style="font-size:9px;color:var(--muted);background:rgba(255,255,255,0.04);padding:1px 5px;border-radius:4px;">${isActive ? 'Active' : '#' + (idx + 1)}</span>
      <button class="profile-del" title="Delete this profile">✕</button>
    `;

    // Delete button: confirm before removing
    const delBtn = div.querySelector('.profile-del');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Inline confirmation
      if (delBtn.dataset.confirming) {
        const updated = (cfg.translatorApiProfiles || []).filter(x => x.id !== p.id);
        cfg.translatorApiProfiles = updated;
        if (cfg.translatorActiveProfileId === p.id) {
          cfg.translatorActiveProfileId = updated[0]?.id || '';
        }
        API.saveSettings({ translatorApiProfiles: updated, translatorActiveProfileId: cfg.translatorActiveProfileId });
        renderProfiles();
        updateModeUI();
        showToast('✓ Profile deleted');
      } else {
        delBtn.dataset.confirming = '1';
        delBtn.textContent = 'Sure?';
        delBtn.style.color = 'var(--red)';
        delBtn.style.fontSize = '10px';
        delBtn.style.fontWeight = '600';
        setTimeout(() => {
          if (delBtn && !delBtn.isConnected) return;
          delete delBtn.dataset.confirming;
          delBtn.textContent = '✕';
          delBtn.style.color = '';
          delBtn.style.fontSize = '';
          delBtn.style.fontWeight = '';
        }, 2500);
      }
    });

    // Click on chip (not on delete) -> set as active
    div.addEventListener('click', (e) => {
      if (e.target.closest('.profile-del')) return;
      cfg.translatorActiveProfileId = p.id;
      API.saveSettings({ translatorActiveProfileId: p.id });
      renderProfiles();
      showToast(`✓ Active: ${p.name}`);
      updateModeUI();
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
