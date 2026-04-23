'use strict';

/**
 * whisper-api-manager.js — Orchestrator for cloud Whisper API dictation.
 * Completely independent from Offline Mode — has its own activation key,
 * its own enable toggle, and its own pipeline.
 *
 * Flow:
 *   1. User holds activation key → show pill overlay + start recording
 *   2. User releases key → stop recording → show "Processing…"
 *   3. Send audio to OpenAI/Groq Whisper API → get transcript
 *   4. (Optional) AI Polish: send transcript to LLM for cleanup
 *   5. Paste result to active text field
 */

const { BrowserWindow } = require('electron');
const store = require('../../store/config');
const offlineRecorder = require('./offline-recorder');
const whisperApiEngine = require('./whisper-api-engine');
const { callLlmRaw } = require('./llm-client');

const DEFAULT_AI_SYSTEM_PROMPT = `You are a speech-to-text post-processor. You receive raw transcriptions from a voice dictation system.

Your job:
- Fix grammar, punctuation, and capitalization
- Remove filler words (um, uh, like, you know, so, basically, I mean)
- Clean up false starts and repeated words
- Preserve the speaker's intended meaning exactly
- Format naturally with proper sentence structure
- If the speaker says "new line" or "new paragraph", insert appropriate line breaks
- If the speaker says "period", "comma", "question mark", "exclamation point", insert the punctuation
- Do NOT add any commentary, explanations, or extra text
- Return ONLY the cleaned-up text, nothing else`;

class WhisperApiManager {
  constructor() {
    this._enabled = false;
    this._pillWindow = null;
    this._isProcessing = false;
    this._clipboardManager = null;
    this._maxRecordingTimer = null;
  }

  /** Initialize from stored config */
  init() {
    this._enabled = store.get('whisperApiEnabled') === true;
  }

  /** Set the clipboard manager reference for text injection */
  setClipboardManager(cm) {
    this._clipboardManager = cm;
  }

  /** Set the pill overlay window reference */
  setPillWindow(win) {
    this._pillWindow = win;
  }

  /** Is Whisper API mode enabled in settings? */
  get isEnabled() {
    return store.get('whisperApiEnabled') === true;
  }

  /** Is a transcription currently being processed? */
  get isProcessing() {
    return this._isProcessing;
  }

  /**
   * Called when the activation key is pressed down.
   * Shows the pill overlay and starts recording.
   */
  onKeyDown() {
    if (!this.isEnabled || this._isProcessing) return;
    if (offlineRecorder.isRecording) return;

    // Runtime trial gate — block if free user's 15-day trial has expired
    try {
      const { checkWhisperApiTrialExpiry } = require('./licensing');
      const trial = checkWhisperApiTrialExpiry();
      if (trial.expired) {
        console.warn('[WhisperAPI] Trial expired — blocking activation');
        return;
      }
    } catch (e) {
      console.error('[WhisperAPI] Trial check failed:', e);
    }

    // Check at least one Whisper profile is configured
    const profiles = store.get('whisperApiProfiles') || [];
    if (!profiles.length || !profiles.some(p => p.apiKey)) {
      console.warn('[WhisperAPI] No Whisper profiles configured — ignoring activation');
      return;
    }

    // Show the pill overlay
    this._showPill('recording');

    // Start recording
    offlineRecorder.startRecording();

    // Safety cap: auto-stop after 5 minutes
    const MAX_RECORDING_MS = 5 * 60 * 1000;
    this._maxRecordingTimer = setTimeout(() => {
      console.warn(`[WhisperAPI] Max recording duration (${MAX_RECORDING_MS / 1000}s) reached — auto-processing`);
      this.onKeyUp();
    }, MAX_RECORDING_MS);
  }

  /**
   * Get profiles ordered with active first, then the rest.
   */
  _getOrderedProfiles() {
    const profiles = store.get('whisperApiProfiles') || [];
    const activeId = store.get('whisperApiActiveProfileId') || '';
    const active = profiles.find(p => p.id === activeId);
    const rest = profiles.filter(p => p.id !== activeId && p.apiKey);

    const ordered = [];
    if (active && active.apiKey) ordered.push(active);
    ordered.push(...rest);
    return ordered;
  }

  /**
   * Called when the activation key is released.
   * Stops recording and processes the audio via Whisper API.
   * Supports profile-based fallback: tries active profile first, then others.
   */
  async onKeyUp() {
    if (!offlineRecorder.isRecording) return;

    // Clear the max-recording safety timer
    if (this._maxRecordingTimer) {
      clearTimeout(this._maxRecordingTimer);
      this._maxRecordingTimer = null;
    }

    this._isProcessing = true;
    this._updatePill('processing');

    // Safety timeout: auto-reset after 120s to prevent permanent lock
    const safetyTimer = setTimeout(() => {
      if (this._isProcessing) {
        console.error('[WhisperAPI] Processing timeout (120s) — force-resetting state');
        this._isProcessing = false;
        this._updatePill('error', 'Processing took too long. Try a shorter recording.');
        setTimeout(() => this._hidePill(), 3000);
      }
    }, 120_000);

    try {
      // 1. Stop recording and get audio data
      const audioData = await offlineRecorder.stopRecording();
      if (!audioData || !audioData.samples || audioData.samples.length === 0) {
        console.warn('[WhisperAPI] No audio data recorded');
        this._hidePill();
        this._isProcessing = false;
        return;
      }

      const durationSec = audioData.samples.length / audioData.sampleRate;
      console.log(`[WhisperAPI] Got ${audioData.samples.length} samples at ${audioData.sampleRate}Hz (${durationSec.toFixed(1)}s)`);

      // 2. Transcribe via Whisper API — with profile fallback
      this._updatePill('transcribing', 'Sending to Whisper API…');
      let transcript;

      const ordered = this._getOrderedProfiles();
      const fallbackEnabled = store.get('whisperApiFallbackEnabled') !== false;
      const profilesToTry = fallbackEnabled ? ordered : ordered.slice(0, 1);

      if (!profilesToTry.length) {
        this._updatePill('error', 'No Whisper profiles configured');
        setTimeout(() => this._hidePill(), 4000);
        this._isProcessing = false;
        return;
      }

      let lastError = null;
      for (const profile of profilesToTry) {
        try {
          console.log(`[WhisperAPI] Trying profile "${profile.name}" (${profile.provider}/${profile.model})`);
          this._updatePill('transcribing', `Sending to ${profile.name}…`);
          await new Promise(resolve => setImmediate(resolve));
          transcript = await whisperApiEngine.transcribe(audioData.samples, audioData.sampleRate, profile);
          lastError = null;
          break; // Success — stop trying
        } catch (e) {
          lastError = e;
          console.warn(`[WhisperAPI] Profile "${profile.name}" failed: ${e.message}`);
        }
      }

      if (lastError || !transcript) {
        const errMsg = lastError?.message || 'All profiles failed';
        console.error('[WhisperAPI] Transcription failed:', errMsg);
        this._updatePill('error', 'Whisper API: ' + errMsg);
        setTimeout(() => this._hidePill(), 4000);
        this._isProcessing = false;
        return;
      }

      if (!transcript || !transcript.trim()) {
        console.log('[WhisperAPI] Empty transcript — nothing to paste');
        this._hidePill();
        this._isProcessing = false;
        return;
      }

      // 3. (Optional) AI Post-Processing / Polish
      let finalText = transcript.trim();
      if (store.get('whisperApiAiEnabled') === true) {
        try {
          this._updatePill('transcribing', 'AI Polishing…');
          const polished = await this._aiPolish(finalText);
          if (polished && polished.trim()) {
            console.log(`[WhisperAPI] AI polished: "${finalText.substring(0, 40)}…" → "${polished.substring(0, 40)}…"`);
            finalText = polished.trim();
          }
        } catch (e) {
          console.warn('[WhisperAPI] AI polish failed, using raw transcript:', e.message);
          // Fall through — use raw transcript
        }
      }

      // 4. Paste result
      if (finalText) {
        this._updatePill('done', finalText.substring(0, 60) + (finalText.length > 60 ? '…' : ''));
        
        if (this._clipboardManager) {
          this._clipboardManager.injectText(finalText);
        }
      }

      // Hide pill after a brief display of success
      setTimeout(() => this._hidePill(), 1200);

    } catch (e) {
      console.error('[WhisperAPI] Processing error:', e);
      this._updatePill('error', e.message);
      setTimeout(() => this._hidePill(), 3000);
    } finally {
      clearTimeout(safetyTimer);
      this._isProcessing = false;
    }
  }

  /**
   * Send transcript through LLM for AI polishing.
   * Uses named profiles with automatic fallback (mirrors AI Dictation profile system).
   */
  async _aiPolish(text) {
    const profiles   = store.get('whisperApiAiProfiles')        || [];
    const activeId   = store.get('whisperApiAiActiveProfileId') || '';
    const sysPrompt  = store.get('whisperApiAiSystemPrompt')    || DEFAULT_AI_SYSTEM_PROMPT;
    const temperature = store.get('whisperApiAiTemperature')    ?? 0.3;
    const fallback   = store.get('whisperApiAiFallbackEnabled') !== false;

    if (!profiles.length) {
      console.warn('[WhisperAPI] AI polish enabled but no profiles configured — skipping');
      return text;
    }

    // Build attempt order: active profile first, then remaining profiles
    const activeProfile = profiles.find(p => p.id === activeId) || profiles[0];
    const attempts = [activeProfile];
    if (fallback) {
      for (const p of profiles) {
        if (p.id !== activeProfile.id && p.apiKey) {
          attempts.push(p);
        }
      }
    }

    let lastError = null;

    for (const prof of attempts) {
      if (!prof.apiKey && prof.provider !== 'custom') continue;

      try {
        console.log(`[WhisperAPI] AI polish attempt → "${prof.name}" (${prof.provider}/${prof.model})`);

        const profile = {
          provider: prof.provider,
          model: prof.model,
          modelName: prof.model,
          apiKey: prof.apiKey,
          baseUrl: prof.baseUrl || '',
        };
        const result = await callLlmRaw({
          text,
          profile,
          systemPrompt: sysPrompt,
          temperature,
        });

        if (result.error) throw new Error(result.error);

        if (result.text && result.text.trim()) {
          if (prof.id !== activeProfile.id) {
            console.log(`[WhisperAPI] Active profile "${activeProfile.name}" failed, succeeded with fallback "${prof.name}"`);
          }
          return result.text;
        }
      } catch (e) {
        lastError = e;
        console.warn(`[WhisperAPI] AI polish failed with "${prof.name}": ${e.message}`);
        if (!fallback || attempts.indexOf(prof) === attempts.length - 1) {
          throw e;
        }
      }
    }

    if (lastError) throw lastError;
    return text;
  }

  /** Show the pill overlay with a given state */
  _showPill(state) {
    if (!this._pillWindow || this._pillWindow.isDestroyed()) return;
    this._pillWindow.webContents.send('offline-pill-state', { state });
    this._pillWindow.showInactive();

    // Restore saved position, or default to centered near top of screen
    const savedPos = store.get('offlinePillPosition');
    if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
      this._pillWindow.setPosition(savedPos.x, savedPos.y);
    } else {
      const { screen } = require('electron');
      const display = screen.getPrimaryDisplay();
      const { width } = display.workAreaSize;
      const pillWidth = 240;
      const x = Math.round((width - pillWidth) / 2);
      this._pillWindow.setPosition(x, 60);
    }
  }

  /** Update the pill overlay state */
  _updatePill(state, detail) {
    if (!this._pillWindow || this._pillWindow.isDestroyed()) return;
    this._pillWindow.webContents.send('offline-pill-state', { state, detail });
  }

  /** Hide the pill overlay */
  _hidePill() {
    if (!this._pillWindow || this._pillWindow.isDestroyed()) return;
    this._pillWindow.hide();
  }

  /** Get overall status for settings display */
  getStatus() {
    const profiles = store.get('whisperApiProfiles') || [];
    const activeId = store.get('whisperApiActiveProfileId') || '';
    const activeProfile = profiles.find(p => p.id === activeId) || profiles[0];
    return {
      enabled: this.isEnabled,
      hasProfiles: profiles.length > 0,
      activeProfile: activeProfile ? activeProfile.name : '',
      provider: activeProfile?.provider || 'openai',
      model: activeProfile?.model || 'whisper-1',
      language: store.get('whisperApiLanguage') || '',
      activationKey: store.get('whisperApiActivationKey') || 'AltRight',
    };
  }
}

module.exports = new WhisperApiManager();
