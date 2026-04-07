# 🚀 JUNO VOICE — AI DICTATION MODE: COMPLETE HANDOFF DOCUMENT

> **PURPOSE**: This document is the complete spec and implementation guide for adding WhisperFlow-style AI dictation to Juno Voice. It was created after extensive discussion between the developer (Sayed Johon) and an AI assistant who has deep knowledge of the entire Juno Voice codebase. Another developer or AI assistant should be able to implement everything from this document alone.

---

## TABLE OF CONTENTS
1. [Current Architecture Overview](#1-current-architecture-overview)
2. [What We're Building](#2-what-were-building)
3. [Critical Decisions Made](#3-critical-decisions-made)
4. [Technical Deep Dive: How Whisper vs LLM Work](#4-technical-deep-dive)
5. [The AI Dictation Pipeline](#5-the-ai-dictation-pipeline)
6. [Hotkey & Activation Design](#6-hotkey--activation-design)
7. [Settings Panel Design](#7-settings-panel-design)
8. [System Prompt Architecture](#8-system-prompt-architecture)
9. [Session Memory Design](#9-session-memory-design)
10. [File-by-File Implementation Plan](#10-file-by-file-implementation-plan)
11. [What NOT To Touch](#11-what-not-to-touch)
12. [Config Store Schema Additions](#12-config-store-schema-additions)
13. [Code Patterns To Follow](#13-code-patterns-to-follow)
14. [Phase Plan](#14-phase-plan)

---

## 1. CURRENT ARCHITECTURE OVERVIEW

Juno Voice is an **Electron** desktop app that provides global voice dictation. Here is how it works:

### System Architecture Diagram
```
┌─── Electron Main Process (main.js) ──────────────────────────────────┐
│                                                                       │
│  ┌─ Chrome Bridge (Puppeteer) ────────────────────────────────────┐  │
│  │  engine/chrome-launcher.js  →  engine/speech-bridge.html       │  │
│  │  Uses: webkitSpeechRecognition (Chrome's Web Speech API)       │  │
│  │  Connection: WebSocket on random localhost port                 │  │
│  │  Sends: final-text, interim-text, audio-data, status           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              ↓ WebSocket                             │
│  ┌─ main.js ─────────────────────────────────────────────────────┐   │
│  │  Routes transcripts based on sttMode:                          │   │
│  │  • 'overlay'    → ClipboardManager.injectText() (live paste)  │   │
│  │  • 'translator' → translatorWindow.send('translator-transcript')│  │
│  │                                                                 │   │
│  │  Controls:                                                      │   │
│  │  • toggleListening() — master start/stop STT                   │   │
│  │  • openTranslator() / closeTranslatorAndRestoreOverlay()       │   │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ Module Files (src/main/) ────────────────────────────────────┐   │
│  │  window-manager.js     → creates overlay + settings windows    │   │
│  │  hotkey-manager.js     → globalShortcut + uiohook-napi hooks   │   │
│  │  clipboard-manager.js  → clipboard write + paste OR typeString │   │
│  │  ipc-handlers.js       → all IPC handlers + LLM helper funcs  │   │
│  │  translator-manager.js → translator window lifecycle           │   │
│  │  tray-manager.js       → system tray icon + menu              │   │
│  │  floating-browser-manager.js → built-in browser                │   │
│  │  licensing.js          → Gumroad license verification          │   │
│  │  updater.js            → electron-updater auto-update          │   │
│  │  constants.js          → shared constants                      │   │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ UI Files (ui/) ──────────────────────────────────────────────┐   │
│  │  overlay.html/js/css         → floating dictation overlay      │   │
│  │  settings.html/js/css        → settings window (6 panels)     │   │
│  │  translator.html/js/css      → translator panel               │   │
│  │  floating-browser.html/js/css → built-in browser              │   │
│  │  *-preload.js                → contextBridge APIs              │   │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ Config (store/config.js) ────────────────────────────────────┐   │
│  │  electron-store with full schema (262 lines)                   │   │
│  │  Stores all settings, API profiles, history, positions, etc.   │   │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

### Key Dependencies (package.json)
| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | ^41.0.4 | Desktop app framework |
| `puppeteer-core` | ^24.40.0 | Launches Chrome for Web Speech API |
| `robotjs` | ^0.7.0 | Keyboard simulation (paste, type) |
| `uiohook-napi` | ^1.5.5 | Global key/mouse event hooks (hold-key) |
| `ws` | ^8.20.0 | WebSocket communication |
| `electron-store` | ^8.1.0 | Persistent config storage |
| `google-translate-api-x` | ^10.7.2 | Free Google Translate |
| `auto-launch` | ^5.0.6 | Launch at login |
| `electron-updater` | ^6.8.3 | Auto-updates from GitHub |

### How Text Injection Currently Works
1. **Real-time mode**: Each `final-text` event from the STT engine is immediately injected into the active app
2. **ClipboardManager** (`src/main/clipboard-manager.js`):
   - Saves current clipboard content
   - Writes new text to clipboard
   - Fires Cmd+V (Mac) or Ctrl+V (Windows) via robotjs
   - Restores original clipboard after 300ms
   - Alternative: `robot.typeString()` for ASCII-only on macOS (simulateTyping setting)

### How Hotkeys Currently Work
- **Combo hotkey** (default: `Alt+C`): Uses Electron's `globalShortcut.register()` — press & release toggles listening
- **Hold-key trigger**: Uses `uiohook-napi` to detect key hold for X seconds, then calls `toggleListening()`
- **Mouse shortcuts**: Middle/Back/Forward button via `uiohook-napi` — click, double-click, or hold
- **Language-specific hotkeys**: Custom combos that start listening in a specific language

### Window Co-existence Rules (CRITICAL — DO NOT BREAK)
1. **Overlay** and **Floating Browser** CAN co-exist (they're the same "mode")
2. **Translator** is MUTUALLY EXCLUSIVE with overlay. Opening translator closes overlay STT.
3. `sttMode` variable in `main.js` controls routing: `'overlay'` or `'translator'`
4. Overlay is `alwaysOnTop: true, level: 'screen-saver'` — it floats above EVERYTHING
5. Settings is `alwaysOnTop: true, level: 'floating'` — below overlay, above normal apps

### Existing LLM Infrastructure (in ipc-handlers.js)
The translator already has full LLM support! These functions exist and work:

```javascript
// ipc-handlers.js — lines 517-607
callLlmRaw({ text, profile, systemPrompt, systemInstructions })
// Supports: openai, anthropic, gemini, mistral, groq, openrouter, custom
// Uses raw HTTP (node https/http) — no SDK dependency needed

httpPost(url, body, extraHeaders)
// Generic HTTP POST helper used by callLlmRaw
```

The `profile` object structure (from `translatorApiProfiles`):
```javascript
{
  id: 'uuid-string',
  name: 'My OpenAI',
  provider: 'openai',      // 'openai' | 'anthropic' | 'gemini' | 'mistral' | 'groq' | 'openrouter' | 'custom'
  model: 'gpt-4o-mini',
  apiKey: 'sk-...',
  baseUrl: '',              // For custom endpoints (e.g., Ollama: http://localhost:11434/v1)
  modelName: ''             // Fallback model field
}
```

---

## 2. WHAT WE'RE BUILDING

**Goal**: Add a WhisperFlow-style AI dictation mode to Juno Voice that:
1. Records speech using the existing STT engine (Web Speech API via Chrome bridge)
2. Buffers the entire raw transcript until the user stops
3. Sends the buffered text through an LLM to clean it up (remove fillers, add punctuation, handle verbal corrections)
4. Pastes the polished result into the active app

### The Vision
- User presses **Right Alt** (hold → speak → release) or **Alt+C** (toggle on/off)
- Speaks naturally: *"Hey so um I want to write an email to John telling him that no wait, um, the meeting is postponed to next week. Make it sound professional."*
- After release/stop, LLM processes it
- Result pasted: *"Hi John, I wanted to let you know that our meeting has been postponed to next week. I'll send a calendar update shortly. Best regards"*

---

## 3. CRITICAL DECISIONS MADE

> [!IMPORTANT]
> **STT and LLM are TWO INDEPENDENT STEPS.** The STT engine (Web Speech API) handles HEARING. The LLM provider handles POLISHING. ALL LLM providers (OpenAI, Gemini, Anthropic, Groq, OpenRouter, Ollama, custom) use the SAME STT engine. The LLM provider does NOT affect how speech is captured — it only cleans up the raw text afterwards.

| Question | Decision |
|----------|----------|
| **STT Engine** | Keep Web Speech API as default and ONLY STT engine for Phase 1. It's FREE, real-time, and works. OpenAI Whisper (cloud) and whisper.cpp (local) are **FUTURE features** — show "Coming Soon" placeholder in UI. Leave a separate code space for Whisper integration later — do NOT mix it into the main pipeline. |
| **LLM for cleanup** | ALL cloud APIs (OpenAI, Anthropic, Gemini, Groq, OpenRouter, custom) + **Ollama local** — all in Phase 1. Any LLM can do text cleanup — it's just a text-in, text-out task. |
| **Does Whisper need LLM?** | **YES.** OpenAI Whisper is STT-only — it converts audio to text. It does NOT remove fillers, handle "delete that" commands, or polish grammar. You still need an LLM for cleanup even with Whisper. Whisper just HEARS more accurately. The Whisper API has a `prompt` parameter for vocabulary hints but that's not the same as full cleanup. |
| **Where does AI mode live?** | AI mode lives **inside the main overlay panel** as an enhancement — NOT as a separate window. This avoids window co-existence conflicts. The code modules should be **separate files** for maintainability, but the UI uses the same overlay. |
| **Hotkey design** | Three options for user: (1) Default `Alt+C` combo toggle, (2) Right Alt key for AI-specific push-to-talk, (3) Hold + Release variants. All customizable in settings. |
| **Session memory** | YES — when AI mode is active, maintain conversation context within a session. Clear on explicit session end. Prevent hallucination via short, focused prompts. |
| **Cost tracking** | NO — no cost awareness UI |
| **System prompt** | Short default prompt (token-efficient). Fully editable by user. Reset-to-default button. Session-level caching to avoid resending. |
| **Translator protection** | DO NOT BREAK the translator. AI dictation and translator remain mutually exclusive. Same rule: when translator opens, overlay STT stops. |
| **Chunking for long recordings** | Handle silently — user should not notice. Split long transcripts if needed, process in sequence, merge results. |
| **Non-English languages** | System prompt tells LLM to preserve the original language. Works for Bengali, Arabic, etc. Warning: small local LLMs may struggle with non-Latin scripts. |

---

## 4. TECHNICAL DEEP DIVE

### CRITICAL: Understanding the Two-Step Architecture
```
STEP 1: STT (Speech → Raw Text)     ←── HEARING (always Web Speech API for now)
STEP 2: LLM (Raw Text → Clean Text) ←── POLISHING (user picks any provider)

These are INDEPENDENT. Changing the LLM provider does NOT change how speech is captured.
```

**What happens with each provider combination:**
| User Picks as LLM | STT (Step 1) | Cleanup (Step 2) |
|---|---|---|
| OpenAI (gpt-4o-mini) | Web Speech API (Chrome) | OpenAI cleans text |
| Anthropic (Claude) | Web Speech API (same) | Claude cleans text |
| Gemini | Web Speech API (same) | Gemini cleans text |
| Groq | Web Speech API (same) | Groq cleans text |
| OpenRouter | Web Speech API (same) | OpenRouter LLM cleans text |
| Ollama (local) | Web Speech API (same) | Local LLM cleans text |
| Custom endpoint | Web Speech API (same) | Custom LLM cleans text |

### Whisper API (FUTURE — Coming Soon)
> [!WARNING]
> **DO NOT IMPLEMENT WHISPER IN PHASE 1.** Leave a separate, isolated code space for Whisper integration. Do not mix Whisper code into the main pipeline. It will be developed separately later.

For reference only (what Whisper does when implemented later):
```
Audio file → POST https://api.openai.com/v1/audio/transcriptions
                  model: "whisper-1"
                  file: audio.mp3
                  language: "en" (optional, improves accuracy)
                  prompt: "JunoverseAI, PeeAI" (vocabulary hints)
              → Returns: { text: "raw transcript" }
```
- Whisper is a BETTER EAR, not an LLM. It replaces Web Speech API (Step 1 only).
- It still needs LLM cleanup (Step 2) — Whisper does NOT remove fillers or handle verbal commands.
- Costs ~$0.006 per minute of audio
- NOT real-time — requires recording audio to a file first, then sending it
- Will require: audio recording pipeline, file management, Gumroad license gate

### LLM Cleanup (The Core Feature — Phase 1)
```javascript
// Using existing callLlmRaw() from ipc-handlers.js
const result = await callLlmRaw({
  text: rawTranscript,          // From Web Speech API
  profile: userApiProfile,       // From settings (API key, model, etc.)
  systemPrompt: cleanupPrompt,   // The dictation cleanup instructions
  systemInstructions: null        // Optional extra instructions
});
// result.text = cleaned, polished text
```

### Ollama Support (Phase 1 — Included)
Ollama exposes an **OpenAI-compatible API** at `http://localhost:11434/v1/chat/completions`. The existing `callLlmRaw()` with provider `'custom'` and `baseUrl: 'http://localhost:11434/v1'` handles it perfectly. No new code needed for the HTTP layer.

**Ollama setup in the app:**
1. Auto-detect if Ollama is running: `GET http://localhost:11434/api/tags`
2. If running, fetch available models and show in dropdown
3. If not running, show helpful message: "Install Ollama from ollama.com and pull a model"
4. User selects Ollama as provider → baseUrl auto-set to `http://localhost:11434/v1`
5. User picks a model from the fetched list
6. When user has multiple models installed, show ALL of them in the dropdown

**Ollama profile:**
```javascript
const ollamaProfile = {
  provider: 'custom',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3.2',       // Whatever model user picks
  apiKey: 'ollama',         // Ollama ignores this but header must exist
};
```

---

## 5. THE AI DICTATION PIPELINE

### Flow Diagram
```
┌─ USER PRESSES AI HOTKEY ──────────────────────────────────────────┐
│                                                                    │
│  STEP 1: START RECORDING                                           │
│  ├── main.js: aiDictationActive = true                            │
│  ├── STT engine starts (same as normal: wsClient.send({start}))   │
│  ├── Overlay shows "AI Listening..." indicator                    │
│  └── Buffer array: aiTranscriptBuffer = []                        │
│                                                                    │
│  STEP 2: BUFFER TRANSCRIPTS (instead of live-pasting)             │
│  ├── On each `final-text` event from Chrome bridge:               │
│  │   └── aiTranscriptBuffer.push(text) // DO NOT paste yet        │
│  ├── On each `interim-text`: show in overlay (visual feedback)    │
│  └── Session word count still tracked                              │
│                                                                    │
│  STEP 3: USER STOPS (release key / silence / manual stop)         │
│  ├── STT engine stops                                              │
│  ├── Overlay shows "Processing..." spinner                        │
│  ├── Concatenate buffer: fullText = aiTranscriptBuffer.join(' ')  │
│  └── Send to LLM                                                  │
│                                                                    │
│  STEP 4: LLM PROCESSING                                           │
│  ├── Build messages array with system prompt + session context     │
│  ├── Call callLlmRaw({ text: fullText, profile, systemPrompt })   │
│  ├── Handle chunking if fullText > ~3000 words                    │
│  └── Get back cleaned text                                         │
│                                                                    │
│  STEP 5: INJECT RESULT                                             │
│  ├── clipboardManager.injectText(cleanedText)                     │
│  ├── Overlay shows cleaned text briefly, then hides               │
│  └── Add to session memory for context continuity                 │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### What Changes in main.js
Currently, the `final-text` handler in `setupWebSocketServer()` (line ~332) immediately calls `clipboardManager.injectText()`. With AI mode:

```
IF aiModeEnabled AND sttMode === 'overlay':
    → Buffer the text, DON'T paste
    → When recording stops, send buffer to LLM, THEN paste result
ELSE:
    → Current behavior (immediate paste)
```

This is the **single most critical change** in the codebase.

---

## 6. HOTKEY & ACTIVATION DESIGN

### Three Activation Methods
| Method | Default Key | Behavior | Works For |
|--------|-------------|----------|-----------|
| **Combo Toggle** | `Alt+C` | Press → recording starts. Press again → recording stops + AI processes | Both normal & AI mode |
| **Push-to-Talk** | `Right Alt` | Hold → recording starts. Release → recording stops + AI processes | AI mode specifically |
| **Hold-Toggle** | Configurable | Hold for 2s → toggles recording on/off | Both normal & AI mode |

### Implementation Notes
- **Right Alt detection**: `uiohook-napi` can detect Right Alt vs Left Alt via keycode. `UiohookKey.AltRight` is the keycode.
- **Push-to-Talk** (NEW behavior): Unlike the current hold-key which waits for X seconds then toggles, push-to-talk starts recording immediately on key DOWN and stops on key UP. This is a new code path in `hotkey-manager.js`.
- User should be able to customize all keys in settings.
- All keys that work cross-platform: `Right Alt/Option`, `Caps Lock`, `F13-F19`, `Scroll Lock` (Windows), function keys (`F5-F12`)
- **Fn key is NOT interceptable** on any platform — firmware-level key, ignore it completely.

### Push-to-Talk Implementation Pattern
```javascript
// In hotkey-manager.js
if (aiPushToTalkEnabled) {
  uIOhook.on('keydown', (e) => {
    if (e.keycode !== AI_PUSH_TO_TALK_KEYCODE) return;
    if (aiPttActive) return; // Prevent repeats from key hold
    aiPttActive = true;
    toggleListening(null, false, false); // Start recording
  });
  
  uIOhook.on('keyup', (e) => {
    if (e.keycode !== AI_PUSH_TO_TALK_KEYCODE) return;
    if (!aiPttActive) return;
    aiPttActive = false;
    toggleListening(); // Stop recording → triggers AI processing
  });
}
```

---

## 7. SETTINGS PANEL DESIGN

Add a NEW panel to the settings sidebar called **"AI Dictation"** (with a robot/sparkles icon).

### New Sidebar Order
```
├── General               (existing)
├── Voice & Language       (existing)
├── 🤖 AI Dictation       ◀── NEW PANEL
├── Text Replacement       (existing)
├── My Stats              (existing)
├── License               (existing)
├── About                 (existing)
```

### AI Dictation Panel Layout
```
┌─────────────────────────────────────────────────┐
│ 🤖 AI Dictation                                 │
├─────────────────────────────────────────────────┤
│                                                  │
│ ─── Enable ──────────────────────────────────    │
│                                                  │
│ Enable AI Mode ───────────────── [TOGGLE ON/OFF] │
│ When ON, spoken text is processed through an LLM │
│ before being typed. Adds ~2-3s delay but         │
│ produces polished, professional text.            │
│                                                  │
│ ─── AI Provider ─────────────────────────────    │
│                                                  │
│ Provider:    [OpenAI ▼]                          │
│ API Key:     [sk-••••••••••] [👁 Show]           │
│ Model:       [gpt-4o-mini ▼]                     │
│              (recommended: fast & cheap)         │
│                                                  │
│ ─── Ollama (Local LLM) ──────────────────────    │
│                                                  │
│ [Use Ollama] toggle                              │
│ Status: ● Connected (localhost:11434)             │
│         OR ○ Not detected — install from         │
│            ollama.com and run `ollama pull llama3`│
│ Model:  [llama3.2 ▼] (fetched from Ollama)       │
│                                                  │
│ Note: When Ollama is selected as provider, user  │
│ does NOT need an API key. The dropdown should     │
│ list ALL models the user has installed locally.   │
│                                                  │
│ ─── OpenAI Whisper (Premium STT) ────────────    │
│ ┌────────────────────────────────────────────┐   │
│ │ 🔒 Coming Soon                             │   │
│ │ Higher accuracy speech recognition using   │   │
│ │ OpenAI Whisper will be available in a      │   │
│ │ future update. Requires valid license.     │   │
│ └────────────────────────────────────────────┘   │
│                                                  │
│ ─── Local Whisper (whisper.cpp) ─────────────    │
│ ┌────────────────────────────────────────────┐   │
│ │ 🔒 Coming Soon                             │   │
│ │ Fully offline speech recognition using     │   │
│ │ local Whisper models. No internet needed.  │   │
│ └────────────────────────────────────────────┘   │
│                                                  │
│ ─── AI Hotkey ───────────────────────────────    │
│                                                  │
│ Push-to-Talk Key: [Right Alt ▼]  (customizable)  │
│ Mode: [○ Push-to-Talk  ○ Hold 2s  ○ Hold+Release]│
│                                                  │
│ ─── System Prompt ───────────────────────────    │
│                                                  │
│ ┌────────────────────────────────────────────┐   │
│ │ Clean up this dictated speech. Remove      │   │
│ │ fillers (um, uh, like). Add punctuation.   │   │
│ │ Handle corrections: "no wait" = discard    │   │
│ │ before. "delete that" = remove last        │   │
│ │ sentence. "start over" = discard all       │   │
│ │ before. Keep same language. Output ONLY    │   │
│ │ the cleaned text.                          │   │
│ └────────────────────────────────────────────┘   │
│ [Reset to Default]                               │
│                                                  │
│ ─── Personal Dictionary ─────────────────────    │
│                                                  │
│ Words the AI should always spell correctly:      │
│ [JunoverseAI, Sayed Johon, PeeAI, ...]          │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 8. SYSTEM PROMPT ARCHITECTURE

### Default System Prompt (TOKEN-EFFICIENT — ~120 tokens)
```
Clean up this dictated speech transcript. Rules:
1. Remove filler words: um, uh, like, basically, you know
2. Add proper punctuation and capitalization
3. Handle spoken corrections: "no no/wait/actually" = discard text before, keep correction. "delete that/scratch that" = remove last sentence. "start over" = output only text after this phrase
4. Handle "new paragraph" and "new line" as whitespace
5. Keep the SAME language as input. Do NOT translate
6. Output ONLY the cleaned text. No explanations.
```

### Why Short Prompts Matter
- This prompt is sent with EVERY LLM request
- At ~120 tokens, it costs ~$0.000015 per call with gpt-4o-mini ($0.15/1M input tokens)
- A verbose 500-token prompt would cost 4x more and be 4x slower

### Session-Level Prompt Strategy
To avoid resending the system prompt + all context every single call:

```
Call 1: system_prompt + "Previous context: none" + raw_text
Call 2: system_prompt + "Previous context: [summary of call 1 output]" + raw_text
Call 3: system_prompt + "Previous context: [summary of calls 1-2]" + raw_text
```

The "previous context" is a SHORT summary (1-2 sentences) of what was dictated earlier in the session, not the full text. This keeps token usage low while giving the LLM awareness of context.

### Language-Aware Enhancement
```javascript
function buildDictationPrompt(language, customPrompt, personalDictionary) {
  let prompt = customPrompt || DEFAULT_AI_SYSTEM_PROMPT;
  
  // Append language preservation instruction for non-English
  if (language && !language.startsWith('en')) {
    const langNames = { 'bn': 'Bengali', 'es': 'Spanish', /* ... */ };
    const langName = langNames[language.split('-')[0]] || language;
    prompt += `\nIMPORTANT: Input is in ${langName}. Output MUST be in ${langName}.`;
  }
  
  // Append personal dictionary if provided
  if (personalDictionary && personalDictionary.length > 0) {
    prompt += `\nAlways spell these correctly: ${personalDictionary.join(', ')}`;
  }
  
  return prompt;
}
```

---

## 9. SESSION MEMORY DESIGN

### How Sessions Work
```
Session START: User enables AI mode and begins first dictation
Session ACTIVE: User can dictate multiple times; each builds on context
Session END: User disables AI mode, closes overlay, or explicitly resets

Within a session:
- Dictation 1: "Write an email to John about the meeting"
  → cleaned: "Hi John, I wanted to discuss our upcoming meeting..."
  → context stored: "User is writing an email to John about a meeting"

- Dictation 2: "Actually add that we should move it to Thursday"  
  → LLM sees context → knows "it" = the meeting, "we" = email participants
  → cleaned: "Could we move the meeting to Thursday?"
  → context updated
```

### Implementation
```javascript
// In the new ai-dictation-manager.js
class AiSession {
  constructor() {
    this.contextSummary = '';    // Short summary of session so far
    this.turnCount = 0;
    this.maxContextLength = 200; // Max chars for context summary
  }
  
  buildMessages(rawText, systemPrompt) {
    const messages = [
      { role: 'system', content: systemPrompt }
    ];
    
    if (this.contextSummary) {
      messages.push({ 
        role: 'system', 
        content: `Previous dictation context: ${this.contextSummary}` 
      });
    }
    
    messages.push({ role: 'user', content: rawText });
    return messages;
  }
  
  updateContext(cleanedText) {
    // Keep only last ~200 chars as context to prevent token bloat
    this.contextSummary = cleanedText.length > this.maxContextLength 
      ? cleanedText.slice(-this.maxContextLength) + '...'
      : cleanedText;
    this.turnCount++;
  }
  
  reset() {
    this.contextSummary = '';
    this.turnCount = 0;
  }
}
```

### Anti-Hallucination Measures
1. Context summary is capped at 200 chars — prevents context window from growing unbounded
2. System prompt explicitly says "Output ONLY the cleaned text" — prevents meta-commentary
3. Temperature set to 0.3 (low creativity, high precision)
4. If context is old (>5 turns), auto-reset to prevent drift

---

## 10. FILE-BY-FILE IMPLEMENTATION PLAN

### New Files to Create

#### `src/main/ai-dictation-manager.js` [NEW]
**Purpose**: Central brain of AI dictation. Manages the recording buffer, LLM calls, session memory, and result injection.

Should contain:
- `AiSession` class (context tracking)
- `bufferTranscript(text)` — adds to buffer during recording
- `processBuffer(profile, systemPrompt, language)` — sends to LLM, returns cleaned text
- `buildDictationPrompt(language, customPrompt, personalDictionary)` — constructs the prompt
- `handleChunking(text)` — splits long text into manageable chunks (transparent to user)
- Session lifecycle: `startSession()`, `endSession()`, `resetSession()`

This file should import `callLlmRaw` and `httpPost` from `ipc-handlers.js` (or factor them into a shared `src/main/llm-client.js`).

#### `src/main/llm-client.js` [NEW — OPTIONAL BUT RECOMMENDED]
**Purpose**: Extract the existing `callLlmRaw()`, `callLlmTranslate()`, `callLlmRaw()`, and `httpPost()` from `ipc-handlers.js` into their own module so BOTH the translator and AI dictation can use them without circular dependencies.

This is a **non-breaking refactor**: `ipc-handlers.js` would `require('./llm-client')` and re-export the same functions.

### Files to Modify

#### `store/config.js` — Add AI dictation schema
```javascript
// Add these new schema entries:
aiModeEnabled: { type: 'boolean', default: false },
aiProvider: { type: 'string', default: 'openai' },
aiModel: { type: 'string', default: 'gpt-4o-mini' },
aiApiKey: { type: 'string', default: '' },
aiBaseUrl: { type: 'string', default: '' },
aiSystemPrompt: { type: 'string', default: '' },  // Empty = use built-in default
aiPersonalDictionary: { type: 'string', default: '' },  // Comma-separated
aiActivationMode: { type: 'string', default: 'push-to-talk' }, // 'push-to-talk' | 'hold' | 'combo'
aiActivationKey: { type: 'string', default: 'AltRight' },  // uiohook key name
aiTemperature: { type: 'number', default: 0.3 },
```

#### `main.js` — Core routing change
**The critical change**: In the `ws.on('message')` handler (around line 332), when `data.type === 'final-text'`:

```javascript
// BEFORE (current):
clipboardManager.injectText(textToInject);

// AFTER (with AI mode check):
if (store.get('aiModeEnabled') && sttMode === 'overlay') {
  // AI MODE: Buffer the text, don't paste yet
  aiDictationManager.bufferTranscript(replacedText);
  // Show buffered text in overlay
  if (overlayWindow) overlayWindow.webContents.send('ai-buffered-text', replacedText);
} else {
  // NORMAL MODE: Current behavior (immediate paste)
  clipboardManager.injectText(textToInject);
}
```

Also add: When recording stops AND AI mode is on, trigger the LLM processing:
```javascript
// When toggleListening turns OFF and AI mode is active:
if (wasListening && store.get('aiModeEnabled') && sttMode === 'overlay') {
  const result = await aiDictationManager.processBuffer();
  if (result.text) {
    clipboardManager.injectText(result.text);
    if (overlayWindow) overlayWindow.webContents.send('ai-result', result.text);
  }
  // Don't hide overlay until paste is done
}
```

#### `src/main/hotkey-manager.js` — Add push-to-talk
Add a new code block for AI push-to-talk alongside the existing hold-key logic:

```javascript
// AI Push-to-Talk handler
const aiPttEnabled = store.get('aiModeEnabled') && store.get('aiActivationMode') === 'push-to-talk';
const aiKeyName = store.get('aiActivationKey') || 'AltRight';
let aiPttActive = false;

if (aiPttEnabled) {
  uIOhook.on('keydown', (e) => {
    const pressed = uiohookKeyName(e.keycode);
    if (pressed !== aiKeyName) return;
    if (aiPttActive) return; // Key repeat guard
    aiPttActive = true;
    toggleListening(null, false, true); // forceStart
  });
  
  uIOhook.on('keyup', (e) => {
    const released = uiohookKeyName(e.keycode);
    if (released !== aiKeyName) return;
    if (!aiPttActive) return;
    aiPttActive = false;
    toggleListening(); // Stop → triggers AI processing
  });
}
```

#### `src/main/ipc-handlers.js` — Add AI dictation IPC
Add new IPC handlers for AI dictation settings. Also, factor out `callLlmRaw` and `httpPost` into `llm-client.js` (optional but recommended).

```javascript
// New IPC handlers to add in setupIpcHandlers():
ipcMain.handle('ai-test-connection', async (event, profile) => {
  // Test LLM connection with a simple "Hello" prompt
  return await callLlmRaw({
    text: 'Say "connected" and nothing else.',
    profile,
    systemPrompt: 'Respond with a single word.'
  });
});

ipcMain.handle('ai-get-ollama-models', async () => {
  // Ping Ollama and list available models (for future Ollama support)
  try {
    const result = await httpGet('http://localhost:11434/api/tags');
    return JSON.parse(result);
  } catch { return { error: 'Ollama not running' }; }
});
```

#### `ui/settings.html` — Add AI Dictation panel
Add a new `<div class="nav-item" data-panel="ai">` to the sidebar, and a new `<div class="panel" id="panel-ai">` to the content area. Follow the exact same HTML patterns as the existing panels.

#### `ui/settings.js` — Add AI panel logic
Add handlers for the AI settings form: saving API key, testing connection, model selection dropdown, system prompt textarea, etc.

#### `ui/settings-preload.js` — Expose new IPC
Add `ai-test-connection`, `ai-get-ollama-models` to the contextBridge API.

#### `ui/overlay.js` — Add AI mode visual indicators
When AI mode is active:
- Change status label from "Listening…" to "AI Listening…"
- Show buffered text count/preview instead of live transcript
- Show "Processing…" spinner when LLM is working
- Show cleaned result briefly before hiding

#### `ui/overlay.html` — Add AI indicator elements
Add a small AI badge/indicator, a processing spinner element, and a result preview area.

---

## 11. WHAT NOT TO TOUCH

> [!CAUTION]
> These systems are working and fragile. Do NOT modify their core logic:

1. **`engine/speech-bridge.html`** — The Chrome bridge STT engine. No changes needed. AI mode uses the same STT data stream.
2. **`engine/chrome-launcher.js`** + **`engine/chrome-finder.js`** — Chrome management. Don't touch.
3. **`ui/translator.html/js/css`** — The translator panel. AI dictation is separate from translation.
4. **`src/main/translator-manager.js`** — Translator window lifecycle. Don't modify.
5. **`src/main/floating-browser-manager.js`** — Browser panel. Don't touch.
6. **The overlay/translator mutual exclusion logic** in `main.js` (`sttMode`, `openTranslator()`, `closeTranslatorAndRestoreOverlay()`). These rules must remain intact.
7. **`src/main/licensing.js`** — Don't modify licensing checks. Premium features (Whisper) will need their own licensing gate later.

---

## 12. CONFIG STORE SCHEMA ADDITIONS

Add these to `store/config.js` schema object:

```javascript
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
```

---

## 13. CODE PATTERNS TO FOLLOW

### Pattern 1: IPC Communication
```javascript
// Preload (contextBridge):
aiTestConnection: (profile) => ipcRenderer.invoke('ai-test-connection', profile),

// Main (ipcMain):
ipcMain.handle('ai-test-connection', async (event, profile) => { ... });
```

### Pattern 2: Settings Save
All settings use the `save-config` IPC event which does:
```javascript
ipcMain.on('save-config', (event, config) => {
  store.set(config);
  registerHotkeys(toggleListening); // Re-register after config change
});
```
AI settings should follow the same pattern — include `aiModeEnabled`, `aiProvider`, etc. in the config object passed to `save-config`.

### Pattern 3: Module Structure
Follow the existing pattern of `src/main/*.js` modules:
```javascript
'use strict';
const store = require('../../store/config');
// ... module logic ...
module.exports = { /* exported functions */ };
```

### Pattern 4: Error Handling for LLM Calls
The existing `callLlmRaw()` returns `{ text: '...' }` on success and `{ error: '...' }` on failure. Always check for the `error` field.

---

## 14. PHASE PLAN

### Phase 1: Core AI Dictation + Ollama (THIS IS WHAT TO BUILD NOW)
- [ ] Create `src/main/ai-dictation-manager.js` (buffer, process, session)
- [ ] Optionally extract `src/main/llm-client.js` from ipc-handlers.js
- [ ] Add AI config schema to `store/config.js`
- [ ] Modify `main.js`: AI mode branching in `final-text` handler + processing on stop
- [ ] Add push-to-talk to `hotkey-manager.js`
- [ ] Add "AI Dictation" panel to `settings.html/js`
- [ ] Add AI-related IPC to `ipc-handlers.js` and `settings-preload.js`
- [ ] Add AI mode visual indicators to `overlay.html/js`
- [ ] Default system prompt with verbal command support
- [ ] Personal dictionary support
- [ ] Session memory (within-session context)
- [ ] **Ollama integration**: auto-detect, model list, provider selection
- [ ] All cloud providers: OpenAI, Anthropic, Gemini, Groq, OpenRouter, custom
- [ ] Leave isolated placeholder/space in code for future Whisper integration (DO NOT implement yet)

### Phase 2: OpenAI Whisper Premium STT (FUTURE — Coming Soon)
- [ ] Audio capture to file (MediaRecorder API in Chrome bridge)
- [ ] Whisper API integration (SEPARATE from main STT pipeline)
- [ ] Licensing gate (Gumroad check for premium feature)
- [ ] Enable the "Coming Soon" Whisper section in settings

### Phase 3: Local whisper.cpp (FUTURE — Coming Soon)
- [ ] Native build pipeline for whisper.cpp
- [ ] Model download manager
- [ ] GPU acceleration (Metal on Mac, CUDA on Windows)
- [ ] Enable the "Coming Soon" local Whisper section in settings

---

## APPENDIX A: EXISTING FILE REFERENCE

| File | Lines | Size | Purpose |
|------|-------|------|---------|
| `main.js` | 479 | 20KB | Electron entry point, routing, orchestration |
| `store/config.js` | 262 | 13KB | electron-store config schema |
| `engine/speech-bridge.html` | 334 | 14KB | Chrome Web Speech API bridge |
| `engine/chrome-launcher.js` | ~100 | 3KB | Puppeteer Chrome management |
| `src/main/ipc-handlers.js` | 610 | 25KB | All IPC handlers + LLM helpers |
| `src/main/hotkey-manager.js` | 213 | 7KB | Hotkeys + hold-key + mouse |
| `src/main/clipboard-manager.js` | 109 | 3KB | Text injection (paste/type) |
| `src/main/window-manager.js` | 172 | 5KB | Overlay + Settings window creation |
| `src/main/translator-manager.js` | 118 | 3KB | Translator window lifecycle |
| `ui/overlay.js` | 767 | 52KB | Overlay UI logic |
| `ui/overlay.html` | ~200 | 6KB | Overlay HTML |
| `ui/overlay.css` | ~600 | 21KB | Overlay styles |
| `ui/settings.html` | 578 | 41KB | Settings HTML (6 panels) |
| `ui/settings.js` | ~900 | 36KB | Settings JS logic |
| `ui/settings.css` | ~500 | 18KB | Settings styles |

## APPENDIX B: KEY FUNCTION SIGNATURES

```javascript
// main.js
toggleListening(forceLang = null, fromTranslator = false, forceStart = false)

// clipboard-manager.js
clipboardManager.injectText(text)        // Clipboard paste
clipboardManager.injectCharDirect(chars) // Single char injection

// ipc-handlers.js
callLlmRaw({ text, profile, systemPrompt, systemInstructions }) → { text } | { error }
httpPost(url, body, extraHeaders) → Promise<string>

// hotkey-manager.js
registerHotkeys(toggleListening)
uiohookKeyName(keycode) → string
```

## APPENDIX C: OLLAMA API COMPATIBILITY (Phase 1 — Included)

Ollama is included in Phase 1. It works like this:
```javascript
// Ollama exposes OpenAI-compatible API at:
// http://localhost:11434/v1/chat/completions
//
// So the existing callLlmRaw() with provider='custom' works:
const profile = {
  provider: 'custom',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3.2',
  apiKey: 'ollama',  // Ollama doesn't need a real key but the header must exist
};
```

To list available models (for the settings dropdown):
```
GET http://localhost:11434/api/tags → { models: [{ name: 'llama3.2', ... }, { name: 'mistral', ... }] }
```

To check if Ollama is running:
```javascript
async function isOllamaRunning() {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    const data = await res.json();
    return { running: true, models: data.models.map(m => m.name) };
  } catch {
    return { running: false, models: [] };
  }
}
```

When user has multiple models installed, show ALL of them in the dropdown. The user knows what they have — give them full control.

---

**END OF HANDOFF DOCUMENT**

*Document created by: AI Assistant with full Juno Voice codebase access*
*Date: April 7, 2026*
*For: Developer/AI assistant implementing AI Dictation in a separate workspace*
