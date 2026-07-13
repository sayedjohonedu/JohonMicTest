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
- **2026-07-14:** Fixed infinite uncaughtException logging loop on broken stdin/stdout/stderr streams (EPIPE errors) in logger.js. Wrapped all log overrides in try-catch blocks and prevented re-entrant crashes. Bumped version to 2.0.1.

