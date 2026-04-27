'use strict';

/**
 * text-replacements.js — Shared text replacement engine.
 *
 * Applies user-defined text replacement rules to dictated text.
 * Used by both the regular overlay dictation pipeline (main.js)
 * and the Whisper API cloud dictation pipeline (whisper-api-manager.js).
 *
 * Two modes (controlled by `textReplaceInline` config):
 *
 *   INLINE (default, textReplaceInline = true):
 *     Replaces every occurrence of a trigger phrase wherever it appears
 *     inside the text (case-insensitive, word-boundary-aware).
 *     e.g. "send it to my email please"  →  "send it to john@example.com please"
 *
 *   EXACT (textReplaceInline = false):
 *     The ENTIRE transcript (trimmed, case-insensitive) must exactly match
 *     the trigger phrase. Partial / substring matches are ignored.
 *     e.g. "my email"  →  "john@example.com"
 *          "send my email" → (no match, returned as-is)
 */

const store = require('../../store/config');

/**
 * Apply text replacement rules to the given text.
 * @param {string} text — the spoken/transcribed text
 * @returns {string} — replaced text, or original if no rule matched
 */
function applyTextReplacements(text) {
  if (!store.get('textReplaceEnabled')) return text;
  const rules = store.get('textReplacements') || [];
  if (!rules.length) return text;

  const inline = store.get('textReplaceInline') !== false; // default true

  if (inline) {
    // ── INLINE MODE: replace trigger phrases wherever they appear ──
    let result = text;
    for (const rule of rules) {
      const say = (rule.say || '').trim();
      if (!say) continue;
      // Build a case-insensitive regex with word boundaries so we don't
      // accidentally match inside unrelated words.
      // Escape regex special chars in the trigger phrase.
      const escaped = say.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      result = result.replace(regex, rule.replace || '');
    }
    return result;
  } else {
    // ── EXACT MODE: entire phrase must match ──
    const trimmed = text.trim();
    for (const rule of rules) {
      const say = (rule.say || '').trim();
      if (!say) continue;
      if (trimmed.toLowerCase() === say.toLowerCase()) {
        return rule.replace || '';
      }
    }
    return text;
  }
}

module.exports = { applyTextReplacements };
