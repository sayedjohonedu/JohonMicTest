# Project Log

## Project Overview
**MicTab** is an Electron-based desktop app for voice dictation (Whisper), node-based Voice Agents (`AgentPipelineEngine`), and screen annotation (Lens).

## Structure Map & Key Logic Flows
- **Main Process Entry:** [main.js](file:///Users/sayedjohon/Documents/DEV_AREA/MicTab/mictab/main.js)
  - Manages Electron app lifecycle, windows (`miniapp-shell`, `lens-editor`, etc.), and IPC handlers.
- **Voice Agents:**
  - `AgentPipelineEngine` -> Executes node-based AI workflows, resolving keywords and replacing variables (e.g., `[clipboard]`).
- **Whisper Engine (STT):**
  - `WhisperApiManager` -> Handles dictation state, audio recording, Whisper API profile management.
- **Lens Annotation:**
  - `ui/lens-editor.html` & `ui/lens-capture.html` -> Canvas drawings, precise hit detection (arrow, line, highlighter), hollow shape selection bounds.
- **Design System:**
  - Located under [ui/](file:///Users/sayedjohon/Documents/DEV_AREA/MicTab/mictab/ui/) and style assets. Incorporates professional styling with customization via `.agent/skills/ui-ux-pro-max/SKILL.md`.

## Dependency / Entry Point Connections
```
main.js (Electron Main)
 ├── ui/miniapp-shell.html (Main UI)
 │    └── src/ (React / Frontend Logic)
 ├── ui/lens-editor.html (Annotation Tool)
 └── Whisper Engine / AgentPipelineEngine (Background Processing)
```

## Significant Changes Log
- **2026-06-22:** Initialized project log and analyzed all remote branches from automated AI agents (bolt, palette, sentinel, jules).
- **2026-06-22:** Updated lens-editor active aspect ratio frame border to white dashed outline (90% opacity) with a dark shadow glow.
- **2026-07-13:** Added max-width and text-overflow to settings dropdowns (`.duration-select`) to prevent long browser option text from squishing settings layouts.
- **2026-06-22:** Manually ported critical fixes from remote agent branches (no merge): Security – blocked unsafe window creation & URL injection in main.js + ipc-handlers.js; Performance – gated clipboard.readImage() behind availableFormats() in clipboard-monitor.js; Accessibility – added :focus-visible keyboard outlines to overlay.css & settings.css, ARIA labels to all clipboard action buttons.
- **2026-06-22:** Enabled Glass theme (liquid glass refraction filter & Specular borders) for the Whisper offline-pill window on macOS/Windows. Toggle style-glass class and platform class on document body. Enable macOS native vibrancy and visualEffectState in window-manager.js for offlinePillWindow. Bump version to 1.3.39.
- **2026-06-25:** Fixed bridge error page external browser redirect issues and protocol security risks. Replaced `shell.openExternal` in the `bridge-error-open-url` IPC handler with `clipboard.writeText(url)` to copy URLs to the clipboard securely, and added a visual toast confirmation alert in `bridge-error.html`. Bump version to 1.3.41.
- **2026-07-03:** Added `prefers-color-scheme` media queries for the Glass theme in `overlay.css` and `offline-pill.css`. Automatically switches to dark charcoal text, dark translucent surfaces/borders, darker specular shadow contours, and high-contrast status/equalizer colors during system Light Mode. Added fallback light frosted background panels for Windows OS to ensure consistent visibility. Bump version to 1.3.43.
- **2026-07-13:** Fixed translation issues in Voice Agent / Jarvis command mode by removing the language preservation hint from command modes and preserving conversation context across consecutive voice agent calls.
- **2026-07-13:** Fixed Windows paste issue where active selections were not collapsed before pasting (modifiers reset now fires globally, and right-arrow collapsing utilizes a robust keyToggle delay on Windows).
- **2026-07-14:** Fixed infinite uncaughtException logging loop on broken stdin/stdout/stderr streams (EPIPE errors) in logger.js. Switched to an asynchronous, non-blocking log queue to avoid blocking the Node event loop and ensure thread-safe rotation/cleanup on Windows. Bumped version to 2.0.2.
- **2026-07-14:** Added "Always on Top" pin functionality to mini-apps. Integrated a titlebar pin icon/button, added state persistence in `config` store, and wired Electron IPC hooks.
- **2026-07-14:** Replaced references to the old black logo (`dark-logo-solid-black-background.png`) with the new `mictablogomain.png` across all main window managers (Clipboard, Gallery, Settings, and Voice Agents).
- **2026-07-14:** Bumped version to 2.0.3.
- **2026-07-15:** Security hardening in `appstore-manager.js`: (1) Replaced `execSync` with `execFileSync` in the unzip fallback to prevent OS command injection via crafted filenames (CWE-78). (2) Added image-extension allowlist to `appstore-read-file-base64` IPC handler to block arbitrary file reads (CWE-22). Both fixes are behavioral no-ops for normal usage.
- **2026-07-15:** Recovered and transcribed the user's last recording WAV file from the installed app directory.
- **2026-07-16:** Security hardening in `main.js`: Added Origin verification to local WebSocket server upgrades to prevent Cross-Site WebSocket Hijacking (CSWSH) to keystroke injection. Upgraded outdated packages (form-data, js-yaml, tar, tmp, undici) to resolve medium/high vulnerabilities using npm audit fix.
- **2026-07-16:** Bumped version to `2.0.4` as a security and vulnerability patch.
- **2026-08-05:** Fixed Whisper Engine profiles missing model dropdown. `renderWhisperProfiles()` in `settings.js` now builds a `<select>` dropdown per profile using the provider's model list (cached via `_whisperProviderCache`), matching AI & API panel. Added double-click-to-rename on profile names (persisted via `vaultUpdateWhisperProfile`). Fixed `updateWhisperStatus()` to sync from Vault profiles instead of legacy store, ensuring live status bar updates on model change and inline rename. Bumped version to 2.0.5.
- **2026-08-05:** Added Clipboard Manager key combination customization to Settings → General (`#row-clipboard-hotkey` + `resetClipboardHotkey()`). Replaced hardcoded `Alt+V` in `clipboard.js` keydown listener and `tray-manager.js` accelerator with dynamic store lookup. Bumped version to 2.0.6.
- **2026-08-14:** Implemented Whisper error recovery system. When API or network errors occur with buffered audio (>0KB), the floating pill presents a concise 2-3 word diagnostic (`Check Network`, `Check API Key`, `Rate Limited`, etc.) with action buttons (Retry 🔄 / Dismiss ✕) and keyboard support (`Enter`/`Esc`). Retrying reprocesses the buffered audio, automatically copies the output to the clipboard, injects into active apps, and confirms with "Copied to Clipboard!".
- **2026-08-14:** Added non-intrusive `Check Network` status indicator for Regular Dictation (Google STT). Detects network errors and offline events in `speech-bridge.html` and displays `Check Network` in the overlay's `#status-label` with amber pulse dot without interrupting tool buttons (AppStore, Clipboard, Browser, Lens). Automatically restores to `Listening…` upon reconnection.
- **2026-08-14:** Modernized all 11 notification, popup, error, and lock dialog windows across MicTab. Created modular SVG icon library `ui/icons.js` and shared obsidian glass design system `ui/popup-theme.css`. Calibrated BrowserWindow viewports in `window-manager.js` to eliminate overflow/clipping bugs. Replaced all modal emojis with clean vector icons, eliminated hardcoded Inter font declarations and AI-purple neon gradients across UI and toasts.
- **2026-08-15:** Fixed Windows text injection/pasting failure. Resolved modifier state desynchronization (Windows modifier filter), added micro-delays between `VK_CONTROL` and `VK_V` dispatch so target app message loops register the Ctrl+V key combination reliably, added safety timeout for `isPasting` to prevent hotkey deadlocks, and debounced clipboard restoration to prevent race conditions during rapid dictation.
- **2026-08-15:** Increased free-tier daily word limit from 500 to 2,000 words per day. Centralized `FREE_DAILY_WORD_LIMIT` constant across backend licensing, IPC handlers, Settings UI, and Word Limit reached popup dialog.
- **2026-08-15:** Upgraded Text-to-Speech (TTS) readout across Translator & Transcription panels. Added dedicated "Read Aloud" sound button & copy control to the Transcription draft panel, returning in-memory Base64 MP3 data URLs in `msedge-tts-manager.js` to eliminate Windows backslash file URL parsing bugs and Chromium security blocks, and reinforced Web Speech fallback for Chromium on Windows. Bumped version to 2.0.7.


