# MicTab — Visual Agent Pipeline Builder: Brainstorm & Plan

> **Goal:** Give users a no-code, block-based editor to build their own voice AI pipelines — like n8n/Zapier but for spoken words — while also fixing the Jarvis routing system cleanly.

---

## Part 1 — The Jarvis Fix (Quick Win, Do First)

Before the big feature, fix the current routing cleanly.

### What changes

Add **two new store keys**:
- `aiCommandTriggerEnabled` — boolean, default `true` (Jarvis on/off toggle)
- `aiCommandTriggerWord` — string, default `"Jarvis"` (customizable wake word)

### New routing logic (both `ai-dictation-manager.js` AND `whisper-api-manager.js`)

```
Has custom system prompt?
  YES → use it, but STILL check for wake word if trigger is enabled
  NO  → use built-in prompts

Wake word trigger enabled?
  YES + wake word found in transcript → COMMAND prompt (execute instruction)
  NO  (trigger disabled)             → always use CLEAN prompt
  YES + wake word NOT found          → CLEAN prompt
```

This means:
- **Trigger OFF** → pure STT cleanup only, always, no matter what
- **Trigger ON + "Jarvis" (or custom word) detected** → command mode
- **Custom prompt set + trigger ON** → custom prompt is used BUT command mode still activates on wake word (currently broken — it ignores wake word entirely when custom prompt is set)

### Settings UI addition (small, in AI & API panel)

A toggle row: **"Voice Command Trigger"**
- Toggle on/off
- Text input for the trigger word (shown only when enabled)
- Helper text: *"Say this word to switch from cleanup mode to command mode mid-dictation"*

---

## Part 2 — The Agent Pipeline Builder (The Big Feature)

### Concept

A new settings panel: **"Voice Agents"** (or "AI Flows").

Each **Agent** is a named pipeline made of **Blocks** connected top-to-bottom. When the user dictates, MicTab checks if any active Agent's trigger condition matches — if yes, that Agent's block chain runs instead of the default clean/command prompt.

Think of it like this:

```
[Trigger Block] → [Context Block] → [Prompt Block] → [Output Block]
```

Every block has a clear job. Users drag, reorder, and configure blocks in a clean visual panel.

---

## Part 3 — Block Types (The Full Catalog)

### 🎯 Trigger Blocks (when does this agent activate?)

| Block | Description |
|---|---|
| **Wake Word** | Activates when transcript contains a specific word/phrase. Default: "Jarvis". Configurable. |
| **Always** | Agent is always active (replaces default behavior). Only one "Always" agent can be active. |
| **Starts With** | Transcript must start with a specific phrase |
| **Contains Phrase** | Any position match |
| **Regex Match** | Power-user regex trigger |
| **Language Match** | Only triggers on a specific detected language |

### 📥 Context Blocks (what data does the LLM get?)

| Block | Description |
|---|---|
| **Clipboard** | Injects latest clipboard text. Already implemented as `_getClipboardContext()` — just expose it as a block. |
| **Clipboard (Nth item)** | Inject 2nd, 3rd most recent clipboard entry |
| **Current Date/Time** | Injects `Today is Thursday May 1, 2026 at 11:26 AM` |
| **Static Text** | User types any fixed text to always inject (e.g., their name, job title, context) |
| **Personal Dictionary** | The user's custom word spellings |
| **Language** | Injects the current dictation language |
| **Previous Output** | Injects the result of the previous dictation run (session memory) |
| **App Name** | Injects the name of the currently focused app (if detectable) |

### 🧠 Prompt Blocks (what does the LLM do?)

| Block | Description |
|---|---|
| **Clean Transcript** | Built-in CLEAN_PROMPT (fix STT errors only) |
| **Execute Command** | Built-in COMMAND_PROMPT (remove wake word, execute instruction) |
| **Custom System Prompt** | User writes their own system prompt (replaces current textarea) |
| **Translate** | Translate to a chosen target language |
| **Summarize** | Summarize the dictated text |
| **Format As** | Format as bullet list / email / code / table / etc. |
| **Tone Adjust** | Make formal / casual / professional |
| **Fill Template** | User defines a template with `{{placeholders}}` and the LLM fills them in |

### ⚙️ Processing Blocks (transform the text before/after LLM)

| Block | Description |
|---|---|
| **Strip Wake Word** | Remove the trigger word from the text before passing to LLM |
| **Text Replacement** | Apply the existing text replacement rules |
| **To Uppercase / Lowercase** | Simple transforms without LLM |
| **Trim** | Remove leading/trailing whitespace/filler |
| **Append Text** | Add a fixed suffix (e.g., always end emails with a signature) |
| **Prepend Text** | Add a fixed prefix |

### 📤 Output Blocks (what happens with the result?)

| Block | Description |
|---|---|
| **Paste to Active Field** | Default — types the result where the cursor is (existing behavior) |
| **Copy to Clipboard** | Places result on clipboard without pasting |
| **Show Notification** | Shows a system notification with the result |
| **Append to File** | Appends result to a local text file |
| **Play as TTS** | Reads the result aloud using the existing MS Edge TTS manager |
| **Open in App Store** | Sends the result to a mini-app for further processing |

---

## Part 4 — Data Model

Each **Agent** stored in `store` as an object:

```json
{
  "id": "agent_abc123",
  "name": "Jarvis Commands",
  "description": "Activated by saying Jarvis",
  "enabled": true,
  "appliesTo": ["ai-dictation", "whisper-polish"],
  "blocks": [
    { "id": "b1", "type": "trigger-wake-word", "config": { "word": "Jarvis" } },
    { "id": "b2", "type": "ctx-clipboard", "config": { "maxChars": 4000 } },
    { "id": "b3", "type": "ctx-datetime", "config": {} },
    { "id": "b4", "type": "proc-strip-wake-word", "config": {} },
    { "id": "b5", "type": "prompt-execute-command", "config": {} },
    { "id": "b6", "type": "output-paste", "config": {} }
  ]
}
```

New store key: `voiceAgents` — array of Agent objects.

Default agents pre-built (on first launch):
1. **"Jarvis Commands"** — wake word + clipboard + command prompt + paste
2. **"Clean Dictation"** — always trigger + clean prompt + paste (the existing default)

---

## Part 5 — Backend Execution Engine

New file: `src/main/agent-pipeline-engine.js`

```
AgentPipelineEngine
  .getActiveAgents(transcript, feature)   → finds matching agent
  .runPipeline(agent, transcript)         → executes block chain
  .buildLlmMessages(blocks, transcript)   → assembles context + prompt into messages[]
  .executeOutputBlocks(blocks, result)    → handles paste / copy / notify
```

Integration point in `ai-dictation-manager.js`:

```js
// BEFORE (current):
const systemPrompt = this.buildDictationPrompt(language, customPrompt, personalDict, rawText);

// AFTER:
const agent = agentEngine.getMatchingAgent(rawText, 'ai-dictation');
if (agent) {
  return agentEngine.runPipeline(agent, rawText);
} else {
  // Fall back to existing behavior
  const systemPrompt = this.buildDictationPrompt(language, customPrompt, personalDict, rawText);
  ...
}
```

Same pattern in `whisper-api-manager.js → _aiPolish()`.

---

## Part 6 — UI Design

### New Settings Panel: "Voice Agents"

**Left side** — Agent list:
- Each agent shown as a card with name, toggle (on/off), and a "✏ Edit" button
- `+ New Agent` button at the bottom
- Drag to reorder (priority order — first matching agent wins)

**Right side / Modal** — Agent editor:
- Name field + description field at top
- `Applies to:` checkboxes — `[ ] AI Dictation` `[ ] Whisper Engine`
- **Block Canvas** — vertical list of block cards
  - Each block has: type icon, title, brief description, `⚙` config button, `✕` delete, drag handle
  - Between blocks: `+` button to insert a new block
  - Add Block panel: searchable grid of block types organized by category (Trigger / Context / Prompt / Processing / Output)
- Save / Cancel buttons

### Block Card Design (inspired by n8n)

```
┌─────────────────────────────────────────┐
│ ⋮⋮  🎯 Wake Word Trigger              ✕ │
│     Activates when transcript contains  │
│     word: [ Jarvis           ] ⚙        │
└─────────────────────────────────────────┘
         ↓ (connector line)
┌─────────────────────────────────────────┐
│ ⋮⋮  📋 Clipboard Context              ✕ │
│     Injects your latest copied text     │
│     Max chars: [ 4000 ]          ⚙      │
└─────────────────────────────────────────┘
```

---

## Part 7 — What Users Get Out of the Box

### Default Agent 1: "Smart Cleanup" (Always active)
Blocks: `[Always] → [Clean Transcript] → [Paste]`
This replaces the current hardcoded CLEAN_PROMPT behavior.

### Default Agent 2: "Jarvis Commands" (enabled by default, toggle off to disable)
Blocks: `[Wake Word: "Jarvis"] → [Strip Wake Word] → [Clipboard] → [Current Time] → [Execute Command] → [Paste]`
This replaces the current Jarvis detection. Fully user-editable.

### Template agents users can add:
- 📧 **Email Drafter** — formal tone + append signature
- 📝 **Meeting Notes** — summarize + bullet format
- 🌐 **Live Translator** — translate to chosen language + paste
- 🤖 **AI Assistant** — custom prompt with clipboard context
- 📋 **Code Formatter** — format as code block

---

## Part 8 — Phased Build Plan

### Phase 1 — Foundation (do first)
1. Fix Jarvis routing (`aiCommandTriggerEnabled` + `aiCommandTriggerWord` store keys)
2. Add toggle + word input in AI & API settings panel
3. Update both `ai-dictation-manager.js` and `whisper-api-manager.js` routing logic
4. Add `voiceAgents` to `store/config.js` schema
5. Create `agent-pipeline-engine.js` with basic execute loop

### Phase 2 — Core Blocks
6. Implement all **Trigger blocks** (wake word, always, starts with)
7. Implement core **Context blocks** (clipboard, datetime, static text)
8. Implement core **Prompt blocks** (clean, command, custom)
9. Implement **Strip Wake Word** processing block
10. Implement **Paste** and **Copy to Clipboard** output blocks
11. Wire engine into `ai-dictation-manager` and `whisper-api-manager`

### Phase 3 — UI
12. Build the "Voice Agents" settings panel
13. Block canvas with add/remove/reorder
14. Per-block config modals
15. Pre-load default agents (Jarvis Commands + Smart Cleanup)
16. Agent enable/disable toggles

### Phase 4 — Advanced Blocks
17. Template filler block
18. Translate block
19. TTS output block
20. Format As block (email, bullets, code)
21. Append/Prepend text blocks
22. Regex trigger block

### Phase 5 — Polish
23. Block templates gallery (pick from preset agent templates)
24. Import/Export agents as JSON
25. Agent per-run stats (how many times triggered)
26. Test button — run an agent against sample text without dictating

---

## Part 9 — Things You Probably Wouldn't Think Of

These are important edge cases to handle:

- **Agent priority** — if two agents match (e.g., "always" AND "wake word"), which wins? → First enabled agent in list wins. Wake word agents should be placed above "always" by default.
- **Disabled blocks** — allow users to temporarily disable a single block without deleting it
- **LLM not configured** — if a Prompt block is added but no LLM profile is set, show a clear inline error instead of silent failure
- **No matching agent** — if all agents are disabled or none match, fall back to the built-in CLEAN_PROMPT (never break existing behavior)
- **Circular context** — "Previous Output" block needs a session-scoped memory object, not persistent storage, so it resets each app restart
- **Long context overflow** — if Context blocks inject too much text, auto-truncate with a `[...truncated]` notice
- **Wake word case insensitivity** — "jarvis", "JARVIS", "Jarvis" all match
- **Wake word in the middle** — "can you Jarvis do this" should still work, not just "Jarvis do this"
- **Multiple wake words** — allow comma-separated list: `"Jarvis, Hey computer, Assistant"`
- **Conflict detection** — warn the user if two "Always" agents are both enabled
- **Migration** — existing users' custom system prompts should auto-convert to a custom Prompt block in their default agent, with no data loss

---

## Summary of Files to Create/Modify

| File | Action |
|---|---|
| `store/config.js` | Add `voiceAgents`, `aiCommandTriggerEnabled`, `aiCommandTriggerWord` |
| `src/main/agent-pipeline-engine.js` | **New** — core execution engine |
| `src/main/ai-dictation-manager.js` | Swap routing logic → delegate to engine |
| `src/main/whisper-api-manager.js` | Same — delegate `_aiPolish` routing to engine |
| `src/main/ipc-handlers.js` | Add IPC for agent CRUD operations |
| `ui/settings.html` | Add Voice Agents panel + Jarvis toggle |
| `ui/settings.js` | Agent panel JS, block editor logic |
| `ui/settings.css` | Block canvas styles |
