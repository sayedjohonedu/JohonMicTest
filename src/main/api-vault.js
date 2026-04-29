'use strict';

/**
 * api-vault.js — Centralised API Credential Manager
 *
 * One Vault, Per-Feature Defaults.
 *
 * Two profile pools:
 *   1. LLM (Chat/Completion) — consumed by AI Dictation, Translator, Whisper AI Polish, future features
 *   2. Whisper (Speech-to-Text) — consumed by Whisper Engine
 *
 * Each feature stores only the *ID* of its preferred default profile.
 * Fallback chains are built here so consumers never re-implement the logic.
 */

const store = require('../../store/config');

// ── Feature → store key mapping ──────────────────────────────────
const FEATURE_DEFAULT_KEYS = {
  'ai-dictation':   'vaultDefaultAiDictation',
  'translator':     'vaultDefaultTranslator',
  'whisper-stt':    'vaultDefaultWhisperStt',
  'whisper-polish': 'vaultDefaultWhisperPolish',
};

// Which pool each feature draws from
const FEATURE_POOL = {
  'ai-dictation':   'llm',
  'translator':     'llm',
  'whisper-polish': 'llm',
  'whisper-stt':    'whisper',
};

class ApiVault {

  // ═══════════════════════════════════════════════════════════════
  //  LLM Profiles  (Chat / Completion APIs)
  // ═══════════════════════════════════════════════════════════════

  getLlmProfiles() {
    const profiles = store.get('apiVaultLlmProfiles') || [];
    // Backfill IDs for any profiles that were saved without one (legacy bug)
    let dirty = false;
    profiles.forEach(p => {
      if (!p.id) {
        p.id = Date.now().toString() + '_' + Math.random().toString(36).slice(2, 8);
        dirty = true;
      }
    });
    if (dirty) store.set('apiVaultLlmProfiles', profiles);
    return profiles;
  }

  getLlmProfile(id) {
    return this.getLlmProfiles().find(p => p.id === id) || null;
  }

  addLlmProfile(profile) {
    const profiles = this.getLlmProfiles();
    // Always ensure the profile has a stable unique ID
    const p = {
      ...profile,
      id: profile.id || Date.now().toString() + '_' + Math.random().toString(36).slice(2, 8),
    };
    profiles.push(p);
    store.set('apiVaultLlmProfiles', profiles);
    return p;
  }

  updateLlmProfile(id, updates) {
    const profiles = this.getLlmProfiles();
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) return null;
    profiles[idx] = { ...profiles[idx], ...updates, id }; // id is immutable
    store.set('apiVaultLlmProfiles', profiles);
    return profiles[idx];
  }

  removeLlmProfile(id) {
    const profiles = this.getLlmProfiles().filter(p => p.id !== id);
    store.set('apiVaultLlmProfiles', profiles);

    // Clear any feature defaults that pointed to the removed profile
    for (const [feature, pool] of Object.entries(FEATURE_POOL)) {
      if (pool === 'llm') {
        const key = FEATURE_DEFAULT_KEYS[feature];
        if (store.get(key) === id) {
          store.set(key, profiles[0]?.id || '');
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Whisper Profiles  (Speech-to-Text APIs)
  // ═══════════════════════════════════════════════════════════════

  getWhisperProfiles() {
    const profiles = store.get('apiVaultWhisperProfiles') || [];
    // Backfill IDs for any profiles that were saved without one (legacy bug)
    let dirty = false;
    profiles.forEach(p => {
      if (!p.id) {
        p.id = Date.now().toString() + '_' + Math.random().toString(36).slice(2, 8);
        dirty = true;
      }
    });
    if (dirty) store.set('apiVaultWhisperProfiles', profiles);
    return profiles;
  }

  getWhisperProfile(id) {
    return this.getWhisperProfiles().find(p => p.id === id) || null;
  }

  addWhisperProfile(profile) {
    const profiles = this.getWhisperProfiles();
    // Always ensure the profile has a stable unique ID
    const p = {
      ...profile,
      id: profile.id || Date.now().toString() + '_' + Math.random().toString(36).slice(2, 8),
    };
    profiles.push(p);
    store.set('apiVaultWhisperProfiles', profiles);
    return p;
  }

  updateWhisperProfile(id, updates) {
    const profiles = this.getWhisperProfiles();
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) return null;
    profiles[idx] = { ...profiles[idx], ...updates, id };
    store.set('apiVaultWhisperProfiles', profiles);
    return profiles[idx];
  }

  removeWhisperProfile(id) {
    const profiles = this.getWhisperProfiles().filter(p => p.id !== id);
    store.set('apiVaultWhisperProfiles', profiles);

    // Clear Whisper STT default if it pointed to the removed profile
    const key = FEATURE_DEFAULT_KEYS['whisper-stt'];
    if (store.get(key) === id) {
      store.set(key, profiles[0]?.id || '');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Feature Defaults
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the default profile for a feature.
   * Falls back to the first profile in the pool if the stored default is missing.
   */
  getDefaultForFeature(feature) {
    const key = FEATURE_DEFAULT_KEYS[feature];
    if (!key) return null;

    const id = store.get(key) || '';
    const pool = FEATURE_POOL[feature] === 'whisper'
      ? this.getWhisperProfiles()
      : this.getLlmProfiles();

    return pool.find(p => p.id === id) || pool[0] || null;
  }

  /**
   * Set the default profile ID for a feature.
   */
  setDefaultForFeature(feature, profileId) {
    const key = FEATURE_DEFAULT_KEYS[feature];
    if (!key) return;
    store.set(key, profileId || '');
  }

  /**
   * Get all feature defaults as a map: { feature: profileId }
   */
  getAllDefaults() {
    const result = {};
    for (const [feature, key] of Object.entries(FEATURE_DEFAULT_KEYS)) {
      result[feature] = store.get(key) || '';
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Fallback Chain
  // ═══════════════════════════════════════════════════════════════

  /**
   * Build the ordered fallback chain for a feature.
   * Default profile first, then remaining profiles.
   * If fallback is disabled, returns only the default.
   */
  getFallbackChain(feature) {
    const pool = FEATURE_POOL[feature] === 'whisper'
      ? this.getWhisperProfiles()
      : this.getLlmProfiles();

    const defaultProfile = this.getDefaultForFeature(feature);
    const fallbackEnabled = store.get('apiVaultFallbackEnabled') !== false;

    if (!defaultProfile) return [...pool];
    if (!fallbackEnabled) return [defaultProfile];

    // Default first, then the rest in stored order
    return [defaultProfile, ...pool.filter(p => p.id !== defaultProfile.id)];
  }

  /**
   * Whether global fallback is enabled.
   */
  get fallbackEnabled() {
    return store.get('apiVaultFallbackEnabled') !== false;
  }

  set fallbackEnabled(val) {
    store.set('apiVaultFallbackEnabled', val === true);
  }

  // ═══════════════════════════════════════════════════════════════
  //  One-Time Migration from Legacy Profile Pools
  // ═══════════════════════════════════════════════════════════════

  /**
   * Migrate legacy profile storage into the centralised vault.
   * Safe to call multiple times — only runs if the vault is empty.
   *
   * Legacy sources:
   *   LLM:     aiProfiles, translatorApiProfiles, whisperApiAiProfiles, + flat keys
   *   Whisper: whisperApiProfiles
   */
  migrateIfNeeded() {
    // Skip if vault already has data (migration already ran)
    const existingLlm     = store.get('apiVaultLlmProfiles');
    const existingWhisper = store.get('apiVaultWhisperProfiles');
    const alreadyMigrated = store.get('apiVaultMigrated') === true;

    if (alreadyMigrated) return false;
    if (existingLlm?.length || existingWhisper?.length) {
      store.set('apiVaultMigrated', true);
      return false;
    }

    console.log('[ApiVault] Running one-time migration from legacy profile pools...');

    // ── Collect LLM profiles ───────────────────────────────────
    const llmProfiles = [];
    const seenLlmKeys = new Set(); // deduplicate by apiKey

    const addLlm = (profile, sourceName) => {
      if (!profile || !profile.apiKey) return null;
      const key = `${profile.provider}:${profile.apiKey}`;
      if (seenLlmKeys.has(key)) return null;
      seenLlmKeys.add(key);

      const p = {
        id: profile.id || Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6),
        name: profile.name || `${this._providerLabel(profile.provider)} (migrated from ${sourceName})`,
        provider: profile.provider || 'openai',
        model: profile.model || profile.modelName || '',
        apiKey: profile.apiKey || '',
        baseUrl: profile.baseUrl || '',
      };
      llmProfiles.push(p);
      return p;
    };

    // 1. AI Dictation profiles
    const aiProfiles = store.get('aiProfiles') || [];
    const aiActiveId = store.get('aiActiveProfileId') || '';
    let aiDefaultNewId = '';
    for (const p of aiProfiles) {
      const added = addLlm(p, 'AI Dictation');
      if (added && p.id === aiActiveId) aiDefaultNewId = added.id;
    }

    // 1b. Legacy flat AI keys (if no profiles existed)
    if (!aiProfiles.length) {
      const flatKey = store.get('aiApiKey');
      if (flatKey) {
        const added = addLlm({
          id: '__legacy_ai__',
          name: 'AI Dictation (migrated)',
          provider: store.get('aiProvider') || 'openai',
          model: store.get('aiModel') || 'gpt-4o-mini',
          apiKey: flatKey,
          baseUrl: store.get('aiBaseUrl') || '',
        }, 'AI Dictation (flat)');
        if (added) aiDefaultNewId = added.id;
      }
    }

    // 2. Translator profiles
    const translatorProfiles = store.get('translatorApiProfiles') || [];
    const translatorActiveId = store.get('translatorActiveProfileId') || '';
    let translatorDefaultNewId = '';
    for (const p of translatorProfiles) {
      const added = addLlm(p, 'Translator');
      if (added && p.id === translatorActiveId) translatorDefaultNewId = added.id;
    }

    // 3. Whisper AI Polish profiles (LLM)
    const whisperAiProfiles = store.get('whisperApiAiProfiles') || [];
    const whisperAiActiveId = store.get('whisperApiAiActiveProfileId') || '';
    let whisperPolishDefaultNewId = '';
    for (const p of whisperAiProfiles) {
      const added = addLlm(p, 'Whisper AI Polish');
      if (added && p.id === whisperAiActiveId) whisperPolishDefaultNewId = added.id;
    }

    // ── Collect Whisper STT profiles ───────────────────────────
    const whisperSttProfiles = [];
    const seenWhisperKeys = new Set();

    const whisperProfiles = store.get('whisperApiProfiles') || [];
    const whisperActiveId = store.get('whisperApiActiveProfileId') || '';
    let whisperSttDefaultNewId = '';

    for (const p of whisperProfiles) {
      if (!p || !p.apiKey) continue;
      const key = `${p.provider}:${p.apiKey}`;
      if (seenWhisperKeys.has(key)) continue;
      seenWhisperKeys.add(key);

      const newP = {
        id: p.id || Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6),
        name: p.name || `${p.provider === 'groq' ? 'Groq' : 'OpenAI'} Whisper (migrated)`,
        provider: p.provider || 'openai',
        model: p.model || 'whisper-1',
        apiKey: p.apiKey,
        baseUrl: p.baseUrl || '',
      };
      whisperSttProfiles.push(newP);
      if (p.id === whisperActiveId) whisperSttDefaultNewId = newP.id;
    }

    // ── Write vault ────────────────────────────────────────────
    if (llmProfiles.length) {
      store.set('apiVaultLlmProfiles', llmProfiles);
      console.log(`[ApiVault] Migrated ${llmProfiles.length} LLM profile(s)`);
    }
    if (whisperSttProfiles.length) {
      store.set('apiVaultWhisperProfiles', whisperSttProfiles);
      console.log(`[ApiVault] Migrated ${whisperSttProfiles.length} Whisper STT profile(s)`);
    }

    // ── Set per-feature defaults ───────────────────────────────
    // If a feature had an active profile that was migrated, point to it;
    // otherwise fall through to the first available profile.
    if (aiDefaultNewId)             store.set('vaultDefaultAiDictation', aiDefaultNewId);
    else if (llmProfiles.length)    store.set('vaultDefaultAiDictation', llmProfiles[0].id);

    if (translatorDefaultNewId)          store.set('vaultDefaultTranslator', translatorDefaultNewId);
    else if (llmProfiles.length)         store.set('vaultDefaultTranslator', llmProfiles[0].id);

    if (whisperPolishDefaultNewId)       store.set('vaultDefaultWhisperPolish', whisperPolishDefaultNewId);
    else if (llmProfiles.length)         store.set('vaultDefaultWhisperPolish', llmProfiles[0].id);

    if (whisperSttDefaultNewId)          store.set('vaultDefaultWhisperStt', whisperSttDefaultNewId);
    else if (whisperSttProfiles.length)  store.set('vaultDefaultWhisperStt', whisperSttProfiles[0].id);

    // Preserve old per-feature fallback preferences as a single global toggle
    // (default on — matches existing behaviour)
    const aiFb = store.get('aiFallbackEnabled');
    store.set('apiVaultFallbackEnabled', aiFb !== false);

    // Mark migration as complete
    store.set('apiVaultMigrated', true);

    const total = llmProfiles.length + whisperSttProfiles.length;
    console.log(`[ApiVault] Migration complete — ${total} total profiles imported`);
    return true;
  }

  // ── Helpers ──────────────────────────────────────────────────

  _providerLabel(provider) {
    const labels = {
      openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini',
      groq: 'Groq', openrouter: 'OpenRouter', custom: 'Custom/Ollama',
    };
    return labels[provider] || provider || 'Unknown';
  }

  /**
   * Get a summary for UI display: { llmCount, whisperCount, features }
   */
  getSummary() {
    const llm = this.getLlmProfiles();
    const whisper = this.getWhisperProfiles();
    const defaults = this.getAllDefaults();

    const featureSummary = {};
    for (const [feature] of Object.entries(FEATURE_DEFAULT_KEYS)) {
      const profile = this.getDefaultForFeature(feature);
      featureSummary[feature] = profile
        ? { id: profile.id, name: profile.name, provider: profile.provider, model: profile.model }
        : null;
    }

    return {
      llmCount: llm.length,
      whisperCount: whisper.length,
      fallbackEnabled: this.fallbackEnabled,
      defaults,
      features: featureSummary,
    };
  }
}

module.exports = new ApiVault();
